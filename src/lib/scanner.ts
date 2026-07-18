export type MonitorCategory =
  "pricing" | "product" | "messaging" | "documentation" | "hiring" | "reviews" | "other";

export type PreviousSnapshot = {
  hash: string;
  normalizedText: string;
  capturedAt: string;
};

export type ScanRequest = {
  url: string;
  category?: MonitorCategory;
  previous?: PreviousSnapshot;
  analyze?: boolean;
  validators?: { etag?: string; lastModified?: string };
};

export type PageSnapshot = {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  capturedAt: string;
  hash: string;
  normalizedText: string;
  excerpt: string;
  wordCount: number;
  statusCode: number;
  contentType: string;
  sizeBytes: number;
  etag?: string;
  lastModified?: string;
  canonicalUrl?: string;
  language?: string;
  structuredDataTypes?: string[];
  discoveredLinks?: string[];
};

export type PublicTextResponse = {
  url: string;
  status: number;
  contentType: string;
  text: string;
};

export type ChangeAnalysis = {
  changed: boolean;
  importance: "baseline" | "low" | "medium" | "high";
  changeScore: number;
  confidence: number;
  summary: string;
  whyItMatters: string;
  added: string[];
  removed: string[];
  actions: string[];
  analysisMode: "deterministic" | "model";
};

export type ScanResult = {
  snapshot?: PageSnapshot;
  analysis?: ChangeAnalysis;
  durationMs: number;
  notModified?: boolean;
};

const MAX_RESPONSE_BYTES = 1_500_000;
const MAX_NORMALIZED_CHARS = 120_000;
const REDIRECT_LIMIT = 4;

