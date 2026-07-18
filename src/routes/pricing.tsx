import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleGauge,
  Globe2,
  MessageCircle,
  Mic2,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import {
  BILLING_PLANS,
  formatInr,
  type BillingPlan,
  type BillingPlanId,
} from "@/lib/billing-plans";

type BillingCycle = "monthly" | "annual";

const serif =
  "[font-family:Baskerville,'Iowan_Old_Style','Palatino_Linotype','Times_New_Roman',serif]";
const selfServePlanIds = ["free", "launch", "growth", "scale"] as const;

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing | Obseri Voice and Chat Agent" },
      {
        name: "description",
        content:
          "Simple Obseri pricing for website voice and chat agents. Start free, then scale conversations, voice minutes, knowledge, and websites without surprise overages.",
      },
      { property: "og:title", content: "Obseri pricing" },
      {
        property: "og:description",
        content: "Plans for turning website visits into useful voice and chat conversations.",
      },
      { property: "og:url", content: "https://obseri.com/pricing" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://obseri.com/pricing" }],
  }),
  component: PricingPage,
});

function PricingPage() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f4f1f3] text-[#17171a]">
      <section className="relative overflow-hidden px-4 pb-20 pt-28 sm:px-6 sm:pt-32 lg:px-10">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f99786_0%,#edb0aa_31%,#ddd8e9_68%,#f4f1f3_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-12%,rgba(255,92,122,.42),transparent_38%),radial-gradient(circle_at_9%_48%,rgba(255,231,222,.52),transparent_26%),radial-gradient(circle_at_89%_58%,rgba(130,111,180,.18),transparent_30%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-[19rem] h-44 opacity-65">
          <svg
            viewBox="0 0 1600 190"
            preserveAspectRatio="none"
            className="h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="pricing-signal" x1="0" x2="1">
                <stop offset="0" stopColor="#ff5c7a" stopOpacity="0" />
                <stop offset=".22" stopColor="#ff5c7a" stopOpacity=".45" />
                <stop offset=".5" stopColor="#fff8f4" stopOpacity=".9" />
                <stop offset=".78" stopColor="#8e7bbb" stopOpacity=".4" />
                <stop offset="1" stopColor="#8e7bbb" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 95 C165 95 206 95 270 95 C325 95 337 50 382 50 C430 50 439 143 493 143 C551 143 563 20 633 20 C702 20 720 169 790 169 C856 169 882 64 945 64 C1008 64 1038 127 1100 127 C1174 127 1205 95 1600 95"
              fill="none"
              stroke="url(#pricing-signal)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        <SiteHeader />

        <div className="relative mx-auto max-w-[1240px] text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/25 px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-black/50 backdrop-blur-md">
            <img src="/obseri-pulse-mark.svg" alt="" className="h-5 w-5" />
            Pricing that scales with real conversations
          </div>
          <h1
            className={`mx-auto mt-7 max-w-[820px] text-[clamp(3rem,6vw,5.6rem)] font-normal leading-[.94] tracking-[-.052em] ${serif}`}
          >
            Start small. <span className="text-[#a4314a]">Grow on signal.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-[590px] text-[15px] leading-7 text-black/55 sm:text-[17px]">
            Every plan includes a grounded voice and chat agent. Upgrade when your traffic and
            conversations earn it.
          </p>

          <BillingCycleToggle cycle={cycle} setCycle={setCycle} />
        </div>
      </section>

      <section className="relative z-10 -mt-8 px-4 pb-24 sm:px-6 lg:px-10">
        <div className="mx-auto grid max-w-[1380px] gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {selfServePlanIds.map((planId) => (
            <PricingCard key={planId} planId={planId} plan={BILLING_PLANS[planId]} cycle={cycle} />
          ))}
        </div>

        <EnterpriseCard />
        <UsageNote />
      </section>

      <Faq />
      <PricingFooter />
    </main>
  );
}

