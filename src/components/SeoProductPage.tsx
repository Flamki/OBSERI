import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, MessageCircle, Mic2 } from "lucide-react";

type CopyBlock = {
  title: string;
  body: string;
};

type Question = {
  question: string;
  answer: string;
};

type SeoProductPageProps = {
  eyebrow: string;
  title: string;
  introduction: string;
  proofPoints: string[];
  sectionTitle: string;
  sectionIntroduction: string;
  benefits: CopyBlock[];
  steps: CopyBlock[];
  useCaseTitle: string;
  useCases: CopyBlock[];
  questions: Question[];
  relatedHref: "/ai-voice-agent-for-website" | "/ai-chatbot-trained-on-your-website";
  relatedLabel: string;
};

export default function SeoProductPage({
  eyebrow,
  title,
  introduction,
  proofPoints,
  sectionTitle,
  sectionIntroduction,
  benefits,
  steps,
  useCaseTitle,
  useCases,
  questions,
  relatedHref,
  relatedLabel,
}: SeoProductPageProps) {
  return (
    <div className="min-h-screen bg-[#f4f4ef] font-sans text-[#171a17]">
      <header className="border-b border-white/10 bg-[#0b0b0d] px-6 text-white lg:px-10">
        <div className="mx-auto flex h-20 max-w-[1320px] items-center justify-between">
          <Link to="/" aria-label="Obseri home">
            <img src="/obseri-logo-light.svg" alt="Obseri" className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-5">
            <Link
              to="/"
              className="hidden text-xs text-white/55 transition hover:text-white sm:block"
            >
              Product
            </Link>
            <Link
              to="/app"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[#ff5c7a] px-4 text-xs font-semibold text-white transition hover:bg-white hover:text-black"
            >
              Open Studio <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-[#0b0b0d] px-6 pb-24 pt-20 text-white sm:pb-32 sm:pt-28 lg:px-10">
          <div className="pointer-events-none absolute right-[-10%] top-[-20%] h-[560px] w-[560px] rounded-full bg-[#ff5c7a]/12 blur-[140px]" />
          <div className="relative mx-auto max-w-[1320px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#ff8aa0]">
              {eyebrow}
            </p>
            <h1 className="mt-8 max-w-5xl text-[clamp(3rem,7vw,6.8rem)] font-semibold leading-[0.91] tracking-[-0.07em]">
              {title}
            </h1>
            <p className="mt-8 max-w-2xl text-[16px] leading-8 text-white/55 sm:text-lg">
              {introduction}
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                to="/app"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[#ff5c7a] px-6 text-xs font-bold text-white transition hover:bg-white hover:text-black"
              >
                Build your website agent <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to={relatedHref}
                className="inline-flex h-12 items-center rounded-full border border-white/14 px-6 text-xs font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
              >
                {relatedLabel}
              </Link>
            </div>
            <div className="mt-14 grid gap-3 border-t border-white/10 pt-7 sm:grid-cols-3">
              {proofPoints.map((point) => (
                <p key={point} className="flex items-center gap-2 text-xs text-white/48">
                  <Check className="h-3.5 w-3.5 text-[#ff758f]" /> {point}
                </p>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-24 sm:py-32 lg:px-10">
          <div className="mx-auto max-w-[1320px]">
            <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
              <h2 className="max-w-3xl text-4xl font-semibold leading-[.98] tracking-[-0.055em] sm:text-6xl">
                {sectionTitle}
              </h2>
              <p className="max-w-xl text-sm leading-7 text-black/48">{sectionIntroduction}</p>
            </div>
            <div className="mt-16 grid gap-3 md:grid-cols-3">
              {benefits.map((benefit, index) => (
                <article
                  key={benefit.title}
                  className="rounded-[1.6rem] border border-black/8 bg-white/60 p-7 sm:p-8"
                >
                  <span className="text-[10px] font-bold text-[#b7445a]">0{index + 1}</span>
                  <h3 className="mt-12 text-xl font-semibold tracking-[-0.03em]">
                    {benefit.title}
                  </h3>
                  <p className="mt-4 text-[13px] leading-6 text-black/46">{benefit.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#e9eae4] px-6 py-24 sm:py-32 lg:px-10">
          <div className="mx-auto max-w-[1320px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-black/38">
              How it works
            </p>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {steps.map((step, index) => (
                <article
                  key={step.title}
                  className="min-h-72 rounded-[1.7rem] bg-[#0e0f0e] p-8 text-white"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ff5c7a] text-xs font-bold">
                    {index + 1}
                  </span>
                  <h2 className="mt-16 text-2xl font-semibold tracking-[-0.04em]">{step.title}</h2>
                  <p className="mt-4 text-[13px] leading-6 text-white/45">{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-24 sm:py-32 lg:px-10">
          <div className="mx-auto max-w-[1320px]">
            <div className="flex items-center gap-3 text-[#b7445a]">
              <Mic2 className="h-4 w-4" />
              <MessageCircle className="h-4 w-4" />
            </div>
            <h2 className="mt-7 max-w-3xl text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">
              {useCaseTitle}
            </h2>
            <div className="mt-14 grid gap-x-14 gap-y-10 md:grid-cols-2">
              {useCases.map((useCase) => (
                <article key={useCase.title} className="border-t border-black/10 pt-6">
                  <h3 className="text-lg font-semibold tracking-[-0.025em]">{useCase.title}</h3>
                  <p className="mt-3 max-w-xl text-[13px] leading-6 text-black/46">
                    {useCase.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-black/8 bg-white/55 px-6 py-24 sm:py-32 lg:px-10">
          <div className="mx-auto grid max-w-[1320px] gap-12 lg:grid-cols-[.65fr_1.35fr]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#b7445a]">
                Clear answers
              </p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">What buyers ask.</h2>
            </div>
            <div>
              {questions.map((item) => (
                <article key={item.question} className="border-b border-black/9 py-7 first:pt-0">
                  <h3 className="text-lg font-semibold tracking-[-0.025em]">{item.question}</h3>
                  <p className="mt-3 text-[13px] leading-6 text-black/48">{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-4 sm:px-6 lg:px-10">
          <div className="mx-auto flex min-h-[470px] max-w-[1360px] items-center justify-center rounded-[2.5rem] bg-[#0b0b0d] px-6 py-20 text-center text-white">
            <div className="max-w-3xl">
              <h2 className="text-5xl font-semibold leading-[.92] tracking-[-0.06em] sm:text-7xl">
                Let visitors talk to your website.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-sm leading-7 text-white/45">
                Give Obseri one public URL. Review what it learns, shape the agent, and test the
                real visitor experience before you publish.
              </p>
              <Link
                to="/app"
                className="mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-[#ff5c7a] px-6 text-xs font-bold transition hover:bg-white hover:text-black"
              >
                Start with your website <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 py-10 lg:px-10">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-5 border-t border-black/8 pt-8 text-xs text-black/42 sm:flex-row sm:items-center sm:justify-between">
          <img src="/obseri-logo-dark.svg" alt="Obseri" className="h-7 w-auto" />
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/ai-voice-agent-for-website" className="transition hover:text-black">
              AI voice agent
            </Link>
            <Link to="/ai-chatbot-trained-on-your-website" className="transition hover:text-black">
              Website-trained chatbot
            </Link>
            <a href="mailto:flamki@obseri.com" className="transition hover:text-black">
              Contact
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
