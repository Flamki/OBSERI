import { withinDeadline, reserveEmbeddingCharacters, recordOperation } from "./operation-guards";
import { createHash } from "node:crypto";
import { integrationDatabase } from "../integration-store";
import { retrievalQuery, type ChatRequest } from "../conversation";
import type { KnowledgeChunk } from "../soul";

const queryCache = new Map<string, number[]>();
function configuration() {
  const api =
    process.env.OBSERI_EMBEDDING_API_URL ||
    (process.env.OBSERI_CHAT_API_URL?.includes("api.fireworks.ai")
      ? process.env.OBSERI_CHAT_API_URL
      : "");
  const key = process.env.OBSERI_EMBEDDING_API_KEY || process.env.OBSERI_CHAT_API_KEY;
  const model = process.env.OBSERI_EMBEDDING_MODEL || "nomic-ai/nomic-embed-text-v1.5";
  return api && key ? { api: api.replace(/\/$/, ""), key, model } : null;
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const documentText = (chunk: KnowledgeChunk) => `${chunk.pageTitle}\n${chunk.text}`;

export function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

export async function embedTexts(
  texts: string[],
  kind: "document" | "query",
  signal: AbortSignal,
  owner?: string,
): Promise<number[][]> {
  const config = configuration();
  if (!config) throw new Error("Embeddings not configured");
  const input = texts.map((text) =>
    config.model.includes("nomic") ? `search_${kind}: ${text}` : text,
  );
  signal.throwIfAborted();
  if (owner)
    await withinDeadline(
      reserveEmbeddingCharacters(
        owner,
        input.reduce((n, text) => n + text.length, 0),
      ),
      signal,
    );
  signal.throwIfAborted();
  const response = await fetch(`${config.api}/embeddings`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: config.model, input }),
    signal,
  });
  if (!response.ok) throw new Error(`Embedding provider HTTP ${response.status}`);
  const payload = (await response.json()) as {
    data?: Array<{ index: number; embedding: number[] }>;
  };
  const rows = payload.data?.slice().sort((a, b) => a.index - b.index);
  const size = rows?.[0]?.embedding?.length ?? 0;
  if (
    rows?.length !== texts.length ||
    size < 32 ||
    size > 4096 ||
    rows.some(
      (row, i) =>
        row.index !== i ||
        row.embedding.length !== size ||
        row.embedding.some((n) => !Number.isFinite(n)),
    )
  )
    throw new Error("Invalid embedding response");
  return rows.map((row) => row.embedding);
}

/** Read only active content hashes for this tenant and embedding model. Never index on a chat request. */
async function readKnowledgeVectors(owner: string, chunks: KnowledgeChunk[], signal: AbortSignal) {
  const config = configuration();
  if (!config || !chunks.length) return new Map<string, number[]>();
  signal.throwIfAborted();
  const sql = integrationDatabase();
  const model = `${config.api}/${config.model}`;
  const hashes = [...new Set(chunks.map((chunk) => hash(documentText(chunk))))];
  const rows = await withinDeadline(
    sql<Array<{ content_hash: string; vector: number[] }>>`
    select content_hash, vector from obseri_knowledge_vectors
    where owner_user_id = ${owner} and model = ${model} and content_hash = any(${hashes}) and expires_at > now()
  `,
    signal,
  );
  return new Map(rows.map((row) => [row.content_hash, row.vector]));
}

