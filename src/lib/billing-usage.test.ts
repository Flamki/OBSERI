import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ sql: null as unknown }));
vi.mock("postgres", () => ({ default: () => state.sql }));
import { finalizeUsage } from "./billing-store";
const pg = new PGlite();
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  await pg.exec(
    await readFile(new URL("../../db/migrations/003_billing.sql", import.meta.url), "utf8"),
  );
  state.sql = (strings: TemplateStringsArray, ...values: unknown[]) =>
    pg
      .query(
        strings.reduce((query, text, index) => query + (index ? `$${index}` : "") + text, ""),
        values,
      )
      .then((result) => result.rows);
}, 20000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await pg.close();
});
beforeEach(async () => {
  await pg.exec(`truncate obseri_usage_monthly, obseri_usage_reservations;
    insert into obseri_usage_monthly (owner_user_id,period_start,period_end,metric,used_units,reserved_units)
    values ('owner','2026-11-01','2026-12-01','voice_seconds',3,10), ('other','2026-11-01','2026-12-01','voice_seconds',7,10);
    insert into obseri_usage_reservations (reservation_id,owner_user_id,period_start,metric,units)
    values ('r','owner','2026-11-01','voice_seconds',10);`);
});
async function usage() {
  return (
    await pg.query<{ used: number; reserved: number }>(
      "select used_units::int as used, reserved_units::int as reserved from obseri_usage_monthly where owner_user_id='owner'",
    )
  ).rows[0];
}
it("commits actual rounded-down seconds once, without touching another owner", async () => {
  await Promise.all([finalizeUsage("r", true, 5.9), finalizeUsage("r", true, 5.9)]);
  await finalizeUsage("r", false);
  expect(await usage()).toEqual({ used: 8, reserved: 0 });
  expect(
    (
      await pg.query(
        "select used_units::int as used from obseri_usage_monthly where owner_user_id='other'",
      )
    ).rows,
  ).toEqual([{ used: 7 }]);
});
it.each([undefined, 100, -5, 0])(
  "keeps reservation bounds when actual usage is %s",
  async (actual) => {
    await finalizeUsage("r", true, actual);
    expect(await usage()).toEqual({
      used: actual === undefined || actual === 100 ? 13 : 3,
      reserved: 0,
    });
  },
);
it("releases failed work once and ignores missing or unlimited reservations", async () => {
  await finalizeUsage("r", false);
  await finalizeUsage("r", true);
  await finalizeUsage("missing", true);
  await finalizeUsage(null, true);
  expect(await usage()).toEqual({ used: 3, reserved: 0 });
});
it("rolls back the reservation status if updating usage fails", async () => {
  await pg.exec(
    "alter table obseri_usage_monthly add constraint test_usage_limit check (used_units <= 7)",
  );
  try {
    await expect(finalizeUsage("r", true)).rejects.toThrow();
    expect(await usage()).toEqual({ used: 3, reserved: 10 });
    expect(
      (await pg.query("select status from obseri_usage_reservations where reservation_id='r'"))
        .rows,
    ).toEqual([{ status: "reserved" }]);
  } finally {
    await pg.exec("alter table obseri_usage_monthly drop constraint test_usage_limit");
  }
});
