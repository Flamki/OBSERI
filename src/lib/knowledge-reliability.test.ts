import { afterEach, describe, expect, it, vi } from "vitest";
import { activeKnowledgeChunks, splitKnowledgeText } from "./knowledge-content";
import { addApprovedAnswer } from "./knowledge-corrections";
import { sourceRefreshDue } from "./knowledge-refresh";
import { answerSoulQuestion, rankKnowledgeChunks, selectRequestChunks } from "./conversation";
import { createSoul, createWebsiteSource, mergeSourceCrawl, type KnowledgePage } from "./soul";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const root = "https://merchant.example";
function page(index: number, text = `Service description number ${index}.`): KnowledgePage {
  return {
    id: `page-${index}`,
    sourceId: createWebsiteSource(root).id,
    url: `${root}/${index}`,
    title: `Page ${index}`,
    description: "",
    content: text,
    hash: `${index}`,
    wordCount: 5,
    capturedAt: new Date().toISOString(),
    status: "ready",
    enabled: true,
    chunks: [
      {
        id: `chunk-${index}`,
        pageUrl: `${root}/${index}`,
        pageTitle: `Page ${index}`,
        text,
        order: 0,
        tokenEstimate: 10,
      },
    ],
  };
}

describe("knowledge coverage and retrieval", () => {
  it("keeps short facts, oversized paragraphs and the document tail in bounded Unicode-safe passages", () => {
    const text =
      "Price: $29.\n" +
      "A long document about our service. ".repeat(2500) +
      "🚀 End: cancellations take effect immediately.";
    const chunks = splitKnowledgeText(text);
    expect(chunks.length).toBeGreaterThan(40);
    expect(chunks[0]).toContain("Price: $29.");
    expect(chunks.at(-1)).toContain("End: cancellations take effect immediately.");
    expect(chunks.every((chunk) => chunk.length <= 1200)).toBe(true);
    expect(splitKnowledgeText("$29")).toEqual(["$29"]);
    expect(
      splitKnowledgeText("🚀".repeat(2000)).every(
        (chunk) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk),
      ),
    ).toBe(true);
  });
  it("searches late pages and excludes disabled pages and paused sources", () => {
    const knowledge = createSoul(root).knowledge;
    const paused = { ...createWebsiteSource("https://paused.example"), status: "paused" as const };
    knowledge.sources = [createWebsiteSource(root), paused];
    knowledge.pages = Array.from({ length: 300 }, (_, index) => page(index));
    knowledge.pages.push(page(301, "Refunds are available for 14 days."));
    knowledge.pages.push({ ...page(302, "Refunds are never available."), enabled: false });
    knowledge.pages.push({ ...page(303, "Refunds take 80 days."), sourceId: paused.id });
    const chunks = activeKnowledgeChunks(knowledge);
    expect(chunks).toHaveLength(301);
    const request = selectRequestChunks(
      [{ role: "visitor", content: "What is your refund policy?" }],
      chunks,
    );
    expect(request.some((chunk) => chunk.text.includes("14 days"))).toBe(true);
    expect(
      request.some(
        (chunk) => chunk.text.includes("never available") || chunk.text.includes("80 days"),
      ),
    ).toBe(false);
    expect(request.every((chunk) => chunk.text.length > 0 && chunk.text.length <= 1300)).toBe(true);
  });
  it("recovers legacy text after previously truncated passages", () => {
    const knowledge = createSoul(root).knowledge;
    knowledge.pages = [
      page(1, "Old captured text ".repeat(4000) + "Final cancellation policy: no notice required."),
    ];
    knowledge.pages[0].chunks[0].text = "Old captured text";
    const chunks = activeKnowledgeChunks(knowledge);
    expect(chunks.at(-1)?.text).toContain("no notice required");
    expect(chunks.every((chunk) => chunk.text.length <= 1200)).toBe(true);
  });
  it("matches common customer vocabulary without unrelated portfolio matches", () => {
    const chunks = [page(1, "Pricing starts at $29 per month.").chunks[0]];
    expect(rankKnowledgeChunks("What does it cost?", chunks)).toHaveLength(1);
    expect(rankKnowledgeChunks("what's the US", chunks)).toHaveLength(0);
  });
  it("keeps an approved answer with its question in model evidence and in provider outages", async () => {
    const soul = createSoul(root);
    const question = "What is the cancellation notice?";
    soul.knowledge = addApprovedAnswer(soul.knowledge, question, "Seven days before renewal.");
    const input = {
      soulId: soul.id,
      personality: soul.personality,
      chunks: activeKnowledgeChunks(soul.knowledge),
      messages: [{ role: "visitor" as const, content: question }],
    };
    vi.stubEnv("OBSERI_CHAT_API_URL", "https://provider.example");
    vi.stubEnv("OBSERI_CHAT_MODEL", "model");
    const fetch = vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    const result = await answerSoulQuestion(input);
    expect(
      JSON.parse(JSON.parse(fetch.mock.calls[0][1].body).messages[1].content).evidence[0].text,
    ).toContain("Seven days before renewal.");
    expect(result.answer).toBe("Seven days before renewal.");
    expect(result.citations).toEqual([]);
  });
});