export async function scanPublicPage(input: ScanRequest): Promise<ScanResult> {
  const startedAt = Date.now();
  let currentUrl = assertPublicHttpUrl(input.url);
  let response: Response | undefined;

  for (let redirectCount = 0; redirectCount <= REDIRECT_LIMIT; redirectCount += 1) {
    response = await fetch(currentUrl, {
      redirect: "manual",
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.7,*/*;q=0.2",
        "user-agent":
          "ObseriBot/1.0 (+https://obseri.com; website knowledge crawler; contact flamki@obseri.com)",
        ...(input.validators?.etag ? { "if-none-match": input.validators.etag } : {}),
        ...(!input.validators?.etag && input.validators?.lastModified
          ? { "if-modified-since": input.validators.lastModified }
          : {}),
      },
      signal: AbortSignal.timeout(18_000),
    });

    if (response.status === 304) {
      return { durationMs: Date.now() - startedAt, notModified: true };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location)
        throw new ScanError("The source returned an invalid redirect.", 502, "invalid_redirect");
      if (redirectCount === REDIRECT_LIMIT) {
        throw new ScanError("The source redirected too many times.", 508, "redirect_limit");
      }
      currentUrl = assertPublicHttpUrl(new URL(location, currentUrl).toString());
      continue;
    }
    break;
  }

  if (!response) throw new ScanError("The source did not return a response.", 502, "no_response");
  if (!response.ok) {
    throw new ScanError(
      `The source returned HTTP ${response.status}.`,
      response.status === 404 ? 404 : 502,
      "upstream_error",
    );
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "unknown";
  const allowedContent =
    contentType.startsWith("text/") ||
    contentType === "application/xhtml+xml" ||
    contentType === "application/json" ||
    contentType === "unknown";
  if (!allowedContent) {
    throw new ScanError(
      `Obseri cannot extract evidence from ${contentType}.`,
      415,
      "unsupported_content",
    );
  }

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new ScanError("The source is too large to scan safely.", 413, "source_too_large");
  }

  const body = await readLimitedBody(response, MAX_RESPONSE_BYTES);
  const title = extractTitle(body) || new URL(currentUrl).hostname;
  const description = extractMetaDescription(body);
  const normalizedText = normalizeDocument(body, contentType).slice(0, MAX_NORMALIZED_CHARS);
  if (normalizedText.length < 40) {
    throw new ScanError(
      "The source did not expose enough readable content. It may require a browser crawler.",
      422,
      "insufficient_content",
    );
  }

  const capturedAt = new Date().toISOString();
  const hash = await sha256(normalizedText);
  const snapshot: PageSnapshot = {
    url: input.url,
    finalUrl: currentUrl,
    title,
    description,
    capturedAt,
    hash,
    normalizedText,
    excerpt: normalizedText.slice(0, 420),
    wordCount: normalizedText.split(/\s+/).filter(Boolean).length,
    statusCode: response.status,
    contentType,
    sizeBytes: new TextEncoder().encode(body).length,
    etag: response.headers.get("etag") ?? undefined,
    lastModified: response.headers.get("last-modified") ?? undefined,
    canonicalUrl: extractCanonicalUrl(body, currentUrl),
    language: extractDocumentLanguage(body),
    structuredDataTypes: extractStructuredDataTypes(body),
    discoveredLinks: extractDiscoveredLinks(body, currentUrl),
  };

  const category = input.category ?? "other";
  const deterministicAnalysis = analyzeChange(snapshot, input.previous, category);
  const analysis =
    input.analyze === false
      ? deterministicAnalysis
      : await enhanceAnalysisWithModel(deterministicAnalysis, snapshot, input.previous, category);

  return {
    snapshot,
    analysis,
    durationMs: Date.now() - startedAt,
    notModified: false,
  };
}

export async function fetchPublicText(
  inputUrl: string,
  options: { maxBytes?: number; timeoutMs?: number; accept?: string } = {},
): Promise<PublicTextResponse> {
  const maxBytes = Math.max(1_024, Math.min(5_000_000, options.maxBytes ?? 1_000_000));
  const timeoutMs = Math.max(1_000, Math.min(30_000, options.timeoutMs ?? 12_000));
  let currentUrl = assertPublicHttpUrl(inputUrl);
  let response: Response | undefined;

  for (let redirectCount = 0; redirectCount <= REDIRECT_LIMIT; redirectCount += 1) {
    response = await fetch(currentUrl, {
      redirect: "manual",
      headers: {
        accept: options.accept ?? "text/plain,application/xml,text/xml;q=0.9,*/*;q=0.2",
        "user-agent":
          "ObseriBot/1.0 (+https://obseri.com; website knowledge crawler; contact flamki@obseri.com)",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location)
        throw new ScanError("The source returned an invalid redirect.", 502, "invalid_redirect");
      if (redirectCount === REDIRECT_LIMIT) {
        throw new ScanError("The source redirected too many times.", 508, "redirect_limit");
      }
      currentUrl = assertPublicHttpUrl(new URL(location, currentUrl).toString());
      continue;
    }
    break;
  }

  if (!response) throw new ScanError("The source did not return a response.", 502, "no_response");
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maxBytes) {
    throw new ScanError("The source is too large to read safely.", 413, "source_too_large");
  }
  return {
    url: currentUrl,
    status: response.status,
    contentType: response.headers.get("content-type")?.split(";")[0]?.trim() ?? "unknown",
    text: response.ok ? await readLimitedBody(response, maxBytes) : "",
  };
}

export class ScanError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ScanError";
  }
}

export function assertPublicHttpUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new ScanError("Enter a valid public URL.", 400, "invalid_url");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ScanError("Only HTTP and HTTPS sources are supported.", 400, "invalid_protocol");
  }
  if (parsed.username || parsed.password) {
    throw new ScanError(
      "URLs containing credentials are not supported.",
      400,
      "credentials_in_url",
    );
  }
  if (parsed.href.length > 2_048) {
    throw new ScanError("The URL is too long.", 400, "url_too_long");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "0.0.0.0" ||
    hostname === "::" ||
    hostname === "::1" ||
    isPrivateIpv4(hostname) ||
    isPrivateIpv6(hostname)
  ) {
    throw new ScanError(
      "Private and local network addresses cannot be monitored.",
      400,
      "private_url",
    );
  }

  parsed.hash = "";
  return parsed.toString();
}

