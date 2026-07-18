import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/lib/user-auth";
import { readUserWorkspace, saveUserWorkspace } from "@/lib/user-workspace-store";

export const Route = createFileRoute("/api/workspace")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          return Response.json(
            { workspace: await readUserWorkspace(user.id) },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return apiError(error);
        }
      },
      PUT: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const length = Number(request.headers.get("content-length") ?? "0");
          if (length > 1_600_000) return apiError(new Error("Workspace payload is too large."), 413);
          const workspace = await saveUserWorkspace(user.id, await request.json());
          return Response.json({ workspace }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return apiError(error);
        }
      },
    },
  },
});

function apiError(error: unknown, overrideStatus?: number) {
  const status =
    overrideStatus ??
    (typeof error === "object" && error && "status" in error ? Number(error.status) : 500);
  const message =
    status >= 500 ? "The workspace could not be saved." : error instanceof Error ? error.message : "Request failed.";
  return Response.json(
    { error: { code: "workspace_request_failed", message } },
    { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  );
}
