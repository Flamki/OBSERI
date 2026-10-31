import type { KnowledgeBase, KnowledgeChunk } from "./soul";

/** One eligibility rule for published chat, draft previews and the retrieval lab. */
export function activeKnowledgeChunks(knowledge: KnowledgeBase): KnowledgeChunk[] {
  const paused = new Set(
    (knowledge.sources ?? [])
      .filter((source) => source.status === "paused")
      .map((source) => source.id),
  );
  return knowledge.pages
    .filter((page) => page.enabled !== false && !paused.has(page.sourceId ?? ""))
    .flatMap<KnowledgeChunk>((page) => {
      const content = page.content;
      // Upgrade legacy oversized/truncated passages without requiring another crawl.
      if (
        content &&
        !page.sourceId?.startsWith("answer-") &&
        (page.chunks.some((chunk) => chunk.text.length > 1300) ||
          !page.chunks.at(-1)?.text.includes(content.trim().slice(-80)))
      ) {
        return splitKnowledgeText(content).map((text, order) => ({
          id: `${page.id.slice(0, 75)}-passage-${order}`,
          sourceId: page.sourceId,
          pageUrl: page.url,
          pageTitle: page.title,
          text,
          order,
          tokenEstimate: Math.ceil(text.length / 4),
        }));
      }
      return page.chunks.flatMap((chunk) =>
        chunk.text.length > 1300
          ? splitKnowledgeText(chunk.text).map((text, order) => ({
              ...chunk,
              id: `${chunk.id.slice(0, 75)}-part-${order}`,
              text,
              tokenEstimate: Math.ceil(text.length / 4),
            }))
          : [chunk],
      );
    });
}

/** Bounded, overlapping passages without dropping short facts or the end of long documents. */
export function splitKnowledgeText(value: string, maxLength = 1200): string[] {
  const text = value.replace(/\r\n?/g, "\n").trim();
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLength, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const boundary = Math.max(
        window.lastIndexOf("\n"),
        window.lastIndexOf(". "),
        window.lastIndexOf(" "),
      );
      if (boundary > (maxLength * 2) / 3) end = start + boundary + 1;
      // Never split a UTF-16 surrogate pair.
      if (/^[\uDC00-\uDFFF]$/.test(text[end])) end -= 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === text.length) break;
    let next = Math.max(start + 1, end - 160);
    const boundary = text.indexOf(" ", next);
    if (boundary >= next && boundary < end) next = boundary + 1;
    if (/^[\uDC00-\uDFFF]$/.test(text[next])) next += 1;
    start = next;
  }
  return chunks;
}
