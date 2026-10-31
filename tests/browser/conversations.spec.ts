import { test, expect, type Locator } from "@playwright/test";
import { createSoul, type SoulConversation } from "../../src/lib/soul";
import { BILLING_PLANS } from "../../src/lib/billing-plans";

const scrollTop = (pane: Locator) => pane.evaluate((element) => element.scrollTop);

test.beforeEach(async ({ page }) => {
  const soul = createSoul("https://merchant.example");
  soul.status = "live";
  const workspace = { id: soul.workspaceId, name: "Test", activeSoulId: soul.id, souls: [soul] };
  const user = {
    id: "test-owner",
    name: "Owner",
    email: "owner@example.com",
    emailVerified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const conversations: SoulConversation[] = Array.from({ length: 30 }, (_, index) => ({
    id: `conversation-${index}`,
    visitorLabel: `Visitor ${index + 1}`,
    channel: "widget",
    leadIntent: "none",
    startedAt: "2026-11-01T00:00:00.000Z",
    updatedAt: new Date(Date.UTC(2026, 10, 1) - index * 60_000).toISOString(),
    messages: Array.from({ length: 40 }, (_, message) => ({
      id: `message-${index}-${message}`,
      role: message % 2 ? "assistant" : "visitor",
      content: `Conversation ${index + 1}, message ${message + 1}. ${message % 2 ? "Here is more information about the website and the services available to visitors." : "Can you tell me about your services?"}`,
      createdAt: "2026-11-01T00:00:00.000Z",
    })),
  }));
  await page.route(/neonauth.*\/auth\//, (route) =>
    route.fulfill({
      json: route.request().url().includes("get-session")
        ? {
            user,
            session: {
              id: "session",
              userId: user.id,
              token: "test-token",
              expiresAt: "2099-01-01T00:00:00.000Z",
            },
          }
        : { token: "test.jwt.token" },
    }),
  );
  await page.route("**/api/workspace", (route) => route.fulfill({ json: { workspace } }));
  await page.route("**/api/billing/summary", (route) =>
    route.fulfill({ json: { plan: BILLING_PLANS.launch } }),
  );
  await page.route("**/api/souls/*/conversations*", (route) =>
    route.fulfill({ json: { conversations } }),
  );
});

test("inbox and transcript scroll independently with stable headers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app?view=conversations");
  const list = page.getByRole("region", {
    name: "Conversation list",
    exact: true,
    includeHidden: true,
  });
  const messages = page.getByRole("region", {
    name: "Conversation messages",
    exact: true,
    includeHidden: true,
  });
  const heading = page.getByRole("heading", { name: "Visitor 1", exact: true });
  await expect(heading).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const headingBox = await heading.boundingBox();
  const searchBox = await page.getByRole("textbox", { name: "Search conversations" }).boundingBox();

  await messages.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => scrollTop(messages)).toBeGreaterThan(300);
  expect(await scrollTop(list)).toBe(0);
  const transcriptPosition = await scrollTop(messages);
  await list.hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => scrollTop(list)).toBeGreaterThan(250);
  expect(await scrollTop(messages)).toBe(transcriptPosition);
  expect(await heading.boundingBox()).toEqual(headingBox);
  expect(await page.getByRole("textbox", { name: "Search conversations" }).boundingBox()).toEqual(
    searchBox,
  );
  expect(await scrollTop(page.locator("main"))).toBe(0);

  // Reaching a pane's end must not scroll the surrounding page.
  await messages.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await messages.hover();
  await page.mouse.wheel(0, 700);
  expect(await scrollTop(page.locator("main"))).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole("textbox", { name: "Search conversations" }).fill("Visitor 2");
  await list.getByRole("button").first().click();
  await expect.poll(() => scrollTop(messages)).toBe(0);
  await expect(page.getByRole("heading", { name: "Visitor 2", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/conversations-desktop.png" });
  await page.setViewportSize({ width: 1280, height: 600 });
  await expect(messages).toBeVisible();
  expect(
    await page.locator("main").evaluate((element) => element.scrollHeight <= element.clientHeight),
  ).toBe(true);
  // Regular settings pages still use the app's normal page scrolling.
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(page.locator("main")).toHaveCSS("overflow-y", "auto");
});

test("mobile opens a full-height transcript and returns to the inbox position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app?view=conversations");
  const list = page.getByRole("region", {
    name: "Conversation list",
    exact: true,
    includeHidden: true,
  });
  const messages = page.getByRole("region", {
    name: "Conversation messages",
    exact: true,
    includeHidden: true,
  });
  await expect(list).toBeVisible();
  await expect(messages).toBeHidden();
  await list.evaluate((element) => {
    element.scrollTop = 500;
  });
  const next = list.getByRole("button").nth(6);
  const listPosition = await scrollTop(list);
  await next.click();
  await expect(messages).toBeVisible();
  await expect(list).toBeHidden();
  const back = page.getByRole("button", { name: "Back to conversations" });
  const backBox = await back.boundingBox();
  await messages.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => scrollTop(messages)).toBeGreaterThan(300);
  expect(await back.boundingBox()).toEqual(backBox);
  expect(await scrollTop(page.locator("main"))).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/conversations-mobile.png" });
  await back.click();
  await expect(list).toBeVisible();
  expect(await scrollTop(list)).toBe(listPosition);
  await page.getByRole("textbox", { name: "Search conversations" }).fill("not a visitor");
  await expect(page.getByText("Nothing matches this filter.")).toBeVisible();
  await expect(messages).toBeHidden();
});

test("owner can test and save an approved answer from a conversation", async ({ page }) => {
  let tested = false;
  let saved = false;
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON();
    tested = body.chunks.some((chunk: { text: string }) =>
      chunk.text.includes("Our service costs $29 per month."),
    );
    await route.fulfill({
      json: {
        answer: "Our service costs $29 per month.",
        citations: [],
        mode: "model",
        leadIntent: "none",
      },
    });
  });
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    const workspace = route.request().postDataJSON();
    saved = workspace.souls.some((soul: { knowledge: { pages: { content?: string }[] } }) =>
      soul.knowledge.pages.some((p) =>
        p.content?.includes("Approved answer: Our service costs $29 per month."),
      ),
    );
    await route.fulfill({ json: { workspace: { ...workspace, revision: 1 } } });
  });
  await page.goto("/app?view=conversations");
  await page.getByRole("button", { name: "Correct answer", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Approved answer").fill("Our service costs $29 per month.");
  await dialog.getByRole("button", { name: "Test answer", exact: true }).click();
  await expect(
    dialog.getByText("Our service costs $29 per month.", { exact: true }).last(),
  ).toBeVisible();
  await expect.poll(() => tested).toBe(true);
  await expect(dialog.getByText(/AI answer/)).toBeVisible();
  await dialog.getByRole("button", { name: "Save to knowledge" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => saved).toBe(true);
});
