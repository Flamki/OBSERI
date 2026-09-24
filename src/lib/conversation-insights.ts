import type { SoulConversation } from "@/lib/soul";

export type ConversationContact = { email?: string; phone?: string };

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// A run of digits with optional "+", spaces, dots, dashes or brackets. Only runs holding
// 7 to 15 digits (the E.164 range) count, so prices and short order numbers do not match.
const PHONE_CANDIDATES = /\+?\d[\d\s().-]{5,}\d/g;

/** Contact details a visitor typed into the conversation, if any. */
export function extractContact(conversation: SoulConversation): ConversationContact {
  const contact: ConversationContact = {};
  for (const message of conversation.messages) {
    if (message.role !== "visitor") continue;
    if (!contact.email) {
      const email = message.content.match(EMAIL_PATTERN)?.[0];
      if (email) contact.email = email.toLowerCase();
    }
    if (!contact.phone) {
      const phone = message.content.match(PHONE_CANDIDATES)?.find((candidate) => {
        const digits = candidate.replace(/\D/g, "").length;
        const looksLikeDate = /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/.test(candidate.trim());
        return digits >= 7 && digits <= 15 && !looksLikeDate;
      });
      if (phone) contact.phone = phone.trim();
    }
  }
  return contact;
}

/** A conversation worth following up: clear buying intent, or the visitor left contact details. */
export function isLead(conversation: SoulConversation): boolean {
  if (conversation.leadIntent === "high" || conversation.leadIntent === "medium") return true;
  const contact = extractContact(conversation);
  return Boolean(contact.email || contact.phone);
}

/** The first thing the visitor asked. */
export function firstQuestion(conversation: SoulConversation): string {
  return conversation.messages.find((message) => message.role === "visitor")?.content.trim() ?? "";
}

/** Most frequent opening questions, case- and punctuation-insensitive, most common first. */
export function topQuestions(
  conversations: SoulConversation[],
  limit = 5,
): Array<{ question: string; count: number }> {
  const counts = new Map<string, { question: string; count: number }>();
  for (const conversation of conversations) {
    const question = firstQuestion(conversation);
    if (!question) continue;
    const key = question
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!key) continue;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { question, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Conversations updated within the last `days` days of `now`. */
export function countSince(conversations: SoulConversation[], days: number, now = Date.now()) {
  const since = now - days * 86_400_000;
  return conversations.filter((conversation) => Date.parse(conversation.updatedAt) >= since).length;
}

/** "just now", "5m ago", "3h ago", "2d ago", or a short date for anything older than a week. */
export function relativeTime(value: string, now = Date.now()): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(time);
}

function csvCell(value: string): string {
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Leads as CSV, one row per conversation, ready for a spreadsheet or CRM import. */
export function leadsToCsv(conversations: SoulConversation[]): string {
  const header = ["Updated", "Intent", "Email", "Phone", "First question", "Messages", "Channel"];
  const rows = conversations.filter(isLead).map((conversation) => {
    const contact = extractContact(conversation);
    return [
      conversation.updatedAt,
      conversation.leadIntent,
      contact.email ?? "",
      contact.phone ?? "",
      firstQuestion(conversation),
      String(conversation.messages.length),
      conversation.channel,
    ];
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// First-person "I don't know" phrasings only, so factual negatives such as
// "We don't have a store in Paris" are not mistaken for missing knowledge.
const UNKNOWN_ANSWER_PATTERNS = [
  /\bi (?:don't|do not) (?:have|know)\b/,
  /\bi(?:'m| am) not sure\b/,
  /\bi (?:couldn't|could not|can't|cannot) find\b/,
  /\bi (?:don't|do not) see (?:that|this|any)\b/,
  /\bnot in my knowledge\b/,
  /\bi'm unable to (?:find|answer)\b/,
];

/** True when an assistant reply says the answer is not in the website's knowledge. */
export function isUnknownAnswer(content: string, unknownResponse?: string): boolean {
  const reply = normalizeText(content);
  if (!reply) return false;
  const fallback = normalizeText(unknownResponse ?? "").slice(0, 48);
  if (fallback.length >= 12 && reply.includes(fallback)) return true;
  return UNKNOWN_ANSWER_PATTERNS.some((pattern) => pattern.test(reply));
}

export type UnansweredQuestion = {
  question: string;
  count: number;
  lastAskedAt: string;
  conversationId: string;
};

/**
 * Visitor questions the agent could not answer, grouped case- and punctuation-insensitively,
 * most frequent first and then most recent.
 */
export function unansweredQuestions(
  conversations: SoulConversation[],
  unknownResponse?: string,
  limit = 20,
): UnansweredQuestion[] {
  const groups = new Map<string, UnansweredQuestion>();
  for (const conversation of conversations) {
    conversation.messages.forEach((message, index) => {
      if (message.role !== "assistant" || !isUnknownAnswer(message.content, unknownResponse)) {
        return;
      }
      const question = conversation.messages
        .slice(0, index)
        .reverse()
        .find((candidate) => candidate.role === "visitor")
        ?.content.trim();
      if (!question) return;
      const key = normalizeText(question);
      if (!key) return;
      const askedAt = message.createdAt || conversation.updatedAt;
      const entry = groups.get(key);
      if (entry) {
        entry.count += 1;
        if (Date.parse(askedAt) > Date.parse(entry.lastAskedAt)) {
          entry.lastAskedAt = askedAt;
          entry.conversationId = conversation.id;
        }
      } else {
        groups.set(key, {
          question,
          count: 1,
          lastAskedAt: askedAt,
          conversationId: conversation.id,
        });
      }
    });
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || Date.parse(b.lastAskedAt) - Date.parse(a.lastAskedAt))
    .slice(0, limit);
}
