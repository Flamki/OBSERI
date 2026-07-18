import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import postgres from "postgres";
import type { Soul, SoulConversation } from "@/lib/soul";
import { deliverWebhook, type ObseriWebhookEvent } from "@/lib/webhooks";
import { normalizeAllowedDomains, sha256 } from "@/lib/integration-security";
import { billingPlanIncludesFeature } from "@/lib/billing-plans";
import { billingSummary } from "@/lib/billing-store";

export type PublishedSoulRecord = {
  soul: Soul;
  ownerUserId: string;
  publishedAt: string;
  webhook: { enabled: boolean; url: string; secret: string };
};

export class IntegrationStoreError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly code = "integration_store_error",
  ) {
    super(message);
    this.name = "IntegrationStoreError";
  }
}

type Sql = ReturnType<typeof postgres>;
let client: Sql | undefined;

function db(): Sql {
  if (client) return client;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new IntegrationStoreError(
      "Publishing is unavailable because durable storage is not configured.",
      503,
      "database_not_configured",
    );
  }
  client = postgres(url, {
    max: 2,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return client;
}

export async function publishSoul(input: {
  value: unknown;
  ownerKey: string;
  widgetToken: string;
  ownerUserId: string;
}): Promise<PublishedSoulRecord> {
  if (!isSoul(input.value)) {
    throw new IntegrationStoreError("The published soul payload is invalid.", 422, "invalid_soul");
  }
  assertCredential(input.ownerKey, "obspub_");
  assertCredential(input.widgetToken, "obswgt_");

  const source = structuredClone(input.value);
  if (
    source.channels.publishKey !== input.ownerKey ||
    source.channels.widgetToken !== input.widgetToken
  ) {
    throw new IntegrationStoreError("The publisher credentials do not match this soul.", 403);
  }
  const allowedDomains = normalizeAllowedDomains([
    ...source.channels.allowedDomains,
    safeHostname(source.siteUrl),
  ]);
  if (!allowedDomains.length) {
    throw new IntegrationStoreError(
      "Add at least one valid allowed domain before publishing.",
      422,
    );
  }

  const now = new Date().toISOString();
  const publicSoul = createPublicSoul(source, allowedDomains, now);
  const ownerKeyHash = sha256(input.ownerKey);
  const widgetTokenHash = sha256(input.widgetToken);
  const webhookSecret = encrypt(source.channels.webhookSecret);
  const sql = db();

  await sql.begin(async (transaction) => {
    const existing = await transaction<{ owner_key_hash: string; owner_user_id: string | null }[]>`
      select owner_key_hash, owner_user_id from obseri_published_souls
      where soul_id = ${publicSoul.id}
      for update
    `;
    if (existing[0] && existing[0].owner_key_hash !== ownerKeyHash) {
      throw new IntegrationStoreError("This soul belongs to another publisher.", 403);
    }
    if (existing[0]?.owner_user_id && existing[0].owner_user_id !== input.ownerUserId) {
      throw new IntegrationStoreError("This soul belongs to another account.", 403);
    }
    await transaction`
      insert into obseri_published_souls (
        soul_id, workspace_id, owner_user_id, owner_key_hash, widget_token_hash, soul,
        widget_enabled, allowed_domains, webhook_enabled, webhook_url,
        webhook_secret, published_at, updated_at
      ) values (
        ${publicSoul.id}, ${publicSoul.workspaceId}, ${input.ownerUserId}, ${ownerKeyHash}, ${widgetTokenHash},
        ${transaction.json(publicSoul)}, ${publicSoul.channels.widgetEnabled},
        ${transaction.json(allowedDomains)}, ${source.channels.webhookEnabled},
        ${source.channels.webhookUrl || null}, ${webhookSecret}, ${now}, ${now}
      )
      on conflict (soul_id) do update set
        workspace_id = excluded.workspace_id,
        owner_user_id = excluded.owner_user_id,
        widget_token_hash = excluded.widget_token_hash,
        soul = excluded.soul,
        widget_enabled = excluded.widget_enabled,
        allowed_domains = excluded.allowed_domains,
        webhook_enabled = excluded.webhook_enabled,
        webhook_url = excluded.webhook_url,
        webhook_secret = excluded.webhook_secret,
        updated_at = excluded.updated_at
    `;
  });

  return {
    soul: publicSoul,
    ownerUserId: input.ownerUserId,
    publishedAt: now,
    webhook: {
      enabled: source.channels.webhookEnabled,
      url: source.channels.webhookUrl,
      secret: source.channels.webhookSecret,
    },
  };
}

export async function getPublishedSoulByWidgetToken(
  soulId: string,
  widgetToken: string,
): Promise<PublishedSoulRecord | null> {
  assertCredential(widgetToken, "obswgt_");
  return readRecord(soulId, "widget_token_hash", sha256(widgetToken));
}

export async function getPublishedSoulForOwner(
  soulId: string,
  ownerKey: string,
  ownerUserId?: string,
): Promise<PublishedSoulRecord | null> {
  assertCredential(ownerKey, "obspub_");
  const sql = db();
  const rows = ownerUserId
    ? await sql<PublishedRow[]>`
        select soul, owner_user_id, webhook_enabled, webhook_url, webhook_secret, published_at
        from obseri_published_souls
        where soul_id = ${soulId} and owner_key_hash = ${sha256(ownerKey)}
          and owner_user_id = ${ownerUserId}
      `
    : await sql<PublishedRow[]>`
        select soul, owner_user_id, webhook_enabled, webhook_url, webhook_secret, published_at
        from obseri_published_souls
        where soul_id = ${soulId} and owner_key_hash = ${sha256(ownerKey)}
      `;
  return rowToRecord(rows[0]);
}

export async function getPublishedSoul(soulId: string): Promise<PublishedSoulRecord | null> {
  const sql = db();
  const rows = await sql<PublishedRow[]>`
    select soul, owner_user_id, webhook_enabled, webhook_url, webhook_secret, published_at
    from obseri_published_souls where soul_id = ${soulId} and widget_enabled = true
  `;
  return rowToRecord(rows[0]);
}

async function readRecord(
  soulId: string,
  column: "widget_token_hash" | "owner_key_hash",
  hash: string,
): Promise<PublishedSoulRecord | null> {
  const sql = db();
  const rows =
    column === "widget_token_hash"
      ? await sql<PublishedRow[]>`
          select soul, owner_user_id, webhook_enabled, webhook_url, webhook_secret, published_at
          from obseri_published_souls
          where soul_id = ${soulId} and widget_token_hash = ${hash} and widget_enabled = true
        `
      : await sql<PublishedRow[]>`
          select soul, owner_user_id, webhook_enabled, webhook_url, webhook_secret, published_at
          from obseri_published_souls
          where soul_id = ${soulId} and owner_key_hash = ${hash}
        `;
  return rowToRecord(rows[0]);
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1_000));
  const sql = db();
  const rows = await sql<{ request_count: number }[]>`
    insert into obseri_rate_limits (rate_key, bucket, request_count, expires_at)
    values (${sha256(key)}, ${bucket}, 1, now() + (${windowSeconds * 2} * interval '1 second'))
    on conflict (rate_key, bucket) do update
      set request_count = obseri_rate_limits.request_count + 1
    returning request_count
  `;
  return Number(rows[0]?.request_count ?? limit + 1) <= limit;
}

