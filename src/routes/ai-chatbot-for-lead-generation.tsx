import { createFileRoute } from "@tanstack/react-router";
import SeoProductPage from "@/components/SeoProductPage";
import { publicPageHead } from "@/lib/public-page-head";

export const Route = createFileRoute("/ai-chatbot-for-lead-generation")({
  head: () =>
    publicPageHead(
      "/ai-chatbot-for-lead-generation",
      "AI Chatbot for Lead Generation & Website Enquiries | Obseri",
      "Answer service questions, capture contact requests with consent, offer a booking link, and follow up in a shared inbox with Obseri's website AI chatbot.",
    ),
  component: LeadGenerationPage,
});

function LeadGenerationPage() {
  return (
    <SeoProductPage
      eyebrow="AI chatbot for lead generation"
      title="Turn website questions into a next step."
      introduction="A visitor wants to know whether you can help before sharing their email. Obseri answers from your website, offers a contact request or booking link, and keeps the conversation ready for your team to follow up."
      proofPoints={[
        "Contact details shared with permission",
        "Booking links for the next step",
        "A shared inbox with conversation context",
      ]}
      sectionTitle="Answer first. Ask for contact details when they help."
      sectionIntroduction="For agencies, consultants, and service businesses, a useful enquiry starts with understanding the visitor's needs. Configure the assistant around your services and the questions your team can actually answer."
      benefits={[
        {
          title: "Explain your services",
          body: "Use service pages, project examples, FAQs, and text-based PDFs as knowledge. Set boundaries so the assistant asks for clarification instead of making up a price, delivery date, or promise.",
        },
        {
          title: "Offer the right next step",
          body: "Enable or disable the follow-up action, customize its label, and choose contact capture or a booking link such as Cal.com or Google Calendar's appointment page. A booking link opens your scheduler; it does not automatically confirm a meeting in Obseri.",
        },
        {
          title: "Follow up as a team",
          body: "Review the original question, assign conversations, add private notes, and track Open, Waiting, or Resolved status. Workspace permissions control which sections teammates can view or edit.",
        },
      ]}
      steps={[
        {
          title: "Prepare the answers",
          body: "Import your service and contact pages. Test questions about scope, pricing, and availability. Add missing information before putting the assistant in front of visitors.",
        },
        {
          title: "Choose the handoff",
          body: "Write a short, specific action such as 'Discuss my project'. Check the contact form or booking destination in Preview, then publish and install the widget.",
        },
        {
          title: "Measure useful enquiries",
          body: "Review sources, page journeys, conversations, and contact requests in Analytics. Mark qualified or won outcomes after your team confirms them; a chat alone is not a sale.",
        },
      ]}
      useCaseTitle="What a useful conversation looks like."
      useCases={[
        {
          title: "An agency project enquiry",
          body: "A visitor asks whether you build online stores. The assistant points to relevant services and examples, then offers to pass their project details to your team. Your team confirms scope and a quote.",
        },
        {
          title: "A consultant booking",
          body: "A visitor asks which service fits their situation. The assistant explains your published options and offers your appointment link. Availability and confirmation stay with your scheduling provider.",
        },
        {
          title: "A question your site cannot answer",
          body: "A visitor asks for a custom discount or an unpublished delivery date. Set the assistant to explain the gap and offer a human follow-up, rather than inventing a commitment.",
        },
        {
          title: "Finding a page that needs work",
          body: "Repeated questions about the same service reveal unclear website content. Update the source, refresh the knowledge, and test the answer again before judging the effect on enquiries.",
        },
      ]}
      questions={[
        {
          question: "Does a lead generation chatbot guarantee more customers?",
          answer:
            "No. Results depend on relevant traffic, the quality of your offer, accurate answers, and timely follow-up. Obseri helps you observe those steps. Its attribution reports show associations, not proof that the chatbot caused an additional sale.",
        },
        {
          question: "Does it identify every anonymous website visitor?",
          answer:
            "No. A visitor becomes a contact when they choose to share details. Analytics respects the widget's consent configuration and supported privacy signals; it does not turn anonymous traffic into a list of email addresses.",
        },
        {
          question: "Can I use my existing scheduler or CRM?",
          answer:
            "You can set a booking URL for your scheduler. CSV export and signed webhooks can support your follow-up workflow. Webhook delivery requires an endpoint or automation you configure; it is not a native integration with every CRM.",
        },
        {
          question: "Can I try it before choosing a paid plan?",
          answer:
            "Yes. The Free plan supports one website within its published usage limits. Review Pricing for current allowances and team seats. Start with your actual services and test the complete visitor-to-inbox journey.",
        },
      ]}
      relatedHref="/website-chatbot-setup-guide"
      relatedLabel="Read the setup guide"
    />
  );
}
