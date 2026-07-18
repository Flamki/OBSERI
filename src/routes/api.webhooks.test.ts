import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createWebhookEvent, deliverWebhook } from "@/lib/webhooks";
import { getPublishedSoulForOwner } from "@/lib/integration-store";
import { readBearerToken } from "@/lib/integration-security";

const schema = z.object({
  soulId: z.string().min(3).max(100),
});

export const Route = createFileRoute("/api/webhooks/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const parsed = schema.safeParse(await request.json());
          if (!parsed.success) return responseError("Choose a valid published soul.", 400);
          const record = await getPublishedSoulForOwner(
            parsed.data.soulId,
            readBearerToken(request),
          );
          if (!record) return responseError("This publisher cannot access that soul.", 403);
          if (!record.webhook.enabled || !record.webhook.url) {
            return responseError("Enable and publish the webhook before testing it.", 409);
          }
          const event = createWebhookEvent("webhook.test", parsed.data.soulId, {
            message: "Your Obseri webhook is connected.",
          });
          const delivery = await deliverWebhook({
            url: record.webhook.url,
            secret: record.webhook.secret,
            event,
          });
          return Response.json({ delivered: true, event, delivery });
        } catch (error) {
          const status =
            typeof error === "object" && error && "status" in error ? Number(error.status) : 502;
          return responseError(error instanceof Error ? error.message : "Delivery failed.", status);
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
