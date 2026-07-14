import { assertPublicHttpUrl, fetchPublicText, scanPublicPage } from "@/lib/scanner";
import {
  createWebsiteSource,
  knowledgeSourceId,
  type KnowledgeBase,
  type KnowledgeChunk,
  type KnowledgePage,
} from "@/lib/soul";

export type IngestOptions = {
  url: string;
  maxPages: number;
  maxDepth: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  validators?: Array<{ url: string; etag?: string; lastModified?: string }>;
};

export type CrawlStage =
  | "starting"
  | "policy"
  | "discovery"
  | "crawling"
  | "deduplication"
  | "indexing"
  | "complete"
  | "error";

export type CrawlStats = {
  discovered: number;
  queued: number;
  fetched: number;
  indexed: number;
  unchanged: number;
  skipped: number;
  duplicates: number;
  blocked: number;
  errors: number;
};

export type CrawlProgressEvent = {
  type: "progress" | "page" | "complete" | "error";
  stage: CrawlStage;
  message: string;
  progress: number;
  timestamp: string;
  url?: string;
  stats: CrawlStats;
  detail?: {
    depth?: number;
    source?: "seed" | "sitemap" | "link";
    score?: number;
    words?: number;
    chunks?: number;
  };
  knowledge?: KnowledgeBase;
};

export type CrawlReporter = (event: CrawlProgressEvent) => void | Promise<void>;

type FrontierItem = {
  url: string;
  depth: number;
  source: "seed" | "sitemap" | "link";
  score: number;
};

type RobotsPolicy = {
  allowed: (url: string) => boolean;
  sitemapUrls: string[];
  crawlDelayMs: number;
};

const USER_AGENT = "ObseriBot";
const MAX_SITEMAP_DOCUMENTS = 8;

