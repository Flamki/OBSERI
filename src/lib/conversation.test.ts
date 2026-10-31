import { afterEach, expect, it, vi } from "vitest";
import { answerSoulQuestion } from "./conversation";
import { createSoul } from "./soul";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("uses low reasoning for GPT OSS and returns the grounded model answer", async () => {
  vi.stubEnv("OBSERI_CHAT_API_URL", "https://api.fireworks.ai/inference/v1");
  vi.stubEnv("OBSERI_CHAT_MODEL", "accounts/fireworks/models/gpt-oss-20b");
  const soul = createSoul("https://merchant.example");
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: "We build websites.",
              citationIds: ["chunk"],
              followUp: "What would you like to build?",
              leadIntent: "medium",
            }),
          },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const result = await answerSoulQuestion({
    soulId: soul.id,
    personality: soul.personality,
    chunks: [
      {
        id: "chunk",
        pageTitle: "Services",
        pageUrl: "https://merchant.example",
        text: "We build websites for businesses.",
        order: 0,
        tokenEstimate: 8,
      },
    ],
    messages: [{ role: "visitor", content: "Do you build websites?" }],
  });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).reasoning_effort).toBe("low");
  expect(result.mode).toBe("model");
  expect(result.answer).toBe("We build websites.");
  expect(result.citations[0].chunkId).toBe("chunk");
});

