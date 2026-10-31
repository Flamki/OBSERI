import { describe, it, expect } from "vitest";
import { createSoul, normalizeWorkspace } from "./soul";
import { launcherLabel, launcherMode, normalizeLauncherLabel } from "./launcher";

describe("launcher configuration", () => {
  it("keeps existing websites on both modes with a usable default label", () => {
    const { appearance } = createSoul("https://example.com");
    expect(launcherMode(appearance)).toBe("both");
    expect(launcherLabel(appearance)).toBe("Ask a question");
    expect(launcherLabel({ ...appearance, launcherMode: "voice" })).toBe("Voice chat");
  });
  it("bounds direct API values, whitespace and Unicode without splitting a code point", () => {
    expect(normalizeLauncherLabel("one two three four five")).toBe("one two three four");
    expect(normalizeLauncherLabel("a".repeat(30))).toBe("a".repeat(24));
    expect(normalizeLauncherLabel("😀".repeat(30))).toBe("😀".repeat(24));
    expect(normalizeLauncherLabel("  Ask\n\t us\u0000 now  ")).toBe("Ask us now");
    expect(normalizeLauncherLabel({ html: "oops" })).toBe("");
    const soul = createSoul("https://example.com");
    soul.appearance.launcherLabel = "one two three four five six";
    const workspace = normalizeWorkspace({
      id: soul.workspaceId,
      name: "Test",
      activeSoulId: soul.id,
      souls: [soul],
    });
    expect(workspace.souls[0].appearance.launcherLabel).toBe("one two three four");
  });
});
