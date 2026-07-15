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
    <section className="relative min-h-[820px] w-full min-w-0 overflow-hidden bg-[#f4f4ef] text-[#151518] sm:min-h-[860px] lg:min-h-[900px]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#ff907d_0%,#f3aa9d_30%,#ded9eb_66%,#f4f4ef_96%)]" />
      <div className="absolute inset-0 opacity-[0.11] mix-blend-soft-light">
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_74%_62%_at_50%_-10%,rgba(255,85,107,.48)_0%,rgba(255,135,119,.31)_43%,rgba(255,206,194,.09)_69%,transparent_84%),radial-gradient(ellipse_42%_30%_at_50%_27%,rgba(255,244,238,.28),transparent_74%),radial-gradient(circle_at_20%_31%,rgba(255,218,208,.24),transparent_28%),radial-gradient(circle_at_82%_36%,rgba(143,128,190,.15),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,.08)_64%,#f4f4ef_100%)]" />

      <header className="fixed left-1/2 top-5 z-50 flex h-[62px] w-[calc(100%-2rem)] max-w-[720px] -translate-x-1/2 items-center justify-between rounded-[1.65rem] border border-white/12 bg-[#111016]/48 px-3.5 shadow-[0_18px_55px_rgba(22,12,20,.18),inset_0_1px_0_rgba(255,255,255,.08)] backdrop-blur-2xl backdrop-saturate-150 sm:px-5">
        <Link to="/" aria-label="Obseri home" className="inline-flex items-center">
          <img src="/obseri-logo-light.svg" alt="Obseri" className="h-6 w-auto sm:h-7" />
        </Link>
        <nav className="hidden items-center gap-8 text-[11px] font-medium text-white/42 md:flex">
          <a href="#how" className="transition duration-200 hover:text-white">
            How it works
          </a>
          <a href="#studio" className="transition duration-200 hover:text-white">
            Soul Studio
          </a>
          <a href="#trust" className="transition duration-200 hover:text-white">
            Trust
          </a>
        </nav>
        <Link
          to="/app"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#f8f6f2] px-4 text-[11px] font-semibold text-[#17171a] shadow-[0_8px_22px_rgba(0,0,0,.18),inset_0_1px_0_white] transition duration-200 hover:bg-white hover:shadow-[0_10px_28px_rgba(255,255,255,.16)] sm:px-5"
        >
          Open Studio <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex min-h-[820px] w-full min-w-0 max-w-[1500px] flex-col items-center justify-center px-6 pb-36 pt-24 text-center sm:min-h-[860px] sm:pb-40 lg:min-h-[900px] lg:px-10 lg:pb-48">
        <img src="/obseri-pulse-mark.svg" alt="" className="mb-7 h-10 w-10" />
        <h1 className="w-full min-w-0 max-w-[1100px] [font-family:Baskerville,'Iowan_Old_Style','Palatino_Linotype','Times_New_Roman',serif] text-[clamp(2.85rem,4.4vw,4.65rem)] font-normal leading-[0.98] tracking-[-0.045em]">
          Make every visit a <span className="text-[#a4314a]">LEAD.</span>
        </h1>
        <p className="mt-5 w-full min-w-0 max-w-[620px] text-[14px] leading-7 text-black/52 sm:text-[17px]">
          A voice and chat agent trained on your website—built to answer, qualify, and convert.
        </p>

        <form
          action="/app"
          method="get"
          className="group relative mt-7 w-full min-w-0 max-w-[700px]"
        >
          <label
            htmlFor="quick-start-url"
            className="mb-2.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-black/42"
          >
            Your website URL
          </label>
          <div className="flex min-w-0 flex-col gap-2 rounded-[1.7rem] border border-white/90 bg-[#fffaf5]/72 p-2 shadow-[0_24px_70px_rgba(94,43,53,.12),inset_0_1px_0_rgba(255,255,255,.98)] backdrop-blur-2xl transition-[border-color,box-shadow,transform] duration-300 group-focus-within:-translate-y-0.5 group-focus-within:border-[#ff5c7a]/55 group-focus-within:shadow-[0_28px_85px_rgba(94,43,53,.15),0_0_0_4px_rgba(255,92,122,.10),0_0_55px_rgba(255,92,122,.24),inset_0_1px_0_rgba(255,255,255,.98)] sm:flex-row sm:items-center sm:rounded-full">
            <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 sm:px-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/[0.06] bg-white/65 text-black/35 transition duration-300 group-focus-within:border-[#ff5c7a]/35 group-focus-within:bg-[#fff7f5] group-focus-within:text-[#d94763]">
                <Globe2 className="h-4 w-4" />
              </span>
              <input
                id="quick-start-url"
                name="url"
                type="url"
                required
                autoComplete="url"
                placeholder="Enter your website URL"
                className="h-10 w-full min-w-0 bg-transparent text-[15px] text-[#17171a] outline-none selection:bg-[#ff5c7a]/25 placeholder:text-black/32"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-14 shrink-0 items-center justify-center gap-3 rounded-[1.2rem] bg-[#17171a] px-7 text-[12px] font-bold text-white shadow-[0_10px_30px_rgba(21,21,24,.16)] transition-[background-color,box-shadow,transform] duration-300 hover:-translate-y-px hover:bg-[#ff5c7a] hover:shadow-[0_12px_34px_rgba(255,92,122,.28)] active:translate-y-0 sm:min-w-[170px] sm:rounded-full"
            >
              Build its soul
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </button>
          </div>
        </form>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[12] h-28 bg-[linear-gradient(to_bottom,transparent,#f4f4ef)]" />
    </section>
  );
}
