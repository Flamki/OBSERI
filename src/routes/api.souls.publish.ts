import { createFileRoute } from "@tanstack/react-router";
import { publishSoul } from "@/lib/published-souls";
import type { Soul } from "@/lib/soul";
import { requireUser } from "@/lib/user-auth";

export const Route = createFileRoute("/api/souls/publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const length = Number(request.headers.get("content-length") ?? "0");
          if (length > 900_000) return responseError("Soul payload is too large.", 413);
          const user = await requireUser(request);
          const value = (await request.json()) as Partial<Soul>;
          const record = await publishSoul({
            value,
            ownerKey: request.headers.get("x-obseri-publish-key") ?? "",
            widgetToken: value.channels?.widgetToken ?? "",
            ownerUserId: user.id,
          });
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
            error instanceof SyntaxError
              ? 400
              : typeof error === "object" && error && "status" in error
                ? Number(error.status)
                : 422,
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
