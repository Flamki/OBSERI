import { test, expect } from "@playwright/test";

const paths = [
  "/",
  "/about",
  "/pricing",
  "/ai-voice-agent-for-website",
  "/ai-chatbot-trained-on-your-website",
  "/ai-chatbot-for-lead-generation",
  "/website-chatbot-setup-guide",
];

test("public pages expose readable content and unique metadata without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const path of paths) {
    const response = await page.goto(`http://127.0.0.1:8080${path}`);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("h1"), path).toHaveCount(1);
    await expect(page.locator("h1"), path).toBeVisible();
    const title = await page.title();
    expect(titles.has(title), path).toBe(false);
    titles.add(title);
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description?.length, path).toBeGreaterThan(60);
    expect(descriptions.has(description!), path).toBe(false);
    descriptions.add(description!);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://obseri.com${path}`,
    );
    await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute("content", /noindex/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      "https://obseri.com/obseri-social-card.png",
    );
    const schemas = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(schemas.length, path).toBeGreaterThan(0);
    schemas.forEach((schema) => expect(JSON.parse(schema)["@context"]).toBe("https://schema.org"));
    expect(
      await page.locator('a[href^="mailto:ayush@flamkilabs.com"]').count(),
      path,
    ).toBeGreaterThan(0);
    expect(await page.locator("body").innerText(), path).not.toMatch(
      /@gmail\.com|flamki@obseri\.com/,
    );
  }
  await context.close();
});

test("public pages fit a small mobile viewport after hydration", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator("h1"), path).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content, path).toBeLessThanOrEqual(dimensions.width + 1);
  }
});

test("sitemap lists public canonical pages and private routes are noindex", async ({
  request,
  page,
}) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  expect(urls.sort()).toEqual(paths.map((path) => `https://obseri.com${path}`).sort());
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Sitemap: https://obseri.com/sitemap.xml");
  for (const path of ["/auth/sign-in", "/app"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute("content", /noindex/);
  }
});