export async function ingestWebsite(
  options: IngestOptions,
  reporter?: CrawlReporter,
): Promise<KnowledgeBase> {
  const startedAt = Date.now();
  const rootUrl = assertPublicHttpUrl(options.url);
  const root = new URL(rootUrl);
  const maxPages = Math.max(1, Math.min(50, options.maxPages));
  const maxDepth = Math.max(0, Math.min(4, options.maxDepth));
  const fetchBudget = Math.max(maxPages, maxPages * 3);
  const includePatterns = options.includePatterns ?? [];
  const excludePatterns = options.excludePatterns ?? [];
  const sourceId = knowledgeSourceId(rootUrl);
  const validators = new Map(
    (options.validators ?? []).map((validator) => [canonicalizeUrl(validator.url), validator]),
  );
  const unchangedUrls: string[] = [];
  const stats: CrawlStats = {
    discovered: 1,
    queued: 1,
    fetched: 0,
    indexed: 0,
    unchanged: 0,
    skipped: 0,
    duplicates: 0,
    blocked: 0,
    errors: 0,
  };
  const pages: KnowledgePage[] = [];
  const errors: Array<{ url: string; message: string }> = [];
  const frontier: FrontierItem[] = [{ url: rootUrl, depth: 0, source: "seed", score: 10_000 }];
  const queued = new Set([canonicalizeUrl(rootUrl)]);
  const contentHashes = new Set<string>();
  const similarityHashes: bigint[] = [];

  const emit = async (
    type: CrawlProgressEvent["type"],
    stage: CrawlStage,
    message: string,
    progress: number,
    url?: string,
    detail?: CrawlProgressEvent["detail"],
    knowledge?: KnowledgeBase,
  ) => {
    if (!reporter) return;
    await reporter({
      type,
      stage,
      message,
      progress: Math.max(0, Math.min(100, Math.round(progress))),
      timestamp: new Date().toISOString(),
      url,
      stats: { ...stats, queued: frontier.length },
      detail,
      knowledge,
    });
  };

  await emit("progress", "starting", `Preparing ${root.hostname}`, 2, rootUrl);
  await emit("progress", "policy", "Checking robots.txt crawl rules", 5, rootUrl);
  const robots = await loadRobotsPolicy(root).catch(async (error) => {
    errors.push({
      url: new URL("/robots.txt", root).toString(),
      message: error instanceof Error ? error.message : "Crawl rules could not be read.",
    });
    stats.errors += 1;
    await emit("progress", "policy", "Crawl rules were unavailable; using safe defaults", 8);
    return allowAllPolicy();
  });

  if (!robots.allowed(rootUrl)) {
    stats.blocked += 1;
    stats.queued = 0;
    const knowledge = makeKnowledge(
      rootUrl,
      [],
      [],
      [{ url: rootUrl, message: "The website's robots.txt blocks ObseriBot from this page." }],
      startedAt,
      stats,
    );
    await emit(
      "error",
      "error",
      "The website does not allow this page to be crawled",
      100,
      rootUrl,
      undefined,
      knowledge,
    );
    return knowledge;
  }

  await emit("progress", "discovery", "Looking for sitemap indexes and important pages", 10);
  const sitemapEntries = await discoverSitemapEntries(
    root,
    robots.sitemapUrls,
    maxPages * 12,
    emit,
  );
  for (const entry of sitemapEntries) {
    if (
      !isCrawlCandidate(entry.url, root) ||
      !matchesSourcePatterns(entry.url, root, includePatterns, excludePatterns)
    ) {
      stats.skipped += 1;
      continue;
    }
    if (!robots.allowed(entry.url)) {
      stats.blocked += 1;
      continue;
    }
    enqueue(frontier, queued, {
      url: entry.url,
      depth: estimateSitemapDepth(entry.url),
      source: "sitemap",
      score: scoreUrl(entry.url, root, entry.lastModified),
    });
  }
  for (const validator of validators.values()) {
    if (
      !isCrawlCandidate(validator.url, root) ||
      !matchesSourcePatterns(validator.url, root, includePatterns, excludePatterns) ||
      !robots.allowed(validator.url)
    ) {
      continue;
    }
    enqueue(frontier, queued, {
      url: validator.url,
      depth: canonicalizeUrl(validator.url) === canonicalizeUrl(rootUrl) ? 0 : 1,
      source: "link",
      score: 9_000,
    });
  }
  stats.discovered = queued.size;
  stats.queued = frontier.length;
  await emit(
    "progress",
    "discovery",
    sitemapEntries.length
      ? `Found ${sitemapEntries.length} sitemap URLs; prioritizing the best pages`
      : "No sitemap found; discovering pages from website links",
    16,
  );

  while (frontier.length && pages.length < maxPages && stats.fetched < fetchBudget) {
    frontier.sort((a, b) => b.score - a.score || a.depth - b.depth);
    const concurrency = robots.crawlDelayMs > 0 ? 1 : 3;
    const batch = frontier.splice(0, Math.min(concurrency, maxPages - pages.length));
    stats.queued = frontier.length;

    const results = await Promise.allSettled(
      batch.map(async (item, index) => {
        if (robots.crawlDelayMs > 0 && index > 0) await wait(robots.crawlDelayMs * index);
        await emit(
          "page",
          "crawling",
          `Reading ${displayPath(item.url)}`,
          crawlProgress(stats.fetched, maxPages),
          item.url,
          { depth: item.depth, source: item.source, score: item.score },
        );
        return {
          item,
          result: await scanPublicPage({
            url: item.url,
            analyze: false,
            validators: validators.get(canonicalizeUrl(item.url)),
          }),
        };
      }),
    );

    for (let index = 0; index < results.length; index += 1) {
      const settled = results[index];
      const item = batch[index];
      stats.fetched += 1;
      if (settled.status === "rejected") {
        const message =
          settled.reason instanceof Error ? settled.reason.message : "Page could not be read.";
        errors.push({ url: item.url, message });
        stats.errors += 1;
        await emit(
          "page",
          "crawling",
          `Skipped ${displayPath(item.url)}: ${shortReason(message)}`,
          crawlProgress(stats.fetched, maxPages),
          item.url,
          { depth: item.depth, source: item.source },
        );
        continue;
      }

      if (settled.value.result.notModified) {
        const unchangedUrl = canonicalizeUrl(item.url);
        unchangedUrls.push(unchangedUrl);
        stats.unchanged += 1;
        await emit(
          "page",
          "crawling",
          `Unchanged ${displayPath(item.url)}`,
          crawlProgress(stats.fetched, maxPages),
          item.url,
          { depth: item.depth, source: item.source },
        );
        continue;
      }
      const snapshot = settled.value.result.snapshot;
      if (!snapshot) {
        stats.errors += 1;
        errors.push({ url: item.url, message: "The page returned no readable snapshot." });
        continue;
      }
      const canonicalHint = snapshot.canonicalUrl;
      const canonical =
        canonicalHint && sameSite(canonicalHint, root)
          ? canonicalizeUrl(canonicalHint)
          : canonicalizeUrl(snapshot.finalUrl);
      queued.add(canonical);

      if (contentHashes.has(snapshot.hash)) {
        stats.duplicates += 1;
        await emit(
          "page",
          "deduplication",
          `Removed an exact duplicate: ${displayPath(snapshot.finalUrl)}`,
          crawlProgress(stats.fetched, maxPages),
          snapshot.finalUrl,
        );
      } else if (snapshot.wordCount < 60 && item.depth > 0) {
        stats.skipped += 1;
        await emit(
          "page",
          "crawling",
          `Skipped a thin page: ${displayPath(snapshot.finalUrl)}`,
          crawlProgress(stats.fetched, maxPages),
          snapshot.finalUrl,
        );
      } else {
        const fingerprint = simHash(snapshot.normalizedText);
        const nearDuplicate = similarityHashes.some(
          (value) => hammingDistance(value, fingerprint) <= 3,
        );
        if (nearDuplicate) {
          stats.duplicates += 1;
          await emit(
            "page",
            "deduplication",
            `Merged a near-duplicate: ${displayPath(snapshot.finalUrl)}`,
            crawlProgress(stats.fetched, maxPages),
            snapshot.finalUrl,
          );
        } else {
          contentHashes.add(snapshot.hash);
          similarityHashes.push(fingerprint);
          const chunks = chunkPage(
            snapshot.normalizedText,
            canonical,
            snapshot.title,
            snapshot.hash,
          );
          pages.push({
            id: snapshot.hash.slice(0, 16),
            sourceId,
            url: canonical,
            title: snapshot.title,
            description: snapshot.description,
            hash: snapshot.hash,
            wordCount: snapshot.wordCount,
            capturedAt: snapshot.capturedAt,
            status: snapshot.wordCount < 120 ? "warning" : "ready",
            content: snapshot.normalizedText,
            contentType: snapshot.contentType,
            httpStatus: snapshot.statusCode,
            language: snapshot.language,
            structuredDataTypes: snapshot.structuredDataTypes,
            etag: snapshot.etag,
            lastModified: snapshot.lastModified,
            sizeBytes: snapshot.sizeBytes,
            updatedAt: snapshot.capturedAt,
            revision: 1,
            enabled: true,
            changeType: "new",
            chunks: chunks.map((chunk) => ({ ...chunk, sourceId })),
          });
          stats.indexed = pages.length;
          await emit(
            "page",
            "indexing",
            `Learned ${snapshot.title || displayPath(snapshot.finalUrl)}`,
            crawlProgress(stats.fetched, maxPages),
            canonical,
            {
              depth: item.depth,
              source: item.source,
              words: snapshot.wordCount,
              chunks: chunks.length,
            },
          );
        }
      }

      if (item.depth >= maxDepth) continue;
      for (const link of snapshot.discoveredLinks ?? []) {
        if (queued.size >= maxPages * 20) break;
        if (!isCrawlCandidate(link, root)) {
          stats.skipped += 1;
          continue;
        }
        if (!matchesSourcePatterns(link, root, includePatterns, excludePatterns)) {
          stats.skipped += 1;
          continue;
        }
        if (!robots.allowed(link)) {
          stats.blocked += 1;
          continue;
        }
        enqueue(frontier, queued, {
          url: link,
          depth: item.depth + 1,
          source: "link",
          score: scoreUrl(link, root) - item.depth * 4,
        });
      }
      stats.discovered = queued.size;
      stats.queued = frontier.length;
    }

    if (robots.crawlDelayMs > 0 && frontier.length) await wait(robots.crawlDelayMs);
  }

  await emit("progress", "indexing", "Building clean, searchable knowledge blocks", 96);
  const knowledge = makeKnowledge(
    rootUrl,
    pages,
    extractKeywords(pages),
    errors,
    startedAt,
    stats,
    unchangedUrls,
  );
  await emit(
    "complete",
    "complete",
    pages.length
      ? `Knowledge ready from ${pages.length} high-value ${pages.length === 1 ? "page" : "pages"}`
      : unchangedUrls.length
        ? `${unchangedUrls.length} ${unchangedUrls.length === 1 ? "page is" : "pages are"} already up to date`
        : "No readable website knowledge was found",
    100,
    undefined,
    undefined,
    knowledge,
  );
  return knowledge;
}

