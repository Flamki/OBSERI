import { integrationDatabase } from "../integration-store";
import { activeKnowledgeChunks } from "../knowledge-content";
import type { Soul } from "../soul";
import { warmKnowledgeIndex } from "./semantic-search";
import { withinDeadline } from "./operation-guards";

type IndexJob = {
  soul_id: string;
  owner_user_id: string;
  soul: Soul;
  revision: string;
  lease: string;
};

export async function claimKnowledgeIndex(signal: AbortSignal): Promise<IndexJob | undefined> {
  const rows = await withinDeadline(
    integrationDatabase()<IndexJob[]>`
    with candidate as (
      select soul_id from obseri_published_souls
      where owner_user_id is not null and semantic_index_due_at <= now()
      order by semantic_index_due_at, soul_id
      for update skip locked limit 1
    )
    update obseri_published_souls p
    set semantic_index_due_at = now() + interval '5 minutes'
    from candidate c where p.soul_id = c.soul_id
    returning p.soul_id, p.owner_user_id, p.soul,
      p.updated_at::text as revision, p.semantic_index_due_at::text as lease
  `,
    signal,
  );
  return rows[0];
}

export async function finishKnowledgeIndex(job: IndexJob, complete: boolean, signal: AbortSignal) {
  // A new publication or another worker's lease must never be marked complete.
  await withinDeadline(
    integrationDatabase()`
    update obseri_published_souls
    set semantic_index_due_at = now() + (${complete ? 14 : 1} * interval '1 day')
    where soul_id = ${job.soul_id} and owner_user_id = ${job.owner_user_id}
      and updated_at = ${job.revision}::timestamptz
      and semantic_index_due_at = ${job.lease}::timestamptz
  `,
    signal,
  );
}

/** Daily cron renews active vectors before expiry; unfinished batches resume next run. */
export async function maintainKnowledgeIndexes(budgetMs = 30_000) {
  const deadline = Date.now() + budgetMs;
  const signal = AbortSignal.timeout(budgetMs);
  let processed = 0;
  let complete = 0;
  try {
    while (Date.now() < deadline - 1500 && processed < 20) {
      const job = await claimKnowledgeIndex(signal);
      if (!job) break;
      const soul = typeof job.soul === "string" ? (JSON.parse(job.soul) as Soul) : job.soul;
      const result = await warmKnowledgeIndex(
        job.owner_user_id,
        activeKnowledgeChunks(soul.knowledge),
        Math.max(1, deadline - Date.now() - 1000),
      );
      const ready = result.indexed === result.total;
      await finishKnowledgeIndex(job, ready, signal);
      processed++;
      if (ready) complete++;
    }
  } catch {
    // Interrupted claims are eligible again after their lease, without blocking cron cleanup.
    return { processed, complete, interrupted: true };
  }
  return { processed, complete, interrupted: false };
}
