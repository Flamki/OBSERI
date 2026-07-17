/**
 * Obseri's client-side Supertonic runtime.
 *
 * The model is intentionally loaded only after explicit user interaction. The
 * pinned Hugging Face revision is immutable, so normal browser/CDN caching can
 * safely reuse the large model files between calls and sessions.
 */

export const SUPERTONIC_MODEL_REVISION = "3cadd1ee6394adea1bd021217a0e650ede09a323";

const modelRoot = `https://huggingface.co/Supertone/supertonic-3/resolve/${SUPERTONIC_MODEL_REVISION}`;
const onnxRoot = `${modelRoot}/onnx`;

export const supertonicVoices = [
  { id: "F1", name: "Aster", description: "Warm, polished and conversational", gender: "Female" },
  { id: "F2", name: "Luma", description: "Bright, clear and welcoming", gender: "Female" },
  { id: "F3", name: "Nora", description: "Calm, grounded and helpful", gender: "Female" },
  { id: "F4", name: "Sora", description: "Confident, expressive and modern", gender: "Female" },
  { id: "F5", name: "Mira", description: "Soft, thoughtful and reassuring", gender: "Female" },
  { id: "M1", name: "Arlo", description: "Natural, composed and articulate", gender: "Male" },
  { id: "M2", name: "Kian", description: "Friendly, direct and energetic", gender: "Male" },
  { id: "M3", name: "Theo", description: "Deep, steady and authoritative", gender: "Male" },
  { id: "M4", name: "Noah", description: "Relaxed, warm and approachable", gender: "Male" },
  { id: "M5", name: "Ravi", description: "Clear, lively and confident", gender: "Male" },
] as const;

export type SupertonicVoiceId = (typeof supertonicVoices)[number]["id"];
export type SupertonicBackend = "webgpu" | "wasm";
export type SupertonicLoadStage =
  | { phase: "loading"; label: string; progress: number }
  | { phase: "ready"; label: string; progress: 1; backend: SupertonicBackend };

type Runtime = {
  tts: import("./supertonic-vendor.js").TextToSpeech;
  styles: Map<
    SupertonicVoiceId,
    import("./supertonic-vendor.js").Style | Promise<import("./supertonic-vendor.js").Style>
  >;
  backend: SupertonicBackend;
  vendor: typeof import("./supertonic-vendor.js");
};

let runtimePromise: Promise<Runtime> | null = null;
let readyRuntime: Runtime | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeAudioUrl = "";
let speechGeneration = 0;
const cloudAudioCache = new Map<string, Promise<Blob>>();
const CLOUD_AUDIO_CACHE_LIMIT = 32;

export function canUseSupertonic() {
  return typeof window !== "undefined" && typeof WebAssembly !== "undefined";
}

