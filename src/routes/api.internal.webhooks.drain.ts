import { createFileRoute } from "@tanstack/react-router";
import { drainWebhookQueue } from "@/lib/integration-store";
import { pruneConversionData } from "@/lib/analytics-store";

async function drain({ request }: { request: Request }) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return Response.json({ error: { code: "unauthorized" } }, { status: 401 });
  }
  await pruneConversionData();
  const results = await drainWebhookQueue(25);
  return Response.json(
    { processed: results.length, results },
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