export async function persistConversation(input: {
  soulId: string;
  origin: string;
  conversation: SoulConversation;
}): Promise<string | null> {
  const sql = db();
  const publishedRows = await sql<
    { owner_user_id: string | null; webhook_enabled: boolean; webhook_url: string | null }[]
  >`
    select owner_user_id, webhook_enabled, webhook_url
    from obseri_published_souls
    where soul_id = ${input.soulId}
    limit 1
  `;
  const publishedSoul = publishedRows[0] ?? null;
  const summary = publishedSoul?.owner_user_id
    ? await billingSummary(publishedSoul.owner_user_id)
    : null;
  const webhookAllowed = summary ? billingPlanIncludesFeature(summary.plan.id, "webhooks") : false;
  const retentionDays = summary?.plan.limits.retentionDays ?? null;
  const eventType =
    input.conversation.leadIntent === "high" ? "lead.detected" : "conversation.updated";
  const event: ObseriWebhookEvent = {
    id: `evt_${crypto.randomUUID()}`,
    type: eventType,
    createdAt: new Date().toISOString(),
    soulId: input.soulId,
    data: {
      conversationId: input.conversation.id,
      origin: input.origin,
      leadIntent: input.conversation.leadIntent,
      messages: input.conversation.messages,
    },
  };

  return sql.begin(async (transaction) => {
    await transaction`
      insert into obseri_conversations (
        conversation_id, soul_id, origin, channel, visitor_label, lead_intent,
        messages, started_at, updated_at
      ) values (
        ${input.conversation.id}, ${input.soulId}, ${input.origin}, 'widget',
        ${input.conversation.visitorLabel}, ${input.conversation.leadIntent},
        ${transaction.json(input.conversation.messages)}, ${input.conversation.startedAt},
        ${input.conversation.updatedAt}
      )
      on conflict (conversation_id) do update set
        lead_intent = excluded.lead_intent,
        messages = excluded.messages,
        updated_at = excluded.updated_at
    `;
    if (retentionDays !== null) {
      await transaction`
        delete from obseri_conversations
        where soul_id = ${input.soulId}
          and updated_at < now() - (${retentionDays} * interval '1 day')
      `;
    }
    if (!webhookAllowed || !publishedSoul?.webhook_enabled || !publishedSoul.webhook_url) {
      return null;
    }
    await transaction`
      insert into obseri_webhook_deliveries (
        event_id, soul_id, event, status, attempt_count, next_attempt_at, created_at, updated_at
      ) values (
        ${event.id}, ${input.soulId}, ${transaction.json(event as never)}, 'pending', 0, now(), now(), now()
      ) on conflict (event_id) do nothing
    `;
    return event.id;
  });
}