export function getSupertonicDeviceHint() {
  if (!canUseSupertonic()) return "unsupported" as const;
  const navigatorWithHints = navigator as Navigator & {
    gpu?: unknown;
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  if (navigatorWithHints.connection?.saveData) return "save-data" as const;
  if (navigatorWithHints.deviceMemory && navigatorWithHints.deviceMemory < 4)
    return "low-memory" as const;
  return navigatorWithHints.gpu ? ("webgpu" as const) : ("wasm" as const);
}

export function preloadSupertonic(
  onProgress?: (stage: SupertonicLoadStage) => void,
): Promise<Runtime> {
  if (!canUseSupertonic()) return Promise.reject(new Error("Neural voice is unsupported."));
  if (runtimePromise) return runtimePromise;

  runtimePromise = initializeRuntime(onProgress)
    .then((runtime) => {
      readyRuntime = runtime;
      return runtime;
    })
    .catch((error) => {
      runtimePromise = null;
      throw error;
    });
  return runtimePromise;
}

export function isSupertonicReady() {
  return readyRuntime !== null;
}

async function initializeRuntime(onProgress?: (stage: SupertonicLoadStage) => void) {
  onProgress?.({ phase: "loading", label: "Loading voice engine", progress: 0.03 });
  const vendor = await import("./supertonic-vendor.js");
  const navigatorWithGpu = navigator as Navigator & { gpu?: unknown };
  const preferredBackend: SupertonicBackend = navigatorWithGpu.gpu ? "webgpu" : "wasm";

  const load = async (backend: SupertonicBackend) => {
    let completed = 0;
    const result = await vendor.loadTextToSpeech(
      onnxRoot,
      {
        executionProviders: [backend],
        graphOptimizationLevel: "all",
      },
      (label, index, total) => {
        completed = Math.max(completed, index);
        onProgress?.({
          phase: "loading",
          label: `Preparing ${label.toLowerCase()}`,
          progress: 0.05 + (completed / total) * 0.78,
        });
      },
    );
    return result.textToSpeech;
  };

  let backend = preferredBackend;
  let tts;
  try {
    tts = await load(backend);
  } catch (error) {
    if (backend === "wasm") throw error;
    backend = "wasm";
    onProgress?.({ phase: "loading", label: "Switching to compatible mode", progress: 0.08 });
    tts = await load(backend);
  }

  const runtime: Runtime = { tts, styles: new Map(), backend, vendor };
  onProgress?.({ phase: "ready", label: "Natural voice ready", progress: 1, backend });
  return runtime;
}

export async function synthesizeSupertonic(
  text: string,
  options: {
    voice?: SupertonicVoiceId;
    language?: string;
    speed?: number;
    qualitySteps?: number;
    onProgress?: (stage: SupertonicLoadStage) => void;
  } = {},
) {
  const runtime = await preloadSupertonic(options.onProgress);
  const voice = options.voice ?? "F1";
  let styleValue = runtime.styles.get(voice);
  if (!styleValue) {
    options.onProgress?.({ phase: "loading", label: "Loading voice style", progress: 0.9 });
    styleValue = runtime.vendor.loadVoiceStyle([`${modelRoot}/voice_styles/${voice}.json`]);
    runtime.styles.set(voice, styleValue);
  }
  const style = await styleValue;
  runtime.styles.set(voice, style);
  const language = normalizeLanguage(options.language);
  const qualitySteps = Math.min(8, Math.max(2, options.qualitySteps ?? 4));
  const { wav } = await runtime.tts.call(
    normalizeSpeechText(text),
    language,
    style,
    qualitySteps,
    Math.min(1.35, Math.max(0.75, options.speed ?? 1.03)),
    0.12,
  );
  return new Blob([runtime.vendor.writeWavFile(wav, runtime.tts.sampleRate)], {
    type: "audio/wav",
  });
}

export async function speakSupertonic(
  text: string,
  options: NonNullable<Parameters<typeof synthesizeSupertonic>[1]> = {},
) {
  let blob: Blob;
  try {
    blob = await fetchSupertonicAudio(text, options);
  } catch (cloudError) {
    // Never make a visitor download the large model during a live call. An
    // already-warm local runtime may rescue a cloud request; otherwise the
    // caller immediately falls back to an installed browser voice.
    if (!readyRuntime) throw cloudError;
    blob = await synthesizeSupertonic(text, options);
  }
  await playSupertonicAudio(blob);
}

export function fetchSupertonicAudio(
  text: string,
  options: NonNullable<Parameters<typeof synthesizeSupertonic>[1]> = {},
) {
  const normalizedText = normalizeSpeechText(text);
  const request = {
    text: normalizedText,
    voice: options.voice ?? "F1",
    language: normalizeLanguage(options.language),
    speed: options.speed ?? 1.03,
    qualitySteps: Math.min(8, Math.max(2, options.qualitySteps ?? 4)),
  };
  const cacheKey = JSON.stringify(request);
  const cached = cloudAudioCache.get(cacheKey);
  if (cached) return cached;
  const audio = fetchCloudSupertonic(request).catch((error) => {
    cloudAudioCache.delete(cacheKey);
    throw error;
  });
  cloudAudioCache.set(cacheKey, audio);
  while (cloudAudioCache.size > CLOUD_AUDIO_CACHE_LIMIT) {
    const oldest = cloudAudioCache.keys().next().value;
    if (typeof oldest !== "string") break;
    cloudAudioCache.delete(oldest);
  }
  return audio;
}

export async function playSupertonicAudio(blob: Blob) {
  const generation = ++speechGeneration;
  if (generation !== speechGeneration) throw new DOMException("Speech stopped", "AbortError");
  clearActiveAudio();
  const href = URL.createObjectURL(blob);
  const audio = new Audio(href);
  activeAudio = audio;
  activeAudioUrl = href;
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      if (activeAudio === audio) activeAudio = null;
      if (activeAudioUrl === href) activeAudioUrl = "";
      URL.revokeObjectURL(href);
      if (error) reject(error);
      else resolve();
    };
    audio.onended = () => finish();
    audio.onerror = () => finish(new Error("Neural voice playback failed."));
    void audio
      .play()
      .catch((cause) =>
        finish(cause instanceof Error ? cause : new Error("Neural voice playback failed.")),
      );
  });
}

async function fetchCloudSupertonic(request: {
  text: string;
  voice: SupertonicVoiceId;
  language: string;
  speed: number;
  qualitySteps: number;
}) {
  const response = await fetch("/api/voice/speak", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: "supertonic",
      text: request.text,
      profileId: request.voice,
      language: request.language,
      speed: request.speed,
      qualitySteps: request.qualitySteps,
    }),
    // A live call must fail over quickly instead of leaving dead air. A warm
    // regional service should answer well inside this ceiling.
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message || "Cloud neural voice is unavailable.");
  }
  return response.blob();
}

export function stopSupertonic() {
  speechGeneration += 1;
  clearActiveAudio();
}

function clearActiveAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = "";
  }
}

function normalizeLanguage(language = "en") {
  const base = language.toLowerCase().split(/[-_]/)[0];
  const supported = new Set([
    "ar",
    "bg",
    "cs",
    "da",
    "de",
    "el",
    "en",
    "es",
    "et",
    "fi",
    "fr",
    "hi",
    "hr",
    "hu",
    "id",
    "it",
    "ja",
    "ko",
    "lt",
    "lv",
    "nl",
    "pl",
    "pt",
    "ro",
    "ru",
    "sk",
    "sl",
    "sv",
    "tr",
    "uk",
    "vi",
  ]);
  return supported.has(base) ? base : "na";
}

function normalizeSpeechText(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, "the linked page")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}
