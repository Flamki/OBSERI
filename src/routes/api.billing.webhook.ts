import { createFileRoute } from "@tanstack/react-router";
import { processRazorpayWebhook } from "@/lib/billing-store";
import { verifyRazorpayWebhook, type RazorpaySubscription } from "@/lib/razorpay";

export const Route = createFileRoute("/api/billing/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        try {
          if (!verifyRazorpayWebhook(rawBody, request.headers.get("x-razorpay-signature"))) {
            return Response.json({ error: "invalid_signature" }, { status: 401 });
          }
          const eventId = request.headers.get("x-razorpay-event-id") ?? "";
          const payload = JSON.parse(rawBody) as {
            event?: unknown;
            payload?: { subscription?: { entity?: RazorpaySubscription } };
          };
          const eventType = typeof payload.event === "string" ? payload.event : "unknown";
          const subscription = payload.payload?.subscription?.entity ?? null;
          const result = await processRazorpayWebhook({
            eventId,
            eventType,
            rawBody,
            subscription,
          });
          return Response.json({ received: true, duplicate: result.duplicate });
        } catch (error) {
          const status =
            typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
          return Response.json(
            { error: status >= 500 ? "webhook_processing_failed" : "invalid_webhook" },
            { status },
          );
        }
      },
    },
  },
});
