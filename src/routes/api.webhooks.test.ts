import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createWebhookEvent, deliverWebhook } from "@/lib/webhooks";

const schema = z.object({
  soulId: z.string().min(3).max(100),
  url: z.string().url().max(2_048),
  secret: z.string().min(20).max(200),
});

export const Route = createFileRoute("/api/webhooks/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const parsed = schema.safeParse(await request.json());
          if (!parsed.success) return responseError("Enter a valid webhook URL and secret.", 400);
          const event = createWebhookEvent("webhook.test", parsed.data.soulId, {
            message: "Your Obseri webhook is connected.",
          });
          const delivery = await deliverWebhook({
            url: parsed.data.url,
            secret: parsed.data.secret,
            event,
          });
          return Response.json({ delivered: true, event, delivery });
        } catch (error) {
          return responseError(error instanceof Error ? error.message : "Delivery failed.", 502);
        }
      },
    },
  },
});

function responseError(message: string, status: number) {
  return Response.json(
    { delivered: false, error: { code: "webhook_delivery_failed", message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
