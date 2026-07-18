import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { answerSoulQuestion } from "@/lib/conversation";
import type { ChatRequest } from "@/lib/conversation";
import { ChatAccessError, resolveChatRequest } from "@/lib/chat-access";
import { BillingStoreError, finalizeUsage, reserveUsage } from "@/lib/billing-store";

const messageSchema = z.object({
  role: z.enum(["visitor", "assistant"]),
  content: z.string().min(1).max(4_000),
});
const chunkSchema = z.object({
  id: z.string().min(1).max(100),
  pageUrl: z.string().url().max(2_048),
  pageTitle: z.string().max(300),
  text: z.string().min(1).max(1_300),
  order: z.number().int().min(0),
  tokenEstimate: z.number().int().min(0).max(10_000),
});
const personalitySchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().min(1).max(160),
  purpose: z.string().min(1).max(600),
  tone: z.enum(["warm", "precise", "playful", "luxury", "bold", "calm"]),
  traits: z.array(z.string().max(50)).max(10),
  greeting: z.string().max(500),
  instructions: z.string().max(2_000),
  guardrails: z.array(z.string().max(500)).max(12),
  unknownResponse: z.string().max(500),
  leadCapture: z.boolean(),
  escalationEmail: z.string().max(320),
});
const schema = z.object({
  soulId: z.string().min(1).max(100),
  personality: personalitySchema,
  chunks: z.array(chunkSchema).max(250),
  messages: z.array(messageSchema).min(1).max(20),
});

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      GET: async () => Response.json({ service: "obseri-soul-chat", status: "ready" }),
      POST: async ({ request }) => {
        try {
          const length = Number(request.headers.get("content-length") ?? "0");
          if (length > 420_000)
            return errorResponse("Knowledge payload is too large.", 413, "payload_too_large");
          const parsed = schema.safeParse(await request.json());
          if (!parsed.success)
            return errorResponse("Invalid conversation request.", 400, "invalid_request");
          const access = await resolveChatRequest(request, parsed.data as ChatRequest);
          const reservation = access.ownerUserId
            ? await reserveUsage(access.ownerUserId, "text_responses", 1)
            : { reservationId: null };
          let committed = false;
          try {
            const result = await answerSoulQuestion(access.input);
            await finalizeUsage(reservation.reservationId, true);
            committed = true;
            return Response.json(result, {
              headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
            });
          } finally {
            if (!committed) await finalizeUsage(reservation.reservationId, false);
          }
        } catch (error) {
          if (error instanceof SyntaxError)
            return errorResponse("Request body must be JSON.", 400, "invalid_json");
          if (error instanceof ChatAccessError)
            return errorResponse(error.message, error.status, "chat_access_denied");
          if (error instanceof BillingStoreError)
            return errorResponse(error.message, error.status, error.code);
          console.error("soul_chat_failed", error);
          return errorResponse("The soul could not answer right now.", 500, "chat_failed");
        }
      },
    },
  },
});

function errorResponse(message: string, status: number, code: string) {
  return Response.json(
    { error: { message, code } },
    { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  );
}
