import { z } from "zod";

export const inboxMutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update"),
      conversationId: z.string().min(1).max(200),
      version: z.number().int().min(0).max(2147483646),
      status: z.enum(["open", "waiting", "resolved"]),
      assigneeId: z.string().min(1).max(200).nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("note"),
      conversationId: z.string().min(1).max(200),
      noteId: z.string().uuid(),
      body: z.string().trim().min(1).max(2000),
    })
    .strict(),
]);
export type InboxMutation = z.infer<typeof inboxMutationSchema>;
export type ConversationInbox = {
  status: "open" | "waiting" | "resolved";
  assigneeId: string | null;
  version: number;
  assignees: { id: string; label: string }[];
  notes: { id: string; author: string; body: string; createdAt: string }[];
  hasOlderNotes: boolean;
  nextCursor: string | null;
};