describe("approved answer corrections", () => {
  it("replaces the same question instead of retaining conflicting approved facts", () => {
    const initial = addApprovedAnswer(
      createSoul(root).knowledge,
      "When can I cancel?",
      "Seven days before renewal.",
    );
    const updated = addApprovedAnswer(
      initial,
      "When can I cancel?",
      "Cancel any time before renewal.",
    );
    expect(updated.pages).toHaveLength(initial.pages.length);
    expect(updated.sources).toHaveLength(initial.sources!.length);
    expect(updated.pages.at(-1)?.revision).toBe(2);
    const evidence = activeKnowledgeChunks(updated)
      .map((chunk) => chunk.text)
      .join(" ");
    expect(evidence).toContain("Cancel any time before renewal.");
    expect(evidence).not.toContain("Seven days before renewal.");
  });
});

describe("refresh safety", () => {
  it("retains unchanged, disabled and manually edited pages on refresh", () => {
    const source = { ...createWebsiteSource(root), autoRemoveMissing: true };
    const current = {
      ...createSoul(root).knowledge,
      sources: [source],
      pages: [page(1), { ...page(2), enabled: false }, { ...page(3), manualOverride: true }],
    };
    const crawl = {
      ...createSoul(root).knowledge,
      pages: [{ ...page(2, "Updated content"), hash: "changed" }, page(3, "Overwritten content")],
      unchangedUrls: [page(1).url],
    };
    const result = mergeSourceCrawl(current, crawl, source);
    expect(result.status).toBe("ready");
    expect(result.pages.find((p) => p.id === "page-2")?.enabled).toBe(false);
    expect(result.pages.find((p) => p.id === "page-3")?.content).toBe(page(3).content);
    const unchanged = mergeSourceCrawl(
      current,
      { ...crawl, pages: [], unchangedUrls: current.pages.map((p) => p.url) },
      source,
    );
    expect(unchanged.status).toBe("ready");
    expect(unchanged.pages).toHaveLength(3);
  });
  it("does not delete pages omitted by a bounded crawl; explicit missing pages respect manual overrides", () => {
    const source = { ...createWebsiteSource(root), autoRemoveMissing: true };
    const current = {
      ...createSoul(root).knowledge,
      sources: [source],
      pages: [page(1), page(2), { ...page(3), manualOverride: true }],
    };
    const crawl = {
      ...createSoul(root).knowledge,
      pages: [],
      errors: [
        { url: page(2).url, message: "HTTP 404" },
        { url: page(3).url, message: "HTTP 410" },
      ],
    };
    expect(mergeSourceCrawl(current, crawl, source).pages.map((p) => p.id)).toEqual([
      "page-1",
      "page-3",
    ]);
    expect(
      mergeSourceCrawl(
        current,
        { ...crawl, errors: [{ url: root, message: "Network timeout" }] },
        source,
      ).pages,
    ).toHaveLength(3);
  });
  it("honors daily, weekly, monthly and paused/manual refresh settings", () => {
    const source = { ...createWebsiteSource(root), lastCrawledAt: "2026-10-01T00:00:00Z" };
    const now = Date.parse("2026-10-09T00:00:00Z");
    expect(sourceRefreshDue({ ...source, cadence: "daily" }, now)).toBe(true);
    expect(sourceRefreshDue({ ...source, cadence: "weekly" }, now)).toBe(true);
    expect(sourceRefreshDue({ ...source, cadence: "monthly" }, now)).toBe(false);
    expect(sourceRefreshDue({ ...source, cadence: "daily", status: "paused" }, now)).toBe(false);
    expect(sourceRefreshDue({ ...source, cadence: "manual" }, now)).toBe(false);
    // The worker excludes recently edited workspaces, so interrupted crawls can recover later.
    expect(sourceRefreshDue({ ...source, cadence: "daily", status: "crawling" }, now)).toBe(true);
  });
});
