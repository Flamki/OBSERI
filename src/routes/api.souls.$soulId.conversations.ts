import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/lib/user-auth";
import { listOwnerConversations } from "@/lib/integration-store";

export const Route = createFileRoute("/api/souls/$soulId/conversations")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const limit = Number(new URL(request.url).searchParams.get("limit") ?? "100");
          const conversations = await listOwnerConversations({
            soulId: params.soulId,
            ownerUserId: user.id,
            limit: Number.isFinite(limit) ? limit : 100,
          });
          return Response.json(
            { conversations },
            { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
          );
        } catch (error) {
          const status =
            typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
          const message =
            status >= 500
              ? "Conversations could not be loaded."
              : error instanceof Error
                ? error.message
                : "Request failed.";
          return Response.json(
            { error: { code: "conversations_request_failed", message } },
            {
              status,
              headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
            },
          );
        }
      },
    },
  },
});
