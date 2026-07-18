import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getRuntimeEnvironment } from "@/lib/runtime-env";
import { readBearerToken, verifyWidgetSession } from "@/lib/integration-security";
import { getPublishedSoul } from "@/lib/integration-store";
import { requireUser } from "@/lib/user-auth";
import { BillingStoreError, finalizeUsage, reserveUsage } from "@/lib/billing-store";

const schema = z.object({
  text: z.string().min(1).max(4_000),
  provider: z.enum(["voicebox", "supertonic"]).optional(),
  profileId: z.string().min(1).max(120).optional(),
  language: z.string().min(2).max(10).default("en"),
  engine: z
    .enum([
      "qwen",
      "qwen_custom_voice",
      "luxtts",
      "chatterbox",
      "chatterbox_turbo",
      "tada",
      "kokoro",
    ])
    .optional(),
  speed: z.number().min(0.5).max(2).optional(),
  qualitySteps: z.number().int().min(2).max(8).optional(),
  soulId: z.string().min(1).max(100).optional(),
});

type CachedAudio = {
  bytes: ArrayBuffer;
  contentType: string;
  createdAt: number;
};

const PREVIEW_CACHE_TTL_MS = 60 * 60 * 1_000;
const PREVIEW_CACHE_LIMIT = 128;
const previewCache = new Map<string, CachedAudio>();
const previewInflight = new Map<string, Promise<CachedAudio>>();

export const Route = createFileRoute("/api/voice/speak")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = schema.safeParse(await request.json());
        if (!parsed.success)
          return Response.json({ error: { message: "Invalid speech request." } }, { status: 400 });
        const env = getRuntimeEnvironment();
        const provider = parsed.data.provider ?? "voicebox";
        const supertonicApiKey = env.OBSERI_SUPERTONIC_API_KEY;
        const baseUrl = (
          provider === "supertonic" ? env.OBSERI_SUPERTONIC_URL : env.OBSERI_VOICEBOX_URL
        )?.replace(/\/$/, "");
        if (!baseUrl)
          return Response.json(
            {
              error: {
                message:
                  provider === "supertonic"
                    ? "Cloud neural voice is not configured."
                    : "Voicebox is not configured.",
              },
            },
            { status: 503 },
          );
        if (provider === "supertonic" && !supertonicApiKey)
          return Response.json(
            { error: { message: "Cloud neural voice authentication is not configured." } },
            { status: 503 },
          );
        if (provider === "voicebox" && !parsed.data.profileId)
          return Response.json(
            { error: { message: "A Voicebox profile is required." } },
            { status: 400 },
          );

        let reservationId: string | null = null;
        let committed = false;
        try {
          const ownerUserId = await resolveVoiceOwner(request, parsed.data.soulId);
          const reservation = await reserveUsage(
            ownerUserId,
            "voice_seconds",
            estimatedVoiceSeconds(parsed.data.text),
          );
          reservationId = reservation.reservationId;
          if (provider === "supertonic") {
            const supertonicRequest = {
              text: parsed.data.text,
              voice: parsed.data.profileId ?? "F1",
              lang: normalizeLanguage(parsed.data.language),
              steps: parsed.data.qualitySteps ?? 4,
              speed: parsed.data.speed ?? 1.03,
              response_format: "wav",
            } satisfies SupertonicGenerationRequest;
            const cacheKey = `supertonic:${JSON.stringify(supertonicRequest)}`;
            const cached = readCachedAudio(cacheKey);
            const audio =
              cached ??
              (await generateCachedAudio(cacheKey, () =>
                generateSupertonicAudio(baseUrl, supertonicApiKey!, supertonicRequest),
              ));
            await finalizeUsage(
              reservationId,
              true,
              audioDurationSeconds(audio, estimatedVoiceSeconds(parsed.data.text)),
            );
            committed = true;
            return audioResponse(audio, cached ? "HIT" : "MISS", "supertonic");
          }

          const engine =
            parsed.data.engine ?? (await resolveProfileEngine(baseUrl, parsed.data.profileId!));
          const voiceboxRequest = {
            profile_id: parsed.data.profileId!,
            text: parsed.data.text,
            language: parsed.data.language,
            engine,
            model_size: engine === "qwen_custom_voice" ? "0.6B" : undefined,
            normalize: true,
          };
          const cacheKey = JSON.stringify(voiceboxRequest);
          const cacheable = parsed.data.text.length <= 240;
          const cached = cacheable ? readCachedAudio(cacheKey) : null;
          const audio =
            cached ??
            (cacheable
              ? await generateCachedAudio(cacheKey, () => generateAudio(baseUrl, voiceboxRequest))
              : await generateAudio(baseUrl, voiceboxRequest));
          await finalizeUsage(
            reservationId,
            true,
            audioDurationSeconds(audio, estimatedVoiceSeconds(parsed.data.text)),
          );
          committed = true;
          return audioResponse(audio, cached ? "HIT" : "MISS", "voicebox");
        } catch (error) {
          if (error instanceof VoiceAccessError || error instanceof BillingStoreError)
            return Response.json(
              { error: { message: error.message, code: error.code } },
              { status: error.status },
            );
          return Response.json(
            {
              error: {
                message: error instanceof Error ? error.message : "Voice generation failed.",
              },
            },
            { status: 502 },
          );
        } finally {
          if (!committed) await finalizeUsage(reservationId, false).catch(() => undefined);
        }
      },
    },
  },
});

class VoiceAccessError extends Error {
  readonly code = "voice_access_denied";

  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "VoiceAccessError";
  }
}

