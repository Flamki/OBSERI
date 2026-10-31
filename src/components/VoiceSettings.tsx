import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  AudioLines,
  Check,
  Headphones,
  LoaderCircle,
  Play,
  RotateCcw,
  Search,
  Square,
  X,
} from "lucide-react";
import type { Soul } from "@/lib/soul";
import { fetchSupertonicAudio, playSupertonicAudio, stopSupertonic } from "@/lib/supertonic";
import {
  neuralVoice,
  supertonicVoices,
  NEURAL_QUALITY_STEPS,
  type SupertonicVoiceId,
} from "@/lib/voice-catalog";
import "./VoiceSettings.css";

type Voice = (typeof supertonicVoices)[number];
const SAMPLE =
  "Hello, it’s lovely to meet you. Tell me what you’re looking for, and we’ll find the right place to start.";
const COLORS = [
  ["#ffe2be", "#c4b6ef", "#f296b4"],
  ["#ffe6a8", "#a8ded3", "#7abdc9"],
  ["#e9d7ff", "#b7bae6", "#9686b9"],
  ["#d2eaff", "#b1c8f5", "#a699e6"],
  ["#ffe3df", "#eabacb", "#c78ba9"],
  ["#dcf1c5", "#b3d5c1", "#6ba29d"],
  ["#ffd1b9", "#e9bdb9", "#b487bb"],
  ["#c6dfec", "#9fb4d8", "#7d8eb8"],
  ["#c8e8cf", "#bdd5de", "#8cafd1"],
  ["#ffe5b7", "#dfc6c7", "#b493bd"],
];
const BARS = Array.from({ length: 37 }, (_, i) => 8 + ((i * 17 + 13) % 31));

function VoiceOrb({ voice, large = false }: { voice: Voice; large?: boolean }) {
  const colors = COLORS[supertonicVoices.findIndex((item) => item.id === voice.id)];
  return (
    <span
      aria-hidden="true"
      className={`voice-orb ${large ? "voice-orb-large" : ""}`}
      style={{
        background: `radial-gradient(circle at 28% 22%,#ffffffdd,transparent 37%),radial-gradient(circle at 75% 75%,${colors[2]},transparent 60%),conic-gradient(from 40deg,${colors[0]},${colors[1]},${colors[2]},${colors[0]})`,
      }}
    />
  );
}

