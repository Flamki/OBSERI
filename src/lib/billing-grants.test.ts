import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ sql: null as unknown }));
vi.mock("postgres", () => ({ default: () => state.sql }));
import { billingSummary } from "./billing-store";
const pg = new PGlite();

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  for (const file of ["003_billing.sql", "008_plan_grants.sql"])
    await pg.exec(await readFile(new URL("../../db/migrations/" + file, import.meta.url), "utf8"));
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
  await pg.exec("truncate obseri_billing_subscriptions, obseri_plan_grants, obseri_usage_monthly");
});
async function grant() {
  await pg.exec(`insert into obseri_plan_grants (id,owner_user_id,plan_id,reason)
    values ('00000000-0000-4000-8000-000000000001','owner','growth','Owner testing')`);
}

it("grants normal Growth limits only to its owner without a fake payment subscription", async () => {
  await grant();
  const summary = await billingSummary("owner");
  expect(summary.plan.id).toBe("growth");
  expect(summary.plan.limits.seats).toBe(5);
  expect(summary.plan.limits.textResponsesPerMonth).toBe(5000);
  expect(summary.subscription).toBeNull();
  expect(summary.complimentary).toEqual({ expiresAt: null });
  expect((await billingSummary("other")).plan.id).toBe("free");
});

it.each(["revoked", "expired"])("ignores %s grants", async (status) => {
  await grant();
  await pg.exec(
    status === "revoked"
      ? "update obseri_plan_grants set revoked_at=now()"
      : "update obseri_plan_grants set created_at=now()-interval '2 days', expires_at=now()-interval '1 day'",
  );
  const summary = await billingSummary("owner");
  expect(summary.plan.id).toBe("free");
  expect(summary.complimentary).toBeNull();
});

it("retains usage already consumed this month when access is granted", async () => {
  await pg.exec(`insert into obseri_usage_monthly (owner_user_id,period_start,period_end,metric,used_units,reserved_units)
    values ('owner',date_trunc('month',now())::date,(date_trunc('month',now())+interval '1 month')::date,'text_responses',80,3)`);
  await grant();
  expect((await billingSummary("owner")).usage.textResponses).toBe(83);
});

it("keeps an active paid plan authoritative over a complimentary grant", async () => {
  await grant();
  await pg.exec(`insert into obseri_billing_subscriptions
    (provider_subscription_id,owner_user_id,provider_plan_id,plan_id,billing_cycle,status)
    values ('sub_paid','owner','plan_paid','scale','monthly','active')`);
  const summary = await billingSummary("owner");
  expect(summary.plan.id).toBe("scale");
  expect(summary.complimentary).toBeNull();
  expect(summary.subscription?.id).toBe("sub_paid");
});
