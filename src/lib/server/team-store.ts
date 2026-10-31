import { createHash, randomBytes, randomUUID } from "node:crypto";
import { integrationDatabase } from "../integration-store";
import { billingSummary } from "../billing-store";
import { requireUser, UserAuthError, type AuthenticatedUser } from "../user-auth";

import {
  normalizePermissions,
  permissionPreset,
  accessRole,
  canAccess,
  type WorkspacePermissions,
  type AccessSection,
} from "../workspace-access";
import { createSoul, normalizeWorkspace, type SoulWorkspace } from "../soul";
export type WorkspaceUser = AuthenticatedUser & {
  actorUserId: string;
  role: "owner" | "editor" | "viewer" | "custom";
  permissions: WorkspacePermissions;
};
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/** Existing stores remain keyed by the workspace owner, never by a client-supplied ID alone. */
export async function requireWorkspaceUser(
  request: Request,
  ownerOnly: boolean | { section: AccessSection; write?: boolean } = false,
): Promise<WorkspaceUser> {
  const actor = await requireUser(request);
  const owner = request.headers.get("x-obseri-workspace-owner") || actor.id;
  if (owner.length > 200) throw new UserAuthError("Invalid workspace.", 400);
  if (owner === actor.id)
    return {
      ...actor,
      actorUserId: actor.id,
      role: "owner",
      permissions: permissionPreset("write"),
    };
  if (ownerOnly === true)
    throw new UserAuthError("Only the workspace owner can manage billing and team access.", 403);
  const sql = integrationDatabase();
  const members =
    await sql`select user_id, permissions from obseri_workspace_members where owner_user_id = ${owner} order by created_at, user_id`;
  const index = members.findIndex((member) => member.user_id === actor.id);
  if (index < 0) throw new UserAuthError("You no longer have access to this workspace.", 403);
  const { plan } = await billingSummary(owner);
  if (plan.limits.seats !== null && index + 1 >= plan.limits.seats)
    throw new UserAuthError(
      "This workspace's plan does not have an available team seat. Contact its owner.",
      403,
    );
  const permissions = normalizePermissions(members[index].permissions);
  if (typeof ownerOnly === "object" && !canAccess(permissions, ownerOnly.section, ownerOnly.write))
    throw new UserAuthError(
      `You do not have ${ownerOnly.write ? "edit" : "view"} access to ${ownerOnly.section}. Ask your workspace owner.`,
      403,
    );
  return { ...actor, id: owner, actorUserId: actor.id, role: accessRole(permissions), permissions };
}

export async function listWorkspaces(actor: AuthenticatedUser) {
  const rows = await integrationDatabase()`
    select user_id as owner_id, workspace->>'name' as name,
    (select permissions from obseri_workspace_members m where m.owner_user_id = w.user_id and m.user_id = ${actor.id}) as permissions
    from obseri_user_workspaces w
    where user_id = ${actor.id} or user_id in (select owner_user_id from obseri_workspace_members where user_id = ${actor.id})
    order by created_at
  `;
  const workspaces = rows.map((row) => ({
    ownerId: String(row.owner_id),
    name: String(row.name || "Workspace"),
    role: row.owner_id === actor.id ? "owner" : accessRole(normalizePermissions(row.permissions)),
    permissions:
      row.owner_id === actor.id ? permissionPreset("write") : normalizePermissions(row.permissions),
  }));
  if (!workspaces.some((w) => w.ownerId === actor.id))
    workspaces.unshift({
      ownerId: actor.id,
      name: "My workspace",
      role: "owner",
      permissions: permissionPreset("write"),
    });
  return workspaces;
}

export async function teamDetails(owner: string) {
  const sql = integrationDatabase();
  const [members, invitations, billing] = await Promise.all([
    sql`select user_id as "userId", email, role, permissions, created_at as "createdAt" from obseri_workspace_members where owner_user_id = ${owner} order by created_at`,
    sql`select id, email, permissions, expires_at as "expiresAt" from obseri_workspace_invitations where owner_user_id = ${owner} and expires_at > now() and accepted_at is null and revoked_at is null order by created_at`,
    billingSummary(owner),
  ]);
  return { members, invitations, seatLimit: billing.plan.limits.seats, plan: billing.plan.name };
}