export default function VoiceSettings({
  soul,
  onUpdate,
  onInstall,
}: {
  soul: Soul;
  onUpdate: (updater: (soul: Soul) => Soul) => void;
  onInstall: () => void;
}) {
  const active = neuralVoice(soul.voice.profileId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | "Female" | "Male">("All");
  const [script, setScript] = useState((soul.personality.greeting || SAMPLE).slice(0, 240));
  const [preview, setPreview] = useState<{
    id: SupertonicVoiceId;
    phase: "loading" | "playing";
  } | null>(null);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      stopSupertonic();
    },
    [],
  );
  const update = (patch: Partial<Soul["voice"]>) =>
    onUpdate((current) => ({ ...current, voice: { ...current.voice, ...patch } }));
  const stop = () => {
    controller.current?.abort();
    controller.current = null;
    stopSupertonic();
    setPreview(null);
  };
  const audition = async (voice: Voice) => {
    if (preview?.id === voice.id) {
      stop();
      return;
    }
    if (!script.trim()) return;
    stop();
    setError("");
    const request = new AbortController();
    controller.current = request;
    setPreview({ id: voice.id, phase: "loading" });
    try {
      const audio = await fetchSupertonicAudio(script, {
        voice: voice.id,
        language: soul.voice.language,
        speed: soul.voice.speed,
        qualitySteps: NEURAL_QUALITY_STEPS,
        signal: request.signal,
      });
      if (request.signal.aborted) return;
      await playSupertonicAudio(audio, () => {
        if (!request.signal.aborted) setPreview({ id: voice.id, phase: "playing" });
      });
    } catch (cause) {
      if (!request.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Preview couldn’t play. Please try again.",
        );
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setPreview(null);
      }
    }
  };
  const select = (voice: Voice) => {
    stop();
    setError("");
    update({
      provider: "supertonic",
      profileId: voice.id,
      profileName: voice.name,
      browserVoiceName: "",
    });
  };
  const filtered = supertonicVoices.filter(
    (voice) =>
      (filter === "All" || voice.gender === filter) &&
      `${voice.name} ${voice.description}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const previewName = preview ? neuralVoice(preview.id).name : active.name;
  const status = preview
    ? `${preview.phase === "loading" ? "Preparing" : "Playing"} ${previewName}…`
    : "Ready when you are";
  const activePreview = preview?.id === active.id;
  const previewIcon = (id: string) =>
    preview?.id === id ? (
      preview.phase === "loading" ? (
        <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
      ) : (
        <Square className="h-3.5 w-3.5 fill-current" />
      )
    ) : (
      <Play className="h-4 w-4 fill-current" />
    );

  return (
    <section className="voice-studio mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            Give your assistant a voice.
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            Find the sound that feels like your brand.
          </p>
        </div>
        <button type="button" onClick={onInstall} className="voice-outline-button">
          Review & publish <ArrowUpRight className="h-4 w-4" />
        </button>
      </header>

      <section aria-label="Selected voice" className="voice-feature mt-7">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.16em] text-[#6a5266]">
            <AudioLines className="h-4 w-4" /> Your signature voice
          </span>
          <div className="flex items-center gap-3 text-xs font-medium text-neutral-600">
            Voice {soul.voice.enabled ? "on" : "off"}
            <button
              type="button"
              role="switch"
              aria-label="Enable voice conversations"
              aria-checked={soul.voice.enabled}
              onClick={() => {
                stop();
                update({ enabled: !soul.voice.enabled });
              }}
              className={`relative h-6 w-10 rounded-full transition ${soul.voice.enabled ? "bg-neutral-900" : "bg-neutral-300"}`}
            >
              <span
                className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${soul.voice.enabled ? "translate-x-4" : ""}`}
              />
            </button>
          </div>
        </div>
        <div className="relative z-10 mt-8 flex flex-col items-center gap-7 text-center sm:flex-row sm:text-left">
          <div className="voice-orb-stage">
            <VoiceOrb voice={active} large />
          </div>
          <div className="min-w-0 flex-1">
            <span className="rounded-full border border-white/80 bg-white/65 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#806077]">
              Neural voice
            </span>
            <h2 className="mt-3 text-5xl font-medium tracking-[-.045em] text-[#302632] sm:text-6xl">
              {active.name}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#766571]">{active.description}.</p>
          </div>
          <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:items-end">
            <button
              type="button"
              aria-label={`${activePreview ? "Stop" : "Preview"} selected voice`}
              disabled={!script.trim() && !activePreview}
              onClick={() => void audition(active)}
              className="voice-primary-button"
            >
              {previewIcon(active.id)} {activePreview ? "Stop preview" : "Hear this voice"}
            </button>
            <span className="text-[11px] text-[#877781]">
              Your script · {soul.voice.speed.toFixed(2)}× speed
            </span>
          </div>
        </div>
        <div className="relative z-10 mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#947286]/10 pt-4">
          <p
            aria-live="polite"
            role="status"
            className="flex items-center gap-2 text-xs text-[#796772]"
          >
            <Headphones className="h-3.5 w-3.5" />
            {status}
          </p>
          <div
            aria-hidden="true"
            className={`voice-equalizer ${preview?.phase === "playing" ? "is-playing" : ""}`}
          >
            {BARS.map((height, i) => (
              <span
                key={i}
                style={{
                  height,
                  animationDelay: `${i * -0.09}s`,
                  animationDuration: `${0.65 + (i % 5) * 0.13}s`,
                }}
              />
            ))}
          </div>
        </div>
      </section>
      {!soul.voice.enabled && (
        <p className="mt-4 rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
          Voice conversations are off in this draft. You can still preview voices here. Text chat
          stays available.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}

      <div className="mt-8 grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="voice-library-title" className="min-w-0 xl:order-first">
          <div className="flex items-center justify-between gap-3">
            <h2 id="voice-library-title" className="text-base font-semibold text-neutral-900">
              The voice collection{" "}
              <span className="ml-1.5 text-xs font-normal text-neutral-400">10</span>
            </h2>
            <span className="text-[11px] text-neutral-500">All neural</span>
          </div>
          <div className="mb-4 mt-4 flex flex-wrap items-center gap-3">
            <div className="flex min-w-[150px] flex-1 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 focus-within:border-neutral-500">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-neutral-400" />
              <input
                type="search"
                aria-label="Search voices"
                placeholder="Search by name or style"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
              />
              {query && (
                <button type="button" aria-label="Clear voice search" onClick={() => setQuery("")}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div
              role="group"
              aria-label="Filter voices"
              className="flex gap-1 rounded-xl bg-neutral-100 p-1"
            >
              {(["All", "Female", "Male"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition ${filter === value ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-900"}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((voice) => (
              <article
                key={voice.id}
                className={`voice-choice ${active.id === voice.id ? "is-selected" : ""}`}
              >
                <button
                  type="button"
                  aria-label={`Select ${voice.name}`}
                  aria-pressed={active.id === voice.id}
                  onClick={() => select(voice)}
                  className="flex w-full items-start gap-3 p-4 pb-3 text-left"
                >
                  <VoiceOrb voice={voice} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-neutral-900">
                      {voice.name}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-neutral-500">
                      {voice.description}
                    </span>
                  </span>
                  {active.id === voice.id && (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#9e5578]" />
                  )}
                </button>
                <div className="flex items-center justify-between gap-2 px-4 pb-3">
                  <span
                    className={`text-[10px] font-medium ${active.id === voice.id ? "text-[#9e5578]" : "text-neutral-400"}`}
                  >
                    {active.id === voice.id ? "Selected" : voice.gender}
                  </span>
                  <button
                    type="button"
                    aria-label={`${preview?.id === voice.id ? "Stop" : "Preview"} ${voice.name}`}
                    disabled={!script.trim() && preview?.id !== voice.id}
                    onClick={() => void audition(voice)}
                    className="voice-audition-button"
                  >
                    {previewIcon(voice.id)}
                    <span>{preview?.id === voice.id ? "Stop" : "Listen"}</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <div className="rounded-2xl border border-dashed border-neutral-200 p-10 text-center">
              <AudioLines className="mx-auto h-6 w-6 text-neutral-400" />
              <p className="mt-3 text-sm font-medium">No voices found</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("All");
                }}
                className="mt-2 text-xs text-[#9e5578] underline underline-offset-4"
              >
                Clear filters
              </button>
            </div>
          )}
        </section>

        <aside
          className="order-first min-w-0 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 xl:order-last"
          aria-label="Voice preview settings"
        >
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-[#9e5578]" />
            <h2 className="text-base font-semibold">Make it yours</h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-neutral-500">
            Try your own words. Hear the difference.
          </p>
          <div className="mt-6 flex items-center justify-between gap-2">
            <label htmlFor="voice-script" className="text-xs font-medium">
              Preview script
            </label>
            <span className="text-[10px] tabular-nums text-neutral-400">{script.length}/240</span>
          </div>
          <textarea
            id="voice-script"
            maxLength={240}
            rows={5}
            value={script}
            onChange={(event) => {
              stop();
              setScript(event.target.value);
              setError("");
            }}
            className="mt-2 w-full resize-y rounded-xl border border-neutral-200 bg-[#faf9f8] p-3 text-sm leading-6 outline-none transition focus:border-[#b9859e] focus:ring-2 focus:ring-[#f7edf1]"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                stop();
                setScript((soul.personality.greeting || SAMPLE).slice(0, 240));
              }}
              className="voice-script-preset"
            >
              Use welcome message
            </button>
            <button
              type="button"
              onClick={() => {
                stop();
                setScript(SAMPLE);
              }}
              className="voice-script-preset"
            >
              Sample text
            </button>
          </div>
          {!script.trim() && (
            <p className="mt-3 text-xs text-neutral-500">Add a few words to preview a voice.</p>
          )}
          <div className="mt-6 border-t border-neutral-100 pt-5">
            <div className="flex items-center justify-between">
              <label htmlFor="voice-speed" className="text-xs font-medium">
                Speaking speed
              </label>
              <output
                htmlFor="voice-speed"
                className="rounded-md bg-neutral-100 px-2 py-1 text-xs tabular-nums text-neutral-600"
              >
                {soul.voice.speed.toFixed(2)}×
              </output>
            </div>
            <input
              id="voice-speed"
              type="range"
              min={0.75}
              max={1.35}
              step={0.05}
              value={soul.voice.speed}
              aria-valuetext={`${soul.voice.speed.toFixed(2)} times normal speed`}
              onChange={(event) => {
                stop();
                update({ speed: Number(event.target.value) });
              }}
              className="mt-4 w-full cursor-pointer accent-[#a46183]"
            />
            <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
              <span>Relaxed</span>
              <span>Brisk</span>
            </div>
            <button
              type="button"
              disabled={soul.voice.speed === 1}
              onClick={() => {
                stop();
                update({ speed: 1 });
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-neutral-500 hover:text-neutral-900 disabled:opacity-40"
            >
              <RotateCcw className="h-3 w-3" />
              Reset speed
            </button>
          </div>
          <button
            type="button"
            aria-label={
              activePreview ? "Stop script preview" : "Preview script with selected voice"
            }
            disabled={!script.trim() && !activePreview}
            onClick={() => void audition(active)}
            className="voice-primary-button mt-5 w-full"
          >
            {previewIcon(active.id)} {activePreview ? "Stop preview" : "Listen to script"}
          </button>
          <p className="mt-5 border-t border-neutral-100 pt-4 text-[11px] leading-5 text-neutral-500">
            Previews use your plan’s voice allowance. Listening to a voice won’t change your
            selection.
          </p>
        </aside>
      </div>
      <p className="mt-7 text-xs leading-5 text-neutral-400">
        Changes save as a draft. Publish when you’re ready to update your website’s voice.
      </p>
    </section>
  );
}
