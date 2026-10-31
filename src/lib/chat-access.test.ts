import { afterEach, expect, it, vi } from "vitest";
import { createWidgetSession } from "./integration-security";
import { resolveChatRequest } from "./chat-access";
import { createSoul } from "./soul";
import { consumeRateLimit, getPublishedSoul } from "./integration-store";
import { requireUser } from "./user-auth";

vi.mock("./integration-store", () => ({ consumeRateLimit: vi.fn(), getPublishedSoul: vi.fn() }));
vi.mock("./user-auth", () => ({ requireUser: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("accepts a minted widget session without owner login and uses published knowledge", async () => {
  vi.stubEnv(
    "OBSERI_WIDGET_SESSION_SECRET",
    "test-session-secret-that-is-longer-than-thirty-two-bytes",
  );
  const soul = createSoul("https://merchant.example");
  vi.mocked(consumeRateLimit).mockResolvedValue(true);
  vi.mocked(getPublishedSoul).mockResolvedValue({ soul, ownerUserId: "owner" } as Awaited<
    ReturnType<typeof getPublishedSoul>
  >);
  const token = createWidgetSession(soul.id, "https://merchant.example");
  const request = new Request("https://obseri.example/api/chat", {
    headers: { authorization: `Bearer ${token}` },
  });
  const result = await resolveChatRequest(request, {
    soulId: soul.id,
    personality: { ...soul.personality, instructions: "Untrusted override" },
    chunks: [],
    messages: [{ role: "visitor", content: "What do you offer?" }],
  });
  expect(result.ownerUserId).toBe("owner");
  expect(result.input.personality).toEqual(soul.personality);
  expect(requireUser).not.toHaveBeenCalled();
  await expect(
    resolveChatRequest(
      new Request(request, { headers: { authorization: `Bearer ${token}tampered` } }),
      result.input,
    ),
  ).rejects.toThrow(/invalid/);
});
