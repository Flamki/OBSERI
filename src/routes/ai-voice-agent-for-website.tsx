import { createFileRoute } from "@tanstack/react-router";
import SeoProductPage from "@/components/SeoProductPage";

const canonicalUrl = "https://obseri.com/ai-voice-agent-for-website";
const title = "AI Voice Agent for Your Website | Obseri";
const description =
  "Add a natural AI voice agent to your website. Obseri learns your content, answers with grounded knowledge, supports text chat, and embeds with one script.";

export const Route = createFileRoute("/ai-voice-agent-for-website")({
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
  component: VoiceAgentPage,
});

function VoiceAgentPage() {
  return (
    <SeoProductPage
      eyebrow="AI voice agent for websites"
      title="A voice agent that actually knows your website."
      introduction="Obseri turns your existing website into a conversational voice and text assistant. Visitors can ask natural questions, hear useful answers, and move through your product without searching page by page."
      proofPoints={[
        "Grounded in your website content",
        "Voice and text in one assistant",
        "Test before placing it on your site",
      ]}
      sectionTitle="A real website assistant, not a talking FAQ."
      sectionIntroduction="The voice is only the interface. Obseri first builds a structured knowledge layer from your website, then applies your chosen personality, boundaries, and delivery rules to every conversation."
      benefits={[
        {
          title: "Knows the current site",
          body: "Obseri discovers important pages, extracts useful content, removes duplicates, and keeps source URLs attached so answers can be checked.",
        },
        {
          title: "Sounds like your brand",
          body: "Choose the agent's name, role, tone, greeting, behavioral boundaries, escalation style, and voice instead of accepting a generic assistant.",
        },
        {
          title: "Works beyond voice",
          body: "Every voice experience includes text chat, citations, lead intent, conversation review, and webhook delivery to the systems your team already uses.",
        },
      ]}
      steps={[
        {
          title: "Give it your URL",
          body: "The crawler maps your public website, follows crawl policy, discovers important pages, and creates searchable knowledge blocks.",
        },
        {
          title: "Shape the agent",
          body: "Set personality and voice, define what it should never invent, and decide when a visitor should be escalated to your team.",
        },
        {
          title: "Test and embed",
          body: "Preview the assistant over your real website, test retrieval quality, then publish one isolated widget script to your domain.",
        },
      ]}
      useCaseTitle="Useful anywhere visitors need a quick, human answer."
      useCases={[
        {
          title: "Product discovery",
          body: "Explain features, compare plans, answer compatibility questions, and guide visitors toward the page or option that fits their goal.",
        },
        {
          title: "Customer support",
          body: "Handle repeat questions from documentation and policies while staying honest when the website does not contain the answer.",
        },
        {
          title: "Lead qualification",
          body: "Recognize buying intent, collect details with consent, and send signed conversation events to a CRM or automation endpoint.",
        },
        {
          title: "Accessible browsing",
          body: "Let visitors speak instead of navigating complex menus, while keeping a full text path available when voice is not appropriate.",
        },
      ]}
      questions={[
        {
          question: "Does the voice agent answer from my website?",
          answer:
            "Yes. Obseri retrieves relevant website knowledge for each turn and can return the supporting source. If the answer is missing, the agent follows the unknown-answer behavior you configure.",
        },
        {
          question: "Can visitors type instead of talking?",
          answer:
            "Yes. The same embedded experience supports voice and text, so visitors can switch based on their device, environment, or accessibility preference.",
        },
        {
          question: "Will it slow down my website?",
          answer:
            "The widget loads asynchronously and remains isolated from the host page. Production voice uses streaming providers and browser speech remains available as a lightweight fallback.",
        },
        {
          question: "Can I hear and test it before publishing?",
          answer:
            "Yes. Soul Studio renders your website inside a full preview so you can test conversations, voice, launcher placement, appearance, and knowledge retrieval first.",
        },
      ]}
      relatedHref="/ai-chatbot-trained-on-your-website"
      relatedLabel="Explore the website-trained chatbot"
    />
  );
}
