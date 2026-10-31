import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  sql: null as unknown,
  seats: 5,
  actor: { id: "owner", email: "owner@example.com", emailVerified: true },
}));
vi.mock("./integration-store", () => ({ integrationDatabase: () => state.sql }));
vi.mock("./billing-store", () => ({
  billingSummary: async () => ({ plan: { name: "Test", limits: { seats: state.seats } } }),
}));
vi.mock("./user-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./user-auth")>()),
  requireUser: async () => state.actor,
}));
import {
  acceptInvitation,
  inviteEditor,
  listWorkspaces,
  requireWorkspaceUser,
  revokeAccess,
  teamDetails,
  updateMemberAccess,
  visibleWorkspace,
  teamActivity,
} from "./server/team-store";
import { normalizePermissions, permissionPreset } from "./workspace-access";
import { createSoul } from "./soul";
import {
  reserveEmbeddingCharacters,
  acquireImportLease,
  withinDeadline,
  readBoundedJson,
} from "./server/operation-guards";
const pg = new PGlite();
type TestSql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
  json: (value: unknown) => { jsonValue: unknown };
  begin: (fn: (tx: TestSql) => Promise<unknown>) => Promise<unknown>;
};
function adapter(db: Pick<PGlite, "query">): TestSql {
  const sql: TestSql = (strings: TemplateStringsArray, ...values: unknown[]) =>
    db
      .query(
        strings.reduce((s, t, i) => s + (i ? `$${i}` : "") + t, ""),
        // Match postgres.js: inferred JSON parameters are serialized by the driver.
        values.map((value, index) =>
          value && typeof value === "object" && "jsonValue" in value
            ? JSON.stringify(value.jsonValue)
            : strings[index + 1].startsWith("::jsonb")
              ? JSON.stringify(value)
              : value,
        ),
      )
      .then((r) => r.rows);
  sql.json = (value: unknown) => ({ jsonValue: value });
  sql.begin = (fn: (tx: TestSql) => Promise<unknown>) => pg.transaction((tx) => fn(adapter(tx)));
  return sql;
}
beforeAll(async () => {
  state.sql = adapter(pg);
  await pg.exec(
    'create schema neon_auth; create table neon_auth."user" (id text primary key, email text, "emailVerified" boolean)',
  );
  await pg.exec(
    "create table obseri_user_workspaces (user_id text primary key, workspace jsonb, created_at timestamptz default now())",
  );
  await pg.exec(await readFile("db/migrations/007_teams_and_operations.sql", "utf8"));
  await pg.exec(await readFile("db/migrations/009_team_collaboration.sql", "utf8"));
});
beforeEach(async () => {
  await pg.exec(
    "truncate obseri_user_workspaces cascade; truncate obseri_embedding_budgets, obseri_import_leases",
  );
  await pg.query(
    "insert into obseri_user_workspaces (user_id, workspace) values ('owner', '{\"name\":\"Shared\"}'), ('other', '{\"name\":\"Other\"}')",
  );
  await pg.exec(
    `truncate neon_auth."user"; insert into neon_auth."user" values ('editor','editor@example.com',true), ('unverified','editor@example.com',false), ('wrong','wrong@example.com',true)`,
  );
  state.seats = 5;
  state.actor = { id: "owner", email: "owner@example.com", emailVerified: true };
});
afterAll(() => pg.close());
it("repairs legacy JSON encoding without losing history or widening permissions", async () => {
  const permissions = { ...permissionPreset("none"), voice: "read" as const };
  const token = await inviteEditor("owner", "editor@example.com", permissions);
  // Reproduce the values persisted by the original postgres.js writes.
  await pg.query("update obseri_workspace_invitations set permissions = $1::jsonb", [
    JSON.stringify(JSON.stringify(permissions)),
  ]);
  await pg.query("update obseri_team_activity set changes = $1::jsonb", [
    JSON.stringify(JSON.stringify([{ email: "editor@example.com", permissions }])),
  ]);
  const before = await teamActivity("owner");
  expect(before.events[0].changes[0].permissions).toEqual(permissions);
  expect(before.events[0].detailsUnavailable).toBe(false);
  await acceptInvitation({ id: "editor", email: "editor@example.com", emailVerified: true }, token);
  await pg.query("update obseri_workspace_members set permissions = $1::jsonb", [
    JSON.stringify(JSON.stringify(permissions)),
  ]);
  const migration = await readFile("db/migrations/010_team_json_encoding.sql", "utf8");
  await pg.exec(migration);
  await pg.exec(migration);
  const repaired = await pg.query(
    "select jsonb_typeof(changes) as shape from obseri_team_activity",
  );
  expect(repaired.rows).toEqual([{ shape: "array" }, { shape: "array" }]);
  expect((await teamActivity("owner")).events.at(-1)).toEqual(before.events[0]);
  expect((await teamDetails("owner")).members[0].permissions).toEqual(permissions);
  state.actor = { id: "editor", email: "editor@example.com", emailVerified: true };
  await expect(requireWorkspaceUser(request(), { section: "voice" })).resolves.toBeDefined();
  await expect(
    requireWorkspaceUser(request(), { section: "voice", write: true }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(requireWorkspaceUser(request(), { section: "knowledge" })).rejects.toMatchObject({
    status: 403,
  });
});

it("keeps malformed explicit permission policies closed", () => {
  for (const value of ["broken", "null", "[]", "42", "true", JSON.stringify({ voice: "admin" })]) {
    expect(normalizePermissions(value)).toEqual(permissionPreset("none"));
  }
  expect(normalizePermissions(null)).toEqual(permissionPreset("write"));
});

it("requires an explicit Dashboard grant on existing section policies", () => {
  expect(normalizePermissions({ voice: "write" }).dashboard).toBe("none");
  expect(normalizePermissions({ dashboard: "write" }).dashboard).toBe("read");
});

it("Dashboard permission never grants access to protected section data", async () => {
  const permissions = { ...permissionPreset("none"), dashboard: "read" as const };
  await acceptInvitation(member, await inviteEditor("owner", member.email, permissions));
  state.actor = member;
  const user = await requireWorkspaceUser(request(), { section: "dashboard" });
  for (const section of [
    "knowledge",
    "voice",
    "personality",
    "conversations",
    "analytics",
    "deploy",
    "settings",
  ] as const) {
    await expect(requireWorkspaceUser(request(), { section })).rejects.toMatchObject({
      status: 403,
    });
  }
  const soul = createSoul("https://example.com");
  soul.knowledge.keywords = ["confidential knowledge"];
  soul.personality.name = "Private assistant name";
  const workspace = { id: "test", name: "Shared", souls: [soul], activeSoulId: soul.id };
  const visible = JSON.stringify(visibleWorkspace(workspace, user));
  expect(visible).not.toContain("confidential knowledge");
  expect(visible).not.toContain("Private assistant name");
  await updateMemberAccess("owner", member.id, permissionPreset("none"));
  await expect(requireWorkspaceUser(request(), { section: "dashboard" })).rejects.toMatchObject({
    status: 403,
  });
});

it("stores new invitation and access audit data as structured JSON", async () => {
  const token = await inviteEditor("owner", "editor@example.com", permissionPreset("read"));
  await acceptInvitation({ id: "editor", email: "editor@example.com", emailVerified: true }, token);
  await updateMemberAccess("owner", "editor", permissionPreset("none"));
  await revokeAccess("owner", { userId: "editor" });
  expect(
    (await pg.query("select distinct jsonb_typeof(changes) as shape from obseri_team_activity"))
      .rows,
  ).toEqual([{ shape: "array" }]);
  expect(
    (await pg.query("select jsonb_typeof(permissions) as shape from obseri_workspace_invitations"))
      .rows,
  ).toEqual([{ shape: "object" }]);
});
const member = { id: "editor", email: "editor@example.com", emailVerified: true };
const request = (owner = "owner") =>
  new Request("https://obseri.com/api/workspace", {
    headers: { "x-obseri-workspace-owner": owner },
  });
it("binds invitation acceptance to a verified email and prevents replay", async () => {
  const token = await inviteEditor("owner", member.email);
  expect(JSON.stringify(await teamDetails("owner"))).not.toContain(token);
  await expect(
    acceptInvitation({ ...member, id: "unverified", emailVerified: false }, token),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    acceptInvitation({ ...member, id: "wrong", email: "wrong@example.com" }, token),
  ).rejects.toMatchObject({ status: 403 });
  expect(await acceptInvitation(member, token)).toBe("owner");
  await expect(acceptInvitation(member, token)).rejects.toMatchObject({ status: 404 });
  expect((await listWorkspaces(member)).map((w) => w.ownerId)).toEqual(["editor", "owner"]);
});
it("denies forged workspace headers, owner actions and revoked membership", async () => {
  state.actor = member;
  await expect(requireWorkspaceUser(request())).rejects.toMatchObject({ status: 403 });
  await acceptInvitation(member, await inviteEditor("owner", member.email));
  expect(await requireWorkspaceUser(request())).toMatchObject({
    id: "owner",
    actorUserId: "editor",
    role: "editor",
  });
  await expect(requireWorkspaceUser(request(), true)).rejects.toMatchObject({ status: 403 });
  await expect(requireWorkspaceUser(request("other"))).rejects.toMatchObject({ status: 403 });
  await revokeAccess("other", { userId: member.id });
  expect((await requireWorkspaceUser(request())).id).toBe("owner");
  await revokeAccess("owner", { userId: member.id });
  await expect(requireWorkspaceUser(request())).rejects.toMatchObject({ status: 403 });
});
it("reserves seats for pending invites and invalidates reissued and revoked links", async () => {
  state.seats = 2;
  const old = await inviteEditor("owner", member.email);
  await expect(inviteEditor("owner", "another@example.com")).rejects.toMatchObject({ status: 402 });
  const replacement = await inviteEditor("owner", member.email);
  await expect(acceptInvitation(member, old)).rejects.toMatchObject({ status: 404 });
  const { invitations } = await teamDetails("owner");
  await revokeAccess("owner", { invitationId: invitations[0].id });
  await expect(acceptInvitation(member, replacement)).rejects.toMatchObject({ status: 404 });
});
it("rejects expired invitations and blocks shared access after plan expiry", async () => {
  const token = await inviteEditor("owner", member.email);
  await pg.exec("update obseri_workspace_invitations set expires_at = now() - interval '1 day'");
  await expect(acceptInvitation(member, token)).rejects.toMatchObject({ status: 404 });
  await acceptInvitation(member, await inviteEditor("owner", member.email));
  state.actor = member;
  state.seats = 1;
  await expect(requireWorkspaceUser(request())).rejects.toMatchObject({ status: 403 });
});
it("allows only the available number of concurrent invitations", async () => {
  state.seats = 3;
  const attempts = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) => inviteEditor("owner", `member${i}@example.com`)),
  );
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(2);
  expect((await teamDetails("owner")).invitations).toHaveLength(2);
});
it("reserves embedding costs atomically across concurrent requests and tenants", async () => {
  vi.stubEnv("OBSERI_EMBEDDING_MONTHLY_CHAR_LIMIT", "1000");
  try {
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () => reserveEmbeddingCharacters("owner", 100)),
    );
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    await expect(reserveEmbeddingCharacters("other", 1000)).resolves.toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
  }
});
it("compares embedding budgets numerically across different digit lengths", async () => {
  vi.stubEnv("OBSERI_EMBEDDING_MONTHLY_CHAR_LIMIT", "5000");
  try {
    await expect(reserveEmbeddingCharacters("owner", 79)).resolves.toBeUndefined();
    await expect(reserveEmbeddingCharacters("owner", 4921)).resolves.toBeUndefined();
    await expect(reserveEmbeddingCharacters("owner", 1)).rejects.toThrow("budget reached");
  } finally {
    vi.unstubAllEnvs();
  }
});
it("limits concurrent imports, releases seats and recovers expired workers", async () => {
  const releases = await Promise.all([acquireImportLease("owner"), acquireImportLease("owner")]);
  await expect(acquireImportLease("owner")).rejects.toMatchObject({ status: 429 });
  await releases[0]();
  const release = await acquireImportLease("owner");
  await release();
  await releases[1]();
  await pg.exec(
    "insert into obseri_import_leases values ('expired','owner',now() - interval '1 minute')",
  );
  const last = await acquireImportLease("owner");
  await last();
});
it("bounds unresponsive work without requiring driver cancellation", async () => {
  const controller = new AbortController();
  const pending = withinDeadline(new Promise<never>(() => {}), controller.signal);
  controller.abort(new Error("deadline"));
  await expect(pending).rejects.toThrow("deadline");
});

