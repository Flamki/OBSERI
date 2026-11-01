import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { publicPageHead } from "@/lib/public-page-head";

export const Route = createFileRoute("/website-chatbot-setup-guide")({
  head: () =>
    publicPageHead(
      "/website-chatbot-setup-guide",
      "How to Add an AI Chatbot to Your Website | Obseri Setup Guide",
      "A practical guide to importing website content and PDFs, testing answers, installing the Obseri widget, and checking lead capture before you launch.",
    ),
  component: SetupGuide,
});

const sections = [
  {
    id: "prepare",
    title: "Choose the questions it should answer",
    paragraphs: [
      "Start with one job: help visitors understand your services and find the right next step. Gather your service pages, pricing explanation, contact page, and the questions you answer repeatedly. Public pages should contain the facts you want visitors to receive.",
      "Write ten representative questions before importing anything. Include straightforward questions, differently worded versions, an ambiguous request, and a question your site cannot answer. This gives you a useful test set instead of judging the assistant from a single greeting.",
    ],
  },
  {
    id: "knowledge",
    title: "Import and inspect the knowledge",
    paragraphs: [
      "Create a website in Obseri and open Knowledge. Import your public URL, upload a text-based PDF, or add manual knowledge. Review each source's status and extracted text. A successful URL discovery is not proof that the page's useful content was extracted.",
      "Supported JavaScript-rendered pages can be crawled, but login screens, blocked pages, and complex applications may not import correctly. Image-only PDFs need readable text supplied separately. If an import fails or the extracted text is empty, use a public text source or add the essential information manually.",
      "Exclude irrelevant or outdated content. Check prices, dates, contact details, and repeated navigation text. Refresh sources after changing your website, then check the extracted result again.",
    ],
  },
  {
    id: "behavior",
    title: "Set the assistant's behavior and next step",
    paragraphs: [
      "In Personality, choose a name, greeting, tone, and instructions that fit your business. Tell the assistant what to do when information is missing: ask a focused clarification or offer a real contact route. Do not instruct it to guarantee outcomes or invent availability.",
      "Choose chat, voice, or both in the widget customization. Set the brand color, launcher label, and placement. If you enable follow-up, choose contact capture or a booking link and verify the destination. Keep the label specific, such as 'Discuss my project'.",
      "Neural voice runs on the visitor's device. Test your selected voice on desktop and mobile; device capability, model loading, browser permissions, and network conditions affect the experience. Starting a voice conversation requires the visitor's microphone permission.",
    ],
  },
  {
    id: "test",
    title: "Test answers before publishing",
    paragraphs: [
      "Use the knowledge test tools and Preview with your question set. Check whether the answer is supported by a source, whether the source link opens the correct page, and whether the next step is useful. Semantic search can help with different wording; keyword fallback keeps search available when semantic retrieval is unavailable.",
      "Try an unsupported question and a short follow-up such as 'help me then'. The assistant should explain what it can do or ask for the missing detail, rather than repeat a dead-end response. Fix source gaps and instructions, then rerun the same questions. AI answers still need review.",
    ],
  },
  {
    id: "install",
    title: "Publish and install the generated script",
    paragraphs: [
      "Publish the assistant, then copy the complete widget snippet from Install. Add it before the closing body tag in your site's HTML template or use your platform's custom-code setting. Keep the generated website ID, widget token, and settings intact. Do not install the same snippet twice.",
      "On a React or other single-page site, install it once in the shared document shell rather than in every route component. The widget script loads asynchronously. If your site uses a Content Security Policy, allow the widget's required script, frame, and network origins without broadly disabling the policy.",
      "If you use a consent manager, select the consent option in Install and follow the generated integration instructions before enabling analytics. After changing embed options, publish and replace the snippet when Install instructs you to do so.",
    ],
  },
  {
    id: "verify",
    title: "Verify the real visitor-to-inbox journey",
    paragraphs: [
      "Open the published site in a fresh browser session. Check the launcher on desktop and mobile, send a real question, open a source link, and submit a clearly labelled test enquiry with an email you control. Confirm that the request and conversation appear in your workspace.",
      "If the widget does not appear, check that the assistant is published, the snippet belongs to this website, the domain is allowed, and the browser has not blocked the script or frame. If an enquiry is missing, inspect the request status and configured follow-up mode before asking visitors to try again.",
      "For a team, invite a teammate with only the sections they need. Verify their access using their own login. Assign the test conversation and check private notes and status changes. Keep test enquiries separate from the outcomes you report as customer results.",
    ],
  },
];

