import { afterEach, expect, it, vi } from "vitest";
import { scanPublicPage, needsBrowserRendering } from "./scanner";
import { renderPublicPage } from "./server/render-page";
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
}));
vi.mock("./server/render-page", () => ({ renderPublicPage: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("indexes JavaScript-rendered text and links instead of the empty app shell", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          '<html><title>Loading</title><div id="root"></div><script src="/app.js"></script></html>',
          { headers: { "content-type": "text/html", etag: "shell-only" } },
        ),
      ),
  );
  vi.mocked(renderPublicPage).mockResolvedValue({
    title: "Returns",
    text: "Our return policy allows unused products to be returned within thirty days.",
    links: ["https://example.com/shipping", "https://elsewhere.com/"],
    finalUrl: "https://example.com/",
  });
  const result = await scanPublicPage({ url: "https://example.com/", rendering: "auto" });
  expect(result.snapshot?.normalizedText).toContain("thirty days");
  expect(result.snapshot?.discoveredLinks).toEqual(["https://example.com/shipping"]);
  expect(result.snapshot?.etag).toBeUndefined();
  expect(result.snapshot?.rendered).toBe(true);
});
it("always-render mode does not accept stale HTML cache validators", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response("<p>" + "Static content. ".repeat(100) + "</p>", {
        headers: { "content-type": "text/html" },
      }),
    );
  vi.stubGlobal("fetch", fetch);
  vi.mocked(renderPublicPage).mockResolvedValue({
    title: "Updated",
    text: "Fresh product availability from the current JavaScript application.",
    links: [],
    finalUrl: "https://example.com/",
  });
  await scanPublicPage({
    url: "https://example.com/",
    rendering: "always",
    validators: { etag: "old" },
  });
  expect(new Headers(fetch.mock.calls[0][1].headers).has("if-none-match")).toBe(false);
  expect(renderPublicPage).toHaveBeenCalledOnce();
});
it("keeps substantial static pages on the fast HTML path", () => {
  expect(needsBrowserRendering('<div id="root"></div>', "Loading")).toBe(true);
  expect(needsBrowserRendering("<main>Article</main>", "Useful article text. ".repeat(100))).toBe(
    false,
  );
});
