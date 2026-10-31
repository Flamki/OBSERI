import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { NEURAL_QUALITY_STEPS, supertonicVoices } from "@/lib/voice-catalog";
import { getRuntimeEnvironment } from "@/lib/runtime-env";
import { readBearerToken, verifyWidgetSession } from "@/lib/integration-security";
import { consumeRateLimit, getPublishedSoul } from "@/lib/integration-store";
import { isPublicVoiceDemo } from "@/lib/voice-demo";
import { requireUser } from "@/lib/user-auth";
import { BillingStoreError, finalizeUsage, reserveUsage } from "@/lib/billing-store";

const schema = z.object({
  text: z.string().min(1).max(4_000),
  provider: z.literal("supertonic").default("supertonic"),
  profileId: z
    .string()
    .refine((id) => supertonicVoices.some((voice) => voice.id === id), "Choose a Neural voice")
    .default("F1"),
  language: z.string().min(2).max(10).default("en"),
  speed: z.number().min(0.5).max(2).optional(),
  qualitySteps: z
    .number()
    .int()
    .min(2)
    .max(8)
    .transform((steps) => Math.max(NEURAL_QUALITY_STEPS, steps))
    .optional(),
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
        const supertonicApiKey = env.OBSERI_SUPERTONIC_API_KEY;
        const baseUrl = env.OBSERI_SUPERTONIC_URL?.replace(/\/$/, "");
        if (!baseUrl || !supertonicApiKey)
          return Response.json(
            { error: { message: "Neural voice is not configured." } },
            { status: 503 },
          );

        let reservationId: string | null = null;
        let committed = false;
        try {
          const ownerUserId = await resolveVoiceOwner(request, parsed.data);
          const reservation = ownerUserId
            ? await reserveUsage(
                ownerUserId,
                "voice_seconds",
                estimatedVoiceSeconds(parsed.data.text),
              )
            : { reservationId: null };
          reservationId = reservation.reservationId;
          {
            const supertonicRequest = {
              text: parsed.data.text,
              voice: parsed.data.profileId ?? "F1",
              lang: normalizeLanguage(parsed.data.language),
              steps: parsed.data.qualitySteps ?? NEURAL_QUALITY_STEPS,
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

  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VoiceAccessError";
  }
}

async function resolveVoiceOwner(request: Request, input: z.infer<typeof schema>) {
  const { soulId } = input;
  const authorization = request.headers.get("authorization");
  const bearer = authorization ? readBearerToken(request) : "";
  if (bearer.startsWith("obs_sess.")) {
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
  if (isPublicVoiceDemo(request, input)) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    for (const [key, limit, window] of [
      [`voice-demo:ip:${ip}`, 12, 600],
      ["voice-demo:global:hour", 120, 3600],
      ["voice-demo:global:day", 200, 86400],
    ] as const) {
      if (!(await consumeRateLimit(key, limit, window)))
        throw new VoiceAccessError(
          "The voice demo has reached its limit. Please try again later.",
          429,
        );
    }
    return null;
  }
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
    throw new Error(readVoiceError(detail) || `Supertonic returned ${response.status}.`);
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

function readVoiceError(detail: string) {
  try {
    const payload = JSON.parse(detail) as { detail?: string };
    return payload.detail || detail;
  } catch {
    return detail;
  }
}
