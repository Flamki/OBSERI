import { createFileRoute } from "@tanstack/react-router";
import { publishSoul } from "@/lib/published-souls";

export const Route = createFileRoute("/api/souls/publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const length = Number(request.headers.get("content-length") ?? "0");
          if (length > 900_000) return responseError("Soul payload is too large.", 413);
          const record = publishSoul(await request.json());
          return Response.json(
            {
              soulId: record.soul.id,
              status: record.soul.status,
              publishedAt: record.publishedAt,
            },
            { status: 201, headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return responseError(
            error instanceof Error ? error.message : "The soul could not be published.",
            error instanceof SyntaxError ? 400 : 422,
          );
        }
      },
    },
  },
});

function responseError(message: string, status: number) {
  return Response.json(
    { error: { code: "publish_failed", message } },
    { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  );
}
