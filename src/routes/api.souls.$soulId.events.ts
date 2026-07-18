import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  consumeRateLimit,
  deliverQueuedWebhook,
  persistConversation,
} from "@/lib/integration-store";
import { readBearerToken, verifyWidgetSession } from "@/lib/integration-security";

const schema = z.object({
  conversationId: z.string().uuid(),
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
          const session = verifyWidgetSession(readBearerToken(request), params.soulId);
          const allowed = await consumeRateLimit(
            `events:${params.soulId}:${session.origin}`,
            120,
            60,
          );
          if (!allowed) return responseError("Too many widget events. Try again shortly.", 429);
          const parsed = schema.safeParse(await request.json());
          if (!parsed.success) return responseError("The conversation event is invalid.", 400);
          const now = new Date().toISOString();
          const eventId = await persistConversation({
            soulId: params.soulId,
            origin: session.origin,
            conversation: {
              id: parsed.data.conversationId,
              startedAt: parsed.data.messages[0]?.createdAt ?? now,
              updatedAt: now,
              channel: "widget",
              visitorLabel: "Website visitor",
              leadIntent: parsed.data.leadIntent,
              messages: parsed.data.messages,
            },
          });
          const delivery = eventId ? await deliverQueuedWebhook(eventId) : null;
          return Response.json({ accepted: true, eventId, delivery });
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
    { accepted: false, error: { code: "event_failed", message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
