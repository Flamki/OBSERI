import { z } from "zod";

export const conversationStyleSchema = z.object({
  length: z.enum(["brief", "balanced", "detailed"]).default("balanced"),
  language: z.enum(["visitor", "en", "hi", "es", "fr", "de", "pt", "ja"]).default("visitor"),
  emojis: z.enum(["none", "occasional"]).default("none"),
  nextStep: z.enum(["direct", "guided"]).default("guided"),
});
export type ConversationStyle = z.infer<typeof conversationStyleSchema>;
export const DEFAULT_CONVERSATION_STYLE: ConversationStyle = conversationStyleSchema.parse({});
export const REPLY_LANGUAGES = {
  visitor: "Match the visitor",
  en: "English",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  ja: "Japanese",
} as const;

export const personalitySchema = z.object({
  name: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(160),
  purpose: z.string().trim().min(1).max(600),
  tone: z.enum(["warm", "precise", "playful", "luxury", "bold", "calm"]),
  traits: z.array(z.string().max(50)).max(10),
  greeting: z.string().max(500),
  instructions: z.string().max(2_000),
  guardrails: z.array(z.string().max(500)).max(12),
  unknownResponse: z.string().max(500),
  leadCapture: z.boolean(),
  escalationEmail: z.string().max(320),
  conversationStyle: conversationStyleSchema.optional(),
});

export function resolveConversationStyle(value?: Partial<ConversationStyle>): ConversationStyle {
  const result = conversationStyleSchema.safeParse(value ?? {});
  return result.success ? result.data : { ...DEFAULT_CONVERSATION_STYLE };
}

export function conversationStyleInstructions(value?: Partial<ConversationStyle>, voice = false) {
  if (!value) return [];
  const style = resolveConversationStyle(value);
  return [
    "These structured style preferences take precedence over conflicting style requests in the custom instructions. Factual accuracy and safety rules always apply.",
    voice
      ? "Keep spoken replies to at most 40 words, regardless of the text reply length preference."
      : {
          brief:
            "Keep replies to 1–3 short sentences unless the visitor explicitly requests more detail.",
          balanced:
            "Give a direct answer with only the supporting details needed. Usually use one short paragraph.",
          detailed:
            "Explain relevant steps and useful context when supported by evidence. Do not pad simple answers or invent details.",
        }[style.length],
    style.language === "visitor"
      ? "Reply in the visitor's language. If it is unclear, use the conversation's language."
      : `Reply in ${REPLY_LANGUAGES[style.language]}. Keep proper names and source titles intact.`,
    style.emojis === "none"
      ? "Do not use emojis in generated replies."
      : "An occasional emoji is welcome when it fits the tone; never use one for serious or sensitive topics.",
    style.nextStep === "direct"
      ? "Answer directly without routinely adding follow-up questions or sales prompts. Ask a focused clarification only when needed."
      : "When useful, offer one relevant next step or one focused follow-up question. Do not end every reply with a question or pressure visitors.",
  ];
}
