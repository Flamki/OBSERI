import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  Globe2,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Volume2,
} from "lucide-react";
import { streamWebsiteCrawl } from "@/lib/crawl-client";
import type { CrawlProgressEvent } from "@/lib/knowledge";
import { createSoul, type Soul, type SoulWorkspace } from "@/lib/soul";

type SetupStep = "website" | "knowledge" | "personality" | "ready";
type PersonalityPreset = "guide" | "expert" | "closer";

type OnboardingFlowProps = {
  initialUrl?: string;
  onSave: (soul: Soul) => Promise<SoulWorkspace>;
  onEnterStudio: () => void;
};

const STEPS: Array<{ id: SetupStep; label: string }> = [
  { id: "website", label: "Website" },
  { id: "knowledge", label: "Knowledge" },
  { id: "personality", label: "Presence" },
  { id: "ready", label: "Ready" },
];

const PRESETS: Array<{
  id: PersonalityPreset;
  name: string;
  detail: string;
  tone: Soul["personality"]["tone"];
  role: string;
  traits: string[];
}> = [
  {
    id: "guide",
    name: "Warm guide",
    detail: "Welcoming, clear, and genuinely helpful.",
    tone: "warm",
    role: "Website guide",
    traits: ["warm", "clear", "helpful"],
  },
  {
    id: "expert",
    name: "Clear expert",
    detail: "Precise answers with calm confidence.",
    tone: "precise",
    role: "Product expert",
    traits: ["precise", "credible", "concise"],
  },
  {
    id: "closer",
    name: "Confident closer",
    detail: "Direct, useful, and focused on the next step.",
    tone: "bold",
    role: "Sales guide",
    traits: ["confident", "decisive", "useful"],
  },
];

