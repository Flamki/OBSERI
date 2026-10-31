import type { ChatResponse } from "./conversation";

// Only expose the first top-level answer string, never JSON fields or reasoning.
// Incomplete escapes (including surrogate pairs) stay buffered until valid.
export function partialAnswer(json: string): string {
  const start = /^\s*(?:```(?:json)?\s*)?\{\s*"answer"\s*:\s*"/i.exec(json);
  if (!start) return "";
  let raw = "";
  for (let index = start[0].length; index < json.length; index += 1) {
    const char = json[index];
    if (char === '"') break;
    if (char === "\\") {
      const length = json[index + 1] === "u" ? 6 : 2;
      if (index + length > json.length) break;
      raw += json.slice(index, index + length);
      index += length - 1;
    } else {
      raw += char;
    }
  }
  try {
    const answer = JSON.parse(`"${raw}"`) as string;
    return answer.slice(0, 2_000).replace(/[\uD800-\uDBFF]$/, "");
  } catch {
    return "";
  }
}

export type ChatStreamEvent =
  | { type: "answer"; text: string }
  | { type: "result"; result: ChatResponse }
  | { type: "error"; message: string };

export async function readChatResponse(
  response: Response,
  onAnswer: (answer: string) => void,
): Promise<ChatResponse> {
  if (!response.ok || !response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const data = await response.json();
    if (!response.ok || typeof data.answer !== "string") {
      throw new Error(data.error?.message || "The conversation was interrupted.");
    }
    return data as ChatResponse;
  }
  if (!response.body) throw new Error("The conversation was interrupted.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as ChatStreamEvent;
        if (event.type === "answer") onAnswer(event.text);
        if (event.type === "result") return event.result;
        if (event.type === "error") throw new Error(event.message);
      }
      if (done) throw new Error("The answer was interrupted. Please try again.");
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
