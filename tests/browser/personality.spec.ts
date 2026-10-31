import { test, expect } from "@playwright/test";
import { createSoul, type PersonalityConfig } from "../../src/lib/soul";
import { BILLING_PLANS } from "../../src/lib/billing-plans";

test("personality preferences survive saving, reach a real chat request, and publish unchanged", async ({
  page,
}) => {
  const soul = createSoul("https://merchant.example");
  soul.status = "live";
  const originalGreeting = soul.personality.greeting;
  let workspace = { id: soul.workspaceId, name: "Test", activeSoulId: soul.id, souls: [soul] };
  const user = {
    id: "test-owner",
    name: "Owner",
    email: "owner@example.com",
    emailVerified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
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
  await page.route("**/api/workspace", (route) => {
    if (route.request().method() === "PUT") workspace = route.request().postDataJSON();
    return route.fulfill({ json: { workspace } });
  });
  await page.route("**/api/billing/summary", (route) =>
    route.fulfill({ json: { plan: BILLING_PLANS.launch } }),
  );
  await page.route("**/api/souls/*/conversations*", (route) =>
    route.fulfill({ json: { conversations: [] } }),
  );
  const requests: PersonalityConfig[] = [];
  await page.route("**/api/chat", (route) => {
    requests.push(route.request().postDataJSON().personality);
    return route.fulfill({
      json: {
        answer: "Respuesta de prueba.",
        citations: [],
        followUp: "",
        leadIntent: "none",
        mode: "model",
      },
    });
  });
  const published: (typeof soul)[] = [];
  await page.route("**/api/souls/publish", (route) => {
    published.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { status: "live" } });
  });
  await page.goto("/app?view=personality");
  await expect(page.getByRole("heading", { name: "Make it sound like you." })).toBeVisible();
  await page.getByRole("button", { name: /Sales advisor Help people/ }).click();
  await expect(page.getByLabel("Welcome message")).toHaveValue(originalGreeting);
  await page.getByLabel("Assistant name").fill("Alex");
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await page.getByRole("radio", { name: /Detailed/ }).check();
  await page.getByLabel("Reply language").selectOption("es");
  await page.getByRole("radio", { name: /Answer directly/ }).check();
  await page.getByLabel("New character trait").fill("thoughtful");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove trait thoughtful" })).toBeVisible();
  await expect.poll(() => workspace.souls[0].personality.conversationStyle?.language).toBe("es");
  await page.getByRole("heading", { name: "Make it sound like you." }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/personality-desktop.png", fullPage: true });
  await page.getByRole("tab", { name: "Boundaries", exact: true }).click();
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await page.getByLabel("Rule 4", { exact: true }).fill("Never promise discounts.");
  await expect
    .poll(() => workspace.souls[0].personality.guardrails.at(-1))
    .toBe("Never promise discounts.");
  await page.reload();
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await expect(page.getByLabel("Reply language")).toHaveValue("es");
  await expect(page.getByRole("radio", { name: /Detailed/ })).toBeChecked();
  await page.getByRole("tab", { name: "Try it", exact: true }).click();
  await page.getByPlaceholder("Ask Alex anything").fill("Tell me about your services");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Respuesta de prueba.")).toBeVisible();
  expect(requests[0].conversationStyle).toEqual({
    length: "detailed",
    language: "es",
    emojis: "none",
    nextStep: "direct",
  });
  expect(requests[0].guardrails).toContain("Never promise discounts.");
  expect(published).toHaveLength(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await expect(page.getByLabel("Reply language")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/personality-mobile.png", fullPage: true });
  await page.getByRole("tab", { name: "Conversation", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Boundaries", exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Review & publish" }).click();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect.poll(() => published.length).toBe(1);
  expect(published[0].personality.conversationStyle).toEqual(requests[0].conversationStyle);
  expect(published[0].personality.guardrails).toContain("Never promise discounts.");
});
