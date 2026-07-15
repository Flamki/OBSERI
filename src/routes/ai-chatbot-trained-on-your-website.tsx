import { createFileRoute } from "@tanstack/react-router";
import SeoProductPage from "@/components/SeoProductPage";

const canonicalUrl = "https://obseri.com/ai-chatbot-trained-on-your-website";
const title = "AI Chatbot Trained on Your Website Content | Obseri";
const description =
  "Create an AI chatbot trained on your website content. Obseri crawls pages, preserves sources, refreshes changes, tests retrieval, and adds voice when you want it.";

export const Route = createFileRoute("/ai-chatbot-trained-on-your-website")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
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
          "@type": "WebPage",
          "@id": `${canonicalUrl}#webpage`,
          url: canonicalUrl,
          name: title,
          description,
          isPartOf: { "@id": "https://obseri.com/#website" },
          about: { "@id": "https://obseri.com/#software" },
          inLanguage: "en",
        },
      },
    ],
    links: [{ rel: "canonical", href: canonicalUrl }],
  }),
  component: WebsiteChatbotPage,
});

function WebsiteChatbotPage() {
  return (
    <SeoProductPage
      eyebrow="AI chatbot trained on your website"
      title="Your website becomes the chatbot’s source of truth."
      introduction="Obseri crawls the pages you already maintain and turns them into a searchable, inspectable knowledge base. The resulting assistant answers from that evidence instead of hiding everything behind vague AI training."
      proofPoints={[
        "Visible pages, blocks, and citations",
        "Incremental refresh when content changes",
        "Retrieval testing before launch",
      ]}
      sectionTitle="Know exactly what the chatbot learned—and what it did not."
      sectionIntroduction="Most website chatbot tools collapse ingestion into a progress spinner. Obseri exposes discovered pages, extracted content, revisions, crawl activity, errors, and the knowledge blocks used during retrieval."
      benefits={[
        {
          title: "Advanced website discovery",
          body: "The crawler respects robots.txt, finds sitemaps and canonical URLs, prioritizes useful pages, blocks private-network targets, and records page-level failures.",
        },
        {
          title: "Clean, traceable knowledge",
          body: "Navigation noise and duplicate content are reduced before chunking. Every searchable block remains connected to its page and source URL.",
        },
        {
          title: "Fresh without relearning",
          body: "Conditional requests, content hashes, and revision history identify real changes so a refresh can preserve stable knowledge and update only what moved.",
        },
      ]}
      steps={[
        {
          title: "Crawl the public site",
          body: "Start with one URL. Obseri checks crawl rules, discovers important pages, and shows each stage instead of leaving you at an unexplained loading screen.",
        },
        {
          title: "Inspect and test retrieval",
          body: "Search learned pages, open extracted content, add manual knowledge, and ask test questions to see which sources the assistant would use.",
        },
        {
          title: "Publish with guardrails",
          body: "Define unknown-answer behavior, escalation, personality, and voice, then embed the tested assistant with a small asynchronous script.",
        },
      ]}
      useCaseTitle="Built for questions scattered across real websites."
      useCases={[
        {
          title: "SaaS product and pricing",
          body: "Answer questions across feature pages, pricing, documentation, integrations, trust content, onboarding material, and release notes.",
        },
        {
          title: "Documentation search",
          body: "Turn long technical guides into conversational retrieval while preserving direct links to the page that supports each answer.",
        },
        {
          title: "Service businesses",
          body: "Explain services, availability, process, policies, and next steps without forcing visitors to understand the site structure first.",
        },
        {
          title: "Frequently changing content",
          body: "Refresh product information, schedules, policies, and documentation while retaining revision history and visibility into what changed.",
        },
      ]}
      questions={[
        {
          question: "How does Obseri train a chatbot on my website?",
          answer:
            "Obseri does retrieval-based knowledge ingestion rather than retraining a foundation model. It discovers pages, extracts useful content, creates searchable blocks, and retrieves relevant evidence for each visitor question.",
        },
        {
          question: "Can I see the content it collected?",
          answer:
            "Yes. Soul Studio exposes the source, individual documents, extracted content, block counts, crawl status, revisions, and retrieval results so you can audit the knowledge base.",
        },
        {
          question: "What happens when my website changes?",
          answer:
            "Refresh uses validators and content hashes to recognize unchanged pages and create revisions for meaningful updates. You can inspect the resulting crawl activity and page state.",
        },
        {
          question: "Can the chatbot invent answers outside my content?",
          answer:
            "You can require grounded behavior and define exactly how the agent responds when retrieval does not contain enough evidence. The test lab lets you evaluate this before publishing.",
        },
      ]}
      relatedHref="/ai-voice-agent-for-website"
      relatedLabel="Explore the AI voice agent"
    />
  );
}
