import { test, expect } from "@playwright/test";
import { createSoul } from "../../src/lib/soul";

for (const theme of ["light", "dark", "glass"] as const) {
  test(`installed ${theme} chat uses brand colors and a simple header`, async ({ page }) => {
    await page.setViewportSize({ width: 394, height: 620 });
    const soul = createSoul("https://merchant.example");
    soul.appearance.theme = theme;
    soul.appearance.accent = theme === "dark" ? "#0b0b0c" : "#7dd3fc";
    soul.personality.leadCapture = true;
    await page.addInitScript(() => {
      window.name = JSON.stringify({ session: "test-session", parentOrigin: location.origin });
    });
    await page.route(/neonauth.*\/auth\//, (route) => route.fulfill({ json: null }));
    await page.route(`**/api/souls/${soul.id}`, (route) => route.fulfill({ json: { soul } }));
    await page.route("**/api/souls/*/events", (route) => route.fulfill({ json: { ok: true } }));
    await page.route("**/api/voice/speak", (route) => route.fulfill({ status: 503, json: {} }));
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        json: { answer: "How can I help?", citations: [], leadIntent: "question" },
      }),
    );
    await page.goto(`/widget/${soul.id}?mode=chat`);
    const panel = page.locator("[data-chat-theme]");
    await expect(panel).toHaveAttribute("data-chat-theme", theme);
    if (theme === "glass") {
      // A translucent surface, not another opaque white theme.
      await expect(panel).toHaveCSS("background-color", /0\.68\)$/);
      await expect(panel).not.toHaveCSS("backdrop-filter", "none");
    } else {
      await expect(panel).toHaveCSS(
        "background-color",
        theme === "dark" ? "rgb(19, 18, 17)" : "rgb(255, 255, 255)",
      );
    }
    await expect(panel).toHaveCSS(
      "color",
      theme === "dark" ? "rgb(247, 247, 246)" : "rgb(33, 33, 32)",
    );
    await expect(page.getByRole("button", { name: /fullscreen|English|Hindi/i })).toHaveCount(0);
    const color = theme === "dark" ? "rgb(11, 11, 12)" : "rgb(125, 211, 252)";
    const ink = theme === "dark" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)";
    await page.getByPlaceholder("Ask this website...").fill("Hello there");
    const send = page.getByRole("button", { name: "Send message" });
    await expect(send).toHaveCSS("background-color", color);
    await expect(send).toHaveCSS("color", ink);
    await send.click();
    await expect(page.getByText("Hello there", { exact: true }).locator("..")).toHaveCSS(
      "background-color",
      color,
    );
    await expect(page.getByText("How can I help?", { exact: true })).toBeVisible();
    const followUp = page.getByRole("button", { name: "Want a personal follow-up?" });
    await expect(followUp).toHaveCSS("background-color", color);
    await followUp.click();
    const form = page.getByRole("dialog");
    await expect(form).toBeVisible();
    await expect(form).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(19, 18, 17)" : "rgb(255, 255, 255)",
    );
    await page.getByRole("button", { name: "Close contact form" }).click();
    await page.screenshot({ path: `test-results/chat-${theme}.png` });
    await page.getByRole("button", { name: "Open voice chat" }).click();
    await expect(page.getByRole("button", { name: "Start voice call", exact: true })).toHaveCSS(
      "background-color",
      color,
    );
    await expect(panel).toHaveAttribute("data-chat-theme", theme);
    await expect(page.getByRole("button", { name: "Close conversation" })).toBeInViewport();
    await page.getByRole("button", { name: "Open text chat" }).click();
    await expect(page.getByText("Hello there", { exact: true })).toBeVisible();
  });
}
