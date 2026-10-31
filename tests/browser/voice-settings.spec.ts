import { test, expect, type Page } from "@playwright/test";
import { createSoul } from "../../src/lib/soul";
import { BILLING_PLANS } from "../../src/lib/billing-plans";

async function studio(page: Page) {
  const soul = createSoul("https://merchant.example");
  soul.status = "live";
  soul.voice.enabled = true;
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
  return { saved: () => workspace.souls[0] };
}

// Real browser audio playback with deterministic, silent PCM (no paid TTS calls).
function wav(seconds = 20) {
  const size = 8000 * seconds * 2;
  const buffer = Buffer.alloc(44 + size);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + size, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(size, 40);
  return buffer;
}

test("voice audition, selection, speed and enabled state stay distinct and persist", async ({
  page,
}) => {
  const { saved } = await studio(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  let published: ReturnType<typeof createSoul> | null = null;
  await page.route("**/api/souls/publish", (route) => {
    published = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { status: "live" } });
  });
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/voice/speak", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ contentType: "audio/wav", body: wav() });
  });
  await page.goto("/app?view=voice");
  await expect(page.getByRole("heading", { name: "Give your assistant a voice." })).toBeVisible();
  await page.getByLabel("Preview script", { exact: true }).fill("Welcome to our shop.");
  await page.getByLabel("Speaking speed", { exact: true }).fill("1.2");
  await page.getByRole("button", { name: "Preview Theo", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Playing Theo" })).toBeVisible();
  expect(requests[0]).toMatchObject({
    profileId: "M3",
    speed: 1.2,
    text: "Welcome to our shop.",
    qualitySteps: 5,
  });
  expect(saved().voice.profileId).toBe("F1");
  await page.getByRole("button", { name: "Stop Theo", exact: true }).click();
  await expect(page.getByText("Ready when you are")).toBeVisible();
  await page.getByRole("button", { name: "Select Theo", exact: true }).click();
  await expect.poll(() => saved().voice.profileId).toBe("M3");
  await page.getByRole("switch", { name: "Enable voice conversations" }).click();
  await page.getByRole("button", { name: "Select Luma", exact: true }).click();
  await expect.poll(() => saved().voice.profileId).toBe("F2");
  expect(saved().voice.enabled).toBe(false);
  await page.getByRole("button", { name: "Reset speed" }).click();
  await expect.poll(() => saved().voice.speed).toBe(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Select Luma", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("switch", { name: "Enable voice conversations" })).not.toBeChecked();
  await page.getByRole("switch", { name: "Enable voice conversations" }).click();
  await page.getByLabel("Preview script", { exact: true }).fill("   ");
  await expect(page.getByRole("button", { name: "Preview selected voice" })).toBeDisabled();
  await page.getByRole("button", { name: "Sample text" }).click();
  await expect(page.getByRole("button", { name: "Preview selected voice" })).toBeEnabled();
  await page
    .getByRole("heading", { name: "Give your assistant a voice." })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/voice-desktop.png", fullPage: true });
  await page.getByLabel("Search voices", { exact: true }).fill("zzzz");
  await expect(page.getByText("No voices found")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button", { name: "Male", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Select / })).toHaveCount(5);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("heading", { name: "Give your assistant a voice." })
    .scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/voice-mobile.png", fullPage: true });
  await page.getByLabel("Preview script", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/voice-mobile-controls.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole("button", { name: "Review & publish" }).click();
  await expect(page.getByRole("button", { name: "Publish changes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish changes", exact: true }).click();
  await expect
    .poll(() => published?.voice)
    .toMatchObject({
      enabled: true,
      profileId: "F2",
      profileName: "Luma",
      speed: 1,
      provider: "supertonic",
    });
});

test("cancelled generation never plays late; errors recover and completed audio returns to idle", async ({
  page,
}) => {
  await studio(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route("**/api/voice/speak", async (route) => {
    calls++;
    if (calls === 1) {
      await gate;
      await route.fulfill({ contentType: "audio/wav", body: wav() }).catch(() => {});
    } else if (calls === 2)
      await route.fulfill({
        status: 503,
        json: { error: { message: "Voice service unavailable. Please retry." } },
      });
    else await route.fulfill({ contentType: "audio/wav", body: wav(1) });
  });
  await page.goto("/app?view=voice");
  await page.getByRole("button", { name: "Preview selected voice" }).click();
  await expect.poll(() => calls).toBe(1);
  await expect(page.getByText("Preparing Aster…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop selected voice" }).click();
  release();
  await expect(page.getByText("Ready when you are")).toBeVisible();
  await page.getByRole("button", { name: "Preview selected voice" }).click();
  await expect(page.getByRole("alert")).toHaveText("Voice service unavailable. Please retry.");
  await page.getByRole("button", { name: "Preview selected voice" }).click();
  await expect(page.getByText("Playing Aster…", { exact: true })).toBeVisible();
  await expect(page.getByText("Ready when you are")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
