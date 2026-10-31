import { refreshDueKnowledge } from "@/lib/knowledge-refresh-worker";
import { createFileRoute } from "@tanstack/react-router";
import { integrationDatabase, drainWebhookQueue } from "@/lib/integration-store";
import { pruneConversionData } from "@/lib/analytics-store";

async function drain({ request }: { request: Request }) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return Response.json({ error: { code: "unauthorized" } }, { status: 401 });
  }
  await pruneConversionData();
  await integrationDatabase()`delete from obseri_operation_events where created_at < now() - interval '30 days'`;
  await integrationDatabase()`delete from obseri_embedding_budgets where month < to_char(now() - interval '3 months', 'YYYY-MM')`;
  await integrationDatabase()`delete from obseri_workspace_invitations where expires_at < now() - interval '30 days'`;
  const results = await drainWebhookQueue(25);
  const knowledge = await refreshDueKnowledge();
  return Response.json(
    { processed: results.length, results, knowledge },
    {
      headers: { "cache-control": "no-store" },
    },
  );
}

export const Route = createFileRoute("/api/internal/webhooks/drain")({
  server: {
    handlers: {
      GET: drain,
      POST: drain,
    },
  },
});
