import { beforeEach, expect, it, vi } from "vitest";
import { ingestWebsite } from "./knowledge";
import { fetchPublicText, scanPublicPage, type PageSnapshot } from "./scanner";
vi.mock("./scanner", async (original) => ({
  ...(await original<typeof import("./scanner")>()),
  fetchPublicText: vi.fn(),
  scanPublicPage: vi.fn(),
}));
const root = "https://merchant.example/";
function snapshot(url: string, text: string, extra: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    url,
    finalUrl: url,
    title: url,
    description: "",
    capturedAt: new Date().toISOString(),
    hash: url,
    normalizedText: text,
    excerpt: text,
    wordCount: text.split(/\s+/).length,
    statusCode: 200,
    contentType: "text/html",
    sizeBytes: text.length,
    ...extra,
  };
}
beforeEach(() => {
  vi.mocked(fetchPublicText)
    .mockReset()
    .mockImplementation(async (url) => ({ url, status: 404, contentType: "text/plain", text: "" }));
  vi.mocked(scanPublicPage).mockReset();
});
it("retains similar product pages with different prices and short policy pages", async () => {
  const template = "A useful product with excellent features and customer service. ".repeat(100);
  vi.mocked(scanPublicPage).mockImplementation(async ({ url }) => ({
    durationMs: 1,
    snapshot: snapshot(
      url,
      url === root
        ? template + "$29"
        : url.endsWith("pro")
          ? template + "$49"
          : "Returns accepted within fourteen days of purchase.",
      { discoveredLinks: url === root ? [root + "pro", root + "returns"] : [] },
    ),
  }));
  const result = await ingestWebsite({ url: root, maxPages: 3, maxDepth: 2 });
  expect(result.pages).toHaveLength(3);
  expect(
    result.pages.flatMap((page) => page.chunks).some((chunk) => chunk.text.includes("$49")),
  ).toBe(true);
  expect(result.pages.some((page) => page.content?.includes("fourteen days"))).toBe(true);
});
it("counts unchanged pages toward the crawl budget", async () => {
  vi.mocked(scanPublicPage).mockResolvedValue({ durationMs: 1, notModified: true });
  const result = await ingestWebsite({
    url: root,
    maxPages: 1,
    maxDepth: 2,
    validators: Array.from({ length: 10 }, (_, i) => ({ url: root + i, etag: "old" })),
  });
  expect(scanPublicPage).toHaveBeenCalledTimes(1);
  expect(result.status).toBe("ready");
  expect(result.unchangedUrls).toEqual([root]);
});
it("reports truncated source coverage rather than silently claiming completeness", async () => {
  vi.mocked(scanPublicPage).mockResolvedValue({
    durationMs: 1,
    snapshot: snapshot(root, "Readable content from a very long page.", { truncated: true }),
  });
  const result = await ingestWebsite({ url: root, maxPages: 1, maxDepth: 0 });
  expect(result.pages[0].status).toBe("warning");
  expect(result.errors[0].message).toContain("120,000");
});
it("stops before scanning when the caller disconnects", async () => {
  const abort = new AbortController();
  abort.abort();
  const result = await ingestWebsite({
    url: root,
    maxPages: 10,
    maxDepth: 2,
    signal: abort.signal,
  });
  expect(scanPublicPage).not.toHaveBeenCalled();
  expect(result.errors.some((error) => error.message.includes("time limit"))).toBe(true);
});
