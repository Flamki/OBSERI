import { createFileRoute } from "@tanstack/react-router";
import { requireWorkspaceUser as requireUser } from "@/lib/server/team-store";
import { listOwnerConversations, consumeRateLimit } from "@/lib/integration-store";
import {
  getConversationInbox,
  mutateConversationInbox,
} from "@/lib/server/conversation-inbox-store";
import { readBoundedJson } from "@/lib/server/operation-guards";
import { UserAuthError } from "@/lib/user-auth";

export const Route = createFileRoute("/api/souls/$soulId/conversations")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const user = await requireUser(request, { section: "conversations", write: false });
          const url = new URL(request.url);
          if (url.searchParams.has("inbox")) {
            return Response.json(
              {
                inbox: await getConversationInbox(
                  user,
                  params.soulId,
                  url.searchParams.get("inbox") || "",
                  url.searchParams.get("before"),
                ),
              },
              { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
            );
          }
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
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request, { section: "conversations", write: true });
          if (!(await consumeRateLimit(`inbox:${user.actorUserId}`, 60, 60)))
            throw new UserAuthError("Please wait a minute before making more changes.", 429);
          await mutateConversationInbox(user, params.soulId, await readBoundedJson(request, 12000));
          return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          const status =
            error instanceof UserAuthError
              ? error.status
              : error instanceof SyntaxError
                ? 400
                : 503;
          return Response.json(
            {
              error: {
                message:
                  status >= 500
                    ? "The conversation could not be updated. Try again."
                    : error instanceof Error
                      ? error.message
                      : "Invalid request.",
              },
            },
            { status, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
