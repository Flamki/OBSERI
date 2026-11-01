import { afterEach, expect, it, vi } from "vitest";
import { cosineSimilarity, embedTexts, prepareSemanticSearch } from "./server/semantic-search";
import { hybridRankKnowledgeChunks } from "./conversation";
import { createSoul } from "./soul";
import { createHash } from "node:crypto";

const database = vi.hoisted(() => vi.fn());
const reserve = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("./integration-store", () => ({ integrationDatabase: () => database }));
vi.mock("./server/operation-guards", async (original) => ({
  ...(await original<typeof import("./server/operation-guards")>()),
  reserveEmbeddingCharacters: reserve,
  recordOperation: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  database.mockReset();
  reserve.mockClear();
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

function searchInput() {
  const soul = createSoul("https://example.com");
  return {
    soulId: soul.id,
    personality: soul.personality,
    chunks,
    messages: [{ role: "visitor" as const, content: "What is the refund policy?" }],
  };
}
function configure() {
  vi.stubEnv("OBSERI_EMBEDDING_API_URL", "https://embedding.example/v1");
  vi.stubEnv("OBSERI_EMBEDDING_API_KEY", "test-only");
}
it("does not index documents or spend query budget when no active vectors exist", async () => {
  configure();
  database.mockResolvedValue([]);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const input = searchInput();
  expect(await prepareSemanticSearch(input, "unindexed-owner")).toBe(input);
  expect(database).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  expect(reserve).not.toHaveBeenCalled();
});
it("reads tenant-scoped active hashes and only embeds the query on a reply", async () => {
  configure();
  const contentHash = createHash("sha256")
    .update(`${chunks[0].pageTitle}\n${chunks[0].text}`)
    .digest("hex");
  database.mockResolvedValue([{ content_hash: contentHash, vector: Array(32).fill(1) }]);
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ data: [{ index: 0, embedding: Array(32).fill(1) }] }));
  vi.stubGlobal("fetch", fetch);
  const result = await prepareSemanticSearch(searchInput(), "indexed-owner");
  expect(result.semanticScores?.refunds).toBeCloseTo(1);
  expect(result.semanticScores?.hours).toBeUndefined();
  expect(database).toHaveBeenCalledTimes(1);
  const [sql, owner, model, hashes] = database.mock.calls[0];
  expect(sql.join("?")).toContain("expires_at > now()");
  expect(sql.join("?")).toContain("owner_user_id =");
  expect(owner).toBe("indexed-owner");
  expect(model).toContain("embedding.example");
  expect(hashes).toContain(contentHash);
  expect(fetch).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.input).toHaveLength(1);
  expect(body.input[0]).toMatch(/^search_query:/);
});
it("does not start database or provider work for cancelled replies", async () => {
  configure();
  const controller = new AbortController();
  controller.abort(new Error("Visitor left"));
  await expect(prepareSemanticSearch(searchInput(), "owner", controller.signal)).rejects.toThrow(
    "Visitor left",
  );
  expect(database).not.toHaveBeenCalled();
});
