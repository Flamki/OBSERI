import { createHash } from "node:crypto";
import postgres from "postgres";
import { normalizeWorkspace, type SoulWorkspace } from "@/lib/soul";

type Sql = ReturnType<typeof postgres>;
let client: Sql | undefined;

function db() {
  if (client) return client;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new WorkspaceStoreError("Workspace storage is unavailable.", 503);
  client = postgres(url, { max: 2, idle_timeout: 20, connect_timeout: 10, prepare: false });
  return client;
}

export async function readUserWorkspace(userId: string): Promise<SoulWorkspace | null> {
  const rows = await db()<Array<{ workspace: SoulWorkspace }>>`
    select workspace from obseri_user_workspaces where user_id = ${userId}
  `;
  return rows[0]?.workspace ? normalizeWorkspace(rows[0].workspace) : null;
}

export async function saveUserWorkspace(
  userId: string,
  value: unknown,
): Promise<SoulWorkspace> {
  if (!isWorkspace(value)) throw new WorkspaceStoreError("The workspace payload is invalid.", 422);
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 1_500_000) {
    throw new WorkspaceStoreError("The workspace is too large to save.", 413);
  }

  const workspaceId = workspaceIdForUser(userId);
  const normalized = normalizeWorkspace(structuredClone(value));
  normalized.id = workspaceId;
  normalized.name = normalized.name.trim().slice(0, 100) || "My Obseri Workspace";
  normalized.souls = normalized.souls.slice(0, 25).map((soul) => ({
    ...soul,
    workspaceId,
    conversations: soul.conversations.slice(-250),
  }));
  if (!normalized.souls.some((soul) => soul.id === normalized.activeSoulId)) {
    normalized.activeSoulId = normalized.souls[0]?.id ?? null;
  }

  const now = new Date().toISOString();
  await db()`
    insert into obseri_user_workspaces (user_id, workspace_id, workspace, created_at, updated_at)
    values (${userId}, ${workspaceId}, ${db().json(normalized)}, ${now}, ${now})
    on conflict (user_id) do update set
      workspace_id = excluded.workspace_id,
      workspace = excluded.workspace,
      updated_at = excluded.updated_at
  `;
  return normalized;
}

export function workspaceIdForUser(userId: string) {
  return `ws_${createHash("sha256").update(userId).digest("hex").slice(0, 24)}`;
}

function isWorkspace(value: unknown): value is SoulWorkspace {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SoulWorkspace>;
  return (
    typeof candidate.name === "string" &&
    candidate.name.length <= 100 &&
    Array.isArray(candidate.souls) &&
    candidate.souls.length <= 25 &&
    (candidate.activeSoulId === null || typeof candidate.activeSoulId === "string")
  );
}

export class WorkspaceStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WorkspaceStoreError";
  }
}
