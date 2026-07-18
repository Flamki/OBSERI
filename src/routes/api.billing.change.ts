import { createFileRoute } from "@tanstack/react-router";
import { isBillingPlanId } from "@/lib/billing-plans";
import {
  assertPlanTransitionAllowed,
  findOwnedSubscription,
  saveSubscriptionPlanChange,
} from "@/lib/billing-store";
import { razorpayPlanId, updateRazorpaySubscription, type BillingCycle } from "@/lib/razorpay";
import { requireUser } from "@/lib/user-auth";
import { readUserWorkspace } from "@/lib/user-workspace-store";

export const Route = createFileRoute("/api/billing/change")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = (await request.json()) as Record<string, unknown>;
          if (
            typeof body.subscriptionId !== "string" ||
            !isBillingPlanId(body.planId) ||
            body.planId === "free" ||
            body.planId === "enterprise" ||
            (body.cycle !== "monthly" && body.cycle !== "annual")
          ) {
            return apiError("Choose a valid paid plan and billing cycle.", 422);
          }
          const owned = await findOwnedSubscription(user.id, body.subscriptionId);
          if (!owned) return apiError("Subscription not found.", 404);
          if (!["active", "authenticated"].includes(owned.status)) {
            return apiError("This subscription cannot be changed right now.", 409);
          }
          await assertPlanTransitionAllowed(user.id, body.planId, await readUserWorkspace(user.id));
          const cycle: BillingCycle = body.cycle;
          const subscription = await updateRazorpaySubscription({
            subscriptionId: body.subscriptionId,
            planId: body.planId,
            cycle,
          });
          const saved = await saveSubscriptionPlanChange({
            ownerUserId: user.id,
            providerSubscriptionId: body.subscriptionId,
            providerPlanId: razorpayPlanId(body.planId, cycle),
            planId: body.planId,
            cycle,
            subscription,
          });
          return Response.json(
            {
              subscription: {
                id: saved.provider_subscription_id,
                status: saved.status,
                planId: saved.plan_id,
                cycle: saved.billing_cycle,
              },
            },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          const status =
            typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
          return apiError(
            status >= 500
              ? "Plan changes are temporarily unavailable."
              : error instanceof Error
                ? error.message
                : "Plan change failed.",
            status,
          );
        }
      },
    },
  },
});

function apiError(message: string, status: number) {
  return Response.json(
    { error: { code: "subscription_change_failed", message } },
    { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  );
}
