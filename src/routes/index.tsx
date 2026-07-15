import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Globe2 } from "lucide-react";
import PrismaticBurst from "@/components/PrismaticBurst";
import ProductSections from "@/components/ProductSections";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Voice Agent & Website Chatbot Trained on Your Content | Obseri" },
      {
        name: "description",
        content:
          "Turn your website into an AI voice agent and chatbot trained on your content. Crawl pages, shape its personality, test answers, and embed it in minutes.",
      },
      { property: "og:title", content: "Obseri — AI Voice Agent for Your Website" },
      {
        property: "og:description",
        content:
          "Build a voice and text AI assistant trained on your website content, grounded in visible sources, and shaped to sound like your brand.",
      },
      { property: "og:url", content: "https://obseri.com/" },
      { property: "og:image", content: "https://obseri.com/obseri-social-card.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Obseri AI voice agent and website chatbot" },
      { name: "twitter:title", content: "Obseri — AI Voice Agent for Your Website" },
      {
        name: "twitter:description",
        content: "A voice and text AI assistant trained on your website content.",
      },
      { name: "twitter:image", content: "https://obseri.com/obseri-social-card.png" },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://obseri.com/#organization",
              name: "Obseri",
              alternateName: "Obseri AI",
              url: "https://obseri.com/",
              email: "flamki@obseri.com",
              logo: {
                "@type": "ImageObject",
                url: "https://obseri.com/obseri-search-logo.png",
                contentUrl: "https://obseri.com/obseri-search-logo.png",
                width: 512,
                height: 512,
              },
              description:
                "Obseri builds source-grounded AI voice agents and website chatbots trained on a business's own content.",
            },
            {
              "@type": "WebSite",
              "@id": "https://obseri.com/#website",
              url: "https://obseri.com/",
              name: "Obseri",
              alternateName: "Obseri AI",
              description: "AI voice agents and website chatbots trained on your content.",
              publisher: { "@id": "https://obseri.com/#organization" },
              inLanguage: "en",
            },
            {
              "@type": "SoftwareApplication",
              "@id": "https://obseri.com/#software",
              name: "Obseri Soul Studio",
              url: "https://obseri.com/",
              applicationCategory: "BusinessApplication",
              applicationSubCategory: "Conversational AI",
              operatingSystem: "Web",
              isAccessibleForFree: true,
              description:
                "Create a source-grounded AI voice agent and website chatbot from your website URL, then customize its personality, test retrieval, and embed it on your site.",
              featureList: [
                "Advanced website crawling and content refresh",
                "Source-grounded AI answers with citations",
                "Voice and text conversations",
                "Custom assistant personality",
                "Retrieval testing before launch",
                "Embeddable website widget and signed webhooks",
              ],
              publisher: { "@id": "https://obseri.com/#organization" },
            },
          ],
        },
      },
    ],
    links: [{ rel: "canonical", href: "https://obseri.com/" }],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4f4ef] font-sans text-[#171a17]">
      <Hero />
      <ProductSections />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative w-full min-w-0 min-h-[900px] overflow-hidden bg-[#090a09] text-white">
      <div className="absolute inset-0">
        <PrismaticBurst
          animationType="rotate3d"
          intensity={2.1}
          speed={0.32}
          distort={0.7}
          offset={{ x: 0, y: 0 }}
          hoverDampness={0.2}
          rayCount={20}
          colors={["#f26f45", "#3468d4", "#e9c46a", "#6fc6cf", "#9b78c9", "#d5e5c3"]}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_47%,rgba(5,6,5,.24)_0%,rgba(5,6,5,.58)_30%,rgba(5,6,5,.08)_58%,rgba(5,6,5,.18)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/40" />

      <header className="absolute inset-x-0 top-0 z-20 mx-auto flex h-24 w-full max-w-[1500px] items-center justify-between px-6 lg:px-10">
        <Link to="/" aria-label="Obseri home" className="inline-flex items-center">
          <img src="/obseri-logo-light.svg" alt="Obseri" className="h-8 w-auto" />
        </Link>
        <nav className="hidden items-center gap-8 text-[12px] font-medium text-white/55 md:flex">
          <a href="#how" className="transition hover:text-white">
            How it works
          </a>
          <a href="#studio" className="transition hover:text-white">
            Studio
          </a>
          <a href="#trust" className="transition hover:text-white">
            Trust
          </a>
        </nav>
        <Link
          to="/app"
          className="inline-flex h-10 items-center gap-2 rounded-full border border-white/14 bg-white/8 px-4 text-[12px] font-semibold backdrop-blur-xl transition hover:bg-white hover:text-black"
        >
          Open Studio <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex min-h-[900px] w-full min-w-0 max-w-[1500px] flex-col items-center justify-center px-6 pb-20 pt-28 text-center lg:px-10">
        <h1 className="w-full min-w-0 max-w-[1100px] text-[clamp(3.2rem,7.9vw,7.75rem)] font-semibold leading-[0.88] tracking-[-0.078em]">
          <span className="block text-white/95 sm:whitespace-nowrap">Give your website</span>
          <span className="mt-1 block bg-[linear-gradient(100deg,#e7ffd0_8%,#b7f774_50%,#d9ffb8_92%)] bg-clip-text pb-[0.08em] text-transparent drop-shadow-[0_0_34px_rgba(183,247,116,.12)]">
            a soul.
          </span>
        </h1>
        <p className="mt-6 w-full min-w-0 max-w-[650px] text-[15px] leading-7 text-white/60 sm:text-[17px] sm:leading-8">
          Deep website knowledge, a personality you shape, and a natural voice—built into one living
          interface.
        </p>

        <form
          action="/app"
          method="get"
          className="group relative mt-9 flex w-full min-w-0 max-w-[720px] flex-col gap-2 overflow-hidden rounded-[1.65rem] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.035))] p-1.5 shadow-[0_28px_90px_rgba(0,0,0,.42),inset_0_1px_0_rgba(255,255,255,.08)] backdrop-blur-2xl transition duration-300 focus-within:border-white/28 sm:flex-row sm:rounded-full"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-1 sm:px-4 sm:py-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white/45 transition group-focus-within:border-[#b7f774]/35 group-focus-within:text-[#b7f774]">
              <Globe2 className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 text-left">
              <label
                htmlFor="quick-start-url"
                className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-white/38"
              >
                Your website URL
              </label>
              <input
                id="quick-start-url"
                name="url"
                type="url"
                required
                autoComplete="url"
                placeholder="https://yourwebsite.com"
                className="h-6 w-full min-w-0 bg-transparent text-[14px] text-white outline-none placeholder:text-white/35"
              />
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex h-14 shrink-0 items-center justify-center gap-3 rounded-[1.25rem] bg-[#b7f774] px-7 text-[12px] font-bold text-[#111410] shadow-[0_8px_28px_rgba(183,247,116,.16)] transition duration-300 hover:bg-[#caff91] sm:rounded-full"
          >
            Build its soul
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] font-medium text-white/38">
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#b7f774] shadow-[0_0_12px_rgba(183,247,116,.7)]" />
            Start from one URL
          </span>
          <a
            href="#how"
            className="inline-flex items-center gap-1.5 transition hover:text-white/75"
          >
            See how it works <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[12] h-24 bg-[linear-gradient(to_bottom,transparent_0%,rgba(9,11,9,.58)_62%,#090b09_100%)]" />
    </section>
  );
}
