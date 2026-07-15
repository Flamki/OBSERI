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
    <section className="relative min-h-[900px] w-full min-w-0 overflow-hidden bg-[#f4f1ec] text-[#151518] lg:min-h-[940px]">
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(21,21,24,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(21,21,24,.035)_1px,transparent_1px)] [background-size:56px_56px]" />
      <div className="absolute inset-x-3 bottom-3 top-[104px] overflow-hidden rounded-[2rem] border border-black/8 bg-[linear-gradient(180deg,#ef9f92_0%,#f1c0ba_24%,#dedcec_60%,#f7f4ef_100%)] shadow-[0_30px_100px_rgba(72,38,45,.10),inset_0_1px_0_rgba(255,255,255,.6)] sm:inset-x-5 sm:rounded-[2.75rem]" />
      <div className="absolute inset-x-3 bottom-3 top-[104px] overflow-hidden rounded-[2rem] opacity-[0.12] mix-blend-soft-light sm:inset-x-5 sm:rounded-[2.75rem]">
        <PrismaticBurst
          animationType="rotate3d"
          intensity={1.05}
          speed={0.13}
          distort={0.38}
          offset={{ x: 0, y: 0 }}
          hoverDampness={0.35}
          rayCount={12}
          colors={["#ff5c7a", "#ff9c89", "#ffd1c7", "#9e91c9", "#f7f5f2"]}
        />
      </div>
      <div className="pointer-events-none absolute inset-x-3 bottom-3 top-[104px] overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_16%_28%,rgba(255,235,225,.38),transparent_24%),radial-gradient(circle_at_84%_38%,rgba(134,119,182,.17),transparent_26%),radial-gradient(circle_at_50%_34%,rgba(255,248,242,.26),transparent_36%),linear-gradient(180deg,transparent,rgba(255,255,255,.2)_62%,rgba(247,244,239,.86)_100%)] sm:inset-x-5 sm:rounded-[2.75rem]" />
      <div className="pointer-events-none absolute left-1/2 top-[45%] h-[420px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/14 blur-[90px]" />

      <header className="absolute inset-x-4 top-4 z-20 mx-auto flex h-[72px] max-w-[1460px] items-center justify-between rounded-full border border-black/7 bg-[#fffdf9]/88 px-5 shadow-[0_14px_50px_rgba(72,31,38,.07),inset_0_1px_0_rgba(255,255,255,.95)] backdrop-blur-2xl sm:inset-x-6 sm:px-7 lg:top-5 lg:px-9">
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

      <div className="pointer-events-none absolute left-10 top-[137px] z-10 hidden text-[8px] font-semibold uppercase tracking-[0.24em] text-black/38 md:block lg:left-16">
        Knowledge&nbsp;&nbsp;&middot;&nbsp;&nbsp;Personality&nbsp;&nbsp;&middot;&nbsp;&nbsp;Voice
      </div>
      <div className="pointer-events-none absolute right-10 top-[137px] z-10 hidden text-[8px] font-semibold uppercase tracking-[0.24em] text-black/38 md:block lg:right-16">
        Source-grounded by design
      </div>

      <div className="relative z-10 mx-auto flex min-h-[900px] w-full min-w-0 max-w-[1500px] flex-col items-center justify-start px-6 pb-14 pt-[154px] text-center sm:pt-[166px] lg:min-h-[940px] lg:px-10 lg:pt-[178px]">
        <div className="relative mb-5 flex h-[76px] w-[76px] items-center justify-center rounded-full border border-[#a94659]/18 bg-white/28 shadow-[0_18px_50px_rgba(106,48,59,.10),inset_0_1px_0_rgba(255,255,255,.65)] backdrop-blur-xl">
          <span className="absolute -inset-2 rounded-full border border-[#a94659]/10" />
          <span className="absolute inset-2 rounded-full border border-white/55" />
          <img src="/obseri-pulse-mark.svg" alt="" className="relative h-10 w-10" />
        </div>
        <p className="mb-5 text-[9px] font-semibold uppercase tracking-[0.26em] text-[#713d47]/72 sm:text-[10px]">
          One URL. A living interface.
        </p>
        <h1 className="w-full min-w-0 max-w-[1120px] [font-family:Georgia,'Times_New_Roman',serif] text-[clamp(3.55rem,7.2vw,7.35rem)] font-normal leading-[0.88] tracking-[-0.068em]">
          <span className="block sm:whitespace-nowrap">Give your website</span>
          <span className="block italic text-[#8e3145]">a soul.</span>
        </h1>
        <p className="mt-6 w-full min-w-0 max-w-[680px] text-[14px] leading-7 text-black/56 sm:text-[16px] sm:leading-8">
          One URL becomes a source-grounded assistant that knows your site, sounds like your brand,
          and speaks with every visitor.
        </p>

        <form
          action="/app"
          method="get"
          className="group relative mt-7 flex w-full min-w-0 max-w-[780px] flex-col items-stretch gap-2 overflow-hidden rounded-[1.65rem] border border-white/90 bg-[#fffdf9]/88 p-1.5 shadow-[0_26px_80px_rgba(94,43,53,.12),inset_0_1px_0_rgba(255,255,255,.98)] backdrop-blur-2xl transition-[border-color,box-shadow,transform] duration-300 focus-within:-translate-y-0.5 focus-within:border-[#ff5c7a]/55 focus-within:shadow-[0_30px_90px_rgba(94,43,53,.16),0_0_0_4px_rgba(255,92,122,.10),0_0_65px_rgba(255,92,122,.28),inset_0_1px_0_rgba(255,255,255,.98)] sm:flex-row sm:items-center sm:rounded-full"
        >
          <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-1 sm:px-4 sm:py-0">
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
                className="h-6 w-full min-w-0 bg-transparent text-[14px] text-[#17171a] outline-none selection:bg-[#ff5c7a]/25 placeholder:text-black/35"
              />
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex h-14 shrink-0 items-center justify-center gap-3 rounded-[1.25rem] bg-[#17171a] px-7 text-[12px] font-bold text-white shadow-[0_10px_30px_rgba(21,21,24,.16)] transition-[background-color,box-shadow,transform] duration-300 hover:-translate-y-px hover:bg-[#ff5c7a] hover:shadow-[0_12px_34px_rgba(255,92,122,.28)] active:translate-y-0 sm:rounded-full"
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
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[12] h-24 rounded-b-[2rem] bg-[linear-gradient(to_bottom,transparent,rgba(247,244,239,.92))] sm:inset-x-5 sm:rounded-b-[2.75rem]" />
    </section>
  );
}
