import type { Soul } from "@/lib/soul";

type PublishedSoulRecord = {
  soul: Soul;
  publishedAt: string;
  webhook: {
    enabled: boolean;
    url: string;
    secret: string;
  };
};

type RegistryGlobal = typeof globalThis & {
  __OBSERI_PUBLISHED_SOULS__?: Map<string, PublishedSoulRecord>;
};

const registryGlobal = globalThis as RegistryGlobal;
const registry =
  registryGlobal.__OBSERI_PUBLISHED_SOULS__ ?? new Map<string, PublishedSoulRecord>();
registryGlobal.__OBSERI_PUBLISHED_SOULS__ = registry;

export function publishSoul(value: unknown): PublishedSoulRecord {
  if (!isSoul(value)) throw new Error("The published soul payload is invalid.");

  const soul = structuredClone(value);
  const webhook = {
    enabled: soul.channels.webhookEnabled,
    url: soul.channels.webhookUrl,
    secret: soul.channels.webhookSecret,
  };
  soul.status = "live";
  soul.updatedAt = new Date().toISOString();
  soul.conversations = [];
  soul.channels.webhookSecret = "";
  soul.knowledge.pages = soul.knowledge.pages.slice(0, 50).map((page) => ({
    ...page,
    chunks: page.chunks.slice(0, 500),
  }));

  const record = { soul, webhook, publishedAt: new Date().toISOString() };
  registry.set(soul.id, record);
  return record;
}

export function getPublishedSoul(soulId: string): PublishedSoulRecord | null {
  return registry.get(soulId) ?? null;
}

function isSoul(value: unknown): value is Soul {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Soul>;
  return (
    typeof candidate.id === "string" &&
    /^[a-zA-Z0-9_-]{3,100}$/.test(candidate.id) &&
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
