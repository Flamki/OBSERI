import { beforeEach, expect, it, vi } from "vitest";
import { BILLING_PLANS } from "./billing-plans";
import { refreshDueKnowledge } from "./knowledge-refresh-worker";
import {
  scheduledWorkspaces,
  saveUserWorkspace,
  refreshPublishedKnowledge,
} from "./user-workspace-store";
import { consumeRateLimit } from "./integration-store";
import { assertWorkspaceWithinPlan, crawlPageAllowance } from "./billing-store";
import { ingestWebsite } from "./knowledge";
import { acquireImportLease } from "./server/operation-guards";
import { createSoul, createWebsiteSource, type SoulWorkspace } from "./soul";
vi.mock("./user-workspace-store", () => ({
  scheduledWorkspaces: vi.fn(),
  saveUserWorkspace: vi.fn(),
  refreshPublishedKnowledge: vi.fn(),
}));
vi.mock("./integration-store", () => ({ consumeRateLimit: vi.fn() }));
vi.mock("./billing-store", () => ({
  assertWorkspaceWithinPlan: vi.fn(),
  crawlPageAllowance: vi.fn(),
}));
vi.mock("./server/operation-guards", () => ({
  acquireImportLease: vi.fn(async () => async () => {}),
  recordOperation: vi.fn(),
}));
vi.mock("./knowledge", () => ({ ingestWebsite: vi.fn() }));
function fixture(): SoulWorkspace {
  const soul = createSoul("https://merchant.example");
  soul.knowledge.sources = [
    {
      ...createWebsiteSource(soul.siteUrl, "2020-01-01T00:00:00Z"),
      cadence: "daily",
      status: "ready",
      pageLimit: 30,
    },
  ];
  return { id: "workspace", name: "Merchant", activeSoulId: soul.id, souls: [soul], revision: 4 };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(consumeRateLimit).mockResolvedValue(true);
  vi.mocked(scheduledWorkspaces).mockResolvedValue([{ user_id: "owner", workspace: fixture() }]);
  vi.mocked(crawlPageAllowance).mockResolvedValue(2);
  vi.mocked(assertWorkspaceWithinPlan).mockResolvedValue({
    plan: BILLING_PLANS.free,
    websiteCount: 1,
    indexedPages: 0,
  });
  vi.mocked(ingestWebsite).mockResolvedValue({
    ...fixture().souls[0].knowledge,
    status: "ready",
    lastCrawledAt: new Date().toISOString(),
  });
  vi.mocked(saveUserWorkspace).mockImplementation(async (_owner, workspace) => ({
    ...(workspace as SoulWorkspace),
    revision: 5,
  }));
});
it("limits scheduled crawls to the customer's allowance and saves before updating live knowledge", async () => {
  expect(await refreshDueKnowledge()).toEqual({ refreshed: 1, failed: 0 });
  expect(ingestWebsite).toHaveBeenCalledWith(
    expect.objectContaining({ maxPages: 2, timeoutMs: 45000 }),
  );
  expect(saveUserWorkspace).toHaveBeenCalledWith("owner", expect.objectContaining({ revision: 4 }));
  expect(refreshPublishedKnowledge).toHaveBeenCalledWith(
    "owner",
    expect.any(Object),
    expect.any(Object),
  );
  expect(vi.mocked(saveUserWorkspace).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(refreshPublishedKnowledge).mock.invocationCallOrder[0],
  );
});
it("does not update the published assistant when a newer workspace wins the save", async () => {
  vi.mocked(saveUserWorkspace).mockRejectedValue({ status: 409 });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    expect(await refreshDueKnowledge()).toEqual({ refreshed: 0, failed: 1 });
    expect(refreshPublishedKnowledge).not.toHaveBeenCalled();
  } finally {
    warn.mockRestore();
  }
});
it("skips exhausted allowances and throttles repeated cron requests", async () => {
  vi.mocked(crawlPageAllowance).mockResolvedValue(0);
  expect(await refreshDueKnowledge()).toEqual({ refreshed: 0, failed: 0 });
  expect(ingestWebsite).not.toHaveBeenCalled();
  vi.mocked(consumeRateLimit).mockResolvedValue(false);
  expect(await refreshDueKnowledge()).toEqual({ refreshed: 0, skipped: true });
  expect(scheduledWorkspaces).toHaveBeenCalledTimes(1);
});

it("does not start a scheduled crawl when import capacity is exhausted", async () => {
  vi.mocked(acquireImportLease).mockRejectedValueOnce(new Error("busy"));
  expect(await refreshDueKnowledge()).toEqual({ refreshed: 0, failed: 1 });
  expect(ingestWebsite).not.toHaveBeenCalled();
});
