import type { SoulWorkspace } from "./soul";
import { type AccessSection, type WorkspacePermissions, canAccess } from "./workspace-access";

export type WorkspaceChange = { path: string[]; before: unknown; after: unknown };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const ignored = new Set(["revision", "activeSoulId", "updatedAt", "workspaceId"]);
function comparable(workspace: SoulWorkspace) {
  return { name: workspace.name, souls: Object.fromEntries(workspace.souls.map((s) => [s.id, s])) };
}
export function workspaceChanges(before: SoulWorkspace, after: SoulWorkspace): WorkspaceChange[] {
  const changes: WorkspaceChange[] = [];
  function walk(a: unknown, b: unknown, path: string[]) {
    if (equal(a, b)) return;
    if (record(a) && record(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (ignored.has(key) || key === "__proto__" || key === "constructor" || key === "prototype")
          continue;
        walk(a[key], b[key], [...path, key]);
      }
    } else changes.push({ path, before: a, after: b });
  }
  walk(comparable(before), comparable(after), []);
  return changes;
}
export function changeSection(change: WorkspaceChange): AccessSection | "workspace" {
  const [root, , field] = change.path;
  if (root !== "souls" || !field) return "workspace";
  if (["knowledge", "personality", "voice", "appearance", "conversations"].includes(field))
    return field as AccessSection;
  if (field === "status" && ["draft", "learning"].includes(String(change.after)))
    return "knowledge";
  if (field === "channels" || field === "status") return "deploy";
  return "settings";
}
export function assertChangesAllowed(
  changes: WorkspaceChange[],
  permissions: WorkspacePermissions,
  owner: boolean,
) {
  for (const change of changes) {
    const section = changeSection(change);
    // Creating/deleting sites and workspace metadata is reserved for the owner.
    if (!owner && (section === "workspace" || !canAccess(permissions, section, true)))
      throw Object.assign(
        new Error(`You do not have edit access to ${section}. Ask the workspace owner.`),
        { status: 403 },
      );
  }
}
/** Objects merge field by field; ordered lists and long text are atomic conflict units. */
export function mergeWorkspaceChanges(
  current: SoulWorkspace,
  changes: WorkspaceChange[],
): SoulWorkspace {
  const tree = structuredClone(comparable(current)) as unknown as Record<string, unknown>;
  for (const change of changes) {
    if (
      !change.path.length ||
      change.path.some((p) => ["__proto__", "constructor", "prototype"].includes(p))
    )
      throw Object.assign(new Error("Invalid change."), { status: 422 });
    let target = tree;
    for (const key of change.path.slice(0, -1)) {
      if (!record(target[key]))
        throw Object.assign(
          new Error(
            "This website was removed by a teammate. Save your local edits before reloading.",
          ),
          { status: 409 },
        );
      target = target[key] as Record<string, unknown>;
    }
    const key = change.path.at(-1)!;
    if (equal(target[key], change.after)) continue;
    if (!equal(target[key], change.before))
      throw Object.assign(
        new Error(
          `A teammate also changed ${changeSection(change)} · ${key}. Download your local edits before reloading.`,
        ),
        { status: 409 },
      );
    if (change.after === undefined) delete target[key];
    else target[key] = structuredClone(change.after);
  }
  return {
    ...current,
    name: tree.name as string,
    souls: Object.values(tree.souls as Record<string, SoulWorkspace["souls"][number]>),
  };
}