function matchesSourcePatterns(
  value: string,
  root: URL,
  includePatterns: string[],
  excludePatterns: string[],
): boolean {
  const url = new URL(value, root);
  const target = `${url.pathname}${url.search}`;
  const matches = (pattern: string) => {
    const normalized = pattern.trim();
    if (!normalized) return false;
    const escaped = normalized
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    try {
      return new RegExp(`^${escaped}$`, "i").test(target);
    } catch {
      return false;
    }
  };
  if (excludePatterns.some(matches)) return false;
  return !includePatterns.length || includePatterns.some(matches);
}

function makeKnowledge(
  rootUrl: string,
  pages: KnowledgePage[],
  keywords: string[],
  errors: Array<{ url: string; message: string }>,
  startedAt: number,
  stats: CrawlStats,
  unchangedUrls: string[] = [],
): KnowledgeBase {
  const finishedAt = new Date().toISOString();
  const source = createWebsiteSource(rootUrl, new Date(startedAt).toISOString());
  const hasKnowledge = pages.length > 0 || unchangedUrls.length > 0;
  source.status = hasKnowledge ? (errors.length ? "warning" : "ready") : "error";
  source.lastCrawledAt = finishedAt;
  source.lastError = pages.length ? undefined : errors[0]?.message;
  return {
    schemaVersion: 2,
    rootUrl,
    status: hasKnowledge ? "ready" : "error",
    pages,
    keywords,
    lastCrawledAt: finishedAt,
    crawlDurationMs: Date.now() - startedAt,
    errors,
    sources: [source],
    revisions: pages.map((page) => ({
      id: `${page.id}-r1`,
      pageId: page.id,
      contentHash: page.hash,
      capturedAt: page.capturedAt,
      reason: "crawl",
      wordCount: page.wordCount,
    })),
    runs: [
      {
        id: crypto.randomUUID(),
        sourceId: source.id,
        status: hasKnowledge ? "succeeded" : "failed",
        startedAt: new Date(startedAt).toISOString(),
        finishedAt,
        durationMs: Date.now() - startedAt,
        stats: {
          discovered: stats.discovered,
          fetched: stats.fetched,
          indexed: stats.indexed,
          unchanged: stats.unchanged,
          skipped: stats.skipped,
          duplicates: stats.duplicates,
          blocked: stats.blocked,
          errors: stats.errors,
        },
        error: hasKnowledge ? undefined : errors[0]?.message,
      },
    ],
    unchangedUrls,
  };
}

