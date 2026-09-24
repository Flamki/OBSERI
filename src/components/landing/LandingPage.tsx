import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpenCheck,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Globe2,
  KeyRound,
  Lock,
  Menu,
  MessageSquareText,
  Mic,
  PhoneCall,
  PhoneOff,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Webhook,
  X,
} from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Reveal, useInView, useTypewriter } from "@/components/landing/motion";
import {
  useVoiceAgent,
  VOICE_AGENTS,
  type VoiceAgent,
  type VoiceStatus,
} from "@/components/landing/useVoiceAgent";
import { BILLING_PLANS, formatInr } from "@/lib/billing-plans";

export const LANDING_FAQ: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: "What does Obseri learn from?",
    answer:
      "Your public website. Paste a URL and Obseri discovers pages on the same domain, respects robots.txt and your sitemap, removes duplicates, and turns the content into searchable knowledge. You can add manual content, exclude pages, and refresh whenever your site changes.",
  },
  {
    question: "Will it make things up?",
    answer:
      "Obseri answers from the sources in your workspace and shows citations back to the original page. When the answer is not in your content, it says so using the fallback response you choose instead of guessing, and you can test retrieval before you publish.",
  },
  {
    question: "How do I put it on my website?",
    answer:
      "Publish from Soul Studio and copy one script tag. The widget loads asynchronously in an isolated frame, only starts on the domains you allow, and uses short-lived signed sessions so your publisher key never touches the page.",
  },
  {
    question: "Can visitors really talk to it?",
    answer:
      "Yes. Visitors can speak through their browser microphone or type. Your agent replies with a consistent neural voice you pick in Studio, so it never switches speakers mid-conversation.",
  },
  {
    question: "What happens when someone is ready to buy?",
    answer:
      "The agent recognises buying intent, asks for contact details with consent, and records the lead. On Growth and above, signed webhooks push conversation and lead events straight into your CRM or workflow.",
  },
  {
    question: "Is there a free plan?",
    answer:
      "Yes. The Free plan includes one website, up to 30 indexed pages, 100 text responses and 5 voice minutes a month, so you can build and test a complete agent before you upgrade.",
  },
];

const salesEmail = "mailto:flamki@obseri.com?subject=Obseri%20sales";

export default function LandingPage() {
  return (
    <div className="obs-landing min-h-screen overflow-x-clip antialiased">
      <Nav />
      <main>
        <Hero />
        <PlatformStrip />
        <Capabilities />
        <UseCases />
        <HowItWorks />
        <Trust />
        <PricingTeaser />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Shared UI                                 */
/* -------------------------------------------------------------------------- */

function Orb({
  agent,
  size,
  live = false,
  className = "",
}: {
  agent: Pick<VoiceAgent, "colors">;
  size: number;
  live?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-live={live}
      className={`obs-orb inline-block shrink-0 ${className}`}
      style={
        {
          width: size,
          height: size,
          "--obs-orb-a": agent.colors[0],
          "--obs-orb-b": agent.colors[1],
          "--obs-orb-c": agent.colors[2],
        } as CSSProperties
      }
    />
  );
}

function PrimaryButton({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0b0b0c] px-6 text-[15px] font-medium text-white transition hover:bg-[#2a2a2e]"
    >
      {children}
      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
    </Link>
  );
}

function SecondaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#e2e2df] bg-white px-6 text-[15px] font-medium text-[#0b0b0c] transition hover:border-[#cfcfcb] hover:bg-[#fafaf8]"
    >
      {children}
    </a>
  );
}

