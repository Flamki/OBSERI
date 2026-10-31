import type { KnowledgeSource } from "./soul";
export function sourceRefreshDue(source: KnowledgeSource, now = Date.now()): boolean {
  if (
    !["website", "sitemap"].includes(source.type) ||
    source.status === "paused" ||
    source.cadence === "manual"
  )
    return false;
  const days = { daily: 1, weekly: 7, monthly: 30 }[source.cadence];
  const last = Date.parse(source.lastCrawledAt ?? source.createdAt);
  return !Number.isFinite(last) || now - last >= days * 86_400_000;
}