async function loadRobotsPolicy(root: URL): Promise<RobotsPolicy> {
  const robotsUrl = new URL("/robots.txt", root).toString();
  const response = await fetchPublicText(robotsUrl, { maxBytes: 500_000, timeoutMs: 10_000 });
  if (response.status === 401 || response.status === 403) {
    return { allowed: () => false, sitemapUrls: [], crawlDelayMs: 0 };
  }
  if (response.status >= 500) {
    throw new Error(`robots.txt returned HTTP ${response.status}`);
  }
  if (response.status >= 400 || !response.text.trim()) return allowAllPolicy();
  return parseRobots(response.text, root);
}

function allowAllPolicy(): RobotsPolicy {
  return { allowed: () => true, sitemapUrls: [], crawlDelayMs: 0 };
}

function parseRobots(text: string, root: URL): RobotsPolicy {
  type Group = { agents: string[]; rules: Array<{ allow: boolean; path: string }>; delay?: number };
  const groups: Group[] = [];
  const sitemapUrls: string[] = [];
  let current: Group | undefined;
  let sawRule = false;

  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "sitemap" && value) {
      try {
        sitemapUrls.push(new URL(value, root).toString());
      } catch {
        // Ignore invalid sitemap declarations.
      }
      continue;
    }
    if (field === "user-agent") {
      if (!current || sawRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
        sawRule = false;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) continue;
    if ((field === "allow" || field === "disallow") && value) {
      current.rules.push({ allow: field === "allow", path: value });
      sawRule = true;
    } else if (field === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.delay = seconds;
      sawRule = true;
    }
  }

  const agent = USER_AGENT.toLowerCase();
  const exact = groups.filter((group) =>
    group.agents.some((value) => agent.includes(value) && value !== "*"),
  );
  const selected = exact.length ? exact : groups.filter((group) => group.agents.includes("*"));
  const rules = selected.flatMap((group) => group.rules);
  const delaySeconds = selected
    .map((group) => group.delay ?? 0)
    .reduce((max, value) => Math.max(max, value), 0);

  return {
    sitemapUrls: [...new Set(sitemapUrls)],
    crawlDelayMs: Math.min(5_000, Math.round(delaySeconds * 1_000)),
    allowed: (value) => {
      const url = new URL(value);
      const target = `${url.pathname}${url.search}`;
      const matches = rules
        .map((rule) => ({ ...rule, length: robotRuleMatchLength(rule.path, target) }))
        .filter((rule) => rule.length >= 0)
        .sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow));
      return matches[0]?.allow ?? true;
    },
  };
}

