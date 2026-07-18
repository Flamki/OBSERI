import { createFileRoute } from "@tanstack/react-router";
import { createWidgetSession, originAllowed } from "@/lib/integration-security";
import { consumeRateLimit, getPublishedSoulByWidgetToken } from "@/lib/integration-store";

export const Route = createFileRoute("/api/widgets/$soulId/session")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const origin = request.headers.get("origin") ?? "";
        const headers = corsHeaders(origin);
        try {
          const token = new URL(request.url).searchParams.get("token") ?? "";
          const record = await getPublishedSoulByWidgetToken(params.soulId, token);
          if (!record || !record.soul.channels.widgetEnabled) {
            return jsonError("This widget is unavailable.", 404, headers);
          }
          if (!originAllowed(origin, record.soul.channels.allowedDomains)) {
            return jsonError("This domain is not allowed to load the widget.", 403, headers);
          }
          const allowed = await consumeRateLimit(`session:${params.soulId}:${origin}`, 30, 60);
          if (!allowed) return jsonError("Too many session requests.", 429, headers);
          return Response.json(
            { session: createWidgetSession(params.soulId, origin), parentOrigin: origin },
            { headers: { ...headers, "cache-control": "no-store" } },
          );
        } catch (error) {
          const status =
            typeof error === "object" && error && "status" in error ? Number(error.status) : 401;
          return jsonError(
            error instanceof Error ? error.message : "Widget session failed.",
            status,
            headers,
          );
        }
      },
    },
  },
});

function corsHeaders(origin: string) {
  return {
    "access-control-allow-origin": origin || "null",
    vary: "Origin",
    "x-content-type-options": "nosniff",
  };
}

function jsonError(message: string, status: number, headers: Record<string, string>) {
  return Response.json(
    { error: { code: "widget_session_failed", message } },
    { status, headers: { ...headers, "cache-control": "no-store" } },
  );
}
