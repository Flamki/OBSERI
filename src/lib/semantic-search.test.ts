import { afterEach, expect, it, vi } from "vitest";
import { cosineSimilarity, embedTexts, prepareSemanticSearch } from "./server/semantic-search";
import { hybridRankKnowledgeChunks } from "./conversation";
import { createSoul } from "./soul";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const chunks = [
  {
    id: "refunds",
    pageTitle: "Policy",
    pageUrl: "https://example.com/policy",
    text: "Refunds are available within thirty days of purchase.",
    order: 0,
    tokenEstimate: 12,
  },
  {
    id: "hours",
    pageTitle: "Support",
    pageUrl: "https://example.com/support",
    text: "Our office opens at nine each weekday.",
    order: 0,
    tokenEstimate: 12,
  },
];
it("retrieves a paraphrase with no matching keywords and excludes stale chunk IDs", () => {
  const ranked = hybridRankKnowledgeChunks("Can I get my money back?", chunks, {
    refunds: 0.82,
    hours: 0.2,
    deleted: 1,
  });
  expect(ranked[0].id).toBe("refunds");
  expect(ranked[0].lexicalScore).toBe(0);
  expect(ranked.some((c) => c.id === "deleted")).toBe(false);
});
it("handles empty or incompatible vectors without false matches", () => {
  expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
  expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  expect(cosineSimilarity([1], [1, 2])).toBe(0);
});
it("sorts provider results by index and uses the required query prefix", async () => {
  vi.stubEnv("OBSERI_EMBEDDING_API_URL", "https://embedding.example/v1");
  vi.stubEnv("OBSERI_EMBEDDING_API_KEY", "test-only");
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      data: [
        { index: 1, embedding: Array(32).fill(2) },
        { index: 0, embedding: Array(32).fill(1) },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const vectors = await embedTexts(
    ["return policy", "opening hours"],
    "query",
    AbortSignal.timeout(1000),
  );
  expect(vectors[0][0]).toBe(1);
  expect(JSON.parse(fetch.mock.calls[0][1].body).input[0]).toBe("search_query: return policy");
});
it("rejects incomplete provider vectors", async () => {
  vi.stubEnv("OBSERI_EMBEDDING_API_URL", "https://embedding.example/v1");
  vi.stubEnv("OBSERI_EMBEDDING_API_KEY", "test-only");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ data: [{ index: 0, embedding: [1] }] })),
  );
  await expect(embedTexts(["question"], "query", AbortSignal.timeout(1000))).rejects.toThrow(
    "Invalid embedding",
  );
});
it("retains keyword retrieval when embeddings are not configured", async () => {
  vi.stubEnv("OBSERI_EMBEDDING_API_URL", "");
  vi.stubEnv("OBSERI_CHAT_API_URL", "");
  const soul = createSoul("https://example.com");
  const input = {
    soulId: soul.id,
    personality: soul.personality,
    chunks,
    messages: [{ role: "visitor" as const, content: "Refunds policy?" }],
  };
  expect(await prepareSemanticSearch(input, "owner")).toBe(input);
  expect(hybridRankKnowledgeChunks("refunds", chunks)[0].id).toBe("refunds");
});
