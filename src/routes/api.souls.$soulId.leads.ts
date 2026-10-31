import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { contactRequestSchema } from "@/lib/analytics";
import { captureLead, requireAnalyticsOwner, updateLeadStatus } from "@/lib/analytics-store";
import { readBearerToken, verifyWidgetSession, originAllowed } from "@/lib/integration-security";
import {
  consumeRateLimit,
  deliverQueuedWebhook,
  getPublishedSoul,
  IntegrationStoreError,
} from "@/lib/integration-store";
import { requireUser } from "@/lib/user-auth";

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "qualified", "won", "closed"]),
});

export const Route = createFileRoute("/api/souls/$soulId/leads")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = verifyWidgetSession(readBearerToken(request), params.soulId);
          const record = await getPublishedSoul(params.soulId);
          if (
            !record ||
            !record.soul.personality.leadCapture ||
            !originAllowed(session.origin, record.soul.channels.allowedDomains)
          )
            throw new IntegrationStoreError("Contact requests are unavailable.", 403);
          if (!(await consumeRateLimit(`contacts:${params.soulId}:${session.origin}`, 60, 60)))
            throw new IntegrationStoreError("Please try again shortly.", 429);
          const body = await request.text();
          if (body.length > 8000)
            throw new IntegrationStoreError("Contact request too large.", 413);
          const parsed = contactRequestSchema.safeParse(JSON.parse(body));
          if (!parsed.success)
            throw new IntegrationStoreError(
              "Enter your name, a valid email and request, and agree to be contacted.",
              400,
            );
          const eventId = await captureLead(params.soulId, parsed.data);
          // The request is already durable. Delivery failures are retried by the webhook worker.
          if (eventId) await deliverQueuedWebhook(eventId).catch(() => undefined);
          return Response.json({ accepted: true }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return fail(error);
        }
      },
      PATCH: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          await requireAnalyticsOwner(params.soulId, user.id);
          const parsed = statusSchema.safeParse(await request.json());
          if (!parsed.success) throw new IntegrationStoreError("Invalid lead status.", 400);
          await updateLeadStatus(params.soulId, parsed.data.id, parsed.data.status);
          return Response.json({ updated: true });
        } catch (error) {
          return fail(error);
        }
      },
    },
  },
});

function fail(error: unknown) {
  const status =
    error instanceof SyntaxError
      ? 400
      : typeof error === "object" && error && "status" in error
        ? Number(error.status)
        : 500;
  return Response.json(
    {
      error: {
        message:
          status >= 500
            ? "Your request could not be saved. Please try again."
            : error instanceof Error
              ? error.message
              : "Request failed.",
      },
    },
    { status, headers: { "cache-control": "no-store" } },
  );
}
