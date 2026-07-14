import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPublishedSoul } from "@/lib/published-souls";
import { createWebhookEvent, deliverWebhook } from "@/lib/webhooks";

const schema = z.object({
  leadIntent: z.enum(["none", "low", "medium", "high"]),
  messages: z
    .array(
      z.object({
        id: z.string().max(120),
        role: z.enum(["visitor", "assistant"]),
        content: z.string().max(4_000),
        createdAt: z.string().max(50),
      }),
    )
    .min(2)
    .max(30),
});

export const Route = createFileRoute("/api/souls/$soulId/events")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const record = getPublishedSoul(params.soulId);
          if (!record) return responseError("This soul is not published.", 404);
          const parsed = schema.safeParse(await request.json());
          if (!parsed.success) return responseError("The conversation event is invalid.", 400);
          if (!record.webhook.enabled || !record.webhook.url) {
            return Response.json({ accepted: true, delivered: false, reason: "disabled" });
          }
          const event = createWebhookEvent(
            parsed.data.leadIntent === "high" ? "lead.detected" : "conversation.updated",
            params.soulId,
            parsed.data,
          );
          const delivery = await deliverWebhook({
            url: record.webhook.url,
            secret: record.webhook.secret,
            event,
          });
          return Response.json({ accepted: true, delivered: true, eventId: event.id, delivery });
        } catch (error) {
          return responseError(error instanceof Error ? error.message : "Delivery failed.", 502);
        }
      },
    },
  },
});

function responseError(message: string, status: number) {
  return Response.json(
    { accepted: false, error: { code: "event_failed", message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
