import {
  scheduledWorkspaces,
  saveUserWorkspace,
  refreshPublishedKnowledge,
} from "./user-workspace-store";
import { consumeRateLimit } from "./integration-store";
import { assertWorkspaceWithinPlan, crawlPageAllowance } from "./billing-store";
import { ingestWebsite } from "./knowledge";
import { mergeSourceCrawl } from "./soul";
import { acquireImportLease, recordOperation } from "./server/operation-guards";
import { sourceRefreshDue } from "./knowledge-refresh";

export async function refreshDueKnowledge() {
  // Throttle cron retries; workspace revision checks guard overlapping runs at bucket boundaries.
  if (!(await consumeRateLimit("knowledge-refresh-worker", 1, 600)))
    return { refreshed: 0, skipped: true };
  const deadline = Date.now() + 180_000;
  let refreshed = 0;
  let failed = 0;
  for (const row of await scheduledWorkspaces()) {
    let workspace = row.workspace;
    for (const soul of row.workspace.souls) {
      for (const source of soul.knowledge.sources ?? []) {
        if (Date.now() > deadline - 10_000 || refreshed + failed >= 8) return { refreshed, failed };
        if (!sourceRefreshDue(source)) continue;
        let release: (() => Promise<void>) | undefined;
        try {
          const allowance = await crawlPageAllowance(row.user_id, workspace, source.rootUrl);
          if (allowance < 1) continue;
          release = await acquireImportLease(row.user_id);
          const currentSoul = workspace.souls.find((candidate) => candidate.id === soul.id)!;
          const crawled = await ingestWebsite({
            url: source.rootUrl,
            maxPages: Math.min(source.pageLimit, allowance),
            maxDepth: source.crawlDepth,
            rendering: source.rendering ?? "auto",
            includePatterns: source.includePatterns,
            excludePatterns: source.excludePatterns,
            timeoutMs: Math.min(45_000, deadline - Date.now() - 5000),
            validators: currentSoul.knowledge.pages
              .filter((page) => page.sourceId === source.id)
              .map(({ url, etag, lastModified }) => ({ url, etag, lastModified })),
          });
          const updatedSoul = {
            ...currentSoul,
            knowledge: mergeSourceCrawl(currentSoul.knowledge, crawled, source),
          };
          const next = {
            ...workspace,
            souls: workspace.souls.map((candidate) =>
              candidate.id === soul.id ? updatedSoul : candidate,
            ),
          };
          await assertWorkspaceWithinPlan(row.user_id, next);
          workspace = await saveUserWorkspace(row.user_id, next);
          await refreshPublishedKnowledge(row.user_id, currentSoul, updatedSoul);
          refreshed += 1;
          await recordOperation(row.user_id, "crawl", "ok", "scheduled_refresh");
        } catch (error) {
          failed += 1;
          if (release) await recordOperation(row.user_id, "crawl", "failed", "scheduled_refresh");
          // Do not log website content, credentials or database error payloads.
          console.warn("knowledge_refresh_failed", {
            status: typeof error === "object" && error && "status" in error ? error.status : 500,
          });
          if (typeof error === "object" && error && "status" in error && error.status === 409)
            break;
        } finally {
          await release?.();
        }
      }
    }
  }
  return { refreshed, failed };
}
