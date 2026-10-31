import { describe, expect, it } from "vitest";
import { createSoul, normalizeVoice } from "./soul";
import { supertonicVoices } from "./voice-catalog";
import { isPublicVoiceDemo } from "./voice-demo";

describe("Neural-only voices", () => {
  it("defaults to Aster and preserves every valid Neural selection", () => {
    const soul = createSoul("https://example.com");
    expect(soul.voice.provider).toBe("supertonic");
    expect(soul.voice.profileId).toBe("F1");
    for (const voice of supertonicVoices) {
      expect(normalizeVoice({ ...soul.voice, profileId: voice.id }).profileName).toBe(voice.name);
    }
  });
  it("migrates old engines and missing presets without changing voice settings", () => {
    const voice = {
      ...createSoul("https://example.com").voice,
      enabled: false,
      language: "es",
      speed: 1.2,
    };
    for (const provider of ["browser", "voicebox", "supertonic"] as const) {
      expect(normalizeVoice({ ...voice, provider, profileId: "old-custom-voice" })).toMatchObject({
        provider: "supertonic",
        profileId: "F1",
        profileName: "Aster",
        enabled: false,
        language: "es",
        speed: 1.2,
      });
    }
  });
});

describe("public voice demo policy", () => {
  const input = { soulId: "obseri-landing-voice-demo", text: "Hello", qualitySteps: 4 };
  const request = (origin = "https://obseri.com") =>
    new Request("https://obseri.com/api/voice/speak", { headers: { origin } });
  it("permits the short first-party demo at the live voice quality", () => {
    expect(isPublicVoiceDemo(request(), input)).toBe(true);
    expect(isPublicVoiceDemo(request(), { ...input, qualitySteps: 5 })).toBe(true);
  });
  it("rejects customer IDs, external origins and expensive requests", () => {
    expect(isPublicVoiceDemo(request(), { ...input, soulId: "customer-soul" })).toBe(false);
    expect(isPublicVoiceDemo(request("https://other.example"), input)).toBe(false);
    expect(isPublicVoiceDemo(request(), { ...input, text: "x".repeat(401) })).toBe(false);
    expect(isPublicVoiceDemo(request(), { ...input, qualitySteps: 8 })).toBe(false);
  });
});
