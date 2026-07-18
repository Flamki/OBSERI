import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ExternalLink } from "lucide-react";

const canonicalUrl = "https://obseri.com/about";
const title = "About Obseri | Website Voice and Chat Agents";
const description =
  "Obseri is a website intelligence platform for building source-grounded AI voice agents and chatbots from the content you already publish.";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: canonicalUrl },
      { property: "og:image", content: "https://obseri.com/obseri-social-card.png" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: "https://obseri.com/obseri-social-card.png" },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "AboutPage",
          "@id": `${canonicalUrl}#webpage`,
          url: canonicalUrl,
          name: title,
          description,
          isPartOf: { "@id": "https://obseri.com/#website" },
          mainEntity: { "@id": "https://obseri.com/#organization" },
          inLanguage: "en",
        },
      },
    ],
    links: [{ rel: "canonical", href: canonicalUrl }],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="min-h-screen bg-[#f4f1f3] text-[#17171a]">
      <header className="mx-auto flex h-24 max-w-[1180px] items-center justify-between px-6 lg:px-10">
        <Link to="/" aria-label="Obseri home">
          <img src="/obseri-logo-dark.svg" alt="Obseri" className="h-7 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/pricing"
            className="hidden text-[12px] font-medium text-black/55 transition hover:text-black sm:inline-flex"
          >
            Pricing
          </Link>
          <Link
            to="/app"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#17171a] px-5 text-[12px] font-semibold text-white transition hover:bg-[#a4314a]"
          >
            Open Studio <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden border-y border-black/[0.07] px-6 py-24 sm:py-32 lg:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,92,122,.28),transparent_36%),radial-gradient(circle_at_85%_85%,rgba(142,123,187,.2),transparent_34%)]" />
        <div className="relative mx-auto max-w-[1180px]">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a4314a]">
            About Obseri
          </p>
          <h1 className="mt-7 max-w-4xl text-[clamp(3.2rem,7vw,6.8rem)] font-normal leading-[0.9] tracking-[-0.055em] [font-family:Baskerville,'Iowan_Old_Style','Palatino_Linotype','Times_New_Roman',serif]">
            Website intelligence that can speak.
          </h1>
          <p className="mt-8 max-w-2xl text-[16px] leading-8 text-black/55 sm:text-[18px]">
            Obseri is the software platform at obseri.com for turning a website into a grounded
            voice and chat agent. It discovers public pages, keeps their sources visible, and gives
            teams control over the agent&apos;s knowledge, personality, voice, and deployment.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1180px] gap-12 px-6 py-24 lg:grid-cols-[0.75fr_1.25fr] lg:px-10 lg:py-32">
        <div>
          <img src="/obseri-pulse-mark.svg" alt="" className="h-12 w-12" />
          <h2 className="mt-7 text-3xl font-medium tracking-[-0.04em]">
            One URL. One living agent.
          </h2>
        </div>
        <div className="divide-y divide-black/[0.08] border-y border-black/[0.08]">
          {[
            ["Learn", "Crawl the website and turn its useful content into inspectable knowledge."],
            ["Shape", "Choose the agent's role, behavior, boundaries, greeting, and voice."],
            ["Launch", "Test retrieval, publish a scoped widget, and review real conversations."],
          ].map(([label, copy]) => (
            <article key={label} className="grid gap-3 py-7 sm:grid-cols-[8rem_1fr] sm:py-8">
              <h3 className="text-[13px] font-semibold">{label}</h3>
              <p className="max-w-xl text-[14px] leading-7 text-black/50">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-black/[0.08] px-6 py-10 lg:px-10">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5 text-[11px] text-black/45 sm:flex-row sm:items-center sm:justify-between">
          <span>Obseri · AI voice and chat agents for websites</span>
          <a
            href="mailto:flamki@obseri.com?subject=Obseri%20inquiry"
            className="inline-flex items-center gap-1.5 font-medium text-black/65 transition hover:text-black"
          >
            flamki@obseri.com <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </footer>
    </main>
  );
}