export async function inviteEditor(
  owner: string,
  email: string,
  permissions = permissionPreset("write"),
) {
  const sql = integrationDatabase();
  const { plan } = await billingSummary(owner);
  const token = randomBytes(32).toString("base64url");
  await sql.begin(async (tx) => {
    const workspace =
      await tx`select user_id from obseri_user_workspaces where user_id = ${owner} for update`;
    if (!workspace.length)
      throw new UserAuthError("Create your workspace before inviting a teammate.", 409);
    const duplicate =
      await tx`select user_id from obseri_workspace_members where owner_user_id = ${owner} and lower(email) = ${email}`;
    if (duplicate.length)
      throw new UserAuthError("That person already belongs to this workspace.", 409);
    // Reissuing invalidates the old link, without consuming another seat.
    await tx`update obseri_workspace_invitations set revoked_at = now() where owner_user_id = ${owner} and email = ${email} and accepted_at is null and revoked_at is null`;
    const [count] = await tx`select
      (select count(*) from obseri_workspace_members where owner_user_id = ${owner}) +
      (select count(*) from obseri_workspace_invitations where owner_user_id = ${owner} and expires_at > now() and accepted_at is null and revoked_at is null) as seats`;
    if (plan.limits.seats !== null && Number(count.seats) + 1 >= plan.limits.seats)
      throw new UserAuthError(
        `${plan.name} includes ${plan.limits.seats} seat${plan.limits.seats === 1 ? "" : "s"}. Upgrade or revoke an invitation to add a teammate.`,
        402,
      );
    await tx`insert into obseri_workspace_invitations (id, owner_user_id, email, token_hash, permissions, expires_at)
      values (${randomUUID()}, ${owner}, ${email}, ${digest(token)}, ${JSON.stringify(permissions)}::jsonb, now() + interval '7 days')`;
    await tx`insert into obseri_team_activity (owner_user_id, actor_user_id, action, changes)
      values (${owner}, ${owner}, 'invitation.created', ${JSON.stringify([{ email, permissions }])}::jsonb)`;
  });
  return token;
}

export async function acceptInvitation(actor: AuthenticatedUser, token: string) {
  if (!/^[\w-]{43}$/.test(token))
    throw new UserAuthError("This invitation is invalid or expired.", 404);
  const sql = integrationDatabase();
  // Check the current auth record: JWTs may omit this field or contain an older email.
  const [account] =
    await sql`select email, "emailVerified" as verified from neon_auth."user" where id = ${actor.id}`;
  if (!account?.email || account.verified !== true)
    throw new UserAuthError("Verify your account email before accepting a team invitation.", 403);
  const invitations =
    await sql`select owner_user_id from obseri_workspace_invitations where token_hash = ${digest(token)}`;
  const owner = invitations[0]?.owner_user_id;
  if (!owner || owner === actor.id)
    throw new UserAuthError("This invitation is invalid or belongs to your own workspace.", 404);
  const { plan } = await billingSummary(owner);
  await sql.begin(async (tx) => {
    await tx`select user_id from obseri_user_workspaces where user_id = ${owner} for update`;
    const [invite] =
      await tx`select id, email, permissions from obseri_workspace_invitations where token_hash = ${digest(token)}
      and expires_at > now() and accepted_at is null and revoked_at is null for update`;
    if (!invite)
      throw new UserAuthError("This invitation is invalid, expired, or already used.", 404);
    if (invite.email !== String(account.email).trim().toLowerCase())
      throw new UserAuthError("Sign in with the email address this invitation was sent to.", 403);
    const existing =
      await tx`select user_id from obseri_workspace_members where owner_user_id = ${owner} and user_id = ${actor.id}`;
    const [count] =
      await tx`select count(*) as seats from obseri_workspace_members where owner_user_id = ${owner}`;
    if (
      !existing.length &&
      plan.limits.seats !== null &&
      Number(count.seats) + 1 >= plan.limits.seats
    )
      throw new UserAuthError(
        "This workspace has no available team seats. Contact its owner.",
        402,
      );
    await tx`insert into obseri_workspace_members (owner_user_id, user_id, email, permissions) values (${owner}, ${actor.id}, ${invite.email}, ${JSON.stringify(normalizePermissions(invite.permissions))}::jsonb) on conflict do nothing`;
    await tx`update obseri_workspace_invitations set accepted_at = now() where id = ${invite.id}`;
    await tx`insert into obseri_team_activity (owner_user_id, actor_user_id, actor_email, action)
      values (${owner}, ${actor.id}, ${invite.email}, 'member.joined')`;
  });
  return String(owner);
}