async function resolveVoiceOwner(request: Request, soulId?: string) {
  const authorization = request.headers.get("authorization");
  const bearer = authorization ? readBearerToken(request) : "";
  if (bearer.startsWith("obss_")) {
    if (!soulId) throw new VoiceAccessError("A published soul is required for widget voice.", 400);
    verifyWidgetSession(bearer, soulId);
    const record = await getPublishedSoul(soulId);
    if (!record) throw new VoiceAccessError("This website soul is unavailable.", 404);
    return record.ownerUserId;
  }
  if (authorization) {
    try {
      return (await requireUser(request)).id;
    } catch (error) {
      const status =
        typeof error === "object" && error && "status" in error ? Number(error.status) : 401;
      throw new VoiceAccessError(
        error instanceof Error ? error.message : "Sign in to generate voice.",
        status,
      );
    }
  }
  const demoOwner = process.env.OBSERI_DEMO_OWNER_USER_ID;
  if (demoOwner) return demoOwner;
  throw new VoiceAccessError("Sign in to generate voice.", 401);
}

function estimatedVoiceSeconds(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 1.8));
}

function audioDurationSeconds(audio: CachedAudio, fallback: number) {
  const bytes = new Uint8Array(audio.bytes);
  if (bytes.length >= 44 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF") {
    const view = new DataView(audio.bytes);
    const byteRate = view.getUint32(28, true);
    const dataBytes = view.getUint32(40, true);
    if (byteRate > 0 && dataBytes > 0) return Math.max(1, Math.ceil(dataBytes / byteRate));
  }
  return fallback;
}

type VoiceboxGenerationRequest = {
  profile_id: string;
  text: string;
  language: string;
  engine?: string;
  model_size?: string;
  normalize: boolean;
};

function readCachedAudio(key: string) {
  const cached = previewCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > PREVIEW_CACHE_TTL_MS) {
    previewCache.delete(key);
    return null;
  }
  previewCache.delete(key);
  previewCache.set(key, cached);
  return cached;
}

async function generateCachedAudio(key: string, generate: () => Promise<CachedAudio>) {
  const existing = previewInflight.get(key);
  if (existing) return existing;
  const generation = generate().then((audio) => {
    previewCache.set(key, audio);
    while (previewCache.size > PREVIEW_CACHE_LIMIT) {
      const oldest = previewCache.keys().next().value;
      if (typeof oldest !== "string") break;
      previewCache.delete(oldest);
    }
    return audio;
  });
  previewInflight.set(key, generation);
  try {
    return await generation;
  } finally {
    previewInflight.delete(key);
  }
}

function audioResponse(audio: CachedAudio, cache: "HIT" | "MISS", provider: string) {
  return new Response(audio.bytes.slice(0), {
    status: 200,
    headers: {
      "content-type": audio.contentType,
      "cache-control": "no-store",
      "content-disposition": 'inline; filename="obseri-voice.wav"',
      "x-obseri-voice-cache": cache,
      "x-obseri-voice-provider": provider,
    },
  });
}

type SupertonicGenerationRequest = {
  text: string;
  voice: string;
  lang: string;
  steps: number;
  speed: number;
  response_format: "wav";
};

async function generateSupertonicAudio(
  baseUrl: string,
  apiKey: string,
  body: SupertonicGenerationRequest,
) {
  const response = await fetch(`${baseUrl}/v1/tts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(readVoiceboxError(detail) || `Supertonic returned ${response.status}.`);
  }
  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") ?? "audio/wav",
    createdAt: Date.now(),
  } satisfies CachedAudio;
}

function normalizeLanguage(language: string) {
  const base = language.toLowerCase().split(/[-_]/)[0];
  return base || "na";
}

async function generateAudio(baseUrl: string, body: VoiceboxGenerationRequest) {
  let response = await fetch(`${baseUrl}/generate/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 400 && detail.toLowerCase().includes("not downloaded")) {
      response = await generateAndFetchAudio(baseUrl, body);
    } else {
      throw new Error(readVoiceboxError(detail) || `Voicebox returned ${response.status}.`);
    }
  }
  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") ?? "audio/wav",
    createdAt: Date.now(),
  } satisfies CachedAudio;
}

function readVoiceboxError(detail: string) {
  try {
    const payload = JSON.parse(detail) as { detail?: string };
    return payload.detail || detail;
  } catch {
    return detail;
  }
}

async function resolveProfileEngine(baseUrl: string, profileId: string) {
  const response = await fetch(`${baseUrl}/profiles/${encodeURIComponent(profileId)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error((await response.text()) || "Voicebox profile could not be loaded.");
  const profile = (await response.json()) as {
    preset_engine?: string | null;
    default_engine?: string | null;
  };
  return profile.preset_engine || profile.default_engine || "qwen";
}

async function generateAndFetchAudio(baseUrl: string, body: VoiceboxGenerationRequest) {
  const start = await fetch(`${baseUrl}/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!start.ok) throw new Error((await start.text()) || "Voicebox model download failed.");
  const generation = (await start.json()) as { id?: string };
  if (!generation.id) throw new Error("Voicebox did not return a generation id.");

  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const statusResponse = await fetch(`${baseUrl}/history/${generation.id}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!statusResponse.ok)
      throw new Error((await statusResponse.text()) || "Voicebox generation status failed.");
    const status = (await statusResponse.json()) as { status?: string; error?: string | null };
    if (status.status === "failed") throw new Error(status.error || "Voicebox generation failed.");
    if (status.status === "completed") {
      const audio = await fetch(`${baseUrl}/audio/${generation.id}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!audio.ok) throw new Error((await audio.text()) || "Voicebox audio is unavailable.");
      return audio;
    }
  }
  throw new Error("Voicebox model preparation timed out. Please try again.");
}
