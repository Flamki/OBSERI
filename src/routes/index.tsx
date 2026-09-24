import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import LandingPage, { LANDING_FAQ } from "@/components/landing/LandingPage";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Obseri: AI Voice Agent & Website Chatbot" },
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
              slogan: "Make every visit a lead.",
              disambiguatingDescription:
                "Obseri is the website intelligence software platform at obseri.com for building source-grounded AI voice agents and chatbots.",
              logo: {
                "@type": "ImageObject",
                url: "https://obseri.com/obseri-search-logo.png",
                contentUrl: "https://obseri.com/obseri-search-logo.png",
                width: 512,
                height: 512,
              },
              description:
                "Obseri builds source-grounded AI voice agents and website chatbots trained on a business's own content.",
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "sales and customer support",
                email: "flamki@obseri.com",
                availableLanguage: ["English"],
              },
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
              "@type": "Brand",
              "@id": "https://obseri.com/#brand",
              name: "Obseri",
              slogan: "Make every visit a lead.",
              url: "https://obseri.com/",
              logo: "https://obseri.com/obseri-search-logo.png",
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
              brand: { "@id": "https://obseri.com/#brand" },
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "INR",
                url: "https://obseri.com/pricing",
                description: "Start with Obseri's free plan.",
              },
              publisher: { "@id": "https://obseri.com/#organization" },
            },
            {
              "@type": "FAQPage",
              "@id": "https://obseri.com/#faq",
              mainEntity: LANDING_FAQ.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: { "@type": "Answer", text: item.answer },
              })),
            },
          ],
        },
      },
    ],
    links: [
      { rel: "canonical", href: "https://obseri.com/" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const session = authClient.useSession();

  useEffect(() => {
    if (session.data?.user) {
      window.location.replace("/app");
    }
  }, [session.data?.user]);

  if (session.data?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07060a] text-sm text-white/50">
        Opening Soul Studio…
      </div>
    );
  }

  return <LandingPage />;
}
