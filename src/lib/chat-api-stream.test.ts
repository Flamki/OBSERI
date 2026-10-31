import { beforeEach, expect, it, vi } from "vitest";
import type { ChatRequest } from "./conversation";
import { createSoul } from "./soul";

const mocks = vi.hoisted(() => ({
  answer: vi.fn(),
  access: vi.fn(),
  reserve: vi.fn(),
  finalize: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@/lib/conversation", () => ({ answerSoulQuestion: mocks.answer }));
vi.mock("@/lib/chat-access", () => ({
  resolveChatRequest: mocks.access,
  ChatAccessError: class extends Error {},
}));
vi.mock("@/lib/billing-store", () => ({
  reserveUsage: mocks.reserve,
  finalizeUsage: mocks.finalize,
  BillingStoreError: class extends Error {},
}));
import { Route } from "../routes/api.chat";
const post = (
  Route as unknown as {
    server: { handlers: { POST: (context: { request: Request }) => Promise<Response> } };
  }
).server.handlers.POST;
const result = {
  answer: "Grounded answer.",
  citations: [],
  followUp: "",
  leadIntent: "none",
  mode: "model",
};
function request() {
  const soul = createSoul("https://merchant.example");
  return new Request("https://obseri.example/api/chat", {
    method: "POST",
    body: JSON.stringify({
      stream: true,
      soulId: soul.id,
      personality: soul.personality,
      chunks: [],
      messages: [{ role: "visitor", content: "What do you offer?" }],
    }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockImplementation(async (_request: Request, input: ChatRequest) => ({
    input,
    ownerUserId: "owner",
  }));
  mocks.reserve.mockResolvedValue({ reservationId: "reservation" });
  mocks.finalize.mockResolvedValue(undefined);
});

it("streams drafts but commits usage before delivering the validated final response", async () => {
  let finish!: () => void;
  mocks.answer.mockImplementation(async (_input, options) => {
    options.onAnswer("Grounded");
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return result;
  });
  const response = await post({ request: request() });
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"answer"');
  expect(mocks.reserve).toHaveBeenCalledWith("owner", "text_responses", 1);
  expect(mocks.finalize).not.toHaveBeenCalled();
  finish();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"result"');
  expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith("reservation", true);
  await reader.cancel();
});

it("cancels the upstream request and releases an unfinished reservation", async () => {
  let signal!: AbortSignal;
  mocks.answer.mockImplementation(async (_input, options) => {
    signal = options.signal;
    options.onAnswer("Partial");
    await new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
    );
  });
  const response = await post({ request: request() });
  const reader = response.body!.getReader();
  await reader.read();
  await reader.cancel();
  expect(signal.aborted).toBe(true);
  await vi.waitFor(() =>
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith("reservation", false),
  );
});
