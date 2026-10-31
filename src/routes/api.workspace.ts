import { createFileRoute } from "@tanstack/react-router";
import { requireWorkspaceUser, visibleWorkspace } from "@/lib/server/team-store";
import { readUserWorkspace, saveUserWorkspace } from "@/lib/user-workspace-store";
import { applyWorkspacePlanPolicy, assertWorkspaceWithinPlan } from "@/lib/billing-store";
import { normalizeWorkspace, type SoulWorkspace } from "@/lib/soul";
import {
  workspaceChanges,
  mergeWorkspaceChanges,
  assertChangesAllowed,
  changeSection,
} from "@/lib/workspace-merge";
import { readBoundedJson } from "@/lib/server/operation-guards";

const json = (body: unknown) => Response.json(body, { headers: { "cache-control": "no-store" } });
export const Route = createFileRoute("/api/workspace")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireWorkspaceUser(request);
          return json({
            workspace: visibleWorkspace(await readUserWorkspace(user.id), user),
            access: { role: user.role, permissions: user.permissions },
          });
        } catch (error) {
          return apiError(error);
        }
      },
      PUT: async ({ request }) => {
        try {
          const user = await requireWorkspaceUser(request);
          const body = (await readBoundedJson(request, 3_100_000)) as {
            workspace?: SoulWorkspace;
            base?: SoulWorkspace;
          } & SoulWorkspace;
          const value = body.workspace || body;
          if (
            !value ||
            !Array.isArray(value.souls) ||
            typeof value.name !== "string" ||
            value.souls.length > 25
          )
            throw Object.assign(new Error("Invalid workspace."), { status: 422 });
          const current = await readUserWorkspace(user.id);
          const base = body.base;
          if (base && (!Array.isArray(base.souls) || typeof base.name !== "string"))
            throw Object.assign(new Error("Invalid base workspace."), { status: 422 });
          if (!base && current && (value.revision || 0) !== (current.revision || 0))
            throw Object.assign(
              new Error("Workspace updated elsewhere. Download your local edits before reloading."),
              { status: 409 },
            );
          const empty: SoulWorkspace = {
            id: value.id,
            name: base?.name || "Obseri Workspace",
            souls: [],
            activeSoulId: null,
            revision: 0,
          };
          const baseline = base || visibleWorkspace(current, user) || empty;
          const changes = workspaceChanges(baseline, normalizeWorkspace(value));
          assertChangesAllowed(changes, user.permissions, user.role === "owner");
          if (!changes.length && current)
            return json({ workspace: visibleWorkspace(current, user) });
          // Retry only revision races. Compare each field against the supplied base on every attempt.
          for (let attempt = 0; attempt < 3; attempt++) {
            const latest = attempt === 0 ? current : await readUserWorkspace(user.id);
            const merged = mergeWorkspaceChanges(latest || empty, changes);
            merged.activeSoulId = value.activeSoulId;
            const changedIds = new Set(
              changes.filter((c) => c.path[0] === "souls").map((c) => c.path[1]),
            );
            merged.souls = merged.souls.map((s) =>
              changedIds.has(s.id) ? { ...s, updatedAt: new Date().toISOString() } : s,
            );
            const { plan } = await assertWorkspaceWithinPlan(user.id, merged);
            const saveValue = applyWorkspacePlanPolicy(merged, plan);
            const summaries = changes.map((change) => ({
              section: changeSection(change),
              field:
                change.path[0] === "souls" ? change.path.slice(2).join(".") : change.path.join("."),
              soulId: change.path[0] === "souls" ? change.path[1] : undefined,
              website:
                merged.souls.find((s) => s.id === change.path[1])?.name ||
                latest?.souls.find((s) => s.id === change.path[1])?.name,
              operation:
                change.before === undefined
                  ? "added"
                  : change.after === undefined
                    ? "removed"
                    : "updated",
            }));
            try {
              const saved = await saveUserWorkspace(user.id, saveValue, {
                actorId: user.actorUserId,
                email: user.email || "",
                changes: summaries,
              });
              return json({ workspace: visibleWorkspace(saved, user) });
            } catch (error) {
              if (
                attempt === 2 ||
                !error ||
                typeof error !== "object" ||
                !("status" in error) ||
                error.status !== 409
              )
                throw error;
            }
          }
          throw new Error("Save failed.");
        } catch (error) {
          return apiError(error);
        }
      },
    },
  },
});
function apiError(error: unknown) {
  const status =
    typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
  return Response.json(
    {
      error: {
        code: "workspace_request_failed",
        message:
          status >= 500
            ? "The workspace could not be saved."
            : error instanceof Error
              ? error.message
              : "Request failed.",
      },
    },
    { status, headers: { "cache-control": "no-store" } },
  );
}
