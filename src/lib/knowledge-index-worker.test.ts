import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSoul } from "./soul";
import {
  claimKnowledgeIndex,
  finishKnowledgeIndex,
  maintainKnowledgeIndexes,
} from "./server/knowledge-index-worker";

const state = vi.hoisted(() => ({ sql: null as unknown }));
const warm = vi.hoisted(() => vi.fn());
vi.mock("./integration-store", () => ({ integrationDatabase: () => state.sql }));
vi.mock("./server/semantic-search", () => ({ warmKnowledgeIndex: warm }));
let pg: PGlite;
const signal = () => AbortSignal.timeout(5000);
beforeEach(async () => {
  pg = new PGlite();
  state.sql = (parts: TemplateStringsArray, ...values: unknown[]) =>
    pg
      .query(
        parts.reduce((query, part, i) => query + (i ? `$${i}` : "") + part, ""),
        values,
      )
      .then((result) => result.rows);
  await pg.exec(
    `create table obseri_published_souls (soul_id text primary key, owner_user_id text, soul jsonb, updated_at timestamptz not null default now());`,
  );
  const migration = readFileSync("db/migrations/011_semantic_index_schedule.sql", "utf8");
  await pg.exec(migration);
  await pg.exec(migration);
  warm.mockReset();
});
afterEach(async () => {
  await pg.close();
});
async function add(id: string, owner = "owner-a", age = 2) {
  await pg.query(
    `insert into obseri_published_souls (soul_id, owner_user_id, soul, semantic_index_due_at) values ($1,$2,$3,now()-($4 * interval '1 day'))`,
    [id, owner, JSON.stringify(createSoul("https://example.com")), age],
  );
}
it("claims oldest jobs once and preserves tenant ownership", async () => {
  await add("newer");
  await add("older", "owner-b", 3);
  const first = await claimKnowledgeIndex(signal());
  const second = await claimKnowledgeIndex(signal());
  expect(first).toMatchObject({ soul_id: "older", owner_user_id: "owner-b" });
  expect(second?.soul_id).toBe("newer");
  expect(await claimKnowledgeIndex(signal())).toBeUndefined();
});
it("cannot finish a job after republishing or losing its lease", async () => {
  await add("republished");
  const job = (await claimKnowledgeIndex(signal()))!;
  await pg.exec(
    `update obseri_published_souls set updated_at = now(), semantic_index_due_at = now() - interval '1 second'`,
  );
  await finishKnowledgeIndex(job, true, signal());
  const replacement = (await claimKnowledgeIndex(signal()))!;
  expect(replacement).toBeDefined();
  // Model a later worker's lease explicitly; PGlite's clock can return the same
  // millisecond for two immediate claims, unlike an actual five-minute expiry.
  const renewed = (
    await pg.query<{ lease: string }>(
      `update obseri_published_souls set semantic_index_due_at = semantic_index_due_at + interval '5 minutes' returning semantic_index_due_at::text as lease`,
    )
  ).rows[0];
  await finishKnowledgeIndex(replacement, true, signal());
  const row = (
    await pg.query<{ lease: string }>(
      `select semantic_index_due_at::text as lease from obseri_published_souls`,
    )
  ).rows[0];
  expect(row.lease).toBe(renewed.lease);
});
it("retries partial indexes next day and renews complete indexes before expiry", async () => {
  await add("complete", "owner-a", 4);
  await add("partial", "owner-b", 3);
  warm
    .mockResolvedValueOnce({ indexed: 2, total: 2 })
    .mockResolvedValueOnce({ indexed: 1, total: 2 });
  expect(await maintainKnowledgeIndexes(10_000)).toEqual({
    processed: 2,
    complete: 1,
    interrupted: false,
  });
  expect(warm.mock.calls.map((call) => call[0])).toEqual(["owner-a", "owner-b"]);
  const rows = (
    await pg.query<{ soul_id: string; days: number }>(
      `select soul_id, extract(epoch from (semantic_index_due_at-now()))/86400 as days from obseri_published_souls order by soul_id`,
    )
  ).rows;
  expect(Number(rows[0].days)).toBeCloseTo(14, 2);
  expect(Number(rows[1].days)).toBeCloseTo(1, 2);
});
