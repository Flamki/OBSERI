import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsEvent, ContactRequest } from "./analytics";

const state = vi.hoisted(() => ({ sql: null as unknown }));
vi.mock("./integration-store", () => ({
  integrationDatabase: () => state.sql,
  IntegrationStoreError: class extends Error {
    constructor(
      message: string,
      public status = 500,
    ) {
      super(message);
    }
  },
}));
vi.mock("./billing-store", () => ({ billingSummary: async () => ({ plan: { id: "launch" } }) }));
import {
  analyticsReport,
  captureLead,
  pruneConversionData,
  recordAnalytics,
  requireAnalyticsOwner,
  updateLeadStatus,
} from "./analytics-store";

const pg = new PGlite();
// Run the store's actual parameterised SQL against embedded Postgres. This adapter
// only translates postgres.js interpolation/transaction helpers, not query results.
function sqlAdapter() {
  type Fragment = { fragment: string; params: unknown[] };
  const bind = (value: unknown) => (value instanceof Date ? value.toISOString() : value);
  function sql(
    strings: TemplateStringsArray | Record<string, unknown>[],
    ...values: unknown[]
  ): unknown {
    if (!("raw" in strings)) {
      const columns = Object.keys(strings[0]);
      return {
        fragment: `(${columns.join(",")}) values ${strings.map(() => `(${columns.map(() => "?").join(",")})`).join(",")}`,
        params: strings.flatMap((row) => columns.map((column) => row[column])),
      } satisfies Fragment;
    }
    const params: unknown[] = [];
    let query = strings[0];
    values.forEach((value, index) => {
      if (value && typeof value === "object" && "fragment" in value) {
        const fragment = value as Fragment;
        let offset = 0;
        query += fragment.fragment.replace(/\?/g, () => {
          params.push(bind(fragment.params[offset++]));
          return `$${params.length}`;
        });
      } else {
        params.push(bind(value));
        query += `$${params.length}`;
      }
      query += strings[index + 1];
    });
    return pg.query(query, params).then((result) => result.rows);
  }
  sql.json = (value: unknown) => JSON.stringify(value);
  sql.begin = async (callback: (tx: typeof sql) => Promise<unknown>) => {
    await pg.exec("BEGIN");
    try {
      const result = await callback(sql);
      await pg.exec("COMMIT");
      return result;
    } catch (error) {
      await pg.exec("ROLLBACK");
      throw error;
    }
  };
  return sql;
}

beforeAll(async () => {
  for (const name of [
    "001_production_integrations.sql",
    "002_user_workspaces.sql",
    "004_conversion_analytics.sql",
  ]) {
    await pg.exec(await readFile(new URL(`../../db/migrations/${name}`, import.meta.url), "utf8"));
  }
  state.sql = sqlAdapter();
}, 20000);
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  await pg.exec("truncate obseri_published_souls cascade");
  for (const id of ["site-a", "site-b"]) {
    await pg.query(
      "insert into obseri_published_souls (soul_id,workspace_id,owner_user_id,owner_key_hash,widget_token_hash,soul,webhook_enabled,webhook_url) values ($1::text,$1::text,$1::text,$1::text,$1::text,'{}',true,'https://example.com/hook')",
      [id],
    );
  }
});
const event = (name: AnalyticsEvent["name"], source = "google"): AnalyticsEvent => ({
  id: crypto.randomUUID(),
  name,
  path: "/pricing?token=secret",
  source,
  referrer: "",
  campaign: "launch",
});
const lead = (sessionId?: string): ContactRequest => ({
  id: crypto.randomUUID(),
  conversationId: crypto.randomUUID(),
  sessionId,
  name: "Sam",
  email: "Sam@example.com",
  message: "Please help me choose",
  consent: true,
  path: "/pricing",
});

describe("durable conversion flow", () => {
  it("deduplicates retries and connects traffic to a submitted contact", async () => {
    const session = crypto.randomUUID();
    const view = event("page_view");
    await recordAnalytics("site-a", session, [view, event("conversation_started")]);
    await recordAnalytics("site-a", session, [view]);
    const contact = lead(session);
    await captureLead("site-a", contact);
    await captureLead("site-a", contact);
    await updateLeadStatus("site-a", contact.id, "won");
    const report = await analyticsReport("site-a", 30);
    expect(report.totals).toEqual({
      sessions: 1,
      pageViews: 1,
      engaged: 1,
      assisted: 1,
      contacts: 1,
      qualified: 1,
      won: 1,
    });
    expect(report.sources).toEqual([{ source: "google", sessions: 1, contacts: 1 }]);
    expect(report.leads[0].email).toBe("sam@example.com");
    expect(report.journeys[0].events[0].path).toBe("/pricing");
    const deliveries = await pg.query("select event from obseri_webhook_deliveries");
    expect(deliveries.rows).toHaveLength(1);
    expect((deliveries.rows[0] as { event: { type: string } }).event.type).toBe("lead.captured");
  });
  it("isolates tenant reports and refuses another owner's mutations", async () => {
    const contact = lead();
    await captureLead("site-b", contact);
    await expect(requireAnalyticsOwner("site-b", "site-a")).rejects.toThrow();
    await expect(updateLeadStatus("site-a", contact.id, "won")).rejects.toThrow();
    expect((await analyticsReport("site-a", 30)).totals.contacts).toBe(0);
    expect((await analyticsReport("site-b", 30)).totals.contacts).toBe(1);
  });
  it("keeps untracked requests out of the session funnel and enforces retention", async () => {
    await captureLead("site-a", lead());
    let report = await analyticsReport("site-a", 30);
    expect(report.totals.contacts).toBe(1);
    expect(report.totals.assisted).toBe(0);
    await pg.exec("update obseri_leads set created_at = now() - interval '31 days'");
    await pruneConversionData();
    report = await analyticsReport("site-a", 30);
    expect(report.totals.contacts).toBe(0);
    expect((await pg.query("select * from obseri_leads")).rows).toHaveLength(0);
  });
});