export async function assertPublicHttpUrlResolved(value: string): Promise<string> {
  const safeUrl = assertPublicHttpUrl(value);
  const hostname = new URL(safeUrl).hostname;
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length) {
    throw new ScanError("The destination hostname did not resolve.", 400, "unresolved_url");
  }
  if (
    addresses.some(({ address }) =>
      address.includes(":") ? isPrivateIpv6(address) : isPrivateIpv4(address),
    )
  ) {
    throw new ScanError(
      "The destination resolves to a private or local network address.",
      400,
      "private_url",
    );
  }
  return safeUrl;
}

function isPrivateIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
  const parts = hostname.split(".").map(Number);
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(hostname: string): boolean {
  if (!hostname.includes(":")) return false;
  const normalized = hostname.toLowerCase();
  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

async function readLimitedBody(response: Response, limit: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel();
      throw new ScanError("The source is too large to scan safely.", 413, "source_too_large");
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function normalizeDocument(body: string, contentType: string): string {
  if (contentType === "application/json") {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body.replace(/\s+/g, " ").trim();
    }
  }

  return decodeEntities(
    body
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|canvas|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr|header|footer|nav)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 1 && !looksVolatile(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksVolatile(line: string): boolean {
  if (line.length > 120) return false;
  return (
    /^(last updated|updated|current time|server time|generated at)\b/i.test(line) ||
    /^\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|utc)?$/i.test(line) ||
    /^(accept|manage) (all )?cookies?$/i.test(line)
  );
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, key: string) => {
    if (key.startsWith("#x")) return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
    return named[key.toLowerCase()] ?? entity;
  });
}

