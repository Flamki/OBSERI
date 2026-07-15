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
    <div className="min-h-screen overflow-x-hidden bg-[#f4f4ef] font-sans text-[#17171a]">
      <Hero />
      <ProductSections />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative min-h-[900px] w-full min-w-0 overflow-hidden bg-[#f4f4ef] text-[#151518]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#ff8d78_0%,#f5a18f_24%,#dedcf0_57%,#f4f4ef_92%)]" />
      <div className="absolute inset-0 opacity-[0.14] mix-blend-soft-light">
        <PrismaticBurst
          animationType="rotate3d"
          intensity={1.15}
          speed={0.16}
          distort={0.42}
          offset={{ x: 0, y: 0 }}
          hoverDampness={0.35}
          rayCount={12}
          colors={["#ff5c7a", "#ff9c89", "#ffd1c7", "#9e91c9", "#f7f5f2"]}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,rgba(255,245,239,.22),transparent_35%),linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.18)_62%,#f4f4ef_100%)]" />

      <header className="absolute inset-x-4 top-4 z-20 mx-auto flex h-[72px] max-w-[1460px] items-center justify-between rounded-full border border-white/65 bg-[#fff8f0]/80 px-5 shadow-[0_16px_50px_rgba(72,31,38,.08),inset_0_1px_0_rgba(255,255,255,.9)] backdrop-blur-2xl sm:inset-x-6 sm:px-7 lg:top-5 lg:px-9">
        <Link to="/" aria-label="Obseri home" className="inline-flex items-center">
          <img src="/obseri-logo-dark.svg" alt="Obseri" className="h-7 w-auto sm:h-8" />
        </Link>
        <nav className="hidden items-center gap-8 text-[11px] font-semibold text-black/55 md:flex lg:gap-10">
          <a href="#how" className="transition hover:text-black">
            How it works
          </a>
          <a href="#studio" className="transition hover:text-black">
            Soul Studio
          </a>
          <a href="#trust" className="transition hover:text-black">
            Trust
          </a>
        </nav>
        <Link
          to="/app"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#17171a] px-4 text-[11px] font-semibold text-white shadow-[0_8px_24px_rgba(21,21,24,.14)] transition hover:bg-[#ff5c7a] sm:px-5"
        >
          Open Studio <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex min-h-[900px] w-full min-w-0 max-w-[1500px] flex-col items-center justify-center px-6 pb-24 pt-36 text-center lg:px-10">
        <div className="mb-8 flex items-center gap-4 sm:gap-5">
          <span className="h-px w-10 bg-[#8e4a57]/25 sm:w-16" />
          <img src="/obseri-pulse-mark.svg" alt="" className="h-9 w-9" />
          <span className="h-px w-10 bg-[#8e4a57]/25 sm:w-16" />
        </div>
        <p className="mb-7 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#6c3942]/80">
          Website intelligence that can speak
        </p>
        <h1 className="w-full min-w-0 max-w-[1120px] [font-family:Georgia,'Times_New_Roman',serif] text-[clamp(3.7rem,7.7vw,7.6rem)] font-normal leading-[0.91] tracking-[-0.065em]">
          <span className="block sm:whitespace-nowrap">Your website,</span>
          <span className="block text-[#8e3145]">ready to talk.</span>
        </h1>
        <p className="mt-7 w-full min-w-0 max-w-[650px] text-[14px] leading-7 text-black/58 sm:text-[16px] sm:leading-8">
          Obseri learns every page, takes on your personality, and helps visitors by voice or
          text&mdash;grounded in the sources you control.
        </p>

        <form
          action="/app"
          method="get"
          className="group relative mt-10 flex w-full min-w-0 max-w-[740px] flex-col gap-2 overflow-hidden rounded-[1.65rem] border border-white/80 bg-[#fffaf4]/78 p-1.5 shadow-[0_24px_80px_rgba(94,43,53,.13),inset_0_1px_0_rgba(255,255,255,.94)] backdrop-blur-2xl transition duration-300 focus-within:border-[#ff5c7a]/35 sm:flex-row sm:rounded-full"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-1 sm:px-4 sm:py-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/7 bg-white/55 text-black/38 transition group-focus-within:border-[#ff5c7a]/30 group-focus-within:text-[#d94763]">
              <Globe2 className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 text-left">
              <label
                htmlFor="quick-start-url"
                className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-black/38"
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
                className="h-6 w-full min-w-0 bg-transparent text-[14px] text-[#17171a] outline-none placeholder:text-black/35"
              />
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex h-14 shrink-0 items-center justify-center gap-3 rounded-[1.25rem] bg-[#17171a] px-7 text-[12px] font-bold text-white shadow-[0_10px_30px_rgba(21,21,24,.16)] transition duration-300 hover:bg-[#ff5c7a] sm:rounded-full"
          >
            Build its soul
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] font-medium text-black/40">
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff5c7a] shadow-[0_0_12px_rgba(255,92,122,.45)]" />
            Start from one URL
          </span>
          <a
            href="#how"
            className="inline-flex items-center gap-1.5 transition hover:text-black/75"
          >
            See how it works <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[12] h-28 bg-[linear-gradient(to_bottom,transparent,#f4f4ef)]" />
    </section>
  );
}