it("rejects oversized chunked JSON and accepts valid UTF-8 requests", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ name: "Café" }));
  const request = () =>
    new Request("https://obseri.com/api/team", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, 14));
          controller.enqueue(bytes.slice(14));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
  await expect(readBoundedJson(request(), 100)).resolves.toEqual({ name: "Café" });
  await expect(readBoundedJson(request(), 5)).rejects.toMatchObject({ status: 413 });
});

it("enforces invited section permissions and immediate owner changes", async () => {
  const permissions = {
    ...permissionPreset("none"),
    knowledge: "write" as const,
    voice: "read" as const,
  };
  await acceptInvitation(member, await inviteEditor("owner", member.email, permissions));
  state.actor = member;
  const user = await requireWorkspaceUser(request(), { section: "knowledge", write: true });
  expect(user.role).toBe("custom");
  await expect(requireWorkspaceUser(request(), { section: "voice" })).resolves.toBeDefined();
  await expect(
    requireWorkspaceUser(request(), { section: "voice", write: true }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(requireWorkspaceUser(request(), { section: "personality" })).rejects.toMatchObject({
    status: 403,
  });
  await updateMemberAccess("owner", member.id, permissionPreset("read"));
  expect((await requireWorkspaceUser(request())).role).toBe("viewer");
  await expect(
    requireWorkspaceUser(request(), { section: "knowledge", write: true }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    updateMemberAccess("other", member.id, permissionPreset("write")),
  ).rejects.toMatchObject({ status: 404 });
  const log = await teamActivity("owner");
  expect(log.events.map((e) => e.action)).toEqual([
    "member.permissions",
    "member.joined",
    "invitation.created",
  ]);
  expect(log.events[0].changes[0].after?.voice).toBe("read");
  expect((await teamActivity("other")).events).toEqual([]);
  expect((await teamActivity("owner", log.events[1].id)).events.map((e) => e.action)).toEqual([
    "invitation.created",
  ]);
});
it("redacts hidden content deterministically without changing saved data", async () => {
  await acceptInvitation(
    member,
    await inviteEditor("owner", member.email, permissionPreset("none")),
  );
  state.actor = member;
  const user = await requireWorkspaceUser(request());
  const soul = createSoul("https://example.com");
  soul.knowledge.keywords = ["private"];
  soul.personality.name = "secret name";
  const workspace = { id: "test", name: "Shared", souls: [soul], activeSoulId: soul.id };
  const visible = visibleWorkspace(workspace, user)!;
  expect(JSON.stringify(visible)).not.toContain("secret name");
  expect(visible.souls[0].knowledge.keywords).not.toContain("private");
  expect(visible.souls[0].channels.publishKey).toBe("restricted");
  expect(visibleWorkspace(workspace, user)).toEqual(visible);
  expect(workspace.souls[0].personality.name).toBe("secret name");
});
