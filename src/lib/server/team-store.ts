import { createHash, randomBytes, randomUUID } from "node:crypto";
import { integrationDatabase } from "../integration-store";
import { billingSummary } from "../billing-store";
import { requireUser, UserAuthError, type AuthenticatedUser } from "../user-auth";

export type WorkspaceUser = AuthenticatedUser & { actorUserId: string; role: "owner" | "editor" };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/** Existing stores remain keyed by the workspace owner, never by a client-supplied ID alone. */
export async function requireWorkspaceUser(
  request: Request,
  ownerOnly = false,
): Promise<WorkspaceUser> {
  const actor = await requireUser(request);
  const owner = request.headers.get("x-obseri-workspace-owner") || actor.id;
  if (owner.length > 200) throw new UserAuthError("Invalid workspace.", 400);
  if (owner === actor.id) return { ...actor, actorUserId: actor.id, role: "owner" };
  if (ownerOnly)
    throw new UserAuthError("Only the workspace owner can manage billing and team access.", 403);
  const sql = integrationDatabase();
  const members =
    await sql`select user_id from obseri_workspace_members where owner_user_id = ${owner} order by created_at, user_id`;
  const index = members.findIndex((member) => member.user_id === actor.id);
  if (index < 0) throw new UserAuthError("You no longer have access to this workspace.", 403);
  const { plan } = await billingSummary(owner);
  if (plan.limits.seats !== null && index + 1 >= plan.limits.seats)
    throw new UserAuthError(
      "This workspace's plan does not have an available team seat. Contact its owner.",
      403,
    );
  return { ...actor, id: owner, actorUserId: actor.id, role: "editor" };
}

export async function listWorkspaces(actor: AuthenticatedUser) {
  const rows = await integrationDatabase()`
    select user_id as owner_id, workspace->>'name' as name from obseri_user_workspaces
    where user_id = ${actor.id} or user_id in (select owner_user_id from obseri_workspace_members where user_id = ${actor.id})
    order by created_at
  `;
  const workspaces = rows.map((row) => ({
    ownerId: String(row.owner_id),
    name: String(row.name || "Workspace"),
    role: row.owner_id === actor.id ? "owner" : "editor",
  }));
  if (!workspaces.some((w) => w.ownerId === actor.id))
    workspaces.unshift({ ownerId: actor.id, name: "My workspace", role: "owner" });
  return workspaces;
}

export async function teamDetails(owner: string) {
  const sql = integrationDatabase();
  const [members, invitations, billing] = await Promise.all([
    sql`select user_id as "userId", email, role, created_at as "createdAt" from obseri_workspace_members where owner_user_id = ${owner} order by created_at`,
    sql`select id, email, expires_at as "expiresAt" from obseri_workspace_invitations where owner_user_id = ${owner} and expires_at > now() and accepted_at is null and revoked_at is null order by created_at`,
    billingSummary(owner),
  ]);
  return { members, invitations, seatLimit: billing.plan.limits.seats, plan: billing.plan.name };
}

export async function inviteEditor(owner: string, email: string) {
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
    await tx`insert into obseri_workspace_invitations (id, owner_user_id, email, token_hash, expires_at)
      values (${randomUUID()}, ${owner}, ${email}, ${digest(token)}, now() + interval '7 days')`;
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
      await tx`select id, email from obseri_workspace_invitations where token_hash = ${digest(token)}
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
    await tx`insert into obseri_workspace_members (owner_user_id, user_id, email) values (${owner}, ${actor.id}, ${invite.email}) on conflict do nothing`;
    await tx`update obseri_workspace_invitations set accepted_at = now() where id = ${invite.id}`;
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
  });
}