function Eyebrow({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <p
      className={`obs-mono text-[12px] font-medium uppercase tracking-[0.14em] text-[#8a8a8f] ${center ? "text-center" : ""}`}
    >
      {children}
    </p>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  center = false,
}: {
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  center?: boolean;
}) {
  return (
    <Reveal className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <Eyebrow center={center}>{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-balance text-[clamp(2.2rem,4.6vw,3.9rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
        {title}
      </h2>
      {body && (
        <p
          className={`mt-5 max-w-xl text-[17px] leading-7 text-[#6f6f73] ${center ? "mx-auto" : ""}`}
        >
          {body}
        </p>
      )}
    </Reveal>
  );
}

/** Advances through a scripted sequence while `running`, looping after a pause. */
function useScriptPlayer(length: number, running: boolean, stepMs = 1800) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!running) return;
    const delay = step >= length ? 4000 : step === 0 ? 600 : stepMs;
    const timer = window.setTimeout(() => {
      setStep((current) => (current >= length ? 0 : current + 1));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [step, length, running, stepMs]);

  return step;
}

/* -------------------------------------------------------------------------- */
/*                                     Nav                                    */
/* -------------------------------------------------------------------------- */

const navLinks = [
  { href: "#product", label: "Product" },
  { href: "#use-cases", label: "Use cases" },
  { href: "#trust", label: "Trust" },
  { href: "#faq", label: "FAQ" },
];

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={[
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled || open
          ? "border-b border-[#ececea] bg-white/85 backdrop-blur-xl backdrop-saturate-150"
          : "border-b border-transparent bg-transparent",
      ].join(" ")}
    >
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-10">
          <Link to="/" aria-label="Obseri home" className="inline-flex items-center">
            <img src="/obseri-logo-dark.svg" alt="Obseri" className="h-7 w-auto" />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full px-3.5 py-2 text-[14px] text-[#3d3d42] transition hover:bg-black/[0.04] hover:text-black"
              >
                {link.label}
              </a>
            ))}
            <Link
              to="/pricing"
              className="rounded-full px-3.5 py-2 text-[14px] text-[#3d3d42] transition hover:bg-black/[0.04] hover:text-black"
            >
              Pricing
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/app"
            className="hidden h-10 items-center px-3 text-[14px] text-[#3d3d42] transition hover:text-black sm:inline-flex"
          >
            Log in
          </Link>
          <a
            href={salesEmail}
            className="hidden h-10 items-center rounded-full border border-[#e2e2df] bg-white px-4 text-[14px] font-medium transition hover:bg-[#fafaf8] md:inline-flex"
          >
            Contact sales
          </a>
          <Link
            to="/app"
            className="inline-flex h-10 items-center rounded-full bg-[#0b0b0c] px-4 text-[14px] font-medium text-white transition hover:bg-[#2a2a2e]"
          >
            Sign up
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/[0.05] lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="grid gap-1 border-t border-[#ececea] bg-white px-4 py-3 lg:hidden">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-3 text-[16px] hover:bg-[#f5f5f3]"
            >
              {link.label}
            </a>
          ))}
          <Link to="/pricing" className="rounded-xl px-3 py-3 text-[16px] hover:bg-[#f5f5f3]">
            Pricing
          </Link>
          <a href={salesEmail} className="rounded-xl px-3 py-3 text-[16px] hover:bg-[#f5f5f3]">
            Contact sales
          </a>
        </nav>
      )}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Hero                                    */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-10 pt-32 sm:px-6 sm:pt-40">
      <div className="mx-auto max-w-[1240px] text-center">
        <Reveal>
          <a
            href="#demo"
            className="group inline-flex items-center gap-2 rounded-full border border-[#e7e7e4] bg-white py-1 pl-1 pr-3.5 text-[13px] text-[#3d3d42] shadow-[0_1px_2px_rgba(0,0,0,.04)] transition hover:border-[#d6d6d2]"
          >
            <span className="flex items-center gap-1.5 rounded-full bg-[#f5f5f3] px-2.5 py-1 text-[12px] font-medium text-[#0b0b0c]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff5c7a]" /> Live
            </span>
            Talk to a real Obseri agent below
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </a>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="mx-auto mt-7 max-w-[980px] text-balance text-[clamp(2.9rem,7.4vw,6rem)] font-semibold leading-[0.96] tracking-[-0.055em]">
            Make every visit a lead.
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mx-auto mt-6 max-w-[620px] text-[17px] leading-7 text-[#6f6f73] sm:text-[19px] sm:leading-8">
            Obseri turns your website into a lifelike voice and chat agent. It answers from your own
            pages, qualifies every buyer, and sends you the lead.
          </p>
        </Reveal>
        <Reveal delay={240} className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <PrimaryButton to="/app">Build your agent free</PrimaryButton>
          <SecondaryButton href={salesEmail}>Talk to sales</SecondaryButton>
        </Reveal>
      </div>

      <Reveal delay={320} className="relative mx-auto mt-16 max-w-[1160px] sm:mt-20">
        <div className="obs-hero-glow pointer-events-none absolute -inset-x-10 -inset-y-16 opacity-90" />
        <HeroDemo />
      </Reveal>
    </section>
  );
}

type DemoTab = "voice" | "chat" | "train" | "embed";

const demoTabs: Array<{ id: DemoTab; label: string; icon: ReactNode }> = [
  { id: "voice", label: "Voice agent", icon: <AudioLines /> },
  { id: "chat", label: "Website chat", icon: <MessageSquareText /> },
  { id: "train", label: "Train on your site", icon: <Globe2 /> },
  { id: "embed", label: "Embed", icon: <Code2 /> },
];

