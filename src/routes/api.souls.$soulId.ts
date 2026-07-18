import { createFileRoute } from "@tanstack/react-router";
import { getPublishedSoul } from "@/lib/published-souls";
import { readBearerToken, verifyWidgetSession } from "@/lib/integration-security";

export const Route = createFileRoute("/api/souls/$soulId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = verifyWidgetSession(readBearerToken(request), params.soulId);
          const record = await getPublishedSoul(params.soulId);
          if (!record) {
            return Response.json(
              { error: { code: "soul_not_found", message: "This soul is not published." } },
              { status: 404, headers: { "cache-control": "no-store" } },
            );
          }
          return Response.json(
            { soul: clientSafeSoul(record.soul), publishedAt: record.publishedAt },
            {
              headers: {
                "cache-control": "private, max-age=30",
                "x-content-type-options": "nosniff",
                "content-security-policy": `default-src 'none'; frame-ancestors ${session.origin}`,
              },
            },
          );
        } catch (error) {
          const status =
            typeof error === "object" && error && "status" in error ? Number(error.status) : 401;
          return Response.json(
            {
              error: {
                code: "widget_unauthorized",
                message: error instanceof Error ? error.message : "Unauthorized",
              },
            },
            { status, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});

function clientSafeSoul(soul: import("@/lib/soul").Soul) {
  return {
    ...soul,
    knowledge: {
      ...soul.knowledge,
      keywords: [],
      errors: [],
      revisions: [],
      runs: [],
      pages: [],
    },
    personality: {
      ...soul.personality,
      purpose: "Help visitors understand this website.",
      instructions: "",
      guardrails: [],
      escalationEmail: "",
    },
  };
}
