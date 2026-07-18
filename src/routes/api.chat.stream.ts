import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { streamSoulVoiceAnswer } from "@/lib/conversation";
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

export const Route = createFileRoute("/api/chat/stream")({
  server: {
    handlers: {
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
          let result: Awaited<ReturnType<typeof streamSoulVoiceAnswer>>;
          try {
            result = await streamSoulVoiceAnswer(access.input);
          } catch (error) {
            await finalizeUsage(reservation.reservationId, false);
            throw error;
          }
          const encoder = new TextEncoder();
          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              controller.enqueue(
                encoder.encode(
                  `${JSON.stringify({
                    type: "meta",
                    citations: result.citations,
                    followUp: result.followUp,
                    leadIntent: result.leadIntent,
                    mode: result.mode,
                  })}\n`,
                ),
              );
              const reader = result.stream.getReader();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  controller.enqueue(
                    encoder.encode(`${JSON.stringify({ type: "delta", text: value })}\n`),
                  );
                }
                controller.enqueue(encoder.encode(`${JSON.stringify({ type: "done" })}\n`));
                await finalizeUsage(reservation.reservationId, true);
                controller.close();
              } catch (error) {
                await finalizeUsage(reservation.reservationId, false);
                controller.enqueue(
                  encoder.encode(
                    `${JSON.stringify({
                      type: "error",
                      message: error instanceof Error ? error.message : "Voice stream interrupted.",
                    })}\n`,
                  ),
                );
                controller.close();
              } finally {
                reader.releaseLock();
              }
            },
          });
          return new Response(stream, {
            headers: {
              "content-type": "application/x-ndjson; charset=utf-8",
              "cache-control": "no-store, no-transform",
              "x-accel-buffering": "no",
              "x-content-type-options": "nosniff",
            },
          });
        } catch (error) {
          if (error instanceof SyntaxError)
            return errorResponse("Request body must be JSON.", 400, "invalid_json");
          if (error instanceof ChatAccessError)
            return errorResponse(error.message, error.status, "chat_access_denied");
          if (error instanceof BillingStoreError)
            return errorResponse(error.message, error.status, error.code);
          console.error("soul_voice_stream_failed", error);
          return errorResponse("The soul could not answer right now.", 500, "voice_stream_failed");
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
