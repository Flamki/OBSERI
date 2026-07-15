import { Link } from "@tanstack/react-router";
import CardSwap, { Card } from "@/components/CardSwap";
import {
  ArrowRight,
  Code2,
  ExternalLink,
  Fingerprint,
  Globe2,
  MessageCircle,
  Mic2,
  RefreshCw,
  ShieldCheck,
  Volume2,
  Webhook,
} from "lucide-react";

export default function ProductSections() {
  return (
    <main className="overflow-hidden bg-[#f4f4ef] text-[#181b18]">
      <SignalLine />
      <HowItWorks />
      <StudioSection />
      <IdentitySection />
      <TrustSection />
      <FinalCta />
      <Footer />
    </main>
  );
}

function SignalLine() {
  const signals = ["Deep crawl", "Living knowledge", "Designed personality", "Natural voice"];
  return (
    <section className="border-b border-black/7 bg-[#f4f4ef] px-6">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-x-8 gap-y-4 py-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-black/38">
        <span className="text-black/72">One URL. A complete website soul.</span>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {signals.map((signal) => (
            <span key={signal} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff5c7a]" /> {signal}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Give it your URL",
      body: "Obseri maps the important parts of your site, respects crawl policy, removes duplicate content, and keeps every source attached.",
      icon: <Globe2 />,
    },
    {
      number: "02",
      title: "Shape who it becomes",
      body: "Name the presence, define its role, tone, boundaries, greeting, voice, and what it should do when it does not know.",
      icon: <Fingerprint />,
    },
    {
      number: "03",
      title: "Put it on your site",
      body: "Test real questions, publish one lightweight widget, and route useful conversation or lead events into your own stack.",
      icon: <Code2 />,
    },
  ];
  return (
    <section
      id="how"
      className="px-6 py-24 [contain-intrinsic-size:auto_900px] [content-visibility:auto] sm:py-32 lg:px-10 lg:py-40"
    >
      <div className="mx-auto max-w-[1320px]">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div>
            <Eyebrow>Simple by design</Eyebrow>
            <h2 className="mt-6 max-w-xl text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl">
              Turn your website into an AI voice agent in three moves.
            </h2>
          </div>
          <p className="max-w-xl text-[15px] leading-7 text-black/48 lg:justify-self-end">
            The hard work—discovery, extraction, chunking, retrieval, citations, personality, and
            deployment—happens behind one calm workflow.
          </p>
        </div>

        <div className="mt-16 grid overflow-hidden rounded-[2rem] border border-black/8 bg-black/8 md:grid-cols-3">
          {steps.map((step) => (
            <article
              key={step.number}
              className="group bg-[#fafaf6] p-7 transition hover:bg-white sm:p-9 lg:min-h-[390px]"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-black/24">{step.number}</span>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f8dfdf] text-[#b7445a] [&_svg]:h-4 [&_svg]:w-4">
                  {step.icon}
                </span>
              </div>
              <div className="mt-24 lg:mt-36">
                <h3 className="text-xl font-semibold tracking-[-0.025em]">{step.title}</h3>
                <p className="mt-4 text-[13px] leading-6 text-black/45">{step.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function StudioSection() {
  return (
    <section
      id="studio"
      className="px-3 py-8 [contain-intrinsic-size:auto_700px] [content-visibility:auto] sm:px-5 lg:py-14"
    >
      <div className="relative mx-auto min-h-[610px] max-w-[1500px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#151518] text-white sm:rounded-[2.5rem]">
        <div className="grid min-h-[610px] items-center px-7 py-16 sm:px-12 lg:grid-cols-[0.72fr_1.28fr] lg:px-20">
          <div className="relative z-20 max-w-[430px] pb-[440px] lg:pb-0">
            <h2 className="text-4xl font-semibold leading-[0.98] tracking-[-0.05em] sm:text-5xl">
              Train an AI chatbot on your website—automatically.
            </h2>
            <p className="mt-5 max-w-sm text-lg leading-7 text-white/42">
              Crawl every page. Keep it current. Verify every answer.
            </p>
            <Link
              to="/app"
              className="mt-8 inline-flex items-center gap-2 text-[12px] font-semibold text-[#ff8399] transition hover:text-white"
            >
              Explore Soul Studio <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="absolute bottom-0 right-0 h-[500px] w-full lg:h-[560px] lg:w-[62%]">
            <CardSwap
              width={560}
              height={400}
              cardDistance={58}
              verticalDistance={68}
              delay={5000}
              pauseOnHover={false}
              skewAmount={5}
              easing="elastic"
              className="scale-[0.58] sm:scale-[0.78] lg:scale-100"
            >
              <StudioVisualCard title="Deep crawl" variant="crawl" />
              <StudioVisualCard title="Living knowledge" variant="knowledge" />
              <StudioVisualCard title="Retrieval ready" variant="retrieval" />
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
  variant: "crawl" | "knowledge" | "retrieval";
}) {
  const backgrounds = {
    crawl:
      "bg-[radial-gradient(circle_at_17%_72%,rgba(255,92,122,.24),transparent_20%),radial-gradient(ellipse_at_73%_48%,rgba(255,255,255,.13),transparent_34%),linear-gradient(145deg,#0b0b0d_5%,#19171b_48%,#08080a_100%)]",
    knowledge:
      "bg-[radial-gradient(ellipse_at_22%_28%,rgba(158,145,201,.26),transparent_27%),radial-gradient(circle_at_77%_74%,rgba(255,92,122,.18),transparent_23%),linear-gradient(155deg,#08080a,#1b181d_48%,#09090b)]",
    retrieval:
      "bg-[radial-gradient(ellipse_at_76%_24%,rgba(196,151,255,.18),transparent_26%),radial-gradient(ellipse_at_25%_78%,rgba(255,255,255,.14),transparent_30%),linear-gradient(135deg,#080808,#171717_48%,#050505)]",
  };

  return (
    <Card className="cursor-pointer border border-white/55 bg-[#0b0b0d] text-white shadow-[0_30px_80px_rgba(0,0,0,.52)]">
      <div className="flex h-16 items-center gap-3 border-b border-white/35 bg-gradient-to-b from-white/[0.055] to-transparent px-5">
        <span className="h-2.5 w-2.5 rounded-full bg-white" />
        <span className="text-[15px] font-medium tracking-[-0.02em]">{title}</span>
      </div>
      <div className={`relative h-[336px] overflow-hidden ${backgrounds[variant]}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_12%,rgba(0,0,0,.5)_86%)]" />
        {variant === "crawl" && <CrawlData />}
        {variant === "knowledge" && <KnowledgeData />}
        {variant === "retrieval" && <RetrievalData />}
      </div>
    </Card>
  );
}

function CrawlData() {
  return (
    <div className="relative z-10 flex h-full flex-col p-8">
      <div className="flex items-center justify-between text-[10px] text-white/38">
        <span>obseri.com</span>
        <span className="flex items-center gap-2 text-[#ff8399]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ff5c7a]" /> Live crawl
        </span>
      </div>
      <div className="mt-auto">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-5xl font-semibold tracking-[-0.06em]">148</p>
            <p className="mt-2 text-[11px] text-white/40">pages mapped</p>
          </div>
          <p className="pb-1 text-[10px] text-white/30">12 updated · 0 blocked</p>
        </div>
        <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-[86%] rounded-full bg-gradient-to-r from-[#ff5c7a] to-[#9e91c9]" />
        </div>
        <div className="mt-3 flex justify-between text-[9px] text-white/25">
          <span>Discovery</span>
          <span>Indexing 86%</span>
        </div>
      </div>
    </div>
  );
}

function KnowledgeData() {
  return (
    <div className="relative z-10 h-full">
      <div className="absolute left-8 top-8">
        <p className="text-4xl font-semibold tracking-[-0.06em]">624</p>
        <p className="mt-2 text-[10px] text-white/35">connected knowledge blocks</p>
      </div>
      <div className="absolute left-[17%] top-[58%] h-px w-[65%] -rotate-6 bg-gradient-to-r from-transparent via-white/22 to-transparent" />
      <div className="absolute left-[25%] top-[41%] h-px w-[52%] rotate-[17deg] bg-gradient-to-r from-transparent via-white/18 to-transparent" />
      {[
        ["Product", "left-[18%] top-[62%]"],
        ["Pricing", "left-[46%] top-[48%]"],
        ["Docs", "right-[17%] top-[65%]"],
      ].map(([label, position]) => (
        <span
          key={label}
          className={`absolute ${position} rounded-full border border-white/14 bg-black/35 px-3 py-2 text-[9px] text-white/60 backdrop-blur-md`}
        >
          {label}
        </span>
      ))}
      <span className="absolute left-1/2 top-[61%] h-3 w-3 -translate-x-1/2 rounded-full bg-[#ff5c7a] shadow-[0_0_28px_rgba(255,92,122,.65)]" />
    </div>
  );
}

function RetrievalData() {
  const matches = [
    ["Pricing", "96%", "w-[96%]"],
    ["Documentation", "89%", "w-[89%]"],
    ["FAQ", "74%", "w-[74%]"],
  ];
  return (
    <div className="relative z-10 h-full p-8">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/28">
        Test query
      </p>
      <p className="mt-3 text-[17px] font-medium tracking-[-0.025em]">
        What does the Pro plan include?
      </p>
      <div className="mt-7 space-y-4">
        {matches.map(([label, score, width]) => (
          <div key={label}>
            <div className="flex justify-between text-[9px] text-white/38">
              <span>{label}</span>
              <span>{score}</span>
            </div>
            <div className="mt-2 h-1 rounded-full bg-white/8">
              <div className={`h-full ${width} rounded-full bg-white/45`} />
            </div>
          </div>
        ))}
      </div>
      <p className="absolute bottom-7 left-8 flex items-center gap-2 text-[9px] text-[#ff8399]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#ff5c7a]" /> Answer ready with 3 citations
      </p>
    </div>
  );
}

function IdentitySection() {
  return (
    <section className="px-6 py-24 [contain-intrinsic-size:auto_850px] [content-visibility:auto] sm:py-32 lg:px-10 lg:py-40">
      <div className="mx-auto max-w-[1320px]">
        <div className="max-w-3xl">
          <Eyebrow>More than answers</Eyebrow>
          <h2 className="mt-6 text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl">
            A website assistant that speaks in your brand’s voice.
          </h2>
        </div>
        <div className="mt-16 grid gap-4 lg:grid-cols-2">
          <article className="relative min-h-[480px] overflow-hidden rounded-[2rem] bg-[#f4dedb] p-8 sm:p-10">
            <Fingerprint className="h-5 w-5 text-[#a84155]" />
            <h3 className="mt-8 max-w-md text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
              A personality designed for your brand.
            </h3>
            <p className="mt-5 max-w-md text-[13px] leading-6 text-black/50">
              Set its name, purpose, tone, traits, greeting, boundaries, escalation behavior, and
              lead instinct—without writing a system prompt from scratch.
            </p>
            <div className="absolute inset-x-8 bottom-8 rounded-2xl border border-black/8 bg-white/65 p-4 backdrop-blur-xl sm:inset-x-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold">Ona</p>
                  <p className="mt-1 text-[9px] text-black/38">Warm · clear · quietly bold</p>
                </div>
                <span className="rounded-full bg-[#a84155] px-2.5 py-1 text-[8px] font-semibold text-white">
                  Active
                </span>
              </div>
              <p className="mt-4 text-[11px] leading-5 text-black/62">
                “Help people understand what Obseri can add to their website.”
              </p>
            </div>
          </article>
          <article className="relative min-h-[480px] overflow-hidden rounded-[2rem] bg-[#e4e1f4] p-8 sm:p-10">
            <Volume2 className="h-5 w-5 text-[#6f5d9c]" />
            <h3 className="mt-8 max-w-md text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
              A voice that feels like it belongs.
            </h3>
            <p className="mt-5 max-w-md text-[13px] leading-6 text-black/50">
              Start instantly with browser speech, connect managed voice profiles, or create an
              authorized clone with explicit consent attached.
            </p>
            <div className="absolute inset-x-8 bottom-8 rounded-2xl border border-black/8 bg-[#17151c] p-5 text-white shadow-2xl sm:inset-x-10">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ff9caf] text-[#3c1520]">
                  <Mic2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold">Natural voice</p>
                  <p className="mt-1 text-[8px] text-white/35">English · conversational</p>
                </div>
              </div>
              <div className="mt-5 flex h-10 items-center gap-1">
                {[14, 24, 19, 33, 16, 27, 11, 35, 21, 29, 15, 25, 10, 19, 13].map(
                  (height, index) => (
                    <span
                      key={index}
                      className="w-1 flex-1 rounded-full bg-[#ff9caf]/65"
                      style={{ height }}
                    />
                  ),
                )}
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  const promises = [
    {
      icon: <ShieldCheck />,
      title: "Grounded by default",
      body: "Answers use captured evidence and return the source. Missing knowledge stays missing instead of becoming a confident guess.",
    },
    {
      icon: <RefreshCw />,
      title: "Fresh without starting over",
      body: "Conditional refresh and content hashes identify what changed, preserve what did not, and keep a revision history.",
    },
    {
      icon: <Webhook />,
      title: "Yours to integrate",
      body: "A small widget handles the visitor experience while signed events connect the useful parts to your existing systems.",
    },
  ];
  return (
    <section
      id="trust"
      className="border-y border-black/8 bg-[#ebece6] px-6 py-24 [contain-intrinsic-size:auto_650px] [content-visibility:auto] sm:py-32 lg:px-10"
    >
      <div className="mx-auto max-w-[1320px]">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div>
            <Eyebrow>Trust is a feature</Eyebrow>
            <h2 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">
              Alive, without becoming unpredictable.
            </h2>
          </div>
          <p className="max-w-md text-[13px] leading-6 text-black/45">
            The system exposes its sources, refresh state, boundaries, and delivery path so you
            remain in control.
          </p>
        </div>
        <div className="mt-14 grid gap-3 md:grid-cols-3">
          {promises.map((promise) => (
            <article
              key={promise.title}
              className="rounded-[1.5rem] border border-black/8 bg-[#f7f7f2] p-7 sm:p-8"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#b7445a] shadow-sm [&_svg]:h-4 [&_svg]:w-4">
                {promise.icon}
              </span>
              <h3 className="mt-16 text-lg font-semibold tracking-[-0.025em]">{promise.title}</h3>
              <p className="mt-4 text-[12px] leading-6 text-black/43">{promise.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-4 py-4 [contain-intrinsic-size:auto_600px] [content-visibility:auto] sm:px-6 lg:px-10">
      <div className="relative mx-auto flex min-h-[560px] max-w-[1360px] items-center justify-center overflow-hidden rounded-[2.6rem] bg-[#0b0b0d] px-6 py-24 text-center text-white">
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff5c7a]/12 blur-[120px]" />
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(255,92,122,.25)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(circle,black,transparent_70%)]" />
        <div className="relative max-w-4xl">
          <MessageCircle className="mx-auto h-6 w-6 text-[#ff5c7a]" />
          <h2 className="mt-8 text-5xl font-semibold leading-[0.9] tracking-[-0.065em] sm:text-7xl lg:text-8xl">
            Build an AI assistant your visitors can talk to.
          </h2>
          <p className="mx-auto mt-7 max-w-xl text-[14px] leading-7 text-white/42">
            Give Obseri the URL. Shape the soul. Let every visitor meet the most useful version of
            your website.
          </p>
          <Link
            to="/app"
            className="mt-10 inline-flex h-12 items-center gap-2 rounded-full bg-[#ff5c7a] px-6 text-[12px] font-bold text-white transition hover:scale-[1.02] hover:bg-white hover:text-black"
          >
            Build your website soul <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="px-6 py-10 lg:px-10">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-6 border-t border-black/8 pt-8 text-[10px] text-black/35 sm:flex-row sm:items-center sm:justify-between">
        <img src="/obseri-logo-dark.svg" alt="Obseri" className="h-7 w-auto" />
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          <a href="/ai-voice-agent-for-website" className="transition hover:text-black">
            AI voice agent
          </a>
          <a href="/ai-chatbot-trained-on-your-website" className="transition hover:text-black">
            Website-trained chatbot
          </a>
        </nav>
        <a
          href="https://github.com/jamiepine/voicebox"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 transition hover:text-black"
        >
          Optional voice infrastructure by Voicebox <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </footer>
  );
}

function Eyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p
      className={`flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.22em] ${dark ? "text-[#ff8399]" : "text-[#a84155]"}`}
    >
      <span className={`h-px w-7 ${dark ? "bg-[#ff5c7a]/55" : "bg-[#a84155]/45"}`} />
      {children}
    </p>
  );
}
