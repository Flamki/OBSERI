import { useState } from "react";
import { authFetch } from "@/lib/auth-client";
import { activeKnowledgeChunks } from "@/lib/knowledge-content";
import { selectRequestChunks, type ChatResponse } from "@/lib/conversation";
import { readChatResponse } from "@/lib/chat-stream";
import type { Soul } from "@/lib/soul";

export function KnowledgeAnswerTest({ soul, question }: { soul: Soul; question: string }) {
  const [result, setResult] = useState<{
    answer: ChatResponse;
    ms: number;
    question: string;
    knowledge: Soul["knowledge"];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function test() {
    setBusy(true);
    setError("");
    setResult(null);
    const started = performance.now();
    const messages = [{ role: "visitor" as const, content: question.trim() }];
    try {
      const response = await authFetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          soulId: soul.id,
          personality: soul.personality,
          messages,
          chunks: selectRequestChunks(messages, activeKnowledgeChunks(soul.knowledge)),
        }),
      });
      const answer = await readChatResponse(response, () => undefined);
      setResult({ answer, ms: performance.now() - started, question, knowledge: soul.knowledge });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The test could not run.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 space-y-3">
      <button
        type="button"
        className="secondary-button w-full text-xs"
        disabled={busy || !question.trim() || question.length > 4000}
        onClick={() => void test()}
      >
        {busy ? "Testing answer…" : "Test answer"}
      </button>
      <p className="text-[11px] text-[#817f79]">
        Uses your draft knowledge and normal message allowance. Publish to update the live
        assistant.
      </p>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
      {result && (
        <div className="rounded-xl border border-[#e6e5e3] bg-[#fafaf9] p-4" aria-live="polite">
          <p className="mb-2 text-[11px] text-[#817f79]">
            {(result.ms / 1000).toFixed(1)}s ·{" "}
            {result.answer.mode === "model" ? "AI answer" : "Evidence fallback"}
            {result.answer.searchMode === "hybrid"
              ? " · Semantic + keyword search"
              : " · Keyword search"}
            {result.question !== question || result.knowledge !== soul.knowledge
              ? " · Draft changed — test again"
              : ""}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-6">{result.answer.answer}</p>
          {result.answer.citations.map((citation) => (
            <a
              className="mt-2 block truncate text-xs underline"
              key={citation.chunkId}
              href={/^https?:\/\//.test(citation.url) ? citation.url : undefined}
              target="_blank"
              rel="noreferrer"
            >
              {citation.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