export async function revokeAccess(
  owner: string,
  target: { userId?: string; invitationId?: string },
) {
  const sql = integrationDatabase();
  await sql.begin(async (tx) => {
    await tx`select user_id from obseri_user_workspaces where user_id = ${owner} for update`;
    if (target.userId)
      await tx`delete from obseri_workspace_members where owner_user_id = ${owner} and user_id = ${target.userId}`;
    if (target.invitationId)
      await tx`update obseri_workspace_invitations set revoked_at = now() where owner_user_id = ${owner} and id = ${target.invitationId}`;
    await tx`insert into obseri_team_activity (owner_user_id, actor_user_id, action, changes)
      values (${owner}, ${owner}, ${target.userId ? "member.removed" : "invitation.revoked"}, ${JSON.stringify([target])}::jsonb)`;
  });
}

export async function updateMemberAccess(
  owner: string,
  userId: string,
  permissions: WorkspacePermissions,
) {
  if (owner === userId) throw new UserAuthError("The owner always has full access.", 403);
  await integrationDatabase().begin(async (tx) => {
    await tx`select user_id from obseri_user_workspaces where user_id = ${owner} for update`;
    const [before] =
      await tx`select email, permissions from obseri_workspace_members where owner_user_id = ${owner} and user_id = ${userId} for update`;
    if (!before) throw new UserAuthError("This teammate no longer belongs to the workspace.", 404);
    await tx`update obseri_workspace_members set permissions = ${JSON.stringify(permissions)}::jsonb where owner_user_id = ${owner} and user_id = ${userId}`;
    await tx`insert into obseri_team_activity (owner_user_id, actor_user_id, action, changes)
      values (${owner}, ${owner}, 'member.permissions', ${JSON.stringify([{ email: before.email, before: normalizePermissions(before.permissions), after: permissions }])}::jsonb)`;
  });
}

export async function recordTeamActivity(
  user: WorkspaceUser,
  action: string,
  changes: unknown[] = [],
) {
  await integrationDatabase()`insert into obseri_team_activity (owner_user_id, actor_user_id, actor_email, action, changes)
    values (${user.id}, ${user.actorUserId}, ${user.email || ""}, ${action}, ${JSON.stringify(changes)}::jsonb)`;
}
export async function teamActivity(owner: string, before = "9223372036854775807") {
  if (!/^\d{1,19}$/.test(before) || BigInt(before) > 9223372036854775807n)
    throw new UserAuthError("Invalid activity cursor.", 400);
  const events =
    await integrationDatabase()`select id::text, actor_user_id as "actorId", actor_email as "actorEmail", action, changes, revision, created_at as "createdAt"
    from obseri_team_activity where owner_user_id = ${owner} and id < ${before}::bigint order by id desc limit 50`;
  return { events, nextCursor: events.length === 50 ? String(events.at(-1)!.id) : null };
}
/** Restricted sections never leave the server, including cached workspace reads. */
export function visibleWorkspace(
  workspace: SoulWorkspace | null,
  user: WorkspaceUser,
): SoulWorkspace | null {
  if (!workspace || user.role === "owner") return workspace;
  return normalizeWorkspace({
    ...workspace,
    souls: workspace.souls.map((soul) => {
      const blank = createSoul(soul.siteUrl, soul.name);
      blank.knowledge.sources = (blank.knowledge.sources || []).map((source) => ({
        ...source,
        createdAt: "1970-01-01T00:00:00.000Z",
      }));
      return {
        ...soul,
        knowledge: canAccess(user.permissions, "knowledge") ? soul.knowledge : blank.knowledge,
        personality: canAccess(user.permissions, "personality")
          ? soul.personality
          : blank.personality,
        voice: canAccess(user.permissions, "voice") ? soul.voice : blank.voice,
        appearance: canAccess(user.permissions, "appearance") ? soul.appearance : blank.appearance,
        channels: canAccess(user.permissions, "deploy")
          ? soul.channels
          : {
              ...blank.channels,
              publishKey: "restricted",
              widgetToken: "restricted",
              webhookSecret: "",
            },
        conversations: canAccess(user.permissions, "conversations") ? soul.conversations : [],
      };
    }),
  });
}
