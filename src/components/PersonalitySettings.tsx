import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  Fingerprint,
  MessageCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { PersonalityConfig, Soul } from "@/lib/soul";
import {
  personalitySchema,
  REPLY_LANGUAGES,
  resolveConversationStyle,
  type ConversationStyle,
} from "@/lib/personality";
import SoulChat from "./SoulChat";

const TABS = [
  { id: "identity", label: "Identity", Icon: Fingerprint },
  { id: "conversation", label: "Conversation", Icon: MessageCircle },
  { id: "boundaries", label: "Boundaries", Icon: ShieldCheck },
  { id: "test", label: "Try it", Icon: Sparkles },
] as const;
const TONES = [
  { id: "warm", label: "Warm", detail: "Friendly and welcoming" },
  { id: "precise", label: "Precise", detail: "Direct and knowledgeable" },
  { id: "playful", label: "Playful", detail: "Light and expressive" },
  { id: "luxury", label: "Refined", detail: "Polished and understated" },
  { id: "bold", label: "Bold", detail: "Confident and energetic" },
  { id: "calm", label: "Calm", detail: "Patient and reassuring" },
] as const;
const STARTERS: Array<{ label: string; detail: string; patch: Partial<PersonalityConfig> }> = [
  {
    label: "Website guide",
    detail: "Help visitors find their way.",
    patch: {
      role: "Website guide",
      purpose: "Help visitors understand this website and find the right page or next step.",
      tone: "warm",
      traits: ["clear", "helpful", "curious"],
    },
  },
  {
    label: "Sales advisor",
    detail: "Help people choose with confidence.",
    patch: {
      role: "Sales advisor",
      purpose:
        "Understand what visitors need, explain relevant products or services using verified information, and help them decide without pressure.",
      tone: "precise",
      traits: ["attentive", "honest", "practical"],
    },
  },
  {
    label: "Support specialist",
    detail: "Guide visitors through problems.",
    patch: {
      role: "Support specialist",
      purpose:
        "Understand the visitor’s problem, guide them through verified solutions, and explain the next step when a human needs to help.",
      tone: "calm",
      traits: ["patient", "clear", "reassuring"],
    },
  },
];
const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-600 focus:ring-2 focus:ring-neutral-100";

