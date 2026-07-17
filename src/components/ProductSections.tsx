import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import CardSwap, { Card } from "@/components/CardSwap";
import {
  ArrowRight,
  Check,
  ExternalLink,
  Mic2,
  PhoneCall,
  PhoneOff,
  RefreshCw,
  ShieldCheck,
  Webhook,
} from "lucide-react";

const displayFont =
  "[font-family:Baskerville,'Iowan_Old_Style','Palatino_Linotype','Times_New_Roman',serif]";

export default function ProductSections() {
  return (
    <main className="overflow-hidden bg-[#f4f1f3] text-[#17171a]">
      <PlayableAgent />
      <StudioSection />
      <IdentitySection />
      <TrustSection />
      <FinalCta />
      <Footer />
    </main>
  );
}

type VoiceStatus = "idle" | "listening" | "thinking" | "speaking" | "error";

type VoiceAgent = {
  id: string;
  name: string;
  role: string;
  tone: string;
  colors: [string, string, string];
  rate: number;
  pitch: number;
  voiceHints: string[];
  fallback: string;
};

type BrowserRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: VoiceRecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type VoiceRecognitionEvent = {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
};

type BrowserRecognitionConstructor = new () => BrowserRecognition;

function PlayableAgent() {
  const agents: VoiceAgent[] = [
    {
      id: "ona",
      name: "Ona",
      role: "Lead qualification",
      tone: "Warm · persuasive",
      colors: ["#ff6f91", "#b39cff", "#ffd3dc"],
      rate: 1.02,
      pitch: 1.08,
      voiceHints: ["aria", "samantha", "female"],
      fallback:
        "I can learn what a visitor needs, recommend the right next step, and capture a qualified lead.",
    },
    {
      id: "arlo",
      name: "Arlo",
      role: "Product guidance",
      tone: "Clear · confident",
      colors: ["#ff8a62", "#ffc178", "#e98594"],
      rate: 0.98,
      pitch: 0.92,
      voiceHints: ["guy", "david", "male"],
      fallback:
        "Tell me what you are trying to accomplish and I will guide you to the most relevant product information.",
    },
    {
      id: "mira",
      name: "Mira",
      role: "Customer support",
      tone: "Calm · helpful",
      colors: ["#8d7bd1", "#d6b4ec", "#ffb7c8"],
      rate: 0.94,
      pitch: 1.02,
      voiceHints: ["zira", "jenny", "female"],
      fallback:
        "I can answer common support questions, cite the right documentation, and escalate when human help is needed.",
    },
  ];
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState(
    "Choose a voice and ask about pricing, product, or support.",
  );
  const [reply, setReply] = useState("Every voice answers from the same website knowledge.");
  const [notice, setNotice] = useState("Live browser voice · nothing is uploaded");
  const recognitionRef = useRef<BrowserRecognition | null>(null);

  useEffect(
    () => () => {
      recognitionRef.current?.abort?.();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  const buildAnswer = (agent: VoiceAgent, spoken: string) => {
    const question = spoken.toLowerCase();

    if (question.includes("price") || question.includes("plan") || question.includes("cost")) {
      return agent.id === "ona"
        ? "I can compare the plans, qualify what your team needs, and guide you to the right option."
        : "The pricing page is the best source. I can explain each plan and cite the exact details.";
    }

    if (
      question.includes("demo") ||
      question.includes("book") ||
      question.includes("call") ||
      question.includes("contact")
    ) {
      return "Absolutely. I can collect the visitor's details and send a signed lead event to your sales workflow.";
    }

    if (question.includes("secure") || question.includes("privacy") || question.includes("data")) {
      return "Answers stay grounded in approved sources, workspace access is scoped, and integration events are signed.";
    }

    return agent.fallback;
  };

  const speakReply = (agent: VoiceAgent, answer: string) => {
    if (!("speechSynthesis" in window)) {
      setVoiceStatus("idle");
      setNotice("Voice playback is not available in this browser.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(answer);
    const availableVoices = window.speechSynthesis
      .getVoices()
      .filter((voice) => voice.lang.toLowerCase().startsWith("en"));
    const preferredVoice = agent.voiceHints
      .map((hint) =>
        availableVoices.find((voice) => voice.name.toLowerCase().includes(hint.toLowerCase())),
      )
      .find((voice): voice is SpeechSynthesisVoice => Boolean(voice));

    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = agent.rate;
    utterance.pitch = agent.pitch;
    utterance.onstart = () => {
      setVoiceStatus("speaking");
      setNotice(agent.name + " is answering");
    };
    utterance.onend = () => {
      setVoiceStatus("idle");
      setNotice("Ready for another question");
    };
    utterance.onerror = () => {
      setVoiceStatus("idle");
      setNotice("Voice playback stopped. Try again.");
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const stopConversation = () => {
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
    setVoiceStatus("idle");
    setNotice("Conversation stopped");
  };

  const startConversation = (agent: VoiceAgent) => {
    if (activeAgent === agent.id && voiceStatus !== "idle" && voiceStatus !== "error") {
      stopConversation();
      return;
    }

    recognitionRef.current?.abort?.();
    window.speechSynthesis?.cancel();
    setActiveAgent(agent.id);
    setVoiceStatus("listening");
    setTranscript("Listening...");
    setReply("");
    setNotice("Speak naturally");

    const recognitionWindow = window as typeof window & {
      SpeechRecognition?: BrowserRecognitionConstructor;
      webkitSpeechRecognition?: BrowserRecognitionConstructor;
    };
    const Recognition =
      recognitionWindow.SpeechRecognition ?? recognitionWindow.webkitSpeechRecognition;

    if (!Recognition) {
      const fallbackQuestion = "How can you help visitors on my website?";
      const fallbackAnswer = buildAnswer(agent, fallbackQuestion);
      setTranscript(fallbackQuestion);
      setReply(fallbackAnswer);
      setVoiceStatus("thinking");
      setNotice("Microphone recognition is unavailable; playing a sample response");
      speakReply(agent, fallbackAnswer);
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    let receivedResult = false;

    recognition.onresult = (event) => {
      receivedResult = true;
      const spoken = event.results[0]?.[0]?.transcript?.trim();

      if (!spoken) {
        setVoiceStatus("error");
        setNotice("I did not catch that. Try again.");
        return;
      }

      const answer = buildAnswer(agent, spoken);
      setTranscript(spoken);
      setReply(answer);
      setVoiceStatus("thinking");
      setNotice("Finding the best grounded answer");
      speakReply(agent, answer);
    };

    recognition.onerror = (event) => {
      setVoiceStatus("error");
      setNotice(
        event.error === "not-allowed"
          ? "Allow microphone access to start talking."
          : "I could not hear you. Tap and try again.",
      );
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (!receivedResult) {
        setVoiceStatus((current) => (current === "listening" ? "idle" : current));
      }
    };

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setVoiceStatus("error");
      setNotice("The microphone could not start. Tap and try again.");
    }
  };

  const selectedAgent = agents.find((agent) => agent.id === activeAgent);

  return (
    <section
      id="how"
      className="bg-[linear-gradient(180deg,#f4f4ef_0%,#eeeaf4_48%,#f4f1f3_100%)] px-3 py-20 [contain-intrinsic-size:auto_900px] [content-visibility:auto] sm:px-5 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="mx-auto flex max-w-[1240px] flex-col justify-between gap-6 px-3 sm:px-5 lg:flex-row lg:items-end">
          <div>
            <Eyebrow>Live voice models</Eyebrow>
            <h2
              className={[
                "mt-6 text-[clamp(2.9rem,5vw,5rem)] font-normal leading-[0.95] tracking-[-0.05em]",
                displayFont,
              ].join(" ")}
            >
              Choose a voice and talk.
            </h2>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/38">
            <span className="h-2 w-2 rounded-full bg-[#ff5c7a] shadow-[0_0_14px_rgba(255,92,122,.65)]" />
            Browser voice ready
          </div>
        </div>

        <div className="mt-12 overflow-hidden rounded-[2.2rem] border border-black/[0.08] bg-white/75 shadow-[0_35px_120px_rgba(79,54,86,.11)] backdrop-blur-xl sm:rounded-[2.8rem]">
          <div className="grid snap-x snap-mandatory auto-cols-[minmax(300px,88vw)] grid-flow-col divide-x divide-black/[0.07] overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid-cols-3 lg:auto-cols-auto lg:grid-flow-row lg:overflow-visible">
            {agents.map((agent) => (
              <VoiceModelOrb
                key={agent.id}
                agent={agent}
                active={activeAgent === agent.id}
                status={activeAgent === agent.id ? voiceStatus : "idle"}
                onToggle={() => startConversation(agent)}
              />
            ))}
          </div>

          <div
            className="grid gap-5 border-t border-black/[0.07] bg-[#f8f5f7] px-6 py-6 sm:px-9 lg:grid-cols-[0.7fr_1.3fr] lg:items-center"
            aria-live="polite"
          >
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-black/32">
                {selectedAgent
                  ? selectedAgent.name + " · " + selectedAgent.tone
                  : "Shared knowledge"}
              </p>
              <p className="mt-2 text-[11px] text-black/48">{notice}</p>
            </div>
            <div className="grid gap-3 text-[11px] leading-5 sm:grid-cols-2">
              <p className="rounded-2xl border border-black/[0.06] bg-white/70 px-4 py-3 text-black/48">
                <span className="mr-2 font-semibold text-black/75">You</span>
                {transcript}
              </p>
              <p className="rounded-2xl bg-[#17171a] px-4 py-3 text-white/64">
                <span className="mr-2 font-semibold text-[#ff9caf]">
                  {selectedAgent?.name ?? "Obseri"}
                </span>
                {reply || "Listening for your question..."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function VoiceModelOrb({
  agent,
  active,
  status,
  onToggle,
}: {
  agent: VoiceAgent;
  active: boolean;
  status: VoiceStatus;
  onToggle: () => void;
}) {
  const statusLabel = {
    idle: "Start talking",
    listening: "Listening...",
    thinking: "Thinking...",
    speaking: "Speaking...",
    error: "Try again",
  }[status];
  const gradientId = "voice-orb-" + agent.id;
  const glowId = "voice-glow-" + agent.id;
  const busy = active && status !== "idle" && status !== "error";

  return (
    <article
      className={[
        "relative flex min-h-[460px] snap-start flex-col items-center justify-center px-6 py-10 text-center transition duration-500 lg:min-h-[500px]",
        active ? "bg-[#fff9f7]" : "bg-white/30",
      ].join(" ")}
    >
      <div className="relative h-[300px] w-[300px] max-w-full">
        <svg
          viewBox="0 0 320 320"
          aria-hidden="true"
          className={[
            "absolute inset-0 h-full w-full transition duration-700",
            busy ? "animate-pulse" : "",
          ].join(" ")}
        >
          <defs>
            <radialGradient id={gradientId} cx="42%" cy="38%" r="72%">
              <stop offset="0" stopColor={agent.colors[2]} />
              <stop offset="0.48" stopColor={agent.colors[1]} />
              <stop offset="1" stopColor={agent.colors[0]} />
            </radialGradient>
            <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="12" />
            </filter>
          </defs>
          <path
            d="M160 12 C171 37 188 43 216 36 C247 28 270 47 267 78 C264 107 276 121 302 134 C326 147 326 173 302 186 C276 199 264 213 267 242 C270 273 247 292 216 284 C188 277 171 283 160 308 C149 283 132 277 104 284 C73 292 50 273 53 242 C56 213 44 199 18 186 C-6 173 -6 147 18 134 C44 121 56 107 53 78 C50 47 73 28 104 36 C132 43 149 37 160 12 Z"
            fill={agent.colors[0]}
            opacity="0.18"
            filter={"url(#" + glowId + ")"}
          />
          <path
            d="M160 12 C171 37 188 43 216 36 C247 28 270 47 267 78 C264 107 276 121 302 134 C326 147 326 173 302 186 C276 199 264 213 267 242 C270 273 247 292 216 284 C188 277 171 283 160 308 C149 283 132 277 104 284 C73 292 50 273 53 242 C56 213 44 199 18 186 C-6 173 -6 147 18 134 C44 121 56 107 53 78 C50 47 73 28 104 36 C132 43 149 37 160 12 Z"
            fill={"url(#" + gradientId + ")"}
            stroke={agent.colors[0]}
            strokeWidth="1.5"
          />
          <path
            d="M160 31 C171 51 188 56 212 50 C238 43 255 59 252 84 C250 111 261 127 284 139 C304 149 304 171 284 181 C261 193 250 209 252 236 C255 261 238 277 212 270 C188 264 171 269 160 289 C149 269 132 264 108 270 C82 277 65 261 68 236 C70 209 59 193 36 181 C16 171 16 149 36 139 C59 127 70 111 68 84 C65 59 82 43 108 50 C132 56 149 51 160 31 Z"
            fill="none"
            stroke="rgba(255,255,255,.32)"
            strokeWidth="1"
          />
        </svg>

        <button
          type="button"
          onClick={onToggle}
          aria-label={`${busy ? "Stop" : "Start"} a voice conversation with ${agent.name}`}
          className={[
            "absolute left-1/2 top-1/2 inline-flex h-14 -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-[#fffaf6]/92 px-5 text-[11px] font-semibold text-[#17171a] shadow-[0_14px_40px_rgba(43,24,40,.2)] backdrop-blur-xl transition hover:scale-[1.03]",
            busy ? "ring-4 ring-white/20" : "",
          ].join(" ")}
        >
          {busy ? (
            <PhoneOff className="h-4 w-4 text-[#b44259]" />
          ) : (
            <PhoneCall className="h-4 w-4" />
          )}
          {statusLabel}
        </button>
      </div>

      <h3 className="mt-5 text-lg font-semibold tracking-[-0.025em]">{agent.role}</h3>
      <p className="mt-2 text-[11px] text-black/38">
        {agent.name} · {agent.tone}
      </p>
    </article>
  );
}

function StudioSection() {
  return (
    <section
      id="studio"
      className="bg-[#ede8f0] px-3 py-4 [contain-intrinsic-size:auto_720px] [content-visibility:auto] sm:px-5 lg:py-8"
    >
      <div className="relative mx-auto min-h-[620px] max-w-[1500px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#121115] text-white sm:rounded-[2.5rem]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(255,92,122,.12),transparent_30%),radial-gradient(circle_at_86%_78%,rgba(142,123,187,.18),transparent_32%)]" />
        <div className="relative grid min-h-[620px] items-center px-7 py-16 sm:px-12 lg:grid-cols-[0.76fr_1.24fr] lg:px-20">
          <div className="relative z-20 max-w-[430px] pb-[410px] lg:pb-0">
            <Eyebrow dark>Soul Studio</Eyebrow>
            <h2
              className={`mt-7 text-[clamp(2.7rem,4.2vw,4.5rem)] font-normal leading-[0.95] tracking-[-0.05em] ${displayFont}`}
            >
              See exactly what your agent knows.
            </h2>
            <p className="mt-5 max-w-sm text-[14px] leading-7 text-white/45">
              Inspect sources, refresh changes, and test retrieval before visitors ask.
            </p>
            <Link
              to="/app"
              className="mt-8 inline-flex items-center gap-2 text-[12px] font-semibold text-[#ff8399] transition hover:text-white"
            >
              Open Soul Studio <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="absolute bottom-0 right-0 h-[470px] w-full lg:h-[560px] lg:w-[62%]">
            <CardSwap
              width={540}
              height={370}
              cardDistance={54}
              verticalDistance={62}
              delay={5200}
              pauseOnHover={false}
              skewAmount={4}
              easing="elastic"
              className="scale-[0.58] sm:scale-[0.78] lg:scale-100"
            >
              <StudioVisualCard title="Sources" variant="sources" />
              <StudioVisualCard title="Freshness" variant="freshness" />
              <StudioVisualCard title="Retrieval" variant="retrieval" />
            </CardSwap>
          </div>
        </div>
      </div>
    </section>
  );
}

function StudioVisualCard({
  title,
  variant,
}: {
  title: string;
  variant: "sources" | "freshness" | "retrieval";
}) {
  return (
    <Card className="cursor-pointer border border-white/45 bg-[#0b0b0d] text-white shadow-[0_30px_80px_rgba(0,0,0,.52)]">
      <div className="flex h-16 items-center gap-3 border-b border-white/15 bg-white/[0.035] px-5">
        <span className="h-2 w-2 rounded-full bg-[#ff8399] shadow-[0_0_16px_rgba(255,92,122,.65)]" />
        <span className="text-[14px] font-medium tracking-[-0.02em]">{title}</span>
      </div>
      <div className="relative h-[306px] overflow-hidden bg-[radial-gradient(circle_at_76%_20%,rgba(142,123,187,.16),transparent_29%),radial-gradient(circle_at_18%_82%,rgba(255,92,122,.14),transparent_26%),#111014]">
        {variant === "sources" && <SourcesData />}
        {variant === "freshness" && <FreshnessData />}
        {variant === "retrieval" && <RetrievalData />}
      </div>
    </Card>
  );
}

function SourcesData() {
  const sources = [
    ["Product pages", "Indexed"],
    ["Pricing", "Updated"],
    ["Documentation", "Indexed"],
  ];

  return (
    <div className="relative z-10 h-full p-7">
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/28">
        Source map
      </p>
      <div className="mt-6 divide-y divide-white/8 rounded-2xl border border-white/10 bg-black/20 px-4">
        {sources.map(([name, status]) => (
          <div key={name} className="flex items-center justify-between py-4">
            <span className="text-[11px] text-white/68">{name}</span>
            <span className="flex items-center gap-1.5 text-[9px] text-[#ff9caf]">
              <Check className="h-3 w-3" /> {status}
            </span>
          </div>
        ))}
      </div>
      <p className="absolute bottom-6 left-7 text-[9px] text-white/28">
        Sources stay attached to every block.
      </p>
    </div>
  );
}

function FreshnessData() {
  return (
    <div className="relative z-10 flex h-full flex-col p-7">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/28">
          Change detection
        </p>
        <RefreshCw className="h-3.5 w-3.5 text-[#ff9caf]" />
      </div>
      <div className="my-auto">
        <p className="max-w-sm text-3xl font-medium leading-tight tracking-[-0.045em]">
          Refresh only what changed.
        </p>
        <p className="mt-4 max-w-xs text-[11px] leading-5 text-white/38">
          New revisions are visible before they replace the live knowledge.
        </p>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/8">
        <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[#ff5c7a] to-[#9e91c9]" />
      </div>
    </div>
  );
}

function RetrievalData() {
  const matches = ["Pricing", "Plan details", "Billing FAQ"];

  return (
    <div className="relative z-10 h-full p-7">
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/28">
        Test question
      </p>
      <p className="mt-3 text-[17px] font-medium tracking-[-0.025em]">
        What is included in the Pro plan?
      </p>
      <div className="mt-7 flex flex-wrap gap-2">
        {matches.map((match) => (
          <span
            key={match}
            className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-2 text-[9px] text-white/48"
          >
            {match}
          </span>
        ))}
      </div>
      <p className="absolute bottom-7 left-7 flex items-center gap-2 text-[9px] text-[#ff9caf]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#ff5c7a]" /> Answer grounded in visible
        sources
      </p>
    </div>
  );
}

function IdentitySection() {
  return (
    <section className="bg-[#ede8f0] px-6 py-24 [contain-intrinsic-size:auto_760px] [content-visibility:auto] sm:py-32 lg:px-10 lg:py-36">
      <div className="mx-auto grid max-w-[1240px] overflow-hidden rounded-[2.3rem] border border-white/75 bg-[linear-gradient(135deg,#f6dedb_0%,#eee4ed_48%,#dfdcf2_100%)] shadow-[0_30px_100px_rgba(75,52,82,.08)] lg:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-16">
          <Eyebrow>Personality + voice</Eyebrow>
          <h2
            className={`mt-7 max-w-xl text-[clamp(2.8rem,4.6vw,4.8rem)] font-normal leading-[0.95] tracking-[-0.05em] ${displayFont}`}
          >
            Make it sound like you.
          </h2>
          <p className="mt-5 max-w-md text-[14px] leading-7 text-black/48">
            Choose how it behaves, what it will not say, and the voice visitors hear.
          </p>
        </div>

        <div className="m-3 min-h-[430px] rounded-[1.8rem] border border-white/50 bg-[#151419] p-7 text-white shadow-2xl sm:m-5 sm:p-9">
          <div className="flex items-center justify-between border-b border-white/10 pb-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff8ba0] text-[#3e1520]">
                <Mic2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[12px] font-semibold">Ona</p>
                <p className="mt-1 text-[9px] text-white/34">Website guide</p>
              </div>
            </div>
            <span className="flex items-center gap-2 text-[9px] text-[#ff9caf]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff5c7a] shadow-[0_0_12px_rgba(255,92,122,.7)]" />
              Ready
            </span>
          </div>

          <div className="flex min-h-[205px] items-center justify-center">
            <div className="flex h-28 items-center gap-1.5">
              {[18, 34, 24, 52, 31, 66, 39, 78, 47, 60, 28, 50, 35, 68, 42, 30, 20].map(
                (height, index) => (
                  <span
                    key={index}
                    className="w-1.5 rounded-full bg-gradient-to-b from-[#ff8399] to-[#9e91c9] opacity-80"
                    style={{ height }}
                  />
                ),
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-white/10 pt-6">
            {["Warm", "Clear", "Concise", "Escalates when unsure"].map((trait) => (
              <span
                key={trait}
                className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-2 text-[9px] text-white/48"
              >
                {trait}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  const controls: Array<{ icon: ReactNode; title: string; body: string }> = [
    {
      icon: <ShieldCheck />,
      title: "Grounded answers",
      body: "Evidence stays visible; missing knowledge stays unanswered.",
    },
    {
      icon: <RefreshCw />,
      title: "Safe refreshes",
      body: "Review changed content before it replaces the live revision.",
    },
    {
      icon: <Webhook />,
      title: "Signed delivery",
      body: "Scoped widget tokens and verified webhooks protect each workspace.",
    },
  ];

  return (
    <section
      id="trust"
      className="bg-[#f4f1f3] px-6 py-24 [contain-intrinsic-size:auto_620px] [content-visibility:auto] sm:py-32 lg:px-10 lg:py-36"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="max-w-3xl">
          <Eyebrow>Built for control</Eyebrow>
          <h2
            className={`mt-6 text-[clamp(2.8rem,4.8vw,4.8rem)] font-normal leading-[0.96] tracking-[-0.05em] ${displayFont}`}
          >
            Nothing important hides behind the magic.
          </h2>
        </div>

        <div className="mt-16 divide-y divide-black/[0.08] border-y border-black/[0.08]">
          {controls.map((control) => (
            <article
              key={control.title}
              className="grid gap-5 py-7 sm:grid-cols-[3rem_0.65fr_1.35fr] sm:items-center sm:py-8"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f8dfdf] text-[#b7445a] [&_svg]:h-4 [&_svg]:w-4">
                {control.icon}
              </span>
              <h3 className="text-[15px] font-semibold tracking-[-0.02em]">{control.title}</h3>
              <p className="max-w-xl text-[12px] leading-6 text-black/43">{control.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-[#f4f1f3] px-4 pb-4 [contain-intrinsic-size:auto_340px] [content-visibility:auto] sm:px-6 lg:px-10">
      <div className="relative mx-auto flex min-h-[330px] max-w-[1360px] items-center justify-center overflow-hidden rounded-[2.4rem] bg-[#111014] px-6 py-20 text-center text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_0%,rgba(255,92,122,.17),transparent_34%),radial-gradient(circle_at_78%_100%,rgba(142,123,187,.2),transparent_38%)]" />
        <div className="relative">
          <img src="/obseri-pulse-mark.svg" alt="" className="mx-auto h-8 w-8" />
          <h2 className={`mt-7 text-4xl font-normal tracking-[-0.04em] sm:text-5xl ${displayFont}`}>
            Ready to build?
          </h2>
          <Link
            to="/app"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[#ff5c7a] px-6 text-[12px] font-bold text-white transition hover:scale-[1.02] hover:bg-white hover:text-black"
          >
            Open Soul Studio <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#f4f1f3] px-6 py-10 lg:px-10">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-6 border-t border-black/[0.08] pt-8 text-[10px] text-black/35 sm:flex-row sm:items-center sm:justify-between">
        <img src="/obseri-logo-dark.svg" alt="Obseri" className="h-7 w-auto" />
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <a href="/ai-voice-agent-for-website" className="transition hover:text-black">
            Voice agent
          </a>
          <a href="/ai-chatbot-trained-on-your-website" className="transition hover:text-black">
            Website chatbot
          </a>
          <a href="#trust" className="transition hover:text-black">
            Trust
          </a>
        </nav>
        <a
          href="mailto:flamki@obseri.com?subject=Obseri%20inquiry"
          className="inline-flex items-center gap-1.5 transition hover:text-black"
        >
          Contact us <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </footer>
  );
}

function Eyebrow({
  children,
  dark = false,
  centered = false,
}: {
  children: ReactNode;
  dark?: boolean;
  centered?: boolean;
}) {
  return (
    <p
      className={`flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.22em] ${centered ? "justify-center" : ""} ${dark ? "text-[#ff8399]" : "text-[#a84155]"}`}
    >
      <span className={`h-px w-7 ${dark ? "bg-[#ff5c7a]/55" : "bg-[#a84155]/45"}`} />
      {children}
      {centered && <span className="h-px w-7 bg-[#a84155]/45" />}
    </p>
  );
}
