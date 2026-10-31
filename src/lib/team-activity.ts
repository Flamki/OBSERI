import { z } from "zod";
import { normalizePermissions } from "./workspace-access";

const policy = z.record(z.enum(["none", "read", "write"])).transform(normalizePermissions);
const changesSchema = z.array(
  z.object({
    section: z.string().optional(),
    field: z.string().optional(),
    website: z.string().optional(),
    email: z.string().optional(),
    operation: z.string().optional(),
    before: policy.optional(),
    after: policy.optional(),
    permissions: policy.optional(),
  }),
);

/** Decode legacy JSON text without letting a damaged entry crash the whole workspace. */
export function normalizeActivityChanges(value: unknown) {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      /* Preserve the entry with an explicit unavailable state. */
    }
  }
  const parsed = changesSchema.safeParse(value);
  return {
    changes: parsed.success ? parsed.data : [],
    detailsUnavailable: !parsed.success,
  };
}

const activityPageSchema = z.object({
  events: z.array(
    z
      .object({
        id: z.string(),
        actorEmail: z.string(),
        action: z.string(),
        changes: z.unknown(),
        detailsUnavailable: z.boolean().optional(),
        revision: z
          .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
          .nullable()
          .optional(),
        createdAt: z.string(),
      })
      .transform((event) => {
        const normalized = normalizeActivityChanges(event.changes);
        return {
          ...event,
          ...normalized,
          detailsUnavailable: event.detailsUnavailable || normalized.detailsUnavailable,
        };
      }),
  ),
  nextCursor: z
    .string()
    .regex(/^\d{1,19}$/)
    .nullable(),
});
export type ActivityEvent = z.infer<typeof activityPageSchema>["events"][number];

export function parseActivityPage(value: unknown) {
  const parsed = activityPageSchema.safeParse(value);
  if (!parsed.success)
    throw new Error("Could not load activity. Please refresh the log to try again.");
  return parsed.data;
}
