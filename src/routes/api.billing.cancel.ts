import { createFileRoute } from "@tanstack/react-router";
import { findOwnedSubscription, syncRazorpaySubscription } from "@/lib/billing-store";
import { cancelRazorpaySubscription } from "@/lib/razorpay";
import { requireUser } from "@/lib/user-auth";

export const Route = createFileRoute("/api/billing/cancel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = (await request.json()) as { subscriptionId?: unknown };
          if (typeof body.subscriptionId !== "string") {
            return apiError("Subscription id is required.", 422);
          }
          const owned = await findOwnedSubscription(user.id, body.subscriptionId);
          if (!owned) return apiError("Subscription not found.", 404);
          if (!["active", "authenticated", "pending"].includes(owned.status)) {
            return apiError("This subscription cannot be cancelled.", 409);
          }
          const subscription = await cancelRazorpaySubscription(body.subscriptionId, true);
          await syncRazorpaySubscription(subscription);
          return Response.json(
            { subscription: { id: subscription.id, status: subscription.status } },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          const status =
            typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
          return apiError(
            status >= 500
              ? "Cancellation is temporarily unavailable."
              : error instanceof Error
                ? error.message
                : "Cancellation failed.",
            status,
          );
        }
      },
    },
  },
});

function apiError(message: string, status: number) {
  return Response.json(
    { error: { code: "subscription_cancel_failed", message } },
    { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  );
}