function fixture(messages: string[] = ["what's the US"]) {
  const soul = createSoul("https://merchant.example");
  return {
    soulId: soul.id,
    personality: soul.personality,
    chunks: [
      {
        id: "cms",
        pageTitle: "Projects",
        pageUrl: "https://merchant.example/projects",
        text: "A custom Admin CMS lets non-technical staff manage the complete listing catalogue without writing code. Deployed with PostgreSQL persistence and JWT authentication.",
        order: 0,
        tokenEstimate: 40,
      },
      {
        id: "swift",
        pageTitle: "Projects",
        pageUrl: "https://merchant.example/projects",
        text: "Diagnosed and fixed a long-standing property-wrapper diagnostic bug in the Swift compiler.",
        order: 1,
        tokenEstimate: 20,
      },
      {
        id: "ui",
        pageTitle: "Projects",
        pageUrl: "https://merchant.example/projects",
        text: "Building something ambitious, debugging something strange, or looking for an engineer? Explored how discovery and collection browsing can live in one playful interface.",
        order: 2,
        tokenEstimate: 30,
      },
    ],
    messages: messages.map((content) => ({ role: "visitor" as const, content })),
  };
}
function provider(answer: string, citationIds: string[] = []) {
  vi.stubEnv("OBSERI_CHAT_API_URL", "https://api.fireworks.ai/inference/v1");
  vi.stubEnv("OBSERI_CHAT_MODEL", "accounts/fireworks/models/gpt-oss-20b");
  const mock = vi.fn().mockResolvedValue(
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({ answer, citationIds, followUp: "", leadIntent: "none" }),
          },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

it("does not confuse filler words, US or UI with unrelated portfolio content", async () => {
  const { rankKnowledgeChunks } = await import("./conversation");
  const { chunks } = fixture();
  expect(rankKnowledgeChunks("what's the US", chunks)).toEqual([]);
  expect(rankKnowledgeChunks("can you say my current UI", chunks)).toEqual([]);
  expect(rankKnowledgeChunks("asking", chunks)).toEqual([]);
  expect(rankKnowledgeChunks("What PostgreSQL projects do you have?", chunks)[0].id).toBe("cms");
  expect(
    rankKnowledgeChunks("Which project uses PostgreSQL?", chunks).map((chunk) => chunk.id),
  ).toContain("cms");
  const acronyms = [
    { ...chunks[0], text: "Our UI supports keyboard navigation. We work with US businesses." },
  ];
  expect(rankKnowledgeChunks("UI", acronyms)).toHaveLength(1);
  expect(rankKnowledgeChunks("US", acronyms)).toHaveLength(1);
});

it("uses the model for ambiguous questions even without retrieved evidence, with no invented citations", async () => {
  const mock = provider("Do you mean the United States, or something on this website?");
  const result = await answerSoulQuestion(fixture());
  expect(result.mode).toBe("model");
  expect(result.citations).toEqual([]);
  const payload = JSON.parse(mock.mock.calls[0][1].body);
  const context = JSON.parse(payload.messages[1].content);
  expect(context.evidence).toEqual([]);
  expect(context.availablePages).toHaveLength(1);
  expect(context.conversation[0].content).toBe("what's the US");
  expect(payload.messages[0].content).toContain("cannot see the visitor's screen");
});

it("keeps conversation history and retrieves the topic of a short follow-up", async () => {
  const mock = provider("The CMS uses PostgreSQL persistence.", ["cms"]);
  const input = fixture();
  const messages: import("./conversation").ChatRequest["messages"] = [
    { role: "visitor", content: "Tell me about PostgreSQL" },
    { role: "assistant", content: "The CMS uses PostgreSQL. Would you like more detail?" },
    { role: "visitor", content: "How about that?" },
  ];
  await answerSoulQuestion({ ...input, messages });
  const context = JSON.parse(JSON.parse(mock.mock.calls[0][1].body).messages[1].content);
  expect(context.evidence[0].id).toBe("cms");
  expect(context.conversation).toEqual(messages);
});

it("does not attach sources to a model clarification, and deduplicates cited pages", async () => {
  provider("Which project do you mean?");
  expect((await answerSoulQuestion(fixture(["projects"]))).citations).toEqual([]);
  provider("The projects include a CMS and a Swift compiler fix.", ["cms", "swift", "unknown-id"]);
  const result = await answerSoulQuestion(fixture(["projects"]));
  expect(result.citations).toHaveLength(1);
  expect(result.citations[0].url).toBe("https://merchant.example/projects");
});

it("turns explicit page recommendations into usable links without exposing internal IDs", async () => {
  provider("You can explore Projects (ID: cms). Which page would you like?");
  const result = await answerSoulQuestion(fixture(["help me find a page"]));
  expect(result.answer).toBe("You can explore Projects. Which page would you like?");
  expect(result.answer).not.toContain("ID:");
  expect(result.citations).toHaveLength(1);
  expect(result.citations[0].url).toBe("https://merchant.example/projects");
});

it("handles provider failures without unrelated excerpts or the repeated help loop", async () => {
  provider("unused");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })));
  const input = fixture();
  const messages: import("./conversation").ChatRequest["messages"] = [];
  for (const question of [
    "what's the US",
    "asking",
    "help me then",
    "ok help me to find",
    "can you say my current UI",
  ]) {
    messages.push({ role: "visitor", content: question });
    const response = await answerSoulQuestion({ ...input, messages });
    expect(response.mode).toBe("retrieval");
    expect(response.answer).not.toBe(input.personality.unknownResponse);
    expect(response.answer).not.toMatch(/PostgreSQL|property-wrapper|Building something/);
    if (question.includes("UI")) {
      expect(response.answer).toContain("can’t see your screen");
      expect(response.citations).toEqual([]);
    }
    if (question.includes("help") || question === "asking")
      expect(response.answer).toContain("Projects");
    messages.push({ role: "assistant", content: response.answer });
  }
});

it("uses only matching sentences and their source when a provider response is empty", async () => {
  provider("   ");
  const response = await answerSoulQuestion(fixture(["PostgreSQL"]));
  expect(response.mode).toBe("retrieval");
  expect(response.answer).toBe("Deployed with PostgreSQL persistence and JWT authentication.");
  expect(response.citations).toHaveLength(1);
  expect(response.citations[0].chunkId).toBe("cms");
});

it("also lets voice clarify without keyword matches and does not invent streaming citations", async () => {
  const { streamSoulVoiceAnswer } = await import("./conversation");
  provider("unused");
  const mock = vi
    .fn()
    .mockResolvedValue(
      new Response(
        'data: {"choices":[{"delta":{"content":"Which part of the website do you mean?"}}]}\n\ndata: [DONE]\n\n',
      ),
    );
  vi.stubGlobal("fetch", mock);
  const result = await streamSoulVoiceAnswer(fixture(["help me then"]));
  const reader = result.stream.getReader();
  expect((await reader.read()).value).toBe("Which part of the website do you mean?");
  expect((await reader.read()).done).toBe(true);
  expect(result.mode).toBe("model");
  expect(result.citations).toEqual([]);
  expect(JSON.parse(mock.mock.calls[0][1].body).max_tokens).toBeGreaterThan(120);
});
