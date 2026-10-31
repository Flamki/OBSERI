import { splitKnowledgeText } from "./knowledge-content";
import type { KnowledgeBase, KnowledgeSource } from "./soul";

export function addApprovedAnswer(
  knowledge: KnowledgeBase,
  question: string,
  answer: string,
): KnowledgeBase {
  const q = question.trim();
  const a = answer.trim();
  if (!q || q.length > 4000 || a.length < 10 || a.length > 8000)
    throw new Error("Add a question and an answer between 10 and 8,000 characters.");
  const now = new Date().toISOString();
  const previous = knowledge.pages.find(
    (page) =>
      page.sourceId?.startsWith("answer-") &&
      page.content?.split("\nApproved answer: ")[0] === `Question: ${q}`,
  );
  const id = previous?.id ?? crypto.randomUUID();
  const source: KnowledgeSource = {
    id: `answer-${id}`,
    type: "manual",
    name: q.slice(0, 100),
    rootUrl: `manual://${id}`,
    status: "ready",
    pageLimit: 1,
    crawlDepth: 0,
    cadence: "manual",
    includePatterns: [],
    excludePatterns: [],
    autoRemoveMissing: false,
    createdAt: now,
  };
  const content = `Question: ${q}\nApproved answer: ${a}`;
  return {
    ...knowledge,
    status: "ready",
    sources: [...(knowledge.sources ?? []).filter((item) => item.id !== source.id), source],
    pages: [
      ...knowledge.pages.filter((page) => page.id !== id),
      {
        id,
        sourceId: source.id,
        url: source.rootUrl,
        title: q.slice(0, 300),
        description: "Owner-approved answer",
        hash: id,
        wordCount: content.split(/\s+/).length,
        capturedAt: now,
        updatedAt: now,
        status: "ready",
        enabled: true,
        manualOverride: true,
        revision: (previous?.revision ?? 0) + 1,
        changeType: "manual",
        content,
        chunks: splitKnowledgeText(a, 750).map((text, order) => ({
          id: `${id}-${order}`,
          sourceId: source.id,
          pageUrl: source.rootUrl,
          pageTitle: q.slice(0, 300),
          text: `Question: ${q.slice(0, 400)}\nApproved answer: ${text}`,
          order,
          tokenEstimate: Math.ceil((text.length + Math.min(q.length, 400) + 30) / 4),
        })),
      },
    ],
  };
}
