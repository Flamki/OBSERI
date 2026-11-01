import { integrationDatabase } from "../integration-store";
import { billingSummary } from "../billing-store";
import { UserAuthError } from "../user-auth";
import { canAccess, normalizePermissions } from "../workspace-access";
import { inboxMutationSchema, type ConversationInbox } from "../conversation-inbox";
import type { WorkspaceUser } from "./team-store";

/** The workspace lock serializes permission changes with inbox reads and writes. */
async function withConversation<T>(
  user: WorkspaceUser,
  soulId: string,
  conversationId: string,
  write: boolean,
  work: (
    tx: ReturnType<typeof integrationDatabase>,
    assignees: ConversationInbox["assignees"],
  ) => Promise<T>,
) {
  if (!conversationId || conversationId.length > 200)
    throw new UserAuthError("Invalid conversation.", 400);
  const { plan } = await billingSummary(user.id);
  return integrationDatabase().begin(async (transaction) => {
    const tx = transaction as unknown as ReturnType<typeof integrationDatabase>;
    await tx`select user_id from obseri_user_workspaces where user_id = ${user.id} for share`;
    const members = await tx`select user_id, email, permissions from obseri_workspace_members
      where owner_user_id = ${user.id} order by created_at, user_id`;
    const active = members.filter(
      (_, index) => plan.limits.seats === null || index + 1 < plan.limits.seats,
    );
    if (user.actorUserId !== user.id) {
      const member = active.find((row) => row.user_id === user.actorUserId);
      if (!member || !canAccess(normalizePermissions(member.permissions), "conversations", write))
        throw new UserAuthError(
          "Your conversation access has changed. Contact your workspace owner.",
          403,
        );
    }
    const rows = await tx`select c.conversation_id from obseri_conversations c
      join obseri_published_souls p on p.soul_id = c.soul_id
      where c.conversation_id = ${conversationId} and c.soul_id = ${soulId} and p.owner_user_id = ${user.id}
      for update of c`;
    if (!rows.length) throw new UserAuthError("Conversation not found.", 404);
    const assignees = [
      { id: user.id, label: "Workspace owner" },
      ...active
        .filter((row) => canAccess(normalizePermissions(row.permissions), "conversations", true))
        .map((row) => ({ id: String(row.user_id), label: String(row.email) })),
    ];
    return work(tx, assignees);
  }) as Promise<T>;
}

export async function getConversationInbox(
  user: WorkspaceUser,
  soulId: string,
  conversationId: string,
  cursor?: string | null,
): Promise<ConversationInbox> {
  // UUID cursor belongs to this conversation; clients cannot jump into another tenant's notes.
  if (cursor && !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(cursor))
    throw new UserAuthError("Invalid notes cursor.", 400);
  return withConversation(user, soulId, conversationId, false, async (tx, assignees) => {
    const [state] =
      await tx`select status, assignee_id, version from obseri_conversation_inbox where conversation_id = ${conversationId}`;
    const notes = await tx`select id, actor_email, body, created_at from obseri_conversation_notes
      where conversation_id = ${conversationId} and (${cursor || null}::uuid is null or
        (created_at, id) < (select created_at, id from obseri_conversation_notes where id = ${cursor || null}::uuid and conversation_id = ${conversationId}))
      order by created_at desc, id desc limit 51`;
    const page = notes.slice(0, 50);
    return {
      status: state?.status || "open",
      assigneeId: state?.assignee_id || null,
      version: Number(state?.version || 0),
      assignees,
      hasOlderNotes: notes.length > 50,
      nextCursor: notes.length > 50 ? String(page[49].id) : null,
      notes: page
        .reverse()
        .map((note) => ({
          id: String(note.id),
          author: String(note.actor_email || "Teammate"),
          body: String(note.body),
          createdAt: new Date(note.created_at).toISOString(),
        })),
    };
  });
}

export async function mutateConversationInbox(user: WorkspaceUser, soulId: string, input: unknown) {
  const parsed = inboxMutationSchema.safeParse(input);
  if (!parsed.success)
    throw new UserAuthError(
      "Check the conversation details. Notes must contain 1–2,000 characters.",
      400,
    );
  const change = parsed.data;
  await withConversation(user, soulId, change.conversationId, true, async (tx, assignees) => {
    let operation: string;
    if (change.action === "note") {
      const inserted =
        await tx`insert into obseri_conversation_notes (id, conversation_id, actor_id, actor_email, body)
        values (${change.noteId}, ${change.conversationId}, ${user.actorUserId}, ${user.email || ""}, ${change.body})
        on conflict (id) do nothing returning id`;
      if (!inserted.length) {
        const [existing] =
          await tx`select id from obseri_conversation_notes where id = ${change.noteId}
          and conversation_id = ${change.conversationId} and actor_id = ${user.actorUserId} and body = ${change.body}`;
        if (!existing) throw new UserAuthError("This note could not be saved. Try again.", 409);
        return; // A retried request must not duplicate the note or audit event.
      }
      operation = "Added a private team note";
    } else {
      if (change.assigneeId && !assignees.some((person) => person.id === change.assigneeId))
        throw new UserAuthError("Choose a teammate with current conversation edit access.", 400);
      await tx`insert into obseri_conversation_inbox (conversation_id) values (${change.conversationId}) on conflict do nothing`;
      const [previous] =
        await tx`select status, assignee_id, version from obseri_conversation_inbox where conversation_id = ${change.conversationId} for update`;
      if (Number(previous.version) !== change.version)
        throw new UserAuthError(
          "A teammate changed this conversation. Review the latest details and try again.",
          409,
        );
      if (previous.status === change.status && previous.assignee_id === change.assigneeId) return;
      await tx`update obseri_conversation_inbox set status = ${change.status}, assignee_id = ${change.assigneeId},
        version = version + 1, updated_at = now() where conversation_id = ${change.conversationId}`;
      const assignee =
        assignees.find((person) => person.id === change.assigneeId)?.label || "Unassigned";
      operation = `Status: ${previous.status} → ${change.status}; assigned to ${assignee}`;
    }
    await tx`insert into obseri_team_activity (owner_user_id, actor_user_id, actor_email, action, changes)
      values (${user.id}, ${user.actorUserId}, ${user.email || ""}, ${change.action === "note" ? "conversation.note" : "conversation.updated"},
      ${tx.json([{ section: "conversations", field: change.conversationId, operation }])}::jsonb)`;
  });
}