/** Cache only vectors and content hashes, scoped to the owner; source text stays in the workspace. */
export async function indexKnowledge(owner: string, chunks: KnowledgeChunk[], signal: AbortSignal) {
  const config = configuration();
  if (!config || !chunks.length) return new Map<string, number[]>();
  const sql = integrationDatabase();
  const model = `${config.api}/${config.model}`;
  const documents = new Map(
    chunks.map((chunk) => [hash(documentText(chunk)), documentText(chunk)]),
  );
  const vectors = await readKnowledgeVectors(owner, chunks, signal);
  // Scheduled maintenance renews vectors still used by published knowledge.
  if (vectors.size)
    await withinDeadline(
      sql`
    update obseri_knowledge_vectors set expires_at = now() + interval '30 days'
    where owner_user_id = ${owner} and model = ${model} and content_hash = any(${[...vectors.keys()]})
  `,
      signal,
    );
  const missing = [...documents].filter(([key]) => !vectors.has(key));
  for (let start = 0; start < missing.length; start += 32) {
    if (signal.aborted) break;
    const batch = missing.slice(start, start + 32);
    try {
      const result = await embedTexts(
        batch.map(([, text]) => text),
        "document",
        signal,
        owner,
      );
      signal.throwIfAborted();
      await withinDeadline(
        sql`
        insert into obseri_knowledge_vectors ${sql(
          batch.map(([key], i) => ({
            owner_user_id: owner,
            model,
            content_hash: key,
            vector: sql.json(result[i]),
            expires_at: new Date(Date.now() + 30 * 86_400_000),
          })),
          "owner_user_id",
          "model",
          "content_hash",
          "vector",
          "expires_at",
        )}
        on conflict (owner_user_id, model, content_hash) do update set vector = excluded.vector, expires_at = excluded.expires_at
      `,
        signal,
      );
      batch.forEach(([key], i) => vectors.set(key, result[i]));
    } catch (error) {
      if (!signal.aborted)
        console.warn(
          "knowledge_embedding_failed",
          error instanceof Error ? error.message : "Embedding unavailable",
        );
      void recordOperation(owner, "semantic", "fallback", "index_unavailable");
      break;
    }
  }
  return vectors;
}

export async function prepareSemanticSearch(
  input: ChatRequest,
  owner: string | null,
  parentSignal?: AbortSignal,
): Promise<ChatRequest> {
  parentSignal?.throwIfAborted();
  if (!owner || !configuration() || !input.chunks.length) return input;
  const query = retrievalQuery(input.messages);
  if (query.trim().split(/\s+/).length < 2) return input;
  const signal = AbortSignal.any([
    AbortSignal.timeout(3500),
    ...(parentSignal ? [parentSignal] : []),
  ]);
  try {
    const config = configuration()!;
    const cacheKey = hash(`${owner}|${config.api}|${config.model}|${query}`);
    const vectors = await readKnowledgeVectors(owner, input.chunks, signal);
    parentSignal?.throwIfAborted();
    // An unindexed draft or new publication uses keywords immediately. Do not spend
    // time or provider budget embedding a query that cannot be compared to anything.
    if (!vectors.size) return input;
    const queryVector = await withinDeadline(
      queryCache.has(cacheKey)
        ? Promise.resolve(queryCache.get(cacheKey)!)
        : embedTexts([query], "query", signal, owner).then((v) => {
            if (queryCache.size >= 256) queryCache.delete(queryCache.keys().next().value!);
            queryCache.set(cacheKey, v[0]);
            return v[0];
          }),
      signal,
    );
    parentSignal?.throwIfAborted();
    const semanticScores: Record<string, number> = {};
    for (const chunk of input.chunks) {
      const vector = vectors.get(hash(documentText(chunk)));
      if (vector) semanticScores[chunk.id] = cosineSimilarity(queryVector, vector);
    }
    return { ...input, semanticScores };
  } catch (error) {
    parentSignal?.throwIfAborted();
    void recordOperation(owner, "semantic", "fallback", "retrieval_unavailable");
    console.warn(
      "knowledge_semantic_fallback",
      error instanceof Error ? error.message : "Semantic search unavailable",
    );
    return input;
  }
}

export async function warmKnowledgeIndex(
  owner: string,
  chunks: KnowledgeChunk[],
  timeoutMs = 45_000,
) {
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const vectors = await indexKnowledge(owner, chunks, signal);
    await withinDeadline(
      integrationDatabase()`delete from obseri_knowledge_vectors where owner_user_id = ${owner} and expires_at < now()`,
      signal,
    );
    return { indexed: vectors.size, total: new Set(chunks.map((c) => hash(documentText(c)))).size };
  } catch {
    return { indexed: 0, total: chunks.length };
  }
}