export default function OnboardingFlow({
  initialUrl = "",
  onSave,
  onEnterStudio,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<SetupStep>("website");
  const [url, setUrl] = useState(initialUrl);
  const [draftSoul, setDraftSoul] = useState<Soul | null>(null);
  const [events, setEvents] = useState<CrawlProgressEvent[]>([]);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState<PersonalityPreset>("guide");
  const [saving, setSaving] = useState(false);
  const [savedWorkspace, setSavedWorkspace] = useState<SoulWorkspace | null>(null);

  const latestEvent = events.at(-1);
  const progress = latestEvent?.progress ?? (step === "knowledge" ? 4 : 0);
  const stats = latestEvent?.stats;
  const pageCount = draftSoul?.knowledge.pages.length ?? stats?.indexed ?? 0;
  const blockCount = useMemo(
    () => draftSoul?.knowledge.pages.reduce((total, page) => total + page.chunks.length, 0) ?? 0,
    [draftSoul],
  );

  async function beginLearning(event: FormEvent) {
    event.preventDefault();
    setError("");
    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeWebsiteUrl(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enter a valid public website URL.");
      return;
    }

    const nextSoul = createSoul(normalizedUrl);
    setUrl(normalizedUrl);
    setDraftSoul(nextSoul);
    setEvents([]);
    setStep("knowledge");

    try {
      const knowledge = await streamWebsiteCrawl(
        { url: normalizedUrl, maxPages: 30, maxDepth: 3 },
        (crawlEvent) => setEvents((current) => [...current, crawlEvent].slice(-80)),
      );
      setDraftSoul({
        ...nextSoul,
        status: "draft",
        knowledge,
        updatedAt: new Date().toISOString(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Obseri could not learn this website.");
    }
  }

  function applyPreset(nextPreset: PersonalityPreset) {
    setPreset(nextPreset);
    const selected = PRESETS.find((item) => item.id === nextPreset) ?? PRESETS[0];
    setDraftSoul((current) => {
      if (!current) return current;
      return {
        ...current,
        personality: {
          ...current.personality,
          tone: selected.tone,
          role: selected.role,
          traits: selected.traits,
          greeting: `Hi — I’m ${current.name}. What can I help you find?`,
          instructions:
            "Answer naturally from verified website knowledge. Be concise, useful, and guide the visitor toward the right next step.",
        },
      };
    });
  }

  async function finishSetup() {
    if (!draftSoul || saving) return;
    setSaving(true);
    setError("");
    try {
      const selected = PRESETS.find((item) => item.id === preset) ?? PRESETS[0];
      const configuredSoul: Soul = {
        ...draftSoul,
        status: "draft",
        personality: {
          ...draftSoul.personality,
          tone: selected.tone,
          role: selected.role,
          traits: selected.traits,
          greeting: `Hi — I’m ${draftSoul.name}. What can I help you find?`,
          instructions:
            "Answer naturally from verified website knowledge. Be concise, useful, and guide the visitor toward the right next step.",
        },
        updatedAt: new Date().toISOString(),
      };
      const workspace = await onSave(configuredSoul);
      setDraftSoul(workspace.souls[0] ?? configuredSoul);
      setSavedWorkspace(workspace);
      setStep("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your setup could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="obs-app relative min-h-screen overflow-hidden bg-[#fafaf9] text-[#0b0b0c]">
      <div className="obs-hero-glow pointer-events-none absolute inset-x-0 top-0 h-[34rem] opacity-70" />
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col px-5 pb-12 pt-6 sm:px-8 sm:pt-8">
        <div className="mb-7 flex items-center justify-between">
          <img src="/obseri-logo-dark.svg" alt="Obseri" className="h-7 w-auto" />
          <a
            href="mailto:flamki@obseri.com?subject=Obseri%20setup%20help"
            className="text-sm text-[#6f6e69] transition hover:text-[#0b0b0c]"
          >
            Need help?
          </a>
        </div>
        <SetupProgress current={step} />

        <section className="mt-8 min-h-[590px] overflow-hidden rounded-[28px] border border-[#e7e7e4] bg-white shadow-[0_1px_2px_rgba(0,0,0,.04),0_24px_80px_-24px_rgba(40,20,60,.18)]">
          {step === "website" ? (
            <div className="grid min-h-[590px] lg:grid-cols-[1.08fr_.92fr]">
              <div className="flex flex-col justify-center px-7 py-12 sm:px-14 lg:px-16">
                <span className="mb-5 obs-mono text-xs font-medium uppercase tracking-[0.14em] text-[#8a8a8f]">
                  Start with one URL
                </span>
                <h1 className="max-w-xl text-[clamp(2.4rem,5vw,3.5rem)] font-semibold leading-[1] tracking-[-0.05em]">
                  Let’s wake up your website.
                </h1>
                <p className="mt-6 max-w-lg text-base leading-7 text-[#716d6c] sm:text-lg">
                  Obseri will discover your pages, build grounded knowledge, and prepare an agent
                  you can shape before it meets a visitor.
                </p>
                <form onSubmit={beginLearning} className="mt-9">
                  <label className="obs-mono mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-[#8a8a8f]">
                    Your website
                  </label>
                  <div className="flex flex-col gap-2 rounded-[22px] border border-[#e2e2df] bg-white p-1.5 shadow-[0_1px_2px_rgba(0,0,0,.04)] transition focus-within:border-[#cfcfcb] focus-within:ring-4 focus-within:ring-black/[0.04] sm:flex-row sm:items-center sm:rounded-full">
                    <Globe2 className="ml-3 hidden h-5 w-5 shrink-0 text-[#a19c99] sm:block" />
                    <input
                      autoFocus
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="yourwebsite.com"
                      className="min-w-0 flex-1 bg-transparent px-3 py-3 text-base outline-none placeholder:text-[#b5b0ad]"
                    />
                    <button className="flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#0b0b0c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2a2a2e]">
                      Build its soul <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                  {error && <ErrorMessage message={error} />}
                  <p className="mt-3 text-xs text-[#98928f]">
                    Public pages only. You stay in control of every source.
                  </p>
                </form>
              </div>
              <OnboardingVisual />
            </div>
          ) : step === "knowledge" ? (
            <div className="grid min-h-[590px] lg:grid-cols-[.9fr_1.1fr]">
              <div className="flex flex-col justify-center border-b border-black/[0.07] px-7 py-10 sm:px-14 lg:border-b-0 lg:border-r">
                <span className="obs-mono text-xs font-medium uppercase tracking-[0.14em] text-[#8a8a8f]">
                  Live website learning
                </span>
                <h1 className="mt-5 text-[clamp(2.2rem,4.4vw,3.2rem)] font-semibold leading-[1] tracking-[-0.05em]">
                  {draftSoul?.knowledge.status === "ready"
                    ? "Knowledge ready."
                    : "Reading your website."}
                </h1>
                <p className="mt-5 text-base leading-7 text-[#716d6c]">
                  This is real crawl activity—not a demo timer. Obseri checks crawl rules, discovers
                  useful pages, extracts content, and prepares searchable blocks.
                </p>
                <div className="mt-8 grid grid-cols-3 gap-3">
                  <Metric value={stats?.discovered ?? 0} label="Found" />
                  <Metric value={stats?.fetched ?? 0} label="Read" />
                  <Metric value={stats?.indexed ?? pageCount} label="Ready" />
                </div>
              </div>
              <div className="flex flex-col justify-center bg-[#fbfaf8] px-7 py-10 sm:px-12">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-[#4e4a49]">{safeHost(url)}</span>
                  <span className="tabular-nums text-[#8d8784]">{Math.round(progress)}%</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#ebe7e4]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#ff5c7a,#f3a37f)] transition-[width] duration-500"
                    style={{ width: `${Math.max(3, progress)}%` }}
                  />
                </div>
                <div className="mt-8 space-y-3">
                  {(events.length ? events.slice(-5) : [startingEvent()]).map(
                    (event, index, list) => (
                      <div
                        key={`${event.timestamp}-${index}`}
                        className="flex items-start gap-3 rounded-2xl border border-black/[0.06] bg-white px-4 py-3"
                      >
                        {index === list.length - 1 &&
                        draftSoul?.knowledge.status !== "ready" &&
                        !error ? (
                          <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#ff5c7a]" />
                        ) : (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0b0b0c]" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#3e3a39]">{event.message}</p>
                          {event.url && (
                            <p className="mt-1 truncate text-xs text-[#9a9491]">{event.url}</p>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
                {error ? (
                  <div className="mt-6">
                    <ErrorMessage message={error} />
                    <button
                      onClick={() => setStep("website")}
                      className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#0b0b0c] underline underline-offset-4"
                    >
                      <RefreshCw className="h-4 w-4" /> Try another URL
                    </button>
                  </div>
                ) : draftSoul?.knowledge.status === "ready" ? (
                  <button
                    onClick={() => {
                      applyPreset("guide");
                      setStep("personality");
                    }}
                    className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-[#0b0b0c] px-5 py-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2e]"
                  >
                    Shape its presence <ArrowRight className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          ) : step === "personality" ? (
            <div className="grid min-h-[590px] lg:grid-cols-[1fr_.78fr]">
              <div className="flex flex-col justify-center px-7 py-10 sm:px-14 lg:px-16">
                <span className="obs-mono text-xs font-medium uppercase tracking-[0.14em] text-[#8a8a8f]">
                  Make it feel like you
                </span>
                <h1 className="mt-5 text-[clamp(2.2rem,4.4vw,3.2rem)] font-semibold leading-[1] tracking-[-0.05em]">
                  How should it show up?
                </h1>
                <p className="mt-5 max-w-xl leading-7 text-[#716d6c]">
                  Choose a starting presence. You can tune every instruction, greeting, and voice
                  later in Soul Studio.
                </p>
                <div className="mt-8 grid gap-3">
                  {PRESETS.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => applyPreset(item.id)}
                      className={`flex items-center justify-between rounded-2xl border p-5 text-left transition ${
                        preset === item.id
                          ? "border-[#0b0b0c] bg-white shadow-[0_0_0_3px_rgba(11,11,12,.06)]"
                          : "border-black/[0.08] bg-white hover:border-black/20"
                      }`}
                    >
                      <span>
                        <span className="block font-semibold">{item.name}</span>
                        <span className="mt-1 block text-sm text-[#817b79]">{item.detail}</span>
                      </span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                          preset === item.id
                            ? "border-[#0b0b0c] bg-[#0b0b0c] text-white"
                            : "border-black/15 text-transparent"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
                {error && <ErrorMessage message={error} />}
                <button
                  onClick={() => void finishSetup()}
                  disabled={saving}
                  className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-[#0b0b0c] px-5 py-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2e] disabled:cursor-wait disabled:opacity-60"
                >
                  {saving ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {saving ? "Saving your agent…" : "Finish setup"}
                </button>
              </div>
              <div className="flex items-center justify-center border-t border-[#efefec] bg-[#f5f5f3] px-7 py-12 lg:border-l lg:border-t-0">
                <div className="w-full max-w-sm">
                  <OnboardingOrb size={112} />
                  <div className="mt-9 rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,.05),0_18px_40px_-20px_rgba(0,0,0,.2)]">
                    <div className="obs-mono flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8a8a8f]">
                      <MessageCircle className="h-4 w-4" /> First greeting
                    </div>
                    <p className="mt-4 text-lg leading-7 text-[#1f1f23]">
                      Hi — I’m {draftSoul?.name}. What can I help you find?
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#8a8a8f]">
                    <Volume2 className="h-4 w-4" /> Natural voice is ready by default
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[590px] flex-col items-center justify-center px-6 py-12 text-center">
              <div className="relative">
                <OnboardingOrb size={112} live />
                <span className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-[#0b0b0c] text-white">
                  <Check className="h-4 w-4" />
                </span>
              </div>
              <span className="mt-8 obs-mono text-xs font-medium uppercase tracking-[0.14em] text-[#8a8a8f]">
                Your first agent is ready
              </span>
              <h1 className="mt-4 text-[clamp(2.4rem,5vw,3.6rem)] font-semibold leading-[1] tracking-[-0.05em]">
                Meet {draftSoul?.name}.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#716d6c]">
                Your website is now searchable, its starting personality is set, and the live
                preview is ready for a real conversation.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <ReadyPill icon={<BookOpen className="h-4 w-4" />} label={`${pageCount} pages`} />
                <ReadyPill
                  icon={<Sparkles className="h-4 w-4" />}
                  label={`${blockCount} knowledge blocks`}
                />
                <ReadyPill icon={<Volume2 className="h-4 w-4" />} label="Voice ready" />
              </div>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <button
                  onClick={onEnterStudio}
                  disabled={!savedWorkspace}
                  className="flex items-center gap-2 rounded-full bg-[#0b0b0c] px-7 py-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2e] disabled:opacity-50"
                >
                  Talk to your agent <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-4 text-sm text-[#8a8a8f]">
                Next: preview it, then install it on your website with one snippet.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function SetupProgress({ current }: { current: SetupStep }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);
  return (
    <nav aria-label="Setup progress" className="mx-auto flex w-full max-w-2xl items-center">
      {STEPS.map((step, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <div key={step.id} className="contents">
            <div className="flex min-w-0 flex-col items-center gap-2 sm:flex-row">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                  complete
                    ? "border-[#0b0b0c] bg-[#0b0b0c] text-white"
                    : active
                      ? "border-[#0b0b0c] bg-white text-[#0b0b0c]"
                      : "border-black/10 bg-white/60 text-[#aaa4a1]"
                }`}
              >
                {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={`hidden text-xs font-medium sm:block ${active ? "text-black" : "text-[#9a9491]"}`}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`mx-3 h-px flex-1 ${index < currentIndex ? "bg-[#0b0b0c]" : "bg-black/10"}`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

function OnboardingOrb({ size, live = false }: { size: number; live?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-live={live}
      className="obs-orb mx-auto block"
      style={
        {
          width: size,
          height: size,
          "--obs-orb-a": "#ff6f91",
          "--obs-orb-b": "#b39cff",
          "--obs-orb-c": "#ffd3dc",
        } as CSSProperties
      }
    />
  );
}

function OnboardingVisual() {
  return (
    <div className="relative flex min-h-[420px] items-center justify-center overflow-hidden border-t border-[#efefec] bg-[#f5f5f3] lg:min-h-0 lg:border-l lg:border-t-0">
      <div className="obs-hero-glow absolute inset-0 opacity-60" />
      <div className="absolute h-[26rem] w-[26rem] rounded-full border border-black/[0.05]" />
      <div className="absolute h-[18rem] w-[18rem] rounded-full border border-black/[0.06]" />
      <OnboardingOrb size={180} />
      <VisualNode
        className="left-[10%] top-[22%]"
        icon={<Globe2 className="h-4 w-4" />}
        label="Discover"
      />
      <VisualNode
        className="right-[8%] top-[40%]"
        icon={<BookOpen className="h-4 w-4" />}
        label="Understand"
      />
      <VisualNode
        className="bottom-[18%] left-[16%]"
        icon={<MessageCircle className="h-4 w-4" />}
        label="Answer"
      />
    </div>
  );
}

function VisualNode({
  className,
  icon,
  label,
}: {
  className: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div
      className={`absolute flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-medium text-[#3d3d42] shadow-[0_1px_2px_rgba(0,0,0,.05),0_10px_24px_-12px_rgba(0,0,0,.2)] ${className}`}
    >
      {icon} {label}
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-[#918b88]">{label}</div>
    </div>
  );
}

function ReadyPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 py-2 text-sm text-[#615c5a]">
      <span className="text-[#0b0b0c]">{icon}</span> {label}
    </span>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#fff0ef] px-4 py-3 text-sm text-[#a33246]">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {message}
    </div>
  );
}

function normalizeWebsiteUrl(value: string) {
  const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  const url = new URL(candidate);
  if (!/^https?:$/.test(url.protocol) || !url.hostname || !url.hostname.includes(".")) {
    throw new Error("Enter a public website such as yourwebsite.com.");
  }
  url.hash = "";
  return url.toString();
}

function safeHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function startingEvent(): CrawlProgressEvent {
  return {
    type: "progress",
    stage: "starting",
    message: "Connecting to your website",
    progress: 3,
    timestamp: "starting",
    stats: {
      discovered: 0,
      queued: 0,
      fetched: 0,
      indexed: 0,
      unchanged: 0,
      skipped: 0,
      duplicates: 0,
      blocked: 0,
      errors: 0,
    },
  };
}