function SetupGuide() {
  return (
    <div className="min-h-screen bg-[#f4f4ef] text-[#171a17]">
      <header className="border-b border-black/10">
        <nav
          className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6"
          aria-label="Main"
        >
          <Link to="/" aria-label="Obseri home">
            <img src="/obseri-logo-dark.svg" alt="Obseri" className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-5 text-sm">
            <Link to="/pricing">Pricing</Link>
            <Link to="/app" className="rounded-full bg-black px-5 py-3 text-white">
              Open Studio
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#a4314a]">
          Obseri setup guide
        </p>
        <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          How to add an AI chatbot to your website
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-black/70">
          Prepare the knowledge, test the answers, install the widget, and verify the first enquiry.
          This guide follows the Obseri workflow from a public website to a working assistant.
        </p>
        <p className="mt-5 text-sm text-black/65">By the Obseri team · Updated November 1, 2026</p>
        <div className="mt-12 grid items-start gap-12 lg:grid-cols-[240px_1fr]">
          <nav
            aria-label="On this page"
            className="rounded-2xl border border-black/10 bg-white p-6 lg:sticky lg:top-6"
          >
            <h2 className="font-semibold">On this page</h2>
            <ol className="mt-4 space-y-4 text-sm leading-6">
              {sections.map((section, i) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-black/75 underline-offset-4 hover:underline"
                  >
                    {i + 1}. {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="min-w-0">
            <div className="rounded-2xl bg-[#e9e2f0] p-6 text-sm leading-7">
              <strong>Before you start:</strong> you need an Obseri account, permission to add code
              to your site, and accurate source content. Start within your plan's page and usage
              limits.
            </div>
            {sections.map((section, i) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-8 border-b border-black/10 py-10"
              >
                <h2 className="text-2xl font-semibold tracking-tight">
                  {i + 1}. {section.title}
                </h2>
                {section.paragraphs.map((p) => (
                  <p key={p} className="mt-5 leading-8 text-black/75">
                    {p}
                  </p>
                ))}
              </section>
            ))}
            <section className="py-10">
              <h2 className="text-2xl font-semibold">Your first-week review</h2>
              <p className="mt-5 leading-8 text-black/75">
                Review unanswered questions, incorrect citations, voice problems, and contact
                requests daily. Update the sources that caused confusion. Look at traffic sources
                and countries in Analytics, then compare conversations and contact requests. Treat a
                qualified lead or sale as an outcome your team confirms, not an assumption based on
                opening the chat.
              </p>
              <div className="mt-8 flex flex-wrap gap-4 text-sm underline underline-offset-4">
                <Link to="/ai-chatbot-trained-on-your-website">
                  Website knowledge and retrieval
                </Link>
                <Link to="/ai-chatbot-for-lead-generation">Lead capture and handoff</Link>
                <Link to="/ai-voice-agent-for-website">Website voice agents</Link>
              </div>
            </section>
            <Link
              to="/app"
              className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-4 font-semibold text-white"
            >
              Build your assistant <ArrowRight size={18} />
            </Link>
          </article>
        </div>
      </main>
      <footer className="border-t border-black/10 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-5 text-sm">
          <Link to="/about">About obseri.com</Link>
          <a href="mailto:ayush@flamkilabs.com">ayush@flamkilabs.com</a>
        </div>
      </footer>
    </div>
  );
}
