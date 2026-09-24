import { describe, expect, it } from "vitest";
import {
  cleanForSpeech,
  contrastText,
  isOrbStyle,
  orbPalette,
  paletteFromAccent,
} from "@/lib/voice-appearance";

describe("orb palettes", () => {
  it("returns presets and falls back to aurora", () => {
    expect(orbPalette("ocean", "#000000")[0]).toBe("#2fb4ff");
    expect(orbPalette(undefined, "#ff5c7a")).toEqual(orbPalette("aurora", "#ff5c7a"));
    expect(orbPalette("unknown", "#ff5c7a")).toEqual(orbPalette("aurora", "#ff5c7a"));
  });

  it("derives three valid colours from a brand accent", () => {
    const palette = paletteFromAccent("#1d4ed8");
    expect(palette).toHaveLength(3);
    for (const colour of palette) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
    expect(orbPalette("accent", "#1d4ed8")).toEqual(palette);
  });

  it("keeps grey brands calm and survives bad input", () => {
    expect(paletteFromAccent("#777777")).toEqual(orbPalette("mono", ""));
    expect(paletteFromAccent("not-a-colour")).toEqual(orbPalette("aurora", ""));
    expect(paletteFromAccent("#f5a")[0]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("recognises style ids", () => {
    expect(isOrbStyle("sunset")).toBe(true);
    expect(isOrbStyle("neon")).toBe(false);
  });

  it("picks readable text for a background", () => {
    expect(contrastText("#ffffff")).toBe("#0b0b0c");
    expect(contrastText("#0b0b0c")).toBe("#ffffff");
    expect(contrastText("#ff5c7a")).toBe("#ffffff");
  });
});

describe("cleanForSpeech", () => {
  it("removes markdown, bullets, links and emoji", () => {
    expect(
      cleanForSpeech(
        "**Yes!** 🎉 See [our pricing](https://x.com/pricing).\n- Free plan\n- Growth plan",
      ),
    ).toBe("Yes! See our pricing. Free plan. Growth plan");
  });

  it("replaces bare URLs with a spoken phrase", () => {
    expect(cleanForSpeech("Visit https://northwind.store/returns today")).toBe(
      "Visit the linked page today",
    );
  });
});

describe("rmsLevel", () => {
  it("is zero for silence and rises with amplitude", async () => {
    const { rmsLevel } = await import("@/lib/voice-meter");
    expect(rmsLevel(new Uint8Array(64).fill(128))).toBe(0);
    const quiet = Array.from({ length: 64 }, (_, index) => (index % 2 ? 132 : 124));
    const loud = Array.from({ length: 64 }, (_, index) => (index % 2 ? 200 : 56));
    expect(rmsLevel(quiet)).toBeGreaterThan(0);
    expect(rmsLevel(loud)).toBeGreaterThan(rmsLevel(quiet));
    expect(rmsLevel(loud)).toBeLessThanOrEqual(1);
  });
});
