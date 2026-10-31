import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ sql: null as unknown }));
vi.mock("postgres", () => ({ default: () => state.sql }));
import {
  readUserWorkspace,
  saveUserWorkspace,
  refreshPublishedKnowledge,
  scheduledWorkspaces,
} from "./user-workspace-store";
import { createSoul, createWebsiteSource, type SoulWorkspace } from "./soul";
const pg = new PGlite();
beforeAll(async () => {
  function sql(strings: TemplateStringsArray, ...values: unknown[]) {
    return pg
      .query(
        strings.reduce((query, text, i) => query + (i ? `$${i}` : "") + text, ""),
        values,
      )
      .then((result) => result.rows);
  }
  sql.json = (value: unknown) => JSON.stringify(value);
  state.sql = sql;
  vi.stubEnv("DATABASE_URL", "postgres://test");
  await pg.exec(`create table obseri_user_workspaces (user_id text primary key, workspace_id text, workspace jsonb, created_at timestamptz, updated_at timestamptz);
    create table obseri_published_souls (soul_id text primary key, owner_user_id text, soul jsonb, updated_at timestamptz);`);
});
beforeEach(async () => {
  await pg.exec("truncate obseri_user_workspaces, obseri_published_souls");
});
afterAll(async () => {
  await pg.close();
  vi.unstubAllEnvs();
});
function fixture(): SoulWorkspace {
  const soul = createSoul("https://merchant.example");
  return { id: soul.workspaceId, name: "Test", activeSoulId: soul.id, souls: [soul] };
}
it("rejects stale saves without overwriting newer knowledge", async () => {
  const initial = await saveUserWorkspace("owner", fixture());
  expect(initial.revision).toBe(1);
  const updated = await saveUserWorkspace("owner", { ...initial, name: "New knowledge" });
  expect(updated.revision).toBe(2);
  await expect(saveUserWorkspace("owner", { ...initial, name: "Stale tab" })).rejects.toMatchObject(
    { status: 409 },
  );
  expect((await readUserWorkspace("owner"))?.name).toBe("New knowledge");
});
it("upgrades legacy workspaces without a revision and isolates owners", async () => {
  const old = fixture();
  await pg.query("insert into obseri_user_workspaces (user_id, workspace) values ($1,$2)", [
    "owner",
    JSON.stringify(old),
  ]);
  expect((await saveUserWorkspace("owner", old)).revision).toBe(1);
  expect(await readUserWorkspace("other")).toBeNull();
});
it("refreshes only matching published knowledge and preserves published settings", async () => {
  const before = fixture().souls[0];
  const published = { ...before, personality: { ...before.personality, name: "Live assistant" } };
  await pg.query(
    "insert into obseri_published_souls (soul_id,owner_user_id,soul) values ($1,$2,$3)",
    [before.id, "owner", JSON.stringify(published)],
  );
  const after = { ...before, knowledge: { ...before.knowledge, keywords: ["new facts"] } };
  await refreshPublishedKnowledge("wrong-owner", before, after);
  const read = async () =>
    (await pg.query<{ soul: typeof before }>("select soul from obseri_published_souls")).rows[0]
      .soul;
  expect((await read()).knowledge.keywords).toEqual(before.knowledge.keywords);
  await refreshPublishedKnowledge("owner", before, after);
  expect((await read()).knowledge.keywords).toEqual(["new facts"]);
  expect((await read()).personality.name).toBe("Live assistant");
  await refreshPublishedKnowledge("owner", before, {
    ...after,
    knowledge: { ...after.knowledge, keywords: ["stale replacement"] },
  });
  expect((await read()).knowledge.keywords).toEqual(["new facts"]);
});
it("selects scheduled sources while excluding manual-only workspaces", async () => {
  const manual = fixture();
  await saveUserWorkspace("manual", manual);
  const scheduled = fixture();
  scheduled.souls[0].knowledge.sources = [
    { ...createWebsiteSource("https://merchant.example"), cadence: "weekly" },
  ];
  await saveUserWorkspace("scheduled", scheduled);
  expect(await scheduledWorkspaces()).toEqual([]);
  await pg.exec("update obseri_user_workspaces set updated_at = now() - interval '10 minutes'");
  expect((await scheduledWorkspaces()).map((row) => row.user_id)).toEqual(["scheduled"]);
});
