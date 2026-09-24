import { createFileRoute } from "@tanstack/react-router";
import { getPublishedSoulByWidgetToken } from "@/lib/integration-store";
import { orbPalette } from "@/lib/voice-appearance";

/**
 * Public launcher styling for the embed script: label, theme, position and orb colours.
 * Nothing here is private (it is what visitors see), so it is cacheable at the edge.
 */
export const Route = createFileRoute("/api/widgets/$soulId/appearance")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const headers = {
          "access-control-allow-origin": "*",
          "x-content-type-options": "nosniff",
        };
        try {
          const token = new URL(request.url).searchParams.get("token") ?? "";
          const record = await getPublishedSoulByWidgetToken(params.soulId, token);
          if (!record || !record.soul.channels.widgetEnabled) {
            return Response.json(
              { error: { code: "widget_unavailable", message: "This widget is unavailable." } },
              { status: 404, headers: { ...headers, "cache-control": "no-store" } },
            );
          }
          const { appearance, personality } = record.soul;
          return Response.json(
            {
              label: (appearance.welcomeLabel || "Voice chat").slice(0, 28),
              theme: appearance.theme === "dark" ? "dark" : "light",
              position: appearance.position === "bottom-left" ? "bottom-left" : "bottom-right",
              orb: orbPalette(appearance.orbStyle, appearance.accent),
              agentName: personality.name.slice(0, 60),
            },
            {
              headers: {
                ...headers,
                "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
              },
            },
          );
        } catch {
          return Response.json(
            { error: { code: "widget_unavailable", message: "This widget is unavailable." } },
            { status: 404, headers: { ...headers, "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