function robotRuleMatchLength(pattern: string, target: string): number {
  const endAnchored = pattern.endsWith("$");
  const body = endAnchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  try {
    return new RegExp(`^${escaped}${endAnchored ? "$" : ""}`).test(target)
      ? body.replace(/\*/g, "").length
      : -1;
  } catch {
    return -1;
  }
}

async function discoverSitemapEntries(
  root: URL,
  declared: string[],
  limit: number,
  emit: (
    type: CrawlProgressEvent["type"],
    stage: CrawlStage,
    message: string,
    progress: number,
    url?: string,
  ) => Promise<void>,
): Promise<Array<{ url: string; lastModified?: string }>> {
  const queue = [
    ...declared,
    new URL("/sitemap.xml", root).toString(),
    new URL("/sitemap_index.xml", root).toString(),
  ];
  const seenDocuments = new Set<string>();
  const entries = new Map<string, { url: string; lastModified?: string }>();

  while (queue.length && seenDocuments.size < MAX_SITEMAP_DOCUMENTS && entries.size < limit) {
    const candidate = queue.shift()!;
    let canonical: string;
    try {
      canonical = canonicalizeUrl(candidate);
      if (seenDocuments.has(canonical) || !sameSite(candidate, root)) continue;
      seenDocuments.add(canonical);
      await emit("progress", "discovery", `Inspecting ${displayPath(candidate)}`, 12, candidate);
      const response = await fetchPublicText(candidate, {
        maxBytes: 2_500_000,
        timeoutMs: 12_000,
        accept: "application/xml,text/xml,text/plain,*/*;q=0.2",
      });
      if (!response.text || response.status >= 400) continue;
      const isIndex = /<sitemapindex\b/i.test(response.text);
      const blocks =
        response.text.match(
          isIndex ? /<sitemap\b[\s\S]*?<\/sitemap>/gi : /<url\b[\s\S]*?<\/url>/gi,
        ) ?? [];
      for (const block of blocks) {
        const rawLocation = block.match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i)?.[1];
        if (!rawLocation) continue;
        const location = decodeXml(rawLocation.trim());
        if (isIndex) {
          if (sameSite(location, root) && queue.length < MAX_SITEMAP_DOCUMENTS * 4)
            queue.push(location);
        } else if (sameSite(location, root)) {
          const lastModified = block.match(/<lastmod\b[^>]*>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim();
          entries.set(canonicalizeUrl(location), { url: location, lastModified });
          if (entries.size >= limit) break;
        }
      }
    } catch {
      // Missing and malformed sitemap candidates are normal; link discovery continues.
    }
  }
  return [...entries.values()];
}

