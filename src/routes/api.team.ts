import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { readBoundedJson } from "@/lib/server/operation-guards";
import { requireUser, UserAuthError } from "@/lib/user-auth";
import { consumeRateLimit } from "@/lib/integration-store";
import {
  acceptInvitation,
  inviteEditor,
  listWorkspaces,
  requireWorkspaceUser,
  revokeAccess,
  teamDetails,
} from "@/lib/server/team-store";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("invite"),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
  }),
  z.object({ action: z.literal("accept"), token: z.string().max(100) }),
  z.object({ action: z.literal("remove"), userId: z.string().min(1).max(200) }),
  z.object({ action: z.literal("revoke"), invitationId: z.string().uuid() }),
]);
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
function failure(error: unknown) {
  return error instanceof UserAuthError
    ? json({ error: { message: error.message } }, error.status)
    : json({ error: { message: "Team access could not be updated. Please try again." } }, 503);
}
export const Route = createFileRoute("/api/team")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          if (new URL(request.url).searchParams.get("view") === "workspaces")
            return json({ workspaces: await listWorkspaces(await requireUser(request)) });
          const owner = await requireWorkspaceUser(request, true);
          return json(await teamDetails(owner.id));
        } catch (error) {
          return failure(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const actor = await requireUser(request);
          if (!(await consumeRateLimit(`team:${actor.id}`, 20, 60)))
            throw new UserAuthError("Please wait a minute before trying again.", 429);
          const parsed = schema.safeParse(await readBoundedJson(request, 2048));
          if (!parsed.success)
            throw new UserAuthError("Check the email address and invitation details.", 400);
          const value = parsed.data;
          if (value.action === "accept")
            return json({ ownerId: await acceptInvitation(actor, value.token) });
          const owner = await requireWorkspaceUser(request, true);
          if (value.action === "invite") {
            if (value.email === actor.email?.trim().toLowerCase())
              throw new UserAuthError("You already own this workspace.", 409);
            return json({ token: await inviteEditor(owner.id, value.email) });
          }
          await revokeAccess(
            owner.id,
            value.action === "remove"
              ? { userId: value.userId }
              : { invitationId: value.invitationId },
          );
          return json({ ok: true });
        } catch (error) {
          if (error instanceof SyntaxError)
            return json({ error: { message: "Invalid request." } }, 400);
          return failure(error);
        }
      },
    },
  },
});
