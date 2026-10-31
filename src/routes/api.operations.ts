import { createFileRoute } from "@tanstack/react-router";
import { requireWorkspaceUser } from "@/lib/server/team-store";
import { integrationDatabase } from "@/lib/integration-store";
export const Route = createFileRoute("/api/operations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireWorkspaceUser(request, { section: "knowledge", write: false });
          const events =
            await integrationDatabase()`select operation, status, max(created_at) as latest
      from obseri_operation_events where owner_user_id = ${user.id} and created_at > now() - interval '24 hours'
      group by operation, status order by latest desc`;
          return Response.json({ events }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          const status =
            typeof error === "object" && error && "status" in error ? Number(error.status) : 503;
          return Response.json(
            { error: { message: "Operation health is unavailable." } },
            { status, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
