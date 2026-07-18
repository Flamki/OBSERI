import type { ChatRequest } from "@/lib/conversation";
import { consumeRateLimit, getPublishedSoul } from "@/lib/integration-store";
import { readBearerToken, verifyWidgetSession } from "@/lib/integration-security";

export async function resolveChatRequest(
  request: Request,
  input: ChatRequest,
): Promise<ChatRequest> {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const session = verifyWidgetSession(readBearerToken(request), input.soulId);
    const allowed = await consumeRateLimit(`chat:${input.soulId}:${session.origin}`, 30, 60);
    if (!allowed) throw new ChatAccessError("Too many messages. Try again shortly.", 429);
    const record = await getPublishedSoul(input.soulId);
    if (!record) throw new ChatAccessError("This website soul is unavailable.", 404);
    return {
      soulId: record.soul.id,
      personality: record.soul.personality,
      chunks: record.soul.knowledge.pages.flatMap((page) => page.chunks).slice(0, 250),
      messages: input.messages,
    };
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const allowed = await consumeRateLimit(`studio-chat:${ip}`, 20, 60);
  if (!allowed) throw new ChatAccessError("Too many messages. Try again shortly.", 429);
  return input;
}

export class ChatAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ChatAccessError";
  }
}