function enqueue(frontier: FrontierItem[], queued: Set<string>, item: FrontierItem) {
  const canonical = canonicalizeUrl(item.url);
  if (queued.has(canonical)) return;
  queued.add(canonical);
  frontier.push({ ...item, url: canonical });
}

function isCrawlCandidate(value: string, root: URL): boolean {
  try {
    const url = new URL(value);
    if (!sameSite(url.toString(), root) || url.searchParams.size > 6) return false;
    const path = url.pathname.toLowerCase();
    if (/\/(?:account|admin|cart|checkout|login|logout|signin|signup|wp-admin)(?:\/|$)/.test(path))
      return false;
    if (/\/(?:calendar|events?)\/\d{4}\/\d{1,2}(?:\/|$)/.test(path)) return false;
    if (/(?:\/[^/]+){3,}\/(?:page|p)\/\d+/.test(path)) return false;
    if (/(\/[^/]+)(?:\1){2,}/.test(path)) return false;
    if (/\/llms(?:-full)?\.txt$/.test(path)) return true;
    return !/\.(?:avif|bmp|css|csv|docx?|eot|gif|ico|jpe?g|js|json|mov|mp3|mp4|ogg|otf|pdf|png|pptx?|rss|svg|ttf|txt|wav|webm|webp|woff2?|xlsx?|xml|zip)$/.test(
      path,
    );
  } catch {
    return false;
  }
}

function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  const entries = [...url.searchParams.entries()]
    .filter(([key]) => !/^(?:utm_.+|fbclid|gclid|dclid|msclkid|ref|source|session|sid)$/i.test(key))
    .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
  url.search = "";
  for (const [key, item] of entries) url.searchParams.append(key, item);
  url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  return url.toString();
}

function sameSite(value: string, root: URL): boolean {
  try {
    const candidate = new URL(value);
    return candidate.hostname.toLowerCase() === root.hostname.toLowerCase();
  } catch {
    return false;
  }
}

function scoreUrl(value: string, root: URL, lastModified?: string): number {
  const url = new URL(value);
  const path = url.pathname.toLowerCase();
  const depth = path.split("/").filter(Boolean).length;
  let score = 100 - depth * 9 - url.searchParams.size * 8;
  if (path === "/") score += 150;
  if (/\/llms(?:-full)?\.txt$/.test(path)) score += 100;
  const valuable: Array<[RegExp, number]> = [
    [/\/(?:pricing|plans)(?:\/|$)/, 70],
    [/\/(?:product|products|features|solutions|services)(?:\/|$)/, 55],
    [/\/(?:docs|documentation|guide|guides|help|support)(?:\/|$)/, 45],
    [/\/(?:integrations|security|enterprise)(?:\/|$)/, 40],
    [/\/(?:about|company|contact)(?:\/|$)/, 28],
    [/\/(?:customers|case-studies|stories)(?:\/|$)/, 25],
    [/\/(?:blog|news|resources)(?:\/|$)/, 12],
  ];
  for (const [pattern, boost] of valuable) if (pattern.test(path)) score += boost;
  if (/\/(?:tag|author|archive|search|feed|page)(?:\/|$)/.test(path)) score -= 65;
  if (lastModified) {
    const ageDays = (Date.now() - Date.parse(lastModified)) / 86_400_000;
    if (Number.isFinite(ageDays)) score += Math.max(0, 20 - ageDays / 30);
  }
  if (url.hostname === root.hostname) score += 10;
  return Number(score.toFixed(2));
}