export async function deliverQueuedWebhook(eventId: string): Promise<{
  delivered: boolean;
  status?: number;
  error?: string;
}> {
  const sql = db();
  const claimed = await sql<
    {
      event_id: string;
      soul_id: string;
      event: ObseriWebhookEvent;
      attempt_count: number;
    }[]
  >`
    update obseri_webhook_deliveries
    set status = 'delivering', attempt_count = attempt_count + 1, updated_at = now()
    where event_id = ${eventId}
      and status in ('pending', 'failed')
      and next_attempt_at <= now()
    returning event_id, soul_id, event, attempt_count
  `;
  const delivery = claimed[0];
  if (!delivery) return { delivered: false, error: "not_ready" };
  const record = await getPublishedSoul(delivery.soul_id);
  if (!record?.webhook.enabled || !record.webhook.url) {
    await sql`
      update obseri_webhook_deliveries
      set status = 'failed', last_error = 'Webhook disabled', updated_at = now()
      where event_id = ${eventId}
    `;
    return { delivered: false, error: "disabled" };
  }

  try {
    const result = await deliverWebhook({
      url: record.webhook.url,
      secret: record.webhook.secret,
      event: delivery.event,
    });
    await sql`
      update obseri_webhook_deliveries
      set status = 'delivered', last_status = ${result.status}, last_error = null,
          delivered_at = now(), updated_at = now()
      where event_id = ${eventId}
    `;
    return { delivered: true, status: result.status };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Delivery failed";
    const exhausted = delivery.attempt_count >= 8;
    const delaySeconds = Math.min(3_600, 5 * 2 ** Math.max(0, delivery.attempt_count - 1));
    await sql`
      update obseri_webhook_deliveries
      set status = 'failed', last_error = ${message},
          next_attempt_at = ${exhausted ? new Date("9999-12-31T00:00:00.000Z") : new Date(Date.now() + delaySeconds * 1_000)},
          updated_at = now()
      where event_id = ${eventId}
    `;
    return { delivered: false, error: message };
  }
}

