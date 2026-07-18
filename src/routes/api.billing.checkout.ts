import { createFileRoute } from "@tanstack/react-router";
import { isBillingPlanId } from "@/lib/billing-plans";
import { billingSummary, recordPendingSubscription } from "@/lib/billing-store";
import { createRazorpaySubscription, publicRazorpayKeyId, type BillingCycle } from "@/lib/razorpay";
import { requireUser } from "@/lib/user-auth";

export const Route = createFileRoute("/api/billing/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const current = await billingSummary(user.id);
          if (
            current.subscription &&
            ["active", "authenticated", "pending"].includes(current.subscription.status)
          ) {
            return errorResponse(
              "This account already has a subscription. Change the existing plan instead of starting a second subscription.",
              409,
              "subscription_already_exists",
            );
          }
          const body = (await request.json()) as { planId?: unknown; cycle?: unknown };
          if (
            !isBillingPlanId(body.planId) ||
            body.planId === "free" ||
            body.planId === "enterprise"
          ) {
            return errorResponse("Choose Launch, Growth, or Scale.", 422, "invalid_plan");
          }
          if (body.cycle !== "monthly" && body.cycle !== "annual") {
            return errorResponse("Choose monthly or annual billing.", 422, "invalid_cycle");
          }
          const cycle: BillingCycle = body.cycle;
          const result = await createRazorpaySubscription({
            planId: body.planId,
            cycle,
            ownerUserId: user.id,
            email: user.email,
          });
          await recordPendingSubscription({
            ownerUserId: user.id,
            providerSubscriptionId: result.subscription.id,
            providerPlanId: result.providerPlanId,
            planId: body.planId,
            cycle,
            status: result.subscription.status,
          });
          return Response.json(
            {
              checkout: {
                keyId: publicRazorpayKeyId(),
                subscriptionId: result.subscription.id,
                planId: body.planId,
                cycle,
                name: "Obseri",
                description: `${body.planId[0].toUpperCase()}${body.planId.slice(1)} plan`,
                email: user.email ?? "",
              },
            },
            { status: 201, headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return billingError(error, "checkout_failed");
        }
      },
    },
  },
});

function billingError(error: unknown, fallbackCode: string) {
  const status =
    typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
  const code =
    typeof error === "object" && error && "code" in error ? String(error.code) : fallbackCode;
  return errorResponse(
    status >= 500
      ? "Checkout is temporarily unavailable."
      : error instanceof Error
        ? error.message
        : "Checkout failed.",
    status,
    code,
  );
}

function errorResponse(message: string, status: number, code: string) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  );
}
