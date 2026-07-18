import { createFileRoute } from "@tanstack/react-router";
import { drainWebhookQueue } from "@/lib/integration-store";
import { readBearerToken } from "@/lib/integration-security";

export const Route = createFileRoute("/api/internal/webhooks/drain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        if (!expected || readBearerToken(request) !== expected) {
          return Response.json({ error: { code: "unauthorized" } }, { status: 401 });
        }
        const results = await drainWebhookQueue(25);
        return Response.json({ processed: results.length, results });
      },
    },
  },
});
