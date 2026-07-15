import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import CardSwap, { Card } from "@/components/CardSwap";
import {
  ArrowRight,
  Check,
  ExternalLink,
  MessageCircle,
  Mic2,
  PhoneCall,
  RefreshCw,
  Send,
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

function PlayableAgent() {
  const demos = [
    {
      question: "Which plan fits my team?",
      answer:
        "For a growing team, Pro adds shared knowledge, lead capture, and conversation history.",
      source: "Pricing",
    },
    {
      question: "Can I book a demo?",
      answer: "Yes. I can collect your details and pass the request to the sales team now.",
      source: "Contact",
    },
    {
      question: "Is my data secure?",
      answer: "Workspace access is scoped, sources remain visible, and webhook events are signed.",
      source: "Security",
    },
  ];
  const [mode, setMode] = useState<"voice" | "chat">("voice");
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "speaking">("idle");
  const [activeDemo, setActiveDemo] = useState(0);
  const voiceTimers = useRef<number[]>([]);

  useEffect(
    () => () => {
      voiceTimers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const switchMode = (nextMode: "voice" | "chat") => {
    voiceTimers.current.forEach((timer) => window.clearTimeout(timer));
    voiceTimers.current = [];
    setVoiceState("idle");
    setMode(nextMode);
  };

  const startVoiceDemo = () => {
    voiceTimers.current.forEach((timer) => window.clearTimeout(timer));
    setVoiceState("listening");
    voiceTimers.current = [
      window.setTimeout(() => setVoiceState("speaking"), 1200),
      window.setTimeout(() => setVoiceState("idle"), 5000),
    ];
  };

  const voiceCopy = {
    idle: "Start a natural conversation",
    listening: "Listening...",
    speaking: "Answering from your website",
  };

  return (
    <section
      id="how"
      className="bg-[linear-gradient(180deg,#f4f4ef_0%,#f4f1f3_22%,#ede8f0_100%)] px-3 py-20 [contain-intrinsic-size:auto_980px] [content-visibility:auto] sm:px-5 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="mx-auto flex max-w-[1240px] flex-col justify-between gap-6 px-3 sm:px-5 lg:flex-row lg:items-end">
          <div>
            <Eyebrow>Live on your website</Eyebrow>
            <h2
              className={`mt-6 text-[clamp(2.9rem,5vw,5rem)] font-normal leading-[0.95] tracking-[-0.05em] ${displayFont}`}
            >
              Try the agent.
            </h2>
          </div>
          <p className="max-w-sm text-[13px] leading-6 text-black/44">
            Switch between voice and chat. Ask a question. Watch the experience your visitors get.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-[2rem] border border-black/[0.08] bg-[#fbfaf8] shadow-[0_35px_120px_rgba(79,54,86,.11)] sm:rounded-[2.6rem]">
          <div className="flex h-12 items-center gap-2 border-b border-black/[0.07] bg-white/75 px-5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff8d85]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#e9c26d]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#9dc49d]" />
            <span className="ml-3 rounded-full bg-black/[0.045] px-3 py-1.5 text-[9px] text-black/35">
              yourwebsite.com
            </span>
          </div>

          <div className="relative min-h-[700px] overflow-hidden bg-[radial-gradient(circle_at_18%_22%,rgba(255,142,129,.3),transparent_27%),radial-gradient(circle_at_76%_72%,rgba(153,137,199,.24),transparent_31%),linear-gradient(135deg,#f9f2ec,#eae8f2)] p-5 sm:p-8 lg:p-12">
            <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(20,18,23,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(20,18,23,.055)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(circle_at_38%_42%,black,transparent_65%)]" />

            <div className="relative flex items-center justify-between">
              <span className="text-[13px] font-bold uppercase tracking-[0.2em]">Northstar</span>
              <nav className="hidden gap-6 text-[10px] text-black/42 sm:flex">
                <span>Product</span>
                <span>Customers</span>
                <span>Pricing</span>
              </nav>
              <span className="rounded-full border border-black/10 bg-white/45 px-3 py-2 text-[9px] font-semibold backdrop-blur-md">
                Start free
              </span>
            </div>

            <div className="relative mt-20 max-w-[680px] sm:mt-28">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/38">
                Example customer website
              </p>
              <h3
                className={`mt-5 text-[clamp(3.2rem,6.2vw,6.7rem)] font-normal leading-[0.88] tracking-[-0.06em] ${displayFont}`}
              >
                Work moves better when everyone sees it.
              </h3>
              <div className="mt-8 flex gap-2">
                <span className="rounded-full bg-[#17171a] px-4 py-2.5 text-[10px] font-semibold text-white">
                  Explore product
                </span>
                <span className="rounded-full border border-black/10 bg-white/35 px-4 py-2.5 text-[10px] font-semibold backdrop-blur-md">
                  View pricing
                </span>
              </div>
            </div>

            <div className="relative mt-16 grid max-w-[680px] gap-2 sm:grid-cols-3 lg:mt-24">
              {["Planning", "Projects", "Insights"].map((item, index) => (
                <div
                  key={item}
                  className="rounded-[1.3rem] border border-white/55 bg-white/36 p-4 backdrop-blur-md"
                >
                  <span className="text-[9px] text-black/36">0{index + 1}</span>
                  <p className="mt-7 text-[11px] font-semibold">{item}</p>
                </div>
              ))}
            </div>

            <div className="relative mt-6 w-full rounded-[1.8rem] border border-black/[0.08] bg-white/88 p-3 shadow-[0_24px_80px_rgba(55,36,63,.18)] backdrop-blur-2xl sm:p-4 lg:absolute lg:bottom-5 lg:right-5 lg:mt-0 lg:w-[370px]">
              <div className="flex items-center justify-between border-b border-black/[0.07] pb-3">
                <div className="flex rounded-full bg-black/[0.045] p-1">
                  <button
                    type="button"
                    onClick={() => switchMode("voice")}
                    className={`flex h-9 items-center gap-2 rounded-full px-3 text-[10px] font-semibold transition ${mode === "voice" ? "bg-[#17171a] text-white shadow-sm" : "text-black/42 hover:text-black"}`}
                  >
                    <Mic2 className="h-3.5 w-3.5" /> Voice
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode("chat")}
                    className={`flex h-9 items-center gap-2 rounded-full px-3 text-[10px] font-semibold transition ${mode === "chat" ? "bg-[#17171a] text-white shadow-sm" : "text-black/42 hover:text-black"}`}
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Chat
                  </button>
                </div>
                <span className="flex items-center gap-1.5 pr-1 text-[9px] text-black/34">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ff5c7a] shadow-[0_0_10px_rgba(255,92,122,.65)]" />
                  Ona
                </span>
              </div>

              {mode === "voice" ? (
                <div className="flex min-h-[330px] flex-col items-center justify-center text-center">
                  <button
                    type="button"
                    onClick={startVoiceDemo}
                    aria-label="Start voice demo"
                    className={`relative flex h-32 w-32 items-center justify-center rounded-full bg-[radial-gradient(circle_at_34%_28%,#ffd0c5,#ff7180_42%,#8e7bbb_100%)] shadow-[0_24px_70px_rgba(165,67,100,.28)] transition duration-500 hover:scale-[1.03] ${voiceState !== "idle" ? "scale-[1.04]" : ""}`}
                  >
                    {voiceState !== "idle" && (
                      <span className="absolute inset-[-14px] animate-ping rounded-full border border-[#ff5c7a]/30" />
                    )}
                    <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#17171a] shadow-xl">
                      <PhoneCall className="h-5 w-5" />
                    </span>
                  </button>

                  <div className="mt-7 flex h-8 items-center gap-1">
                    {[12, 23, 17, 30, 20, 36, 16, 28, 14, 24, 11].map((height, index) => (
                      <span
                        key={index}
                        className={`w-1 rounded-full bg-[#b44259]/60 ${voiceState !== "idle" ? "animate-pulse" : ""}`}
                        style={{
                          height,
                          animationDelay: `${index * 65}ms`,
                          animationDuration: `${620 + (index % 4) * 110}ms`,
                        }}
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-[12px] font-semibold">{voiceCopy[voiceState]}</p>
                  <p className="mt-2 max-w-[15rem] text-[10px] leading-5 text-black/38">
                    {voiceState === "speaking"
                      ? "I can explain the plans and help you choose the right one."
                      : "Tap the orb to experience the voice flow."}
                  </p>
                </div>
              ) : (
                <div className="flex min-h-[330px] flex-col pt-4">
                  <div className="rounded-2xl bg-black/[0.045] p-4 text-[11px] leading-5 text-black/62">
                    {demos[activeDemo].answer}
                    <span className="mt-3 flex items-center gap-1.5 text-[9px] font-semibold text-[#a4314a]">
                      <Check className="h-3 w-3" /> Source: {demos[activeDemo].source}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {demos.map((demo, index) => (
                      <button
                        key={demo.question}
                        type="button"
                        onClick={() => setActiveDemo(index)}
                        className={`w-full rounded-xl border px-3 py-2.5 text-left text-[10px] transition ${activeDemo === index ? "border-[#ff5c7a]/30 bg-[#fff1ef] text-black" : "border-black/[0.07] text-black/45 hover:bg-black/[0.025]"}`}
                      >
                        {demo.question}
                      </button>
                    ))}
                  </div>
                  <div className="mt-auto flex items-center rounded-full border border-black/[0.08] bg-white px-4 py-2.5 text-[10px] text-black/35 shadow-sm">
                    Ask this website
                    <Send className="ml-auto h-3.5 w-3.5 text-[#b44259]" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
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
          href="mailto:9833ayush@gmail.com?subject=Obseri%20inquiry"
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
