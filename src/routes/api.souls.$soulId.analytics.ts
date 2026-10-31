import { createFileRoute } from "@tanstack/react-router";
import { visitorContext } from "@/lib/visitor-context";
import { requireWorkspaceUser as requireUser } from "@/lib/server/team-store";
import { trackingSchema } from "@/lib/analytics";
import { analyticsReport, recordAnalytics, requireAnalyticsOwner } from "@/lib/analytics-store";
import { readBearerToken, verifyWidgetSession } from "@/lib/integration-security";
import { consumeRateLimit, getPublishedSoul, IntegrationStoreError } from "@/lib/integration-store";
import { originAllowed } from "@/lib/integration-security";

function headers(request: Request) {
  return {
    "access-control-allow-origin": request.headers.get("origin") || "null",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
    "cache-control": "no-store",
  };
}

export const Route = createFileRoute("/api/souls/$soulId/analytics")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => new Response(null, { status: 204, headers: headers(request) }),
      GET: async ({ request, params }) => {
        try {
          const user = await requireUser(request, { section: "analytics", write: false });
          await requireAnalyticsOwner(params.soulId, user.id);
          const days = new URL(request.url).searchParams.get("days") === "7" ? 7 : 30;
          return Response.json(await analyticsReport(params.soulId, days), {
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          return fail(error, request);
        }
      },
      POST: async ({ request, params }) => {
        try {
          const session = verifyWidgetSession(readBearerToken(request), params.soulId);
          if (request.headers.get("origin") !== session.origin)
            throw new IntegrationStoreError("Invalid tracking origin.", 403);
          const record = await getPublishedSoul(params.soulId);
          if (
            !record ||
            record.soul.channels.analyticsEnabled === false ||
            !originAllowed(session.origin, record.soul.channels.allowedDomains)
          )
            throw new IntegrationStoreError("Tracking unavailable.", 403);
          const body = await request.text();
          if (body.length > 24000) throw new IntegrationStoreError("Event batch too large.", 413);
          const parsed = trackingSchema.safeParse(JSON.parse(body));
          if (!parsed.success) throw new IntegrationStoreError("Invalid analytics events.", 400);
          if (
            !(await consumeRateLimit(
              `tracking:${params.soulId}:${session.origin}:${parsed.data.sessionId}`,
              60,
              60,
            ))
          )
            throw new IntegrationStoreError("Too many events.", 429);
          if (!(await consumeRateLimit(`tracking:${params.soulId}:${session.origin}`, 3000, 60)))
            throw new IntegrationStoreError("Too many events.", 429);
          await recordAnalytics(
            params.soulId,
            parsed.data.sessionId,
            parsed.data.events,
            visitorContext(request, process.env.VERCEL === "1"),
          );
          return Response.json({ accepted: true }, { headers: headers(request) });
        } catch (error) {
          return fail(error, request);
        }
      },
    },
  },
});

function fail(error: unknown, request: Request) {
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
            ? "Visitor analytics are temporarily unavailable."
            : error instanceof Error
              ? error.message
              : "Request failed.",
      },
    },
    { status, headers: headers(request) },
  );
}
