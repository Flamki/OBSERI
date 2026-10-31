import { describe, expect, it } from "vitest";
import { createSoul, type SoulWorkspace } from "./soul";
import { permissionPreset } from "./workspace-access";
import { workspaceChanges, mergeWorkspaceChanges, assertChangesAllowed } from "./workspace-merge";
function fixture(): SoulWorkspace {
  const soul = createSoul("https://example.com");
  return { id: "test", name: "Workspace", souls: [soul], activeSoulId: soul.id, revision: 1 };
}
describe("collaborative changes", () => {
  it("merges unrelated edits, preserves the current revision and allows idempotent retries", () => {
    const base = fixture(),
      remote = structuredClone(base),
      local = structuredClone(base);
    remote.souls[0].personality.name = "Remote name";
    remote.revision = 2;
    local.souls[0].appearance.accent = "#abcdef";
    const changes = workspaceChanges(base, local);
    const merged = mergeWorkspaceChanges(remote, changes);
    expect(merged.souls[0].personality.name).toBe("Remote name");
    expect(merged.souls[0].appearance.accent).toBe("#abcdef");
    expect(merged.revision).toBe(2);
    expect(mergeWorkspaceChanges(merged, changes)).toEqual(merged);
  });
  it("rejects same-field conflicts, concurrent lists and edits to removed websites", () => {
    const base = fixture(),
      local = structuredClone(base),
      remote = structuredClone(base);
    local.souls[0].personality.name = "Alice";
    remote.souls[0].personality.name = "Bob";
    expect(() => mergeWorkspaceChanges(remote, workspaceChanges(base, local))).toThrow("teammate");
    expect(() =>
      mergeWorkspaceChanges({ ...base, souls: [] }, workspaceChanges(base, local)),
    ).toThrow("removed");
    local.souls[0].personality.name = base.souls[0].personality.name;
    remote.souls[0].personality.name = base.souls[0].personality.name;
    local.souls[0].knowledge.keywords = ["local"];
    remote.souls[0].knowledge.keywords = ["remote"];
    expect(() => mergeWorkspaceChanges(remote, workspaceChanges(base, local))).toThrow("teammate");
  });
  it("rejects mixed authorized and unauthorized changes and site deletion", () => {
    const base = fixture(),
      local = structuredClone(base),
      permissions = { ...permissionPreset("none"), voice: "write" as const };
    local.souls[0].voice.speed = 1.1;
    expect(() =>
      assertChangesAllowed(workspaceChanges(base, local), permissions, false),
    ).not.toThrow();
    local.souls[0].knowledge.keywords = ["tampered"];
    expect(() => assertChangesAllowed(workspaceChanges(base, local), permissions, false)).toThrow(
      "knowledge",
    );
    expect(() =>
      assertChangesAllowed(
        workspaceChanges(base, { ...base, souls: [] }),
        permissionPreset("write"),
        false,
      ),
    ).toThrow("workspace");
  });
  it("allows knowledge editors to start crawling without publishing access", () => {
    const base = fixture(),
      local = structuredClone(base);
    local.souls[0].status = "learning";
    const permissions = { ...permissionPreset("none"), knowledge: "write" as const };
    expect(() =>
      assertChangesAllowed(workspaceChanges(base, local), permissions, false),
    ).not.toThrow();
    local.souls[0].status = "live";
    expect(() => assertChangesAllowed(workspaceChanges(base, local), permissions, false)).toThrow(
      "deploy",
    );
  });
  it("ignores navigation and timestamp changes", () => {
    const base = fixture(),
      local = structuredClone(base);
    local.activeSoulId = null;
    local.revision = 99;
    local.souls[0].updatedAt = "later";
    expect(workspaceChanges(base, local)).toEqual([]);
  });
});
