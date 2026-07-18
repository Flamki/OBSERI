import type { CrawlProgressEvent } from "@/lib/knowledge";
import type { KnowledgeBase } from "@/lib/soul";
import { authFetch } from "@/lib/auth-client";

export async function streamWebsiteCrawl(
  input: {
    url: string;
    maxPages: number;
    maxDepth: number;
    includePatterns?: string[];
    excludePatterns?: string[];
    validators?: Array<{ url: string; etag?: string; lastModified?: string }>;
  },
  onEvent: (event: CrawlProgressEvent) => void,
): Promise<KnowledgeBase> {
  const response = await authFetch("/api/ingest/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message || "Website crawl could not be started.");
  }
  if (!response.body) throw new Error("The browser could not read crawl progress.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let knowledge: KnowledgeBase | undefined;
  let streamError: string | undefined;

  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as CrawlProgressEvent;
    onEvent(event);
    if (event.knowledge) knowledge = event.knowledge;
    if (event.type === "error") streamError = event.message;
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consume(line);
    if (done) break;
  }
  consume(buffer);

  if (knowledge) return knowledge;
  throw new Error(streamError || "The crawl ended before knowledge was ready.");
}
