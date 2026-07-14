import { createFileRoute } from "@tanstack/react-router";
import { getPublishedSoul } from "@/lib/published-souls";

export const Route = createFileRoute("/api/souls/$soulId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const record = getPublishedSoul(params.soulId);
        if (!record) {
          return Response.json(
            { error: { code: "soul_not_found", message: "This soul is not published." } },
            { status: 404, headers: { "cache-control": "no-store" } },
          );
        }
        return Response.json(
          { soul: record.soul, publishedAt: record.publishedAt },
          {
            headers: {
              "cache-control": "public, max-age=30, stale-while-revalidate=60",
              "x-content-type-options": "nosniff",
            },
          },
        );
      },
    },
  },
});