function SiteHeader() {
  return (
    <header className="fixed left-1/2 top-5 z-50 flex h-[62px] w-[calc(100%-2rem)] max-w-[860px] -translate-x-1/2 items-center justify-between rounded-[1.65rem] border border-white/15 bg-[#111016]/55 px-3.5 shadow-[0_18px_55px_rgba(22,12,20,.18),inset_0_1px_0_rgba(255,255,255,.08)] backdrop-blur-2xl sm:px-5">
      <Link to="/" aria-label="Obseri home" className="inline-flex items-center">
        <img src="/obseri-logo-light.svg" alt="Obseri" className="h-6 w-auto sm:h-7" />
      </Link>
      <nav className="hidden items-center gap-8 text-[11px] font-medium text-white/50 md:flex">
        <Link to="/" hash="how" className="transition hover:text-white">
          How it works
        </Link>
        <span className="text-white">Pricing</span>
        <a
          href="mailto:flamki@obseri.com?subject=Obseri%20pricing"
          className="transition hover:text-white"
        >
          Contact
        </a>
      </nav>
      <Link
        to="/app"
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#f8f6f2] px-4 text-[11px] font-semibold text-[#17171a] shadow-[0_8px_22px_rgba(0,0,0,.18)] transition hover:bg-white sm:px-5"
      >
        Open Studio <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </header>
  );
}

function BillingCycleToggle({
  cycle,
  setCycle,
}: {
  cycle: BillingCycle;
  setCycle: (value: BillingCycle) => void;
}) {
  return (
    <div
      className="mx-auto mt-9 inline-flex rounded-full border border-white/70 bg-white/38 p-1.5 shadow-[0_14px_40px_rgba(70,38,50,.1)] backdrop-blur-xl"
      aria-label="Billing interval"
    >
      {(["monthly", "annual"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={cycle === value}
          onClick={() => setCycle(value)}
          className={`h-10 rounded-full px-5 text-[11px] font-semibold capitalize transition-all ${
            cycle === value
              ? "bg-[#17171a] text-white shadow-[0_8px_18px_rgba(23,23,26,.2)]"
              : "text-black/48 hover:text-black"
          }`}
        >
          {value}
          {value === "annual" ? <span className="ml-2 text-[#ff869b]">Save 15%</span> : null}
        </button>
      ))}
    </div>
  );
}