function estimateSitemapDepth(value: string): number {
  return Math.min(4, new URL(value).pathname.split("/").filter(Boolean).length);
}

function chunkPage(
  text: string,
  pageUrl: string,
  pageTitle: string,
  hash: string,
): KnowledgeChunk[] {
  const paragraphs = text
    .split(/\n+/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 20);
  const chunks: KnowledgeChunk[] = [];
  let buffer = "";

  const push = (value: string) => {
    const clean = value.trim();
    if (clean.length < 20 || clean === chunks.at(-1)?.text) return;
    const order = chunks.length;
    chunks.push({
      id: `${hash.slice(0, 12)}-${order}`,
      pageUrl,
      pageTitle,
      text: clean,
      order,
      tokenEstimate: Math.ceil(clean.length / 4),
    });
  };

  for (const paragraph of paragraphs) {
    if (buffer && buffer.length + paragraph.length > 1_200) {
      push(buffer);
      buffer = sentenceOverlap(buffer, 180);
    }
    buffer = `${buffer}${buffer ? "\n" : ""}${paragraph}`;
  }
  push(buffer);
  return chunks.slice(0, 40);
}

function sentenceOverlap(value: string, target: number): string {
  const tail = value.slice(-target * 2);
  const boundary = Math.max(tail.lastIndexOf(". "), tail.lastIndexOf("? "), tail.lastIndexOf("! "));
  return (boundary >= 0 ? tail.slice(boundary + 2) : tail.slice(-target)).trim();
}

function simHash(text: string): bigint {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const features = new Map<string, number>();
  for (let index = 0; index < words.length; index += 1) {
    const feature = words.slice(index, index + 3).join(" ");
    features.set(feature, (features.get(feature) ?? 0) + 1);
  }
  const weights = new Array<number>(64).fill(0);
  for (const [feature, frequency] of features) {
    const hash = fnv1a64(feature);
    const weight = 1 + Math.log2(frequency);
    for (let bit = 0; bit < 64; bit += 1) {
      weights[bit] += (hash & (1n << BigInt(bit))) !== 0n ? weight : -weight;
    }
  }
  return weights.reduce(
    (fingerprint, weight, bit) => (weight >= 0 ? fingerprint | (1n << BigInt(bit)) : fingerprint),
    0n,
  );
}

function fnv1a64(value: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash;
}

function hammingDistance(left: bigint, right: bigint): number {
  let value = left ^ right;
  let count = 0;
  while (value) {
    value &= value - 1n;
    count += 1;
  }
  return count;
}

function extractKeywords(pages: KnowledgePage[]): string[] {
  const stop = new Set([
    "about",
    "after",
    "again",
    "also",
    "been",
    "before",
    "being",
    "between",
    "could",
    "from",
    "have",
    "into",
    "more",
    "most",
    "other",
    "over",
    "page",
    "that",
    "their",
    "there",
    "these",
    "they",
    "this",
    "those",
    "through",
    "under",
    "very",
    "website",
    "what",
    "when",
    "where",
    "which",
    "while",
    "with",
    "would",
    "your",
  ]);
  const counts = new Map<string, number>();
  for (const chunk of pages.flatMap((page) => page.chunks)) {
    for (const word of chunk.text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []) {
      if (stop.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}

function crawlProgress(fetched: number, targetPages: number): number {
  return 18 + Math.min(1, fetched / Math.max(1, targetPages)) * 75;
}

function displayPath(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`.slice(0, 90);
  } catch {
    return value.slice(0, 90);
  }
}

function shortReason(value: string): string {
  return value
    .replace(/^The source /i, "")
    .replace(/\.$/, "")
    .slice(0, 100);
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
