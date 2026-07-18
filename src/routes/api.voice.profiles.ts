import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getRuntimeEnvironment } from "@/lib/runtime-env";
import { requireUser } from "@/lib/user-auth";

const presetSchema = z.object({
  engine: z.enum(["kokoro", "qwen_custom_voice"]),
  voiceId: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  language: z.string().min(2).max(16).default("en"),
});

type VoiceboxProfile = {
  id: string;
  name: string;
  language?: string;
  voice_type?: string;
  preset_engine?: string | null;
  preset_voice_id?: string | null;
};

export const Route = createFileRoute("/api/voice/profiles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireUser(request);
        } catch (error) {
          return Response.json({ error: { message: error instanceof Error ? error.message : "Sign in to continue." } }, { status: 401 });
        }
        const baseUrl = getRuntimeEnvironment().OBSERI_VOICEBOX_URL?.replace(/\/$/, "");
        if (!baseUrl) {
          return Response.json({
            provider: "browser",
            connected: false,
            profiles: [],
            message: "Voicebox is not configured. Browser voices remain available.",
          });
        }
        try {
          const enableQwen =
            getRuntimeEnvironment().OBSERI_ENABLE_QWEN_VOICES?.toLowerCase() === "true";
          const [profilesResponse, kokoroResponse, qwenResponse] = await Promise.all([
            fetch(`${baseUrl}/profiles`, { signal: AbortSignal.timeout(8_000) }),
            fetch(`${baseUrl}/profiles/presets/kokoro`, { signal: AbortSignal.timeout(8_000) }),
            enableQwen
              ? fetch(`${baseUrl}/profiles/presets/qwen_custom_voice`, {
                  signal: AbortSignal.timeout(8_000),
                })
              : Promise.resolve(null),
          ]);
          if (!profilesResponse.ok) throw new Error(`Voicebox returned ${profilesResponse.status}`);
          const profiles = (await profilesResponse.json()) as VoiceboxProfile[];
          const presets = [
            ...(await readPresets(kokoroResponse, "kokoro")),
            ...(qwenResponse ? await readPresets(qwenResponse, "qwen_custom_voice") : []),
          ];
          return Response.json({
            provider: "voicebox",
            connected: true,
            profiles,
            presets,
            qwenEnabled: enableQwen,
          });
        } catch (error) {
          return Response.json({
            provider: "voicebox",
            connected: false,
            profiles: [],
            message: error instanceof Error ? error.message : "Voicebox is unavailable.",
          });
        }
      },
      POST: async ({ request }) => {
        try {
          await requireUser(request);
        } catch (error) {
          return Response.json({ error: { message: error instanceof Error ? error.message : "Sign in to continue." } }, { status: 401 });
        }
        const parsed = presetSchema.safeParse(await request.json());
        if (!parsed.success)
          return Response.json({ error: { message: "Invalid Voicebox preset." } }, { status: 400 });
        const baseUrl = getRuntimeEnvironment().OBSERI_VOICEBOX_URL?.replace(/\/$/, "");
        if (!baseUrl)
          return Response.json(
            { error: { message: "Voicebox is not configured." } },
            { status: 503 },
          );

        try {
          const existingResponse = await fetch(`${baseUrl}/profiles`, {
            signal: AbortSignal.timeout(8_000),
          });
          if (!existingResponse.ok) throw new Error(`Voicebox returned ${existingResponse.status}`);
          const profiles = (await existingResponse.json()) as VoiceboxProfile[];
          const existing = profiles.find(
            (profile) =>
              profile.voice_type === "preset" &&
              profile.preset_engine === parsed.data.engine &&
              profile.preset_voice_id === parsed.data.voiceId,
          );
          if (existing) return Response.json({ profile: existing, created: false });

          const response = await fetch(`${baseUrl}/profiles`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: parsed.data.name,
              description: `Voicebox ${parsed.data.engine.replaceAll("_", " ")} preset.`,
              language: normalizeLanguage(parsed.data.language),
              voice_type: "preset",
              preset_engine: parsed.data.engine,
              preset_voice_id: parsed.data.voiceId,
              default_engine: parsed.data.engine,
            }),
            signal: AbortSignal.timeout(15_000),
          });
          if (!response.ok) throw new Error((await response.text()) || "Voice creation failed.");
          return Response.json({ profile: await response.json(), created: true });
        } catch (error) {
          return Response.json(
            {
              error: {
                message: error instanceof Error ? error.message : "Voice creation failed.",
              },
            },
            { status: 502 },
          );
        }
      },
    },
  },
});

async function readPresets(response: Response, engine: "kokoro" | "qwen_custom_voice") {
  if (!response.ok) return [];
  const payload = (await response.json()) as {
    voices?: Array<{ voice_id?: string; name?: string; gender?: string; language?: string }>;
  };
  return (payload.voices ?? [])
    .filter((voice) => voice.voice_id && voice.name)
    .map((voice) => ({
      engine,
      voiceId: voice.voice_id as string,
      name: voice.name as string,
      gender: voice.gender ?? "",
      language: voice.language ?? "en",
    }));
}

function normalizeLanguage(language: string) {
  const supported = new Set([
    "zh",
    "en",
    "ja",
    "ko",
    "de",
    "fr",
    "ru",
    "pt",
    "es",
    "it",
    "he",
    "ar",
    "da",
    "el",
    "fi",
    "hi",
    "ms",
    "nl",
    "no",
    "pl",
    "sv",
    "sw",
    "tr",
  ]);
  const base = language.toLowerCase().split(/[-_]/)[0];
  return supported.has(base) ? base : "en";
}