function PricingCard({
  planId,
  plan,
  cycle,
}: {
  planId: Exclude<BillingPlanId, "enterprise">;
  plan: BillingPlan;
  cycle: BillingCycle;
}) {
  const price = cycle === "annual" ? plan.annualPriceInrPaise : plan.monthlyPriceInrPaise;
  const monthlyEquivalent =
    cycle === "annual" && price !== null && price > 0 ? Math.round(price / 12) : price;
  const limitRows = planLimitRows(plan);

  return (
    <article
      className={`relative flex min-h-[590px] flex-col overflow-hidden rounded-[2rem] border p-6 sm:p-7 ${
        plan.highlighted
          ? "border-[#ff5c7a]/55 bg-[#17171a] text-white shadow-[0_26px_80px_rgba(69,32,44,.2)]"
          : "border-black/[0.08] bg-white/72 shadow-[0_18px_60px_rgba(46,38,43,.06)] backdrop-blur-xl"
      }`}
    >
      {plan.highlighted ? (
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#ff5c7a,#ffad92,#927fc2)]" />
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${plan.highlighted ? "text-white/44" : "text-black/38"}`}
          >
            {planId === "free"
              ? "Explore"
              : planId === "launch"
                ? "Go live"
                : planId === "growth"
                  ? "Build pipeline"
                  : "Run volume"}
          </p>
          <h2 className={`mt-3 text-[2.35rem] font-normal tracking-[-.04em] ${serif}`}>
            {plan.name}
          </h2>
        </div>
        {plan.highlighted ? (
          <span className="rounded-full bg-[#ff5c7a] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.14em] text-white">
            Most popular
          </span>
        ) : null}
      </div>

      <p
        className={`mt-3 min-h-12 text-[13px] leading-6 ${plan.highlighted ? "text-white/54" : "text-black/50"}`}
      >
        {plan.description}
      </p>

      <div className="mt-7 min-h-[78px]">
        {price === 0 ? (
          <p className={`text-[3rem] font-normal tracking-[-.05em] ${serif}`}>₹0</p>
        ) : (
          <>
            <div className="flex items-end gap-1.5">
              <span
                className={`text-[2.75rem] font-normal leading-none tracking-[-.05em] ${serif}`}
              >
                {formatInr(monthlyEquivalent ?? 0)}
              </span>
              <span
                className={`pb-1 text-[11px] ${plan.highlighted ? "text-white/42" : "text-black/38"}`}
              >
                / month
              </span>
            </div>
            <p
              className={`mt-2 text-[10px] ${plan.highlighted ? "text-white/38" : "text-black/35"}`}
            >
              {cycle === "annual" ? `${formatInr(price ?? 0)} billed yearly` : "Billed monthly"} ·
              GST included
            </p>
          </>
        )}
      </div>

      <Link
        to="/app"
        className={`mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full text-[11px] font-bold transition hover:-translate-y-0.5 ${
          plan.highlighted
            ? "bg-[#ff5c7a] text-white shadow-[0_12px_30px_rgba(255,92,122,.2)] hover:bg-white hover:text-black"
            : "bg-[#17171a] text-white hover:bg-[#a4314a]"
        }`}
      >
        {planId === "free" ? "Start free" : `Choose ${plan.name}`}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>

      <div className={`my-7 h-px ${plan.highlighted ? "bg-white/10" : "bg-black/[0.07]"}`} />
      <ul className="space-y-3.5">
        {limitRows.map((label) => (
          <li
            key={label}
            className={`flex gap-2.5 text-[12px] leading-5 ${plan.highlighted ? "text-white/68" : "text-black/60"}`}
          >
            <Check
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${plan.highlighted ? "text-[#ff869b]" : "text-[#a4314a]"}`}
            />
            {label}
          </li>
        ))}
        {plan.features.slice(0, planId === "free" ? 2 : 3).map((feature) => (
          <li
            key={feature}
            className={`flex gap-2.5 text-[12px] leading-5 ${plan.highlighted ? "text-white/68" : "text-black/60"}`}
          >
            <Check
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${plan.highlighted ? "text-[#ff869b]" : "text-[#a4314a]"}`}
            />
            {feature}
          </li>
        ))}
      </ul>
    </article>
  );
}

function planLimitRows(plan: BillingPlan) {
  const { limits } = plan;
  const rows = [
    `${numberLabel(limits.websites, "website")}`,
    `${numberLabel(limits.indexedPages, "indexed page")}`,
    `${numberLabel(limits.textResponsesPerMonth, "text response")} / month`,
    `${numberLabel(limits.voiceMinutesPerMonth, "voice minute")} / month`,
  ];
  if (limits.seats && limits.seats > 1) rows.push(numberLabel(limits.seats, "team seat"));
  return rows;
}

function numberLabel(value: number | null, noun: string) {
  if (value === null) return `Custom ${noun}s`;
  return `${new Intl.NumberFormat("en-IN").format(value)} ${noun}${value === 1 ? "" : "s"}`;
}

function EnterpriseCard() {
  const plan = BILLING_PLANS.enterprise;
  return (
    <article className="relative mx-auto mt-3 grid max-w-[1380px] overflow-hidden rounded-[2rem] border border-black/[0.08] bg-[#ede8ed] lg:grid-cols-[.9fr_1.1fr]">
      <div className="p-7 sm:p-10 lg:p-12">
        <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#a4314a]">
          Enterprise
        </p>
        <h2
          className={`mt-4 max-w-[520px] text-[clamp(2.4rem,4vw,4.4rem)] font-normal leading-[.98] tracking-[-.05em] ${serif}`}
        >
          Capacity designed around your traffic.
        </h2>
        <p className="mt-5 max-w-[540px] text-[14px] leading-7 text-black/52">{plan.description}</p>
        <a
          href="mailto:flamki@obseri.com?subject=Obseri%20Enterprise"
          className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-[#17171a] px-6 text-[11px] font-bold text-white transition hover:bg-[#a4314a]"
        >
          Talk to us <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="relative grid grid-cols-2 gap-px bg-black/[0.07] sm:grid-cols-3">
        {[
          [ShieldCheck, "SSO + audit controls"],
          [Globe2, "Custom regions"],
          [Mic2, "Private voice deployment"],
          [MessageCircle, "Committed usage"],
          [CircleGauge, "SLA + priority"],
          [Check, "Dedicated support"],
        ].map(([Icon, label]) => (
          <div
            key={label as string}
            className="flex min-h-36 flex-col justify-between bg-[#f7f3f5] p-6"
          >
            <Icon className="h-5 w-5 text-[#a4314a]" />
            <span className="max-w-[140px] text-[11px] font-medium leading-5 text-black/55">
              {label as string}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function UsageNote() {
  return (
    <div className="mx-auto mt-6 flex max-w-[1050px] flex-col items-center justify-center gap-3 text-center text-[11px] leading-5 text-black/42 sm:flex-row sm:gap-7">
      <span className="inline-flex items-center gap-2">
        <ShieldCheck className="h-3.5 w-3.5 text-[#a4314a]" /> No surprise overages
      </span>
      <span>Usage resets each billing month</span>
      <span>Change or cancel from your workspace</span>
    </div>
  );
}

function Faq() {
  const questions = [
    [
      "What happens when I reach a limit?",
      "We pause the metered feature and show the limit in your workspace. Obseri does not add surprise usage charges.",
    ],
    [
      "Can I change plans later?",
      "Yes. You can upgrade, schedule a plan change, or cancel from billing in your workspace.",
    ],
    [
      "What counts as a text response?",
      "One completed visitor answer counts as one response. Failed generations are released and do not consume quota.",
    ],
    [
      "Is website refresh automatic?",
      "Launch plans currently use manual incremental refresh, so you decide when Obseri re-learns changed pages.",
    ],
  ];
  return (
    <section className="bg-[#17171a] px-4 py-24 text-white sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[.7fr_1.3fr]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#ff869b]">
            Good to know
          </p>
          <h2
            className={`mt-5 text-[clamp(2.5rem,5vw,4.8rem)] font-normal leading-[.95] tracking-[-.05em] ${serif}`}
          >
            Clear before you commit.
          </h2>
        </div>
        <div className="divide-y divide-white/10 border-y border-white/10">
          {questions.map(([question, answer]) => (
            <details key={question} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-[14px] font-medium marker:hidden">
                {question}
                <ChevronDown className="h-4 w-4 shrink-0 text-white/40 transition group-open:rotate-180" />
              </summary>
              <p className="max-w-[650px] pb-6 text-[13px] leading-6 text-white/48">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingFooter() {
  return (
    <footer className="bg-[#17171a] px-6 pb-10 text-white lg:px-10">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5 border-t border-white/10 pt-8 text-[10px] text-white/35 sm:flex-row sm:items-center sm:justify-between">
        <img src="/obseri-logo-light.svg" alt="Obseri" className="h-7 w-auto" />
        <span>Prices include applicable GST. Capacity is enforced per workspace.</span>
        <a
          href="mailto:flamki@obseri.com?subject=Obseri%20pricing"
          className="transition hover:text-white"
        >
          flamki@obseri.com
        </a>
      </div>
    </footer>
  );
}