function HeroDemo() {
  const [tab, setTab] = useState<DemoTab>("voice");

  return (
    <div
      id="demo"
      className="relative scroll-mt-24 overflow-hidden rounded-[28px] border border-[#e7e7e4] bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,.04),0_24px_80px_-24px_rgba(40,20,60,.18)]"
    >
      <div className="flex flex-col gap-3 border-b border-[#efefec] p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div
          role="tablist"
          aria-label="Obseri demo"
          className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {demoTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={[
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-medium transition [&_svg]:h-4 [&_svg]:w-4",
                tab === item.id
                  ? "bg-[#0b0b0c] text-white"
                  : "text-[#5b5b60] hover:bg-[#f5f5f3] hover:text-black",
              ].join(" ")}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
        <p className="hidden items-center gap-2 px-2 text-[13px] text-[#8a8a8f] sm:flex">
          <span className="h-2 w-2 rounded-full bg-[#22c55e]" /> Running on obseri.com
        </p>
      </div>
      <div className="min-h-[520px]">
        {tab === "voice" && <VoiceTab />}
        {tab === "chat" && <ChatTab />}
        {tab === "train" && <TrainTab />}
        {tab === "embed" && <EmbedTab />}
      </div>
    </div>
  );
}

/* --------------------------------- Voice tab -------------------------------- */

function VoiceTab() {
  const voice = useVoiceAgent();
  const [selectedId, setSelectedId] = useState(VOICE_AGENTS[0].id);
  const selected = VOICE_AGENTS.find((agent) => agent.id === selectedId) ?? VOICE_AGENTS[0];
  const onCall = voice.activeAgent === selected.id;
  const status: VoiceStatus = onCall ? voice.voiceStatus : "idle";
  const live = onCall && status !== "idle" && status !== "error";

  const selectAgent = (agent: VoiceAgent) => {
    if (voice.activeAgent && voice.activeAgent !== agent.id) voice.stopConversation();
    setSelectedId(agent.id);
  };

  return (
    <div className="grid lg:grid-cols-[1.35fr_1fr]">
      <div className="relative flex flex-col items-center justify-center px-6 py-12 sm:py-14">
        <div className="relative h-[220px] w-[220px] sm:h-[250px] sm:w-[250px]">
          {live && (
            <span
              className="absolute inset-0 animate-ping rounded-full opacity-20 [animation-duration:2.4s]"
              style={{ background: selected.colors[0] }}
            />
          )}
          <Orb agent={selected} size={250} live={live} className="!h-full !w-full" />
        </div>
        <p className="mt-7 text-[13px] font-medium text-[#8a8a8f]" aria-live="polite">
          {onCall ? voice.notice : "Ready when you are"}
        </p>
        <button
          type="button"
          onClick={() => voice.startConversation(selected)}
          className={[
            "mt-4 inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-medium transition",
            live
              ? "border border-[#e2e2df] bg-white text-[#0b0b0c] hover:bg-[#fafaf8]"
              : "bg-[#0b0b0c] text-white hover:bg-[#2a2a2e]",
          ].join(" ")}
        >
          {live ? (
            <>
              <PhoneOff className="h-4 w-4 text-[#e0395a]" /> End call
            </>
          ) : (
            <>
              <PhoneCall className="h-4 w-4" /> Call {selected.name}
            </>
          )}
        </button>
        <div className="mt-8 grid w-full max-w-[560px] gap-2 text-[14px] leading-6">
          <p className="rounded-2xl bg-[#f5f5f3] px-4 py-3 text-[#5b5b60]">
            <span className="mr-2 inline-flex items-center gap-1 font-medium text-[#0b0b0c]">
              <Mic className="h-3.5 w-3.5" /> You
            </span>
            {onCall ? voice.transcript : "Ask about pricing, features, or how setup works."}
          </p>
          <p className="rounded-2xl border border-[#efefec] px-4 py-3 text-[#3d3d42]">
            <span className="mr-2 font-medium text-[#0b0b0c]">{selected.name}</span>
            {onCall ? voice.reply : selected.greeting}
          </p>
        </div>
      </div>

      <div className="border-t border-[#efefec] bg-[#fafaf9] p-4 sm:p-6 lg:border-l lg:border-t-0">
        <p className="obs-mono px-2 text-[12px] uppercase tracking-[0.14em] text-[#8a8a8f]">
          Choose a voice
        </p>
        <ul className="mt-4 space-y-2">
          {VOICE_AGENTS.map((agent) => {
            const active = agent.id === selectedId;
            return (
              <li key={agent.id}>
                <button
                  type="button"
                  onClick={() => selectAgent(agent)}
                  aria-pressed={active}
                  className={[
                    "flex w-full items-center gap-4 rounded-2xl border p-3 text-left transition",
                    active
                      ? "border-[#e2e2df] bg-white shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_-12px_rgba(0,0,0,.12)]"
                      : "border-transparent hover:bg-white",
                  ].join(" ")}
                >
                  <Orb agent={agent} size={44} live={voice.activeAgent === agent.id && live} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{agent.name}</span>
                    <span className="block text-[13px] text-[#8a8a8f]">
                      {agent.role} · {agent.tone}
                    </span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 rounded-2xl border border-[#efefec] bg-white p-4">
          <p className="text-[14px] font-medium">Same knowledge, different personality</p>
          <p className="mt-1.5 text-[13px] leading-5 text-[#6f6f73]">
            Every voice answers from the same website content. You choose the tone, the guardrails,
            and how hard it sells.
          </p>
        </div>
        <p className="mt-4 px-2 text-[12px] leading-5 text-[#8a8a8f]">
          Uses your browser microphone. Works best in Chrome or Edge.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------- Chat tab --------------------------------- */

type ScriptLine =
  | { kind: "visitor"; text: string }
  | { kind: "agent"; text: string; source?: string }
  | { kind: "lead" };

const chatScript: ScriptLine[] = [
  { kind: "visitor", text: "Does Obseri work with HubSpot?" },
  {
    kind: "agent",
    text: "Yes. Obseri sends signed webhook events for every lead and conversation, so you can route them into HubSpot or any CRM that accepts webhooks.",
    source: "obseri.com/#trust",
  },
  { kind: "visitor", text: "We’re a team of 5 with 3 websites. Which plan?" },
  {
    kind: "agent",
    text: "Growth fits well: 3 websites, 5 seats, 2,000 indexed pages and signed webhooks. Want me to have someone walk you through setup?",
    source: "obseri.com/pricing",
  },
  { kind: "visitor", text: "Sure, it’s priya@company.com" },
  { kind: "lead" },
];

const chatInsights = [
  { at: 2, icon: <BookOpenCheck />, title: "Answered from a source", body: "Cited the trust page" },
  {
    at: 4,
    icon: <Sparkles />,
    title: "Buying intent detected",
    body: "Comparing plans · team of 5",
  },
  { at: 6, icon: <UserRoundCheck />, title: "Lead captured", body: "priya@company.com" },
  { at: 6, icon: <Webhook />, title: "lead.detected delivered", body: "Signed webhook · 200 OK" },
];

function ChatTab() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.2 });
  const step = useScriptPlayer(chatScript.length, inView);
  const agentTyping = chatScript[step]?.kind === "agent";

  return (
    <div ref={ref} className="grid lg:grid-cols-[1.35fr_1fr]">
      <div className="flex h-[600px] flex-col bg-white">
        <div className="flex items-center gap-3 border-b border-[#efefec] px-5 py-4">
          <Orb agent={VOICE_AGENTS[0]} size={36} live={agentTyping} />
          <div>
            <p className="text-[15px] font-medium">Ona</p>
            <p className="text-[12px] text-[#8a8a8f]">Answers from obseri.com</p>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden p-5">
          {chatScript.slice(0, step).map((line, index) => (
            <ChatBubble key={index} line={line} />
          ))}
          {agentTyping && (
            <div className="flex w-16 items-center justify-center gap-1 self-start rounded-2xl rounded-bl-md bg-[#f5f5f3] px-4 py-3.5">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8a8a8f]"
                  style={{ animationDelay: `${dot * 120}ms` }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-[#efefec] p-3">
          <div className="flex h-11 flex-1 items-center rounded-full bg-[#f5f5f3] px-4 text-[14px] text-[#9a9a9e]">
            Ask anything…
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0b0b0c] text-white">
            <AudioLines className="h-4 w-4" />
          </span>
        </div>
      </div>
      <div className="border-t border-[#efefec] bg-[#fafaf9] p-4 sm:p-6 lg:border-l lg:border-t-0">
        <p className="obs-mono px-2 text-[12px] uppercase tracking-[0.14em] text-[#8a8a8f]">
          What Obseri did
        </p>
        <ul className="mt-4 space-y-2">
          {chatInsights.map((insight) => {
            const done = step >= insight.at;
            return (
              <li
                key={insight.title}
                className={[
                  "flex items-center gap-3 rounded-2xl border bg-white p-3 transition-all duration-500",
                  done ? "border-[#e7e7e4] opacity-100" : "border-transparent opacity-40",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors [&_svg]:h-4 [&_svg]:w-4",
                    done ? "bg-[#fff0f3] text-[#e0395a]" : "bg-[#f5f5f3] text-[#9a9a9e]",
                  ].join(" ")}
                >
                  {insight.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium">{insight.title}</span>
                  <span className="block truncate text-[13px] text-[#8a8a8f]">{insight.body}</span>
                </span>
                {done && <Check className="ml-auto h-4 w-4 shrink-0 text-[#16a34a]" />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ChatBubble({ line }: { line: ScriptLine }) {
  if (line.kind === "visitor") {
    return (
      <div className="max-w-[80%] animate-in fade-in slide-in-from-bottom-2 self-end rounded-2xl rounded-br-md bg-[#0b0b0c] px-4 py-3 text-[14px] leading-6 text-white duration-500">
        {line.text}
      </div>
    );
  }
  if (line.kind === "agent") {
    return (
      <div className="max-w-[85%] animate-in fade-in slide-in-from-bottom-2 self-start duration-500">
        <div className="rounded-2xl rounded-bl-md bg-[#f5f5f3] px-4 py-3 text-[14px] leading-6 text-[#1f1f23]">
          {line.text}
        </div>
        {line.source && (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[#e7e7e4] px-2.5 py-1 text-[12px] text-[#6f6f73]">
            <ArrowUpRight className="h-3 w-3" /> {line.source}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="flex animate-in fade-in zoom-in-95 items-center gap-2 self-center rounded-full bg-[#ecfdf3] px-3.5 py-2 text-[13px] font-medium text-[#15803d] duration-500">
      <Check className="h-3.5 w-3.5" /> Lead saved and sent to your CRM
    </div>
  );
}

/* --------------------------------- Train tab -------------------------------- */

const exampleSites = ["yourwebsite.com", "acme-dental.com", "northwind.store", "lumen-saas.io"];

function UrlForm({ id }: { id: string }) {
  const typed = useTypewriter(exampleSites);
  const [value, setValue] = useState("");

  return (
    <form action="/app" method="get" className="w-full">
      <label htmlFor={id} className="sr-only">
        Your website URL
      </label>
      <div className="flex flex-col gap-2 rounded-[22px] border border-[#e2e2df] bg-white p-1.5 shadow-[0_1px_2px_rgba(0,0,0,.04)] transition focus-within:border-[#cfcfcb] focus-within:ring-4 focus-within:ring-black/[0.04] sm:flex-row sm:items-center sm:rounded-full">
        <div className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4">
          <Globe2 className="h-4 w-4 shrink-0 text-[#9a9a9e]" />
          <div className="relative min-w-0 flex-1">
            <input
              id={id}
              name="url"
              type="url"
              required
              autoComplete="url"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="https://yourwebsite.com"
              className="h-10 w-full min-w-0 bg-transparent text-[16px] text-[#0b0b0c] outline-none placeholder:text-transparent"
            />
            {!value && (
              <span
                aria-hidden="true"
                className="obs-caret pointer-events-none absolute inset-y-0 left-0 flex items-center text-[16px] text-[#9a9a9e]"
              >
                https://{typed}
              </span>
            )}
          </div>
        </div>
        <button
          type="submit"
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#0b0b0c] px-6 text-[15px] font-medium text-white transition hover:bg-[#2a2a2e]"
        >
          Build my agent <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

const crawlPages = [
  "/",
  "/pricing",
  "/features",
  "/docs/getting-started",
  "/integrations",
  "/about",
  "/faq",
];

function TrainTab() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.2 });
  const step = useScriptPlayer(crawlPages.length, inView, 520);
  const learned = Math.min(step, crawlPages.length);

  return (
    <div ref={ref} className="grid lg:grid-cols-[1.35fr_1fr]">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <h3 className="text-[clamp(1.7rem,3vw,2.4rem)] font-semibold leading-[1.05] tracking-[-0.04em]">
          Paste a URL. Get an agent that knows your business.
        </h3>
        <p className="mt-4 max-w-md text-[16px] leading-7 text-[#6f6f73]">
          Obseri reads your public pages, follows your sitemap, respects robots.txt, and keeps a
          source for every answer. Try it with your own site.
        </p>
        <div className="mt-8 max-w-[560px]">
          <UrlForm id="demo-url" />
        </div>
        <p className="mt-4 text-[13px] text-[#8a8a8f]">Free plan · 1 website · up to 30 pages</p>
      </div>
      <div className="border-t border-[#efefec] bg-[#fafaf9] p-4 sm:p-6 lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between px-2">
          <p className="obs-mono text-[12px] uppercase tracking-[0.14em] text-[#8a8a8f]">
            Learning yourwebsite.com
          </p>
          <span className="obs-mono text-[12px] text-[#8a8a8f]">
            {learned}/{crawlPages.length}
          </span>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#ececea]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#ff8ba0] to-[#b39cff] transition-all duration-300"
            style={{ width: `${(learned / crawlPages.length) * 100}%` }}
          />
        </div>
        <ul className="mt-4 space-y-2">
          {crawlPages.map((page, index) => {
            const done = index < learned;
            return (
              <li
                key={page}
                className={[
                  "flex items-center justify-between rounded-xl border bg-white px-3.5 py-2.5 text-[13px] transition-all duration-300",
                  done ? "border-[#e7e7e4] opacity-100" : "border-transparent opacity-40",
                ].join(" ")}
              >
                <span className="obs-mono text-[#3d3d42]">{page}</span>
                {done ? (
                  <span className="flex items-center gap-1 text-[#16a34a]">
                    <Check className="h-3.5 w-3.5" /> Learned
                  </span>
                ) : (
                  <span className="text-[#9a9a9e]">Queued</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* --------------------------------- Embed tab -------------------------------- */

const embedSnippet = `<script
  src="https://obseri.com/obseri-widget.js"
  data-soul-id="your-soul-id"
  data-widget-token="your-widget-token"
  async
></script>`;

function EmbedTab() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(embedSnippet).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="grid lg:grid-cols-[1.35fr_1fr]">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <h3 className="text-[clamp(1.7rem,3vw,2.4rem)] font-semibold leading-[1.05] tracking-[-0.04em]">
          One snippet. Live on every page.
        </h3>
        <p className="mt-4 max-w-md text-[16px] leading-7 text-[#6f6f73]">
          Publish from Soul Studio and paste the snippet before the closing body tag. Works on any
          site that accepts a script tag.
        </p>
        <div className="mt-8 overflow-hidden rounded-2xl bg-[#0b0b0c] text-white">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <span className="obs-mono text-[12px] text-white/50">index.html</span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="obs-mono overflow-x-auto p-4 text-[13px] leading-6 text-white/80">
            {embedSnippet}
          </pre>
        </div>
      </div>
      <div className="border-t border-[#efefec] bg-[#fafaf9] p-4 sm:p-6 lg:border-l lg:border-t-0">
        <p className="obs-mono px-2 text-[12px] uppercase tracking-[0.14em] text-[#8a8a8f]">
          Built in
        </p>
        <ul className="mt-4 space-y-2">
          {[
            ["Domain allowlist", "Only runs on sites you approve"],
            ["Signed sessions", "Short-lived and origin-bound"],
            ["Isolated frame", "Never touches your page styles"],
            ["Your branding", "Accent, position and welcome label"],
          ].map(([title, body]) => (
            <li
              key={title}
              className="flex items-center gap-3 rounded-2xl border border-[#e7e7e4] bg-white p-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f5f5f3]">
                <Check className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[14px] font-medium">{title}</span>
                <span className="block text-[13px] text-[#8a8a8f]">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Platform strip                              */
/* -------------------------------------------------------------------------- */

const platforms = [
  "WordPress",
  "Shopify",
  "Webflow",
  "Framer",
  "Wix",
  "Squarespace",
  "Next.js",
  "React",
  "Ghost",
  "Custom HTML",
];

function PlatformStrip() {
  return (
    <section className="px-4 pb-8 pt-14 sm:px-6">
      <p className="text-center text-[14px] text-[#8a8a8f]">
        Works on any website that accepts a script tag
      </p>
      <div className="obs-marquee-mask mx-auto mt-6 max-w-[1100px] overflow-hidden">
        <div className="obs-marquee items-center">
          {[...platforms, ...platforms].map((name, index) => (
            <span
              key={index}
              className="mx-8 shrink-0 text-[22px] font-semibold tracking-[-0.03em] text-[#b4b4b0] sm:mx-12"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Capabilities                                */
/* -------------------------------------------------------------------------- */

function Capabilities() {
  return (
    <section id="product" className="scroll-mt-20 px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-[1240px]">
        <SectionHeading
          eyebrow="Product"
          title={
            <>
              Everything your best salesperson does.
              <span className="text-[#a1a1a5]"> On every page, all day.</span>
            </>
          }
        />

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <Reveal className="h-full">
            <FeatureCard
              title="Lifelike voice conversations"
              body="Visitors talk, your agent talks back with a consistent neural voice. No menus, no typing, no waiting."
            >
              <div className="flex h-full items-center justify-center gap-8">
                <Orb agent={VOICE_AGENTS[2]} size={120} live />
                <div className="flex h-16 items-center gap-[5px]">
                  {Array.from({ length: 16 }, (_, index) => (
                    <span
                      key={index}
                      className="obs-wave-bar w-[4px] rounded-full bg-[#0b0b0c]"
                      style={{
                        height: `${20 + Math.abs(Math.sin(index * 1.4)) * 44}px`,
                        ["--obs-delay" as string]: `${index * 70}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </FeatureCard>
          </Reveal>

          <Reveal delay={100} className="h-full">
            <FeatureCard
              title="Answers with receipts"
              body="Every reply comes from your own pages with a link to the source. If it isn’t in your content, it says so."
            >
              <div className="flex h-full flex-col justify-center gap-2.5 px-2">
                <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-[#0b0b0c] px-4 py-2.5 text-[13px] text-white">
                  Do you offer refunds?
                </div>
                <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-[13px] leading-5 shadow-[0_1px_2px_rgba(0,0,0,.05)]">
                  Yes, within 30 days of purchase for any unused plan.
                  <span className="mt-2 flex items-center gap-1 text-[12px] text-[#6f6f73]">
                    <ArrowUpRight className="h-3 w-3" /> yourwebsite.com/refund-policy
                  </span>
                </div>
              </div>
            </FeatureCard>
          </Reveal>

          <Reveal className="h-full">
            <FeatureCard
              title="Leads, not just chats"
              body="Spots buying intent, asks for details with consent, and hands your team a warm lead with the full conversation."
            >
              <div className="flex h-full items-center justify-center">
                <div className="w-full max-w-[300px] rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.05),0_12px_32px_-16px_rgba(0,0,0,.2)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-medium">Priya S.</span>
                    <span className="rounded-full bg-[#ecfdf3] px-2 py-0.5 text-[11px] font-medium text-[#15803d]">
                      High intent
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-[#6f6f73]">priya@company.com</p>
                  <div className="mt-3 space-y-1.5 border-t border-[#efefec] pt-3 text-[12px] text-[#6f6f73]">
                    <p>Interested in: Growth plan</p>
                    <p>Team size: 5 · 3 websites</p>
                    <p>Next step: setup call</p>
                  </div>
                </div>
              </div>
            </FeatureCard>
          </Reveal>

          <Reveal delay={100} className="h-full">
            <FeatureCard
              title="A studio that shows its work"
              body="See every page and chunk it learned, test real questions before visitors ask, and preview it on any device."
            >
              <div className="flex h-full flex-col justify-center gap-3 px-2">
                {[
                  { label: "Warmth", value: 82 },
                  { label: "Concision", value: 68 },
                  { label: "Sales push", value: 44 },
                ].map((trait) => (
                  <TraitBar key={trait.label} {...trait} />
                ))}
              </div>
            </FeatureCard>
          </Reveal>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: <RefreshCw />,
              title: "Always up to date",
              body: "Refresh only what changed and review new revisions before they go live.",
            },
            {
              icon: <Sparkles />,
              title: "Sounds like your brand",
              body: "Name, role, tone, greeting, guardrails and what it should never say.",
            },
            {
              icon: <Webhook />,
              title: "Plugs into your stack",
              body: "Signed webhooks for every lead and conversation, with retries built in.",
            },
          ].map((item, index) => (
            <Reveal key={item.title} delay={index * 80}>
              <div className="h-full rounded-[24px] border border-[#ececea] p-7">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5f5f3] [&_svg]:h-[18px] [&_svg]:w-[18px]">
                  {item.icon}
                </span>
                <h3 className="mt-5 text-[18px] font-semibold tracking-[-0.02em]">{item.title}</h3>
                <p className="mt-2 text-[15px] leading-6 text-[#6f6f73]">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[28px] bg-[#f5f5f3] p-3">
      <div className="h-[260px] rounded-[20px] bg-[#eeeeeb] p-6">{children}</div>
      <div className="px-4 pb-4 pt-6">
        <h3 className="text-[22px] font-semibold tracking-[-0.03em]">{title}</h3>
        <p className="mt-2 max-w-md text-[15px] leading-6 text-[#6f6f73]">{body}</p>
      </div>
    </article>
  );
}

function TraitBar({ label, value }: { label: string; value: number }) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.5 });

  return (
    <div ref={ref} className="rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,.05)]">
      <div className="flex justify-between text-[13px]">
        <span className="font-medium">{label}</span>
        <span className="obs-mono text-[#8a8a8f]">{inView ? value : 0}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#efefec]">
        <div
          className="h-full rounded-full bg-[#0b0b0c] transition-[width] duration-[1400ms] ease-out"
          style={{ width: inView ? `${value}%` : "0%" }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Use cases                                 */
/* -------------------------------------------------------------------------- */

const useCases = [
  {
    id: "saas",
    label: "SaaS",
    title: "Turn pricing-page visitors into demos",
    body: "Answer plan, integration and security questions instantly, then book the call while interest is high.",
    outcomes: [
      "Plan comparisons in seconds",
      "Demo requests routed to sales",
      "Fewer repeat support tickets",
    ],
    agent: VOICE_AGENTS[0],
    question: "Can I use this with our SSO?",
    answer:
      "SSO is available on the Enterprise plan. Want me to connect you with the team to scope it?",
  },
  {
    id: "commerce",
    label: "E-commerce",
    title: "Help shoppers choose and check out",
    body: "Recommend products, explain shipping and returns, and recover buyers who would have bounced.",
    outcomes: [
      "Product guidance by voice",
      "Shipping and returns answered",
      "Email capture for follow-ups",
    ],
    agent: VOICE_AGENTS[1],
    question: "Which one is best for sensitive skin?",
    answer:
      "The Calm Ritual set is fragrance-free and made for sensitive skin. Shall I send the details to your email?",
  },
  {
    id: "services",
    label: "Clinics & services",
    title: "Answer and qualify around the clock",
    body: "Handle hours, pricing and eligibility questions after hours and collect enquiries for your front desk.",
    outcomes: [
      "After-hours enquiries captured",
      "Consistent, on-brand answers",
      "Escalates when unsure",
    ],
    agent: VOICE_AGENTS[2],
    question: "Do you take walk-ins on Saturday?",
    answer:
      "We’re open 9 to 1 on Saturdays for appointments only. I can take your details to book a slot.",
  },
  {
    id: "agencies",
    label: "Agencies",
    title: "Ship a voice agent for every client",
    body: "Build a branded agent from each client’s site in minutes and deliver leads straight into their tools.",
    outcomes: [
      "Up to 10 websites on Scale",
      "Per-site keys and domains",
      "Leads delivered by webhook",
    ],
    agent: VOICE_AGENTS[0],
    question: "Can you build one for our client’s site?",
    answer:
      "Yes. Paste their URL in Soul Studio and you’ll have a working agent to show them today.",
  },
];

function UseCases() {
  const [active, setActive] = useState(useCases[0].id);
  const current = useCases.find((item) => item.id === active) ?? useCases[0];

  return (
    <section id="use-cases" className="scroll-mt-20 bg-[#fafaf9] px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-[1240px]">
        <SectionHeading
          eyebrow="Use cases"
          title="Built for every website that sells something."
          center
        />
        <Reveal delay={100} className="mt-10 flex justify-center">
          <div
            role="tablist"
            aria-label="Use cases"
            className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-[#e7e7e4] bg-white p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {useCases.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === active}
                onClick={() => setActive(item.id)}
                className={[
                  "h-10 shrink-0 rounded-full px-5 text-[14px] font-medium transition",
                  item.id === active
                    ? "bg-[#0b0b0c] text-white"
                    : "text-[#5b5b60] hover:text-black",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))}
          </div>
        </Reveal>

        <div
          key={current.id}
          className="mt-10 grid animate-in fade-in gap-4 duration-500 lg:grid-cols-2"
        >
          <div className="flex flex-col justify-center rounded-[28px] border border-[#ececea] bg-white p-8 sm:p-12">
            <h3 className="text-[clamp(1.7rem,3vw,2.4rem)] font-semibold leading-[1.05] tracking-[-0.04em]">
              {current.title}
            </h3>
            <p className="mt-4 text-[16px] leading-7 text-[#6f6f73]">{current.body}</p>
            <ul className="mt-8 space-y-3">
              {current.outcomes.map((outcome) => (
                <li key={outcome} className="flex items-center gap-3 text-[15px]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f5f5f3]">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {outcome}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative flex min-h-[380px] items-center justify-center overflow-hidden rounded-[28px] bg-[#f1efed] p-6 sm:p-10">
            <div
              className="pointer-events-none absolute inset-0 opacity-60 blur-3xl"
              style={{
                background: `radial-gradient(circle at 30% 30%, ${current.agent.colors[2]}, transparent 60%), radial-gradient(circle at 75% 70%, ${current.agent.colors[1]}, transparent 60%)`,
              }}
            />
            <div className="relative w-full max-w-[400px] rounded-[22px] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.05),0_24px_60px_-24px_rgba(0,0,0,.25)]">
              <div className="flex items-center gap-3 border-b border-[#efefec] pb-3">
                <Orb agent={current.agent} size={36} live />
                <div>
                  <p className="text-[14px] font-medium">{current.agent.name}</p>
                  <p className="text-[12px] text-[#8a8a8f]">{current.agent.role}</p>
                </div>
              </div>
              <div className="space-y-2.5 pt-4">
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[#0b0b0c] px-4 py-2.5 text-[13px] text-white">
                  {current.question}
                </div>
                <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-[#f5f5f3] px-4 py-3 text-[13px] leading-5">
                  {current.answer}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                How it works                                */
/* -------------------------------------------------------------------------- */

function HowItWorks() {
  const steps = [
    {
      title: "Paste your URL",
      body: "Obseri learns your public pages and keeps a source attached to everything it knows.",
    },
    {
      title: "Shape its personality",
      body: "Pick a voice, set the tone and guardrails, and test real questions in Soul Studio.",
    },
    {
      title: "Go live",
      body: "Paste one script tag. Your agent starts answering and capturing leads right away.",
    },
  ];

  return (
    <section className="px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-[1240px]">
        <SectionHeading
          eyebrow="How it works"
          title={
            <>
              From URL to live agent.
              <span className="text-[#a1a1a5]"> In minutes, not months.</span>
            </>
          }
        />
        <div className="mt-14 grid gap-px overflow-hidden rounded-[28px] border border-[#ececea] bg-[#ececea] md:grid-cols-3">
          {steps.map((step, index) => (
            <Reveal key={step.title} delay={index * 100} className="bg-white p-8 sm:p-10">
              <span className="obs-mono text-[13px] text-[#8a8a8f]">0{index + 1}</span>
              <h3 className="mt-10 text-[24px] font-semibold tracking-[-0.03em]">{step.title}</h3>
              <p className="mt-3 text-[15px] leading-6 text-[#6f6f73]">{step.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Trust                                   */
/* -------------------------------------------------------------------------- */

function Trust() {
  const controls = [
    {
      icon: <BookOpenCheck />,
      title: "Grounded answers",
      body: "Replies come from your approved sources with citations. Gaps stay unanswered.",
    },
    {
      icon: <Globe2 />,
      title: "Domain allowlists",
      body: "Exact and wildcard subdomains are checked before the widget ever starts.",
    },
    {
      icon: <KeyRound />,
      title: "Signed sessions",
      body: "Opaque widget tokens exchange for short-lived, origin-bound sessions.",
    },
    {
      icon: <Webhook />,
      title: "Verified webhooks",
      body: "HMAC-SHA256 signatures, timestamps, idempotency keys and automatic retries.",
    },
    {
      icon: <ServerCog />,
      title: "Safe crawling",
      body: "Same-origin only, robots.txt aware, with private-network targets blocked.",
    },
    {
      icon: <Lock />,
      title: "Isolated workspaces",
      body: "Every account gets its own workspace, keyed to a verified identity.",
    },
  ];

  return (
    <section id="trust" className="scroll-mt-20 px-3 sm:px-5">
      <div className="mx-auto max-w-[1400px] overflow-hidden rounded-[32px] bg-[#0b0b0c] px-5 py-20 text-white sm:px-10 sm:py-28 lg:px-16">
        <div className="mx-auto max-w-[1240px]">
          <Reveal className="max-w-3xl">
            <p className="obs-mono text-[12px] font-medium uppercase tracking-[0.14em] text-white/45">
              Trust &amp; security
            </p>
            <h2 className="mt-4 text-balance text-[clamp(2.2rem,4.6vw,3.9rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
              Built to be trusted with your brand.
            </h2>
            <p className="mt-5 max-w-xl text-[17px] leading-7 text-white/55">
              Your agent speaks for your business. Obseri is designed so it only says what you can
              stand behind, and only where you allow it.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-px overflow-hidden rounded-[24px] border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {controls.map((control, index) => (
              <Reveal key={control.title} delay={index * 60} className="bg-[#0b0b0c] p-7 sm:p-8">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.07] [&_svg]:h-[18px] [&_svg]:w-[18px]">
                  {control.icon}
                </span>
                <h3 className="mt-6 text-[17px] font-semibold tracking-[-0.02em]">
                  {control.title}
                </h3>
                <p className="mt-2 text-[14px] leading-6 text-white/50">{control.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Pricing                                  */
/* -------------------------------------------------------------------------- */

function PricingTeaser() {
  const plans = [
    BILLING_PLANS.free,
    BILLING_PLANS.launch,
    BILLING_PLANS.growth,
    BILLING_PLANS.scale,
  ];

  return (
    <section id="pricing" className="scroll-mt-20 px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-[1240px]">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeading
            eyebrow="Pricing"
            title={
              <>
                Start free.
                <span className="text-[#a1a1a5]"> Upgrade when it’s paying off.</span>
              </>
            }
          />
          <Link
            to="/pricing"
            className="group inline-flex shrink-0 items-center gap-2 text-[15px] font-medium"
          >
            Compare all plans
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan, index) => {
            const highlighted = "highlighted" in plan && plan.highlighted;
            const price = plan.monthlyPriceInrPaise;
            return (
              <Reveal key={plan.id} delay={index * 80} className="h-full">
                <article
                  className={[
                    "flex h-full flex-col rounded-[24px] p-7",
                    highlighted ? "bg-[#0b0b0c] text-white" : "border border-[#ececea] bg-white",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-[17px] font-semibold">{plan.name}</h3>
                    {highlighted && (
                      <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium">
                        Popular
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-2 min-h-[44px] text-[14px] leading-5 ${highlighted ? "text-white/60" : "text-[#6f6f73]"}`}
                  >
                    {plan.description}
                  </p>
                  <p className="mt-6 flex items-baseline gap-1.5">
                    <span className="text-[36px] font-semibold tracking-[-0.04em]">
                      {formatInr(price)}
                    </span>
                    <span
                      className={`text-[14px] ${highlighted ? "text-white/50" : "text-[#8a8a8f]"}`}
                    >
                      /month
                    </span>
                  </p>
                  <ul
                    className={`mt-6 space-y-2.5 text-[14px] ${highlighted ? "text-white/75" : "text-[#3d3d42]"}`}
                  >
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" />
                      {plan.limits.websites} website{plan.limits.websites === 1 ? "" : "s"},{" "}
                      {plan.limits.indexedPages.toLocaleString("en-IN")} pages
                    </li>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" />
                      {plan.limits.textResponsesPerMonth.toLocaleString("en-IN")} chat replies a
                      month
                    </li>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" />
                      {plan.limits.voiceMinutesPerMonth} voice minutes a month
                    </li>
                  </ul>
                  <div className="mt-auto pt-8">
                    <Link
                      to={price === 0 ? "/app" : "/pricing"}
                      className={[
                        "inline-flex h-11 w-full items-center justify-center rounded-full text-[14px] font-medium transition",
                        highlighted
                          ? "bg-white text-[#0b0b0c] hover:bg-[#f0f0ee]"
                          : "border border-[#e2e2df] hover:bg-[#fafaf8]",
                      ].join(" ")}
                    >
                      {price === 0 ? "Start free" : `Get ${plan.name}`}
                    </Link>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
        <p className="mt-6 text-center text-[14px] text-[#8a8a8f]">
          Need SSO, custom retention or private deployment?{" "}
          <a href={salesEmail} className="font-medium text-[#0b0b0c] underline underline-offset-4">
            Talk to us about Enterprise
          </a>
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                     FAQ                                    */
/* -------------------------------------------------------------------------- */

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 px-4 pb-24 sm:px-6 sm:pb-32">
      <div className="mx-auto grid max-w-[1240px] gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions, answered."
          body="Or ask the voice agent at the top of the page. That’s what it’s for."
        />
        <div className="border-t border-[#ececea]">
          {LANDING_FAQ.map((item) => (
            <details
              key={item.question}
              className="group border-b border-[#ececea] [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[17px] font-medium">
                {item.question}
                <ChevronDown className="h-5 w-5 shrink-0 text-[#8a8a8f] transition duration-300 group-open:rotate-180" />
              </summary>
              <p className="max-w-2xl pb-6 pr-10 text-[15px] leading-7 text-[#6f6f73]">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Final CTA                                 */
/* -------------------------------------------------------------------------- */

function FinalCta() {
  return (
    <section className="px-3 sm:px-5">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[32px] bg-[#f3f1ee] px-5 py-24 text-center sm:py-32">
        <div className="obs-hero-glow pointer-events-none absolute inset-0 opacity-80" />
        <div className="relative">
          <div className="flex justify-center -space-x-4">
            {VOICE_AGENTS.map((agent) => (
              <Orb key={agent.id} agent={agent} size={64} className="ring-4 ring-[#f3f1ee]" />
            ))}
          </div>
          <Reveal>
            <h2 className="mx-auto mt-10 max-w-3xl text-[clamp(2.4rem,6vw,4.8rem)] font-semibold leading-[1] tracking-[-0.05em]">
              Give your website a voice today.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-[17px] leading-7 text-[#6f6f73]">
              Paste your URL and meet your agent in minutes. Free to start.
            </p>
          </Reveal>
          <Reveal delay={120} className="mx-auto mt-10 max-w-[600px]">
            <UrlForm id="final-url" />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Footer                                   */
/* -------------------------------------------------------------------------- */

function Footer() {
  const columns: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
    {
      title: "Product",
      links: [
        { label: "Soul Studio", href: "/app" },
        { label: "Pricing", href: "/pricing" },
        { label: "Live demo", href: "#demo" },
        { label: "Trust", href: "#trust" },
      ],
    },
    {
      title: "Solutions",
      links: [
        { label: "AI voice agent for websites", href: "/ai-voice-agent-for-website" },
        { label: "Chatbot trained on your site", href: "/ai-chatbot-trained-on-your-website" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Contact sales", href: salesEmail },
      ],
    },
  ];

  return (
    <footer className="px-4 pb-10 pt-20 sm:px-6">
      <div className="mx-auto grid max-w-[1240px] gap-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <img src="/obseri-logo-dark.svg" alt="Obseri" className="h-8 w-auto" />
          <p className="mt-5 max-w-xs text-[14px] leading-6 text-[#6f6f73]">
            Voice and chat agents trained on your website. Make every visit a lead.
          </p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <p className="text-[14px] font-medium">{column.title}</p>
            <ul className="mt-4 space-y-3">
              {column.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-[14px] text-[#6f6f73] transition hover:text-black"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-16 flex max-w-[1240px] flex-col justify-between gap-3 border-t border-[#ececea] pt-6 text-[13px] text-[#8a8a8f] sm:flex-row">
        <span>© {new Date().getFullYear()} Obseri</span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" /> Answers grounded in your own content
        </span>
      </div>
    </footer>
  );
}
