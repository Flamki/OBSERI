import { expect, it, vi } from "vitest";
import { partialAnswer, readChatResponse } from "./chat-stream";

it("decodes an answer at every token boundary without leaking metadata or broken escapes", () => {
  const answer = 'Hello "Ayush".\nCafé 👋';
  const json = '{"answer":"Hello \\"Ayush\\".\\nCafé \\ud83d\\udc4b","citationIds":["private-id"]}';
  for (let length = 0; length <= json.length; length += 1) {
    const draft = partialAnswer(json.slice(0, length));
    expect(answer.startsWith(draft)).toBe(true);
    expect(draft).not.toMatch(/[\uD800-\uDBFF]$/);
  }
  expect(partialAnswer(json)).toBe(answer);
  expect(partialAnswer('{"reasoning":"secret","answer":"Hello"}')).toBe("");
});

it("renders a partial answer before completion and returns authoritative final sources", async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream = controller;
    },
  });
  const encoder = new TextEncoder();
  const update = vi.fn();
  const pending = readChatResponse(
    new Response(body, { headers: { "content-type": "application/x-ndjson" } }),
    update,
  );
  const first = encoder.encode('{"type":"answer","text":"Café"}\n');
  for (const byte of first) stream.enqueue(new Uint8Array([byte]));
  await vi.waitFor(() => expect(update).toHaveBeenCalledWith("Café"));
  const result = {
    answer: "Café is open.",
    citations: [],
    followUp: "",
    leadIntent: "none",
    mode: "model",
  };
  stream.enqueue(encoder.encode(JSON.stringify({ type: "result", result })));
  stream.close();
  await expect(pending).resolves.toEqual(result);
});

it("does not treat a truncated or failed draft as a completed response", async () => {
  for (const ending of ["", '{"type":"error","message":"Try again"}\n']) {
    const response = new Response('{"type":"answer","text":"Partial"}\n' + ending, {
      headers: { "content-type": "application/x-ndjson" },
    });
    await expect(readChatResponse(response, vi.fn())).rejects.toThrow();
  }
});
