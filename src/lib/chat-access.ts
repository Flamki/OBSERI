import { activeKnowledgeChunks } from "@/lib/knowledge-content";
import type { ChatRequest } from "@/lib/conversation";
import { consumeRateLimit, getPublishedSoul } from "@/lib/integration-store";
import { readBearerToken, verifyWidgetSession } from "@/lib/integration-security";
import { requireWorkspaceUser as requireUser } from "@/lib/server/team-store";

export async function resolveChatRequest(
  request: Request,
  input: ChatRequest,
): Promise<{ input: ChatRequest; ownerUserId: string | null }> {
  const authorization = request.headers.get("authorization");
  const bearer = authorization ? readBearerToken(request) : "";
  if (bearer.startsWith("obs_sess.")) {
    const session = verifyWidgetSession(bearer, input.soulId);
    const allowed = await consumeRateLimit(`chat:${input.soulId}:${session.origin}`, 30, 60);
    if (!allowed) throw new ChatAccessError("Too many messages. Try again shortly.", 429);
    const record = await getPublishedSoul(input.soulId);
    if (!record) throw new ChatAccessError("This website soul is unavailable.", 404);
    return {
      ownerUserId: record.ownerUserId,
      input: {
        soulId: record.soul.id,
        personality: record.soul.personality,
        chunks: activeKnowledgeChunks(record.soul.knowledge),
        messages: input.messages,
      },
    };
  }

  if (authorization) {
    const user = await requireUser(request);
    const allowed = await consumeRateLimit(`studio-chat:${user.id}`, 40, 60);
    if (!allowed) throw new ChatAccessError("Too many messages. Try again shortly.", 429);
    return { input, ownerUserId: user.id };
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const allowed = await consumeRateLimit(`studio-chat:${ip}`, 20, 60);
  if (!allowed) throw new ChatAccessError("Too many messages. Try again shortly.", 429);
  return { input, ownerUserId: process.env.OBSERI_DEMO_OWNER_USER_ID ?? null };
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