export async function drainWebhookQueue(limit = 25) {
  const sql = db();
  const rows = await sql<{ event_id: string }[]>`
    select event_id from obseri_webhook_deliveries
    where status in ('pending', 'failed') and next_attempt_at <= now()
    order by next_attempt_at asc
    limit ${Math.max(1, Math.min(limit, 100))}
  `;
  return Promise.all(rows.map((row) => deliverQueuedWebhook(row.event_id)));
}

type PublishedRow = {
  soul: Soul;
  owner_user_id: string;
  webhook_enabled: boolean;
  webhook_url: string | null;
  webhook_secret: string;
  published_at: string | Date;
};

function rowToRecord(row: PublishedRow | undefined): PublishedSoulRecord | null {
  if (!row) return null;
  return {
    soul: row.soul,
    ownerUserId: row.owner_user_id,
    publishedAt:
      row.published_at instanceof Date ? row.published_at.toISOString() : row.published_at,
    webhook: {
      enabled: row.webhook_enabled,
      url: row.webhook_url ?? "",
      secret: decrypt(row.webhook_secret),
    },
  };
}

function createPublicSoul(source: Soul, allowedDomains: string[], now: string): Soul {
  const soul = structuredClone(source);
  soul.status = "live";
  soul.updatedAt = now;
  soul.conversations = [];
  soul.channels.allowedDomains = allowedDomains;
  soul.channels.webhookSecret = "";
  soul.channels.publishKey = "";
  soul.channels.widgetToken = "";
  soul.knowledge.pages = soul.knowledge.pages.slice(0, 50).map((page) => ({
    ...page,
    chunks: page.chunks.slice(0, 500),
  }));
  return soul;
}

function encrypt(value: string): string {
  if (!value) return "";
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decrypt(value: string): string {
  if (!value) return "";
  const [version, ivValue, tagValue, encryptedValue] = value.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new IntegrationStoreError("A stored integration secret is unreadable.", 500);
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function encryptionKey(): Buffer {
  const secret = process.env.OBSERI_SECRET_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new IntegrationStoreError(
      "Secret encryption is not configured on this deployment.",
      503,
      "encryption_not_configured",
    );
  }
  return createHash("sha256").update(secret).digest();
}

function assertCredential(value: string, prefix: string) {
  if (!value.startsWith(prefix) || value.length < prefix.length + 43 || value.length > 160) {
    throw new IntegrationStoreError("The integration credential is invalid.", 401);
  }
}

function safeHostname(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isSoul(value: unknown): value is Soul {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Soul>;
  return (
    typeof candidate.id === "string" &&
    /^[a-zA-Z0-9_-]{3,100}$/.test(candidate.id) &&
    typeof candidate.workspaceId === "string" &&
    typeof candidate.name === "string" &&
    candidate.name.length > 0 &&
    candidate.name.length <= 120 &&
    typeof candidate.siteUrl === "string" &&
    Boolean(candidate.knowledge) &&
    Array.isArray(candidate.knowledge?.pages) &&
    candidate.knowledge.pages.length <= 50 &&
    candidate.knowledge.pages.every(
      (page) =>
        page &&
        typeof page.url === "string" &&
        typeof page.title === "string" &&
        Array.isArray(page.chunks) &&
        page.chunks.length <= 500 &&
        page.chunks.every(
          (chunk) =>
            chunk &&
            typeof chunk.id === "string" &&
            typeof chunk.text === "string" &&
            chunk.text.length <= 1_500,
        ),
    ) &&
    Boolean(candidate.personality) &&
    typeof candidate.personality?.greeting === "string" &&
    Boolean(candidate.voice) &&
    Boolean(candidate.appearance) &&
    Boolean(candidate.channels)
  );
}
