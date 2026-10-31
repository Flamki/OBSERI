import { test, expect } from "@playwright/test";
import { createSoul } from "../../src/lib/soul";
import { supertonicVoices } from "../../src/lib/voice-catalog";
import { BILLING_PLANS } from "../../src/lib/billing-plans";

test("voice library offers only Neural presets and never falls back on preview failure", async ({
  page,
}) => {
  const soul = createSoul("https://merchant.example");
  soul.voice.provider = "browser";
  soul.voice.profileId = "old-device-voice";
  const workspace = { id: soul.workspaceId, name: "Test", activeSoulId: soul.id, souls: [soul] };
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
  await page.route("**/api/workspace", (route) => route.fulfill({ json: { workspace } }));
  await page.route("**/api/billing/summary", (route) =>
    route.fulfill({ json: { plan: BILLING_PLANS.launch } }),
  );
  await page.route("**/api/souls/*/conversations*", (route) =>
    route.fulfill({ json: { conversations: [] } }),
  );
  await page.addInitScript(() => {
    window.speechSynthesis.speak = () => {
      document.documentElement.dataset.browserVoiceUsed = "yes";
    };
  });
  let request: Record<string, unknown> | undefined;
  await page.route("**/api/voice/speak", (route) => {
    request = route.request().postDataJSON();
    return route.fulfill({
      status: 503,
      json: { error: { message: "Neural voice test unavailable" } },
    });
  });
  await page.goto("/app?view=voice");
  await expect(page.getByText("10 voices", { exact: true })).toBeVisible();
  for (const voice of supertonicVoices)
    await expect(
      page.getByRole("button", { name: `Preview ${voice.name}`, exact: true }),
    ).toBeVisible();
  await expect(page.getByRole("button", { name: "Browser", exact: true })).toHaveCount(0);
  await expect(page.getByText("Clone an authorized voice")).toHaveCount(0);
  await expect(page.getByText(/On-device/)).toHaveCount(0);
  await page.getByRole("button", { name: "Preview Nora", exact: true }).click();
  await expect(page.getByText("Neural voice test unavailable", { exact: true })).toBeVisible();
  expect(request).toMatchObject({ provider: "supertonic", profileId: "F3" });
  expect(await page.locator("html").getAttribute("data-browser-voice-used")).toBeNull();
  await page.screenshot({ path: "test-results/neural-library.png", fullPage: true });
});

test("signed-out landing demo requests Neural audio and reports failure without browser speech", async ({
  page,
}) => {
  await page.route(/neonauth.*\/auth\//, (route) => route.fulfill({ json: null }));
  await page.addInitScript(() => {
    window.speechSynthesis.speak = () => {
      document.documentElement.dataset.browserVoiceUsed = "yes";
    };
  });
  let request: Record<string, unknown> | undefined;
  await page.route("**/api/voice/speak", (route) => {
    request = route.request().postDataJSON();
    return route.fulfill({ status: 503, json: { error: { message: "Unavailable" } } });
  });
  await page.goto("/");
  const voiceTab = page.getByRole("tab", { name: "Voice agent", exact: true });
  // The marketing page is server rendered; wait for hydration to wire its tabs.
  await expect(async () => {
    await voiceTab.click();
    await expect(voiceTab).toHaveAttribute("aria-selected", "true", { timeout: 1000 });
  }).toPass();
  await page.getByRole("button", { name: "Call Aster", exact: true }).click();
  await expect(
    page.getByText("Neural voice is unavailable. Please try again.", { exact: true }),
  ).toBeVisible();
  expect(request).toMatchObject({
    provider: "supertonic",
    profileId: "F1",
    soulId: "obseri-landing-voice-demo",
  });
  expect(await page.locator("html").getAttribute("data-browser-voice-used")).toBeNull();
});