function extractTitle(body: string): string {
  const match = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match
    ? decodeEntities(
        match[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
    : "";
}

function extractMetaDescription(body: string): string {
  const tags = body.match(/<meta\s+[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/(?:name|property)=["'](?:description|og:description)["']/i.test(tag)) continue;
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "";
    if (content) return decodeEntities(content.trim());
  }
  return "";
}

function extractCanonicalUrl(body: string, baseUrl: string): string | undefined {
  const tags = body.match(/<link\s+[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/\brel\s*=\s*["'][^"']*\bcanonical\b[^"']*["']/i.test(tag)) continue;
    const value = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!value) continue;
    try {
      const canonical = new URL(decodeEntities(value.trim()), baseUrl);
      if (!["http:", "https:"].includes(canonical.protocol)) continue;
      canonical.hash = "";
      return canonical.toString();
    } catch {
      // Ignore malformed canonical hints from untrusted markup.
    }
  }
  return undefined;
}

function extractDocumentLanguage(body: string): string | undefined {
  const value = body.match(/<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i)?.[1]?.trim();
  return value ? value.slice(0, 24) : undefined;
}

function extractStructuredDataTypes(body: string): string[] {
  const types = new Set<string>();
  for (const match of body.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    for (const typeMatch of match[1].matchAll(/["']@type["']\s*:\s*["']([^"']+)["']/gi)) {
      const value = typeMatch[1].trim();
      if (value) types.add(value.slice(0, 80));
      if (types.size >= 20) return [...types];
    }
  }
  return [...types];
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function analyzeChange(
  snapshot: PageSnapshot,
  previous: PreviousSnapshot | undefined,
  category: MonitorCategory,
): ChangeAnalysis {
  if (!previous) {
    return {
      changed: false,
      importance: "baseline",
      changeScore: 0,
      confidence: 0.99,
      summary: `Baseline captured for ${snapshot.title}.`,
      whyItMatters: "Future scans will be compared with this evidence snapshot.",
      added: [],
      removed: [],
      actions: ["Choose a scan frequency", "Add another source", "Share the workspace"],
      analysisMode: "deterministic",
    };
  }

  if (previous.hash === snapshot.hash) {
    return {
      changed: false,
      importance: "low",
      changeScore: 0,
      confidence: 0.99,
      summary: `No meaningful change detected on ${snapshot.title}.`,
      whyItMatters: "The readable source content still matches the previous evidence snapshot.",
      added: [],
      removed: [],
      actions: ["Keep monitoring"],
      analysisMode: "deterministic",
    };
  }

  const oldSegments = segmentText(previous.normalizedText);
  const newSegments = segmentText(snapshot.normalizedText);
  const oldSet = new Set(oldSegments.map(normalizeSegment));
  const newSet = new Set(newSegments.map(normalizeSegment));
  const added = newSegments.filter((segment) => !oldSet.has(normalizeSegment(segment))).slice(0, 8);
  const removed = oldSegments
    .filter((segment) => !newSet.has(normalizeSegment(segment)))
    .slice(0, 8);
  const changedCount = added.length + removed.length;
  const denominator = Math.max(oldSegments.length + newSegments.length, 1);
  const changeScore = Math.min(1, changedCount / denominator);
  const changeText = [...added, ...removed].join(" ");
  const highSignal =
    /(\$|€|£|pricing|price|plan|trial|api|integration|deprecated|launch|enterprise|free tier|per month|\/mo\b)/i.test(
      changeText,
    );
  const importance =
    highSignal || changeScore >= 0.22 ? "high" : changeScore >= 0.08 ? "medium" : "low";
  const categoryLabel = category === "other" ? "page" : category;
  const leadingChange = added[0] ?? removed[0] ?? "Readable content changed.";

  return {
    changed: true,
    importance,
    changeScore: Number(changeScore.toFixed(3)),
    confidence: Number(Math.min(0.97, 0.72 + Math.min(changedCount, 10) * 0.025).toFixed(2)),
    summary: `${snapshot.title} changed its ${categoryLabel} signal. ${truncate(leadingChange, 180)}`,
    whyItMatters: getWhyItMatters(category, importance),
    added,
    removed,
    actions: getActions(category),
    analysisMode: "deterministic",
  };
}

function segmentText(value: string): string[] {
  return value
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter((segment) => segment.length >= 24 && segment.length <= 500)
    .slice(0, 1_000);
}

function normalizeSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, "<time>")
    .replace(/\s+/g, " ")
    .trim();
}

function getWhyItMatters(
  category: MonitorCategory,
  importance: ChangeAnalysis["importance"],
): string {
  const prefix =
    importance === "high"
      ? "This is a commercially meaningful change. "
      : "This may indicate a market shift. ";
  const messages: Record<MonitorCategory, string> = {
    pricing:
      "It can change competitive positioning, deal economics, and the comparison story your team should tell.",
    product:
      "It may alter feature parity, customer expectations, or the strength of your current differentiation.",
    messaging:
      "It reveals who the competitor is targeting and which outcomes they now want to own.",
    documentation:
      "It may signal a capability launch, deprecation, integration change, or developer-experience investment.",
    hiring: "Hiring patterns expose strategic bets before they appear in polished announcements.",
    reviews:
      "Customer language surfaces recurring pain, delight, and openings your product or messaging can address.",
    other: "Review the evidence to decide whether product, marketing, or sales should respond.",
  };
  return prefix + messages[category];
}

function getActions(category: MonitorCategory): string[] {
  const actions: Record<MonitorCategory, string[]> = {
    pricing: [
      "Update the pricing battlecard",
      "Review open competitive deals",
      "Refresh the comparison page",
    ],
    product: [
      "Update feature parity notes",
      "Brief product marketing",
      "Review roadmap implications",
    ],
    messaging: [
      "Capture the new positioning",
      "Review campaign differentiation",
      "Brief sales on the narrative shift",
    ],
    documentation: [
      "Validate the technical change",
      "Notify product and solutions teams",
      "Update integration guidance",
    ],
    hiring: [
      "Map roles to strategic themes",
      "Share the hiring signal",
      "Watch for related product launches",
    ],
    reviews: [
      "Tag recurring customer pain",
      "Create a voice-of-customer brief",
      "Feed insights into product discovery",
    ],
    other: ["Review the evidence", "Assign an owner", "Add the finding to the weekly digest"],
  };
  return actions[category];
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1).trim()}…`;
}

async function enhanceAnalysisWithModel(
  fallback: ChangeAnalysis,
  snapshot: PageSnapshot,
  previous: PreviousSnapshot | undefined,
  category: MonitorCategory,
): Promise<ChangeAnalysis> {
  if (!fallback.changed || !previous) return fallback;

  const env = getRuntimeEnvironment();
  const apiUrl = env.OBSERI_AI_API_URL?.trim();
  const model = env.OBSERI_AI_MODEL?.trim();
  if (!apiUrl || !model) return fallback;

  const evidence = {
    source: snapshot.finalUrl,
    title: snapshot.title,
    category,
    previousCapturedAt: previous.capturedAt,
    currentCapturedAt: snapshot.capturedAt,
    added: fallback.added,
    removed: fallback.removed,
    deterministicScore: fallback.changeScore,
  };

  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.OBSERI_AI_API_KEY ? { authorization: `Bearer ${env.OBSERI_AI_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are Obseri, a careful B2B competitor-intelligence analyst. Use only the supplied before/after evidence. Never invent facts. Return strict JSON with keys summary, whyItMatters, importance, confidence, actions. importance must be low, medium, or high. confidence is 0 to 1. actions is an array of at most 4 concise actions.",
          },
          {
            role: "user",
            content: JSON.stringify(evidence),
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      console.warn("model_analysis_failed", response.status);
      return fallback;
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return fallback;
    const parsed = parseModelAnalysis(content);
    if (!parsed) return fallback;

    return {
      ...fallback,
      summary: parsed.summary,
      whyItMatters: parsed.whyItMatters,
      importance: parsed.importance,
      confidence: parsed.confidence,
      actions: parsed.actions,
      analysisMode: "model",
    };
  } catch (error) {
    console.warn("model_analysis_fallback", error instanceof Error ? error.message : error);
    return fallback;
  }
}

function parseModelAnalysis(content: string): {
  summary: string;
  whyItMatters: string;
  importance: "low" | "medium" | "high";
  confidence: number;
  actions: string[];
} | null {
  try {
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const value = JSON.parse(cleaned) as Record<string, unknown>;
    if (
      typeof value.summary !== "string" ||
      typeof value.whyItMatters !== "string" ||
      !["low", "medium", "high"].includes(String(value.importance)) ||
      typeof value.confidence !== "number" ||
      !Array.isArray(value.actions)
    ) {
      return null;
    }

    const actions = value.actions
      .filter((action): action is string => typeof action === "string")
      .map((action) => truncate(action.trim(), 140))
      .filter(Boolean)
      .slice(0, 4);
    if (!actions.length) return null;

    return {
      summary: truncate(value.summary.trim(), 420),
      whyItMatters: truncate(value.whyItMatters.trim(), 600),
      importance: value.importance as "low" | "medium" | "high",
      confidence: Number(Math.max(0, Math.min(1, value.confidence)).toFixed(2)),
      actions,
    };
  } catch {
    return null;
  }
}

function extractDiscoveredLinks(body: string, baseUrl: string): string[] {
  const values = [
    ...Array.from(body.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi), (match) => match[1]),
    ...Array.from(body.matchAll(/<loc[^>]*>([^<]+)<\/loc>/gi), (match) => match[1]),
  ];
  const base = new URL(baseUrl);
  const links = new Set<string>();

  for (const value of values) {
    try {
      const decoded = decodeEntities(value.trim());
      if (!decoded || decoded.startsWith("#")) continue;
      const url = new URL(decoded, base);
      if (!["http:", "https:"].includes(url.protocol) || url.hostname !== base.hostname) continue;
      url.hash = "";
      if (shouldSkipDiscoveredUrl(url)) continue;
      links.add(url.toString());
      if (links.size >= 100) break;
    } catch {
      // Ignore malformed links from untrusted source markup.
    }
  }

  return [...links];
}

function shouldSkipDiscoveredUrl(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  const isKnowledgeManifest = /\/llms(?:-full)?\.txt$/.test(path);
  return (
    (!isKnowledgeManifest &&
      /\.(?:avif|bmp|css|csv|docx?|eot|gif|ico|jpe?g|js|json|mov|mp3|mp4|ogg|otf|pdf|png|pptx?|rss|svg|ttf|txt|wav|webm|webp|woff2?|xlsx?|xml|zip)$/.test(
        path,
      )) ||
    /\/(?:admin|cart|checkout|login|logout|signin|signup|wp-admin)(?:\/|$)/.test(path)
  );
}
import { getRuntimeEnvironment } from "@/lib/runtime-env";
import { lookup } from "node:dns/promises";
