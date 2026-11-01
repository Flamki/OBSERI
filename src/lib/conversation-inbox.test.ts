import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ sql: null as unknown, seats: 5 as number | null }));
vi.mock("./integration-store", () => ({ integrationDatabase: () => state.sql }));
vi.mock("./billing-store", () => ({
  billingSummary: async () => ({ plan: { limits: { seats: state.seats } } }),
}));
import {
  getConversationInbox as read,
  mutateConversationInbox as mutate,
} from "./server/conversation-inbox-store";
import { permissionPreset } from "./workspace-access";
import type { WorkspaceUser } from "./server/team-store";
const pg = new PGlite();
type Sql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
  json: (value: unknown) => { jsonValue: unknown };
  begin: (fn: (tx: Sql) => Promise<unknown>) => Promise<unknown>;
};
function adapter(db: Pick<PGlite, "query">): Sql {
  const sql: Sql = (strings, ...values) =>
    db
      .query(
        strings.reduce((s, t, i) => s + (i ? `$${i}` : "") + t, ""),
        values.map((v) =>
          v && typeof v === "object" && "jsonValue" in v ? JSON.stringify(v.jsonValue) : v,
        ),
      )
      .then((r) => r.rows);
  sql.json = (value) => ({ jsonValue: value });
  sql.begin = (fn) => pg.transaction((tx) => fn(adapter(tx)));
  return sql;
}
const owner = {
  id: "owner",
  actorUserId: "owner",
  email: "owner@example.com",
  emailVerified: true,
  role: "owner",
  permissions: permissionPreset("write"),
} as WorkspaceUser;
const editor = {
  ...owner,
  actorUserId: "editor",
  email: "editor@example.com",
  role: "editor",
} as WorkspaceUser;
const update = (extra = {}) => ({
  action: "update",
  conversationId: "c1",
  version: 0,
  status: "waiting",
  assigneeId: "editor",
  ...extra,
});
const note = (extra = {}) => ({
  action: "note",
  conversationId: "c1",
  noteId: randomUUID(),
  body: "Private handoff context",
  ...extra,
});
beforeAll(async () => {
  state.sql = adapter(pg);
  await pg.exec(`create table obseri_user_workspaces(user_id text primary key);
    create table obseri_published_souls(soul_id text primary key, owner_user_id text);
    create table obseri_conversations(conversation_id text primary key, soul_id text references obseri_published_souls(soul_id), messages jsonb default '[]');`);
  for (const file of [
    "007_teams_and_operations",
    "009_team_collaboration",
    "012_conversation_inbox",
  ])
    await pg.exec(await readFile(`db/migrations/${file}.sql`, "utf8"));
  // Applying the new migration twice is safe.
  await pg.exec(await readFile("db/migrations/012_conversation_inbox.sql", "utf8"));
});
beforeEach(async () => {
  state.seats = 5;
  await pg.exec(`truncate obseri_user_workspaces, obseri_published_souls cascade;
    insert into obseri_user_workspaces values ('owner'), ('other');
    insert into obseri_published_souls values ('s1','owner'), ('s2','other');
    insert into obseri_conversations(conversation_id,soul_id) values ('c1','s1'), ('c2','s2');`);
  await pg.query(
    "insert into obseri_workspace_members(owner_user_id,user_id,email,permissions) values ('owner','editor','editor@example.com',$1::jsonb)",
    [JSON.stringify(permissionPreset("write"))],
  );
});
afterAll(() => pg.close());
it("assigns only eligible editors, saves status and records the actual actor", async () => {
  expect(await read(owner, "s1", "c1")).toMatchObject({
    status: "open",
    assigneeId: null,
    version: 0,
    notes: [],
  });
  await mutate(editor, "s1", update());
  expect(await read(owner, "s1", "c1")).toMatchObject({
    status: "waiting",
    assigneeId: "editor",
    version: 1,
  });
  const events = await pg.query<{ actor_user_id: string; changes: unknown }>(
    "select actor_user_id, changes from obseri_team_activity",
  );
  expect(events.rows[0].actor_user_id).toBe("editor");
  expect(events.rows[0].changes).toEqual([
    {
      section: "conversations",
      field: "c1",
      operation: "Status: open → waiting; assigned to editor@example.com",
    },
  ]);
  await expect(
    mutate(owner, "s1", update({ assigneeId: "other", version: 1 })),
  ).rejects.toMatchObject({ status: 400 });
});
it("rejects stale writes instead of overwriting another teammate", async () => {
  const attempts = await Promise.allSettled([
    mutate(owner, "s1", update()),
    mutate(editor, "s1", update({ status: "resolved" })),
  ]);
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(attempts.find((r) => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
  expect((await read(owner, "s1", "c1")).version).toBe(1);
});
it("isolates tenants and binds conversation IDs to their website", async () => {
  for (const [soul, conversation] of [
    ["s1", "c2"],
    ["s2", "c2"],
    ["s2", "c1"],
  ]) {
    await expect(read(owner, soul, conversation)).rejects.toMatchObject({ status: 404 });
    await expect(mutate(owner, soul, note({ conversationId: conversation }))).rejects.toMatchObject(
      { status: 404 },
    );
  }
});
it("rechecks revoked access and plan limits even with an old authenticated user object", async () => {
  state.seats = 1;
  await expect(read(editor, "s1", "c1")).rejects.toMatchObject({ status: 403 });
  await expect(mutate(owner, "s1", update())).rejects.toMatchObject({ status: 400 });
  state.seats = 5;
  await pg.exec("delete from obseri_workspace_members where user_id='editor'");
  await expect(read(editor, "s1", "c1")).rejects.toMatchObject({ status: 403 });
  await expect(mutate(editor, "s1", note())).rejects.toMatchObject({ status: 403 });
});
it("viewers can read notes but cannot write or receive assignments", async () => {
  await mutate(owner, "s1", note());
  await pg.query("update obseri_workspace_members set permissions=$1::jsonb", [
    JSON.stringify(permissionPreset("read")),
  ]);
  expect((await read(editor, "s1", "c1")).notes).toHaveLength(1);
  expect((await read(owner, "s1", "c1")).assignees).toEqual([
    { id: "owner", label: "Workspace owner" },
  ]);
  await expect(mutate(editor, "s1", note())).rejects.toMatchObject({ status: 403 });
  await expect(mutate(editor, "s1", update())).rejects.toMatchObject({ status: 403 });
  await pg.query("update obseri_workspace_members set permissions=$1::jsonb", [
    JSON.stringify(permissionPreset("none")),
  ]);
  await expect(read(editor, "s1", "c1")).rejects.toMatchObject({ status: 403 });
});
it("retries notes idempotently, keeps them out of transcripts and excludes their contents from the audit log", async () => {
  const input = note();
  await mutate(editor, "s1", input);
  await mutate(editor, "s1", input);
  expect((await read(owner, "s1", "c1")).notes).toHaveLength(1);
  await expect(mutate(owner, "s1", input)).rejects.toMatchObject({ status: 409 });
  await expect(mutate(editor, "s1", { ...input, body: "different" })).rejects.toMatchObject({
    status: 409,
  });
  const events = await pg.query("select * from obseri_team_activity");
  expect(events.rows).toHaveLength(1);
  expect(JSON.stringify(events.rows)).not.toContain(input.body);
  expect(
    (await pg.query("select messages from obseri_conversations where conversation_id='c1'")).rows,
  ).toEqual([{ messages: [] }]);
  await pg.exec(
    `update obseri_conversations set messages='[{"role":"visitor","content":"New message"}]' where conversation_id='c1'`,
  );
  expect((await read(owner, "s1", "c1")).notes).toHaveLength(1);
});
it("paginates notes without duplicates and removes them with the conversation", async () => {
  for (let i = 0; i < 53; i++) await mutate(owner, "s1", note({ body: `Note ${i}` }));
  const page = await read(owner, "s1", "c1");
  expect(page.notes).toHaveLength(50);
  const older = await read(owner, "s1", "c1", page.nextCursor);
  expect(older.notes).toHaveLength(3);
  expect(older.nextCursor).toBeNull();
  expect(new Set([...page.notes, ...older.notes].map((n) => n.id)).size).toBe(53);
  const other = { ...owner, id: "other", actorUserId: "other" };
  expect((await read(other, "s2", "c2", page.nextCursor)).notes).toHaveLength(0);
  await mutate(owner, "s1", update());
  await pg.exec("delete from obseri_conversations where conversation_id='c1'");
  expect((await pg.query("select * from obseri_conversation_notes")).rows).toHaveLength(0);
  expect((await pg.query("select * from obseri_conversation_inbox")).rows).toHaveLength(0);
});
it("bounds input and rejects unknown actions or forged fields", async () => {
  for (const input of [
    note({ body: " " }),
    note({ body: "x".repeat(2001) }),
    note({ actor_id: "other" }),
    update({ version: -1 }),
    update({ status: "invalid" }),
  ])
    await expect(mutate(owner, "s1", input)).rejects.toMatchObject({ status: 400 });
  await expect(read(owner, "s1", "c1", "invalid")).rejects.toMatchObject({ status: 400 });
});
