import { createFileRoute } from "@tanstack/react-router";
import { findOwnedSubscription, syncRazorpaySubscription } from "@/lib/billing-store";
import { fetchRazorpaySubscription, verifyRazorpayCheckoutSignature } from "@/lib/razorpay";
import { requireUser } from "@/lib/user-auth";

export const Route = createFileRoute("/api/billing/confirm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = (await request.json()) as Record<string, unknown>;
          const subscriptionId = stringField(body.razorpay_subscription_id);
          const paymentId = stringField(body.razorpay_payment_id);
          const signature = stringField(body.razorpay_signature);
          const owned = await findOwnedSubscription(user.id, subscriptionId);
          if (!owned) return apiError("Subscription not found.", 404, "subscription_not_found");
          if (!verifyRazorpayCheckoutSignature({ paymentId, subscriptionId, signature })) {
            return apiError("Payment verification failed.", 401, "invalid_payment_signature");
          }
          const subscription = await fetchRazorpaySubscription(subscriptionId);
          const saved = await syncRazorpaySubscription(subscription);
          return Response.json(
            { subscription: { id: saved.provider_subscription_id, status: saved.status } },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          const status =
            typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
          return apiError(
            status >= 500
              ? "Payment confirmation is temporarily unavailable."
              : error instanceof Error
                ? error.message
                : "Payment confirmation failed.",
            status,
            "payment_confirmation_failed",
          );
        }
      },
    },
  },
});

function stringField(value: unknown) {
  if (typeof value !== "string" || !value || value.length > 200) {
    throw Object.assign(new Error("The payment response is incomplete."), { status: 422 });
  }
  return value;
}

function apiError(message: string, status: number, code: string) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  );
}