export default function PersonalitySettings({
  soul,
  onUpdate,
  onInstall,
}: {
  soul: Soul;
  onUpdate: (updater: (soul: Soul) => Soul) => void;
  onInstall: () => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("identity");
  const [trait, setTrait] = useState("");
  const [starterNotice, setStarterNotice] = useState("");
  const config = soul.personality;
  const style = resolveConversationStyle(config.conversationStyle);
  const update = (patch: Partial<PersonalityConfig>) =>
    onUpdate((current) => ({ ...current, personality: { ...current.personality, ...patch } }));
  const updateStyle = (patch: Partial<ConversationStyle>) =>
    onUpdate((current) => ({
      ...current,
      personality: {
        ...current.personality,
        conversationStyle: {
          ...resolveConversationStyle(current.personality.conversationStyle),
          ...patch,
        },
      },
    }));
  const validation = personalitySchema.safeParse(config);
  const problem = validation.success
    ? ""
    : `Check ${validation.error.issues[0].path.join(" ")}: ${validation.error.issues[0].message}`;
  const addTrait = () => {
    const next = trait.trim();
    if (!next || config.traits.length >= 10) return;
    if (!config.traits.some((value) => value.toLowerCase() === next.toLowerCase()))
      update({ traits: [...config.traits, next] });
    setTrait("");
  };
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            Make it sound like you.
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            Set its character, shape its replies, and try a conversation.
          </p>
        </div>
        <button
          type="button"
          onClick={onInstall}
          className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
        >
          Review & publish <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
      <div
        role="tablist"
        aria-label="Personality settings"
        className="mt-7 flex gap-1 overflow-x-auto border-b border-neutral-200"
      >
        {TABS.map(({ id, label, Icon }, index) => (
          <button
            key={id}
            id={`personality-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`personality-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (!offset && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault();
              const next =
                TABS[
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? TABS.length - 1
                      : (index + offset + TABS.length) % TABS.length
                ];
              setTab(next.id);
              document.getElementById(`personality-tab-${next.id}`)?.focus();
            }}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-2 py-3.5 text-xs font-medium transition sm:px-4 sm:text-sm ${tab === id ? "border-neutral-950 text-neutral-950" : "border-transparent text-neutral-500 hover:text-neutral-900"}`}
          >
            <Icon className="hidden h-4 w-4 sm:block" />
            {label}
          </button>
        ))}
      </div>
      <div
        id={`personality-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`personality-tab-${tab}`}
        className="pt-7"
      >
        {tab === "identity" && (
          <div className="space-y-7">
            <Block
              title="Start with a role"
              description="Optional starting points. These change role, purpose, tone and traits; your greeting and custom instructions stay yours."
            >
              <div className="grid gap-3 md:grid-cols-3">
                {STARTERS.map((starter) => (
                  <button
                    key={starter.label}
                    type="button"
                    onClick={() => {
                      update(starter.patch);
                      setStarterNotice(`${starter.label} starting point applied.`);
                    }}
                    className="rounded-2xl border border-neutral-200 p-4 text-left transition hover:border-neutral-500 hover:bg-neutral-50"
                  >
                    <span className="text-sm font-semibold">{starter.label}</span>
                    <span className="mt-1.5 block text-xs leading-5 text-neutral-500">
                      {starter.detail}
                    </span>
                  </button>
                ))}
              </div>
              {starterNotice && (
                <p role="status" className="mt-3 text-xs text-neutral-600">
                  {starterNotice}
                </p>
              )}
            </Block>
            <Block
              title="Introduce your assistant"
              description="Use a visitor-facing name and a clear job description."
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Assistant name">
                  <input
                    className={inputClass}
                    value={config.name}
                    maxLength={100}
                    onChange={(event) => update({ name: event.target.value })}
                    placeholder="e.g. Alex"
                  />
                </Field>
                <Field label="Role">
                  <input
                    className={inputClass}
                    value={config.role}
                    maxLength={160}
                    onChange={(event) => update({ role: event.target.value })}
                    placeholder="e.g. Product specialist"
                  />
                </Field>
              </div>
              <Field
                label="Main purpose"
                hint="What should a successful conversation help the visitor do?"
                className="mt-5"
              >
                <textarea
                  className={inputClass}
                  rows={3}
                  value={config.purpose}
                  maxLength={600}
                  onChange={(event) => update({ purpose: event.target.value })}
                />
              </Field>
              <Field
                label="Welcome message"
                hint="Shown exactly as written when a visitor starts a new conversation."
                className="mt-5"
              >
                <textarea
                  className={inputClass}
                  rows={3}
                  value={config.greeting}
                  maxLength={500}
                  onChange={(event) => update({ greeting: event.target.value })}
                />
              </Field>
            </Block>
          </div>
        )}
        {tab === "conversation" && (
          <div className="space-y-7">
            <Block
              title="Tone & character"
              description="Choose a tone, then add the qualities that make it yours."
            >
              <Choices
                label="Tone"
                value={config.tone}
                options={TONES}
                onChange={(tone) => update({ tone })}
              />
              <div className="mt-6">
                <p className="text-sm font-medium">
                  Character traits{" "}
                  <span className="ml-1 font-normal text-neutral-400">
                    {config.traits.length}/10
                  </span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {config.traits.map((value, index) => (
                    <span
                      key={`${value}-${index}`}
                      className="inline-flex items-center gap-2 rounded-full bg-neutral-100 py-1.5 pl-3 pr-2 text-sm"
                    >
                      {value}
                      <button
                        aria-label={`Remove trait ${value}`}
                        onClick={() =>
                          update({ traits: config.traits.filter((_, i) => i !== index) })
                        }
                        className="rounded-full p-1 hover:bg-neutral-200"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <form
                  className="mt-3 flex max-w-md gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addTrait();
                  }}
                >
                  <input
                    aria-label="New character trait"
                    className={inputClass}
                    value={trait}
                    maxLength={50}
                    disabled={config.traits.length >= 10}
                    onChange={(event) => setTrait(event.target.value)}
                    placeholder="e.g. thoughtful"
                  />
                  <button
                    disabled={!trait.trim() || config.traits.length >= 10}
                    className="rounded-xl border border-neutral-200 px-4 text-sm font-medium disabled:opacity-40"
                  >
                    Add
                  </button>
                </form>
              </div>
            </Block>
            <Block
              title="How replies feel"
              description="These controls guide generated replies. Voice replies stay short enough for a conversation."
            >
              <Choices
                label="Reply length"
                value={style.length}
                options={[
                  { id: "brief", label: "Brief", detail: "A few useful sentences" },
                  { id: "balanced", label: "Balanced", detail: "An answer with key details" },
                  { id: "detailed", label: "Detailed", detail: "Steps and supporting context" },
                ]}
                onChange={(length) => updateStyle({ length })}
              />
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Field label="Reply language">
                  <select
                    className={inputClass}
                    value={style.language}
                    onChange={(event) =>
                      updateStyle({ language: event.target.value as ConversationStyle["language"] })
                    }
                  >
                    {Object.entries(REPLY_LANGUAGES).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Emojis">
                  <select
                    className={inputClass}
                    value={style.emojis}
                    onChange={(event) =>
                      updateStyle({ emojis: event.target.value as ConversationStyle["emojis"] })
                    }
                  >
                    <option value="none">No emojis</option>
                    <option value="occasional">Occasional, when appropriate</option>
                  </select>
                </Field>
              </div>
              <div className="mt-6">
                <Choices
                  label="Next steps"
                  value={style.nextStep}
                  options={[
                    {
                      id: "direct",
                      label: "Answer directly",
                      detail: "No routine questions or sales prompts",
                    },
                    {
                      id: "guided",
                      label: "Guide when helpful",
                      detail: "Offer one relevant next step",
                    },
                  ]}
                  onChange={(nextStep) => updateStyle({ nextStep })}
                />
              </div>
            </Block>
            <Block
              title="Custom instructions"
              description="Add business-specific preferences. The controls above take priority over conflicting style instructions."
            >
              <Field label="Instructions" hint={`${config.instructions.length}/2,000 characters`}>
                <textarea
                  className={inputClass}
                  rows={5}
                  value={config.instructions}
                  maxLength={2000}
                  placeholder="e.g. Ask about the visitor’s team size before recommending a plan. Never promise a delivery date."
                  onChange={(event) => update({ instructions: event.target.value })}
                />
              </Field>
            </Block>
          </div>
        )}
        {tab === "boundaries" && (
          <div className="space-y-7">
            <div className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <div>
                <h2 className="text-sm font-semibold text-emerald-950">
                  Grounded answers are always on
                </h2>
                <p className="mt-1 text-sm leading-6 text-emerald-900/70">
                  The assistant uses your website knowledge, asks for clarification when needed, and
                  does not pretend to see a visitor’s screen. Your rules add to these protections.
                </p>
              </div>
            </div>
            <Block
              title="Your rules"
              description="One clear instruction per rule. For example: never promise discounts, or never estimate delivery times."
            >
              <div className="space-y-3">
                {config.guardrails.map((rule, index) => (
                  <div className="flex items-start gap-2" key={index}>
                    <textarea
                      aria-label={`Rule ${index + 1}`}
                      className={inputClass}
                      value={rule}
                      maxLength={500}
                      rows={2}
                      onChange={(event) =>
                        update({
                          guardrails: config.guardrails.map((value, i) =>
                            i === index ? event.target.value : value,
                          ),
                        })
                      }
                    />
                    <button
                      onClick={() =>
                        update({ guardrails: config.guardrails.filter((_, i) => i !== index) })
                      }
                      aria-label={`Remove rule ${index + 1}`}
                      className="rounded-xl p-3 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                disabled={config.guardrails.length >= 12}
                onClick={() => update({ guardrails: [...config.guardrails, ""] })}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                Add rule
              </button>
            </Block>
            <Block
              title="When an answer is missing"
              description="A starting point, not a fixed reply. The assistant adapts this wording to the conversation."
            >
              <Field label="Preferred uncertainty wording">
                <textarea
                  className={inputClass}
                  rows={3}
                  maxLength={500}
                  value={config.unknownResponse}
                  onChange={(event) => update({ unknownResponse: event.target.value })}
                  placeholder="I don’t have that detail yet. Tell me what you need and I can help you find a relevant page."
                />
              </Field>
            </Block>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 p-5">
              <div>
                <h2 className="text-sm font-semibold">Contact forms & booking</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Configure the follow-up button and calendar links in Install.
                </p>
              </div>
              <button
                onClick={onInstall}
                className="inline-flex items-center gap-2 text-sm font-medium"
              >
                Open Install <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        {tab === "test" && (
          <div className="grid items-start gap-7 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div>
              <h2 className="text-lg font-semibold">Try your draft</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                Chat with your current settings and saved website knowledge. Test messages use your
                plan’s normal response allowance.
              </p>
              <div className="mt-6 space-y-4 text-sm text-neutral-600">
                {[
                  "Ask a question a real visitor would ask.",
                  "Follow up with a short message like “tell me more”.",
                  "Ask something your website does not cover.",
                ].map((text) => (
                  <p key={text} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                    {text}
                  </p>
                ))}
              </div>
              {!soul.knowledge.pages.some(
                (page) => page.enabled !== false && page.chunks.length,
              ) && (
                <p
                  role="status"
                  className="mt-5 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900"
                >
                  Add website knowledge for factual answers. You can still test greetings and
                  clarification.
                </p>
              )}
              <p className="mt-6 text-xs leading-5 text-neutral-400">
                Changing a setting and returning here starts a fresh test. Voice pronunciation is
                configured in Voice.
              </p>
            </div>
            {problem ? (
              <p role="alert" className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-900">
                {problem}
              </p>
            ) : (
              <div className="min-w-0">
                <SoulChat key={soul.id} soul={soul} initialPanelMode="chat" />
              </div>
            )}
          </div>
        )}
      </div>
      {problem && tab !== "test" && (
        <p role="alert" className="mt-5 text-sm text-amber-800">
          {problem}
        </p>
      )}
      <p className="mt-8 border-t border-neutral-100 pt-5 text-xs leading-5 text-neutral-500">
        Edits are saved to your workspace draft. Review and publish when you’re ready to update your
        website.
      </p>
    </section>
  );
}

function Block({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-neutral-500">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}
function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-2 block text-xs leading-5 text-neutral-500">{hint}</span>}
    </label>
  );
}
function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ id: T; label: string; detail: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-medium">{label}</legend>
      <div
        className={`grid gap-3 ${options.length === 6 ? "grid-cols-2" : "sm:grid-cols-2"} ${options.length >= 3 ? "lg:grid-cols-3" : ""}`}
      >
        {options.map((option) => (
          <label
            key={option.id}
            className={`cursor-pointer rounded-xl border p-4 transition ${value === option.id ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:border-neutral-400"}`}
          >
            <span className="flex items-center justify-between gap-2 text-sm font-medium">
              {option.label}
              <input
                type="radio"
                name={`personality-${label}`}
                value={option.id}
                checked={value === option.id}
                onChange={() => onChange(option.id)}
                className="accent-neutral-900"
              />
            </span>
            <span className="mt-1.5 block text-xs leading-5 text-neutral-500">{option.detail}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
