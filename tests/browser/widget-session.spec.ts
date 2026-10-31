import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createSoul } from "../../src/lib/soul";
// Allow the synthetic merchant to embed the loopback development server.
test.use({ launchOptions: { args: ["--disable-features=LocalNetworkAccessChecks"] } });
test("cross-site embed starts chat when the browser clears window.name", async ({ page }) => {
  let voiceRequests = 0;
  await page.route("**/api/voice/speak", (route) => {
    voiceRequests++;
    return route.fulfill({ status: 401, json: { error: { message: "Unexpected voice request" } } });
  });
  const embed = await readFile(new URL("../../public/obseri-widget.js", import.meta.url), "utf8");
  await page.route("**/obseri-widget.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: embed }),
  );
  const soul = createSoul("http://127.0.0.2:8080");
  let soulRequests = 0;
  soul.personality.leadCapture = true;
  await page.addInitScript(() => {
    window.name = "";
  });
  await page.route("http://127.0.0.2:8080/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><body><script src="http://127.0.0.1:8080/obseri-widget.js" data-soul-id="${soul.id}" data-widget-token="obswgt_test"></script></body></html>`,
    }),
  );
  await page.route("**/api/widgets/*/session?*", (route) =>
    route.fulfill({
      headers: { "access-control-allow-origin": "http://127.0.0.2:8080" },
      json: { session: "test-session", parentOrigin: "http://127.0.0.2:8080" },
    }),
  );
  await page.route(`**/api/souls/${soul.id}`, (route) => {
    soulRequests++;
    expect(route.request().headers().authorization).toBe("Bearer test-session");
    return route.fulfill({ json: { soul } });
  });
  await page.route("**/api/souls/*/analytics", (route) =>
    route.fulfill({
      headers: { "access-control-allow-origin": "http://127.0.0.2:8080" },
      json: { accepted: true },
    }),
  );
  await page.goto("http://127.0.0.2:8080/");
  const panel = page.locator(`#obseri-panel-${soul.id}`);
  const iframe = page.locator('iframe[title="Obseri website assistant"]');
  // It is fully prepared without opening it or starting a voice request.
  await expect(iframe).toHaveCSS("opacity", "1");
  await expect(panel).toHaveAttribute("aria-hidden", "true");
  expect(soulRequests).toBe(1);
  await page.getByRole("button", { name: "Ask a question", exact: true }).click();
  await expect(panel).toHaveAttribute("data-state", "open");
  const frame = page.frameLocator('iframe[title="Obseri website assistant"]');
  await expect(frame.getByPlaceholder("Ask this website...")).toBeVisible();
  await expect(iframe).toHaveCSS("filter", "none");
  await expect(panel).toHaveCSS("border-radius", "28px");
  await frame.getByPlaceholder("Ask this website...").fill("Keep my draft");
  expect(voiceRequests).toBe(0);
  await frame.getByRole("button", { name: "Close conversation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ask a question", exact: true })).toBeVisible();
  await expect(panel).toHaveCSS("visibility", "hidden");
  const openingSize = await page.evaluate(async () => {
    document.querySelector<HTMLButtonElement>('button[aria-label="Ask a question"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const rect = document.querySelector('[id^="obseri-panel-"]')!.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(openingSize.width).toBeLessThan(394);
  expect(openingSize.height).toBeGreaterThan(60);
  expect(openingSize.height).toBeLessThan(620);
  await expect(panel).toHaveAttribute("data-state", "open");
  await expect(frame.getByPlaceholder("Ask this website...")).toHaveValue("Keep my draft");
  expect(soulRequests).toBe(1);
  await frame.getByRole("button", { name: "Close conversation", exact: true }).click();
  await expect(panel).toHaveAttribute("data-state", "closing");
  await page.waitForTimeout(160);
  const shrinking = await panel.boundingBox();
  expect(shrinking!.height).toBeGreaterThan(60);
  expect(shrinking!.height).toBeLessThan(620);
  await expect(panel).toHaveAttribute("data-state", "closed");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Ask a question", exact: true }).click();
  await expect(panel).toHaveAttribute("data-state", "open");
  await expect(panel).toHaveCSS("transition-duration", "0s");
  await frame.getByRole("button", { name: "Close conversation", exact: true }).click();
  await expect(panel).toHaveCSS("visibility", "hidden");
});

test("a cold connection opens immediately and can be closed before loading finishes", async ({
  page,
}) => {
  const embed = await readFile(new URL("../../public/obseri-widget.js", import.meta.url), "utf8");
  let release!: () => void;
  const sessionGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("https://merchant.example/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body><button id="host-action">Website action</button><script src="https://obseri.example/obseri-widget.js" data-soul-id="cold" data-widget-token="test"></script></body></html>',
    }),
  );
  await page.route("https://obseri.example/**", async (route) => {
    if (route.request().url().endsWith(".js"))
      return route.fulfill({ contentType: "application/javascript", body: embed });
    if (route.request().url().includes("/session?")) {
      await sessionGate;
      return route.fulfill({
        headers: { "access-control-allow-origin": "https://merchant.example" },
        json: { session: "test", parentOrigin: "https://merchant.example" },
      });
    }
    return route.fulfill({
      contentType: "text/html",
      body: '<script>parent.postMessage({type:"obseri:loaded"},"https://merchant.example")</script>',
    });
  });
  await page.goto("https://merchant.example/");
  const launcher = page.getByRole("button", { name: "Ask a question", exact: true });
  await launcher.click();
  const panel = page.locator("#obseri-panel-cold");
  await expect(panel).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByRole("button", { name: "Close chat", exact: true })).toBeVisible();
  await expect(page.getByText("Connecting…", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close chat", exact: true }).click();
  release();
  await expect(page.locator("iframe")).toHaveCSS("opacity", "1");
  await expect(panel).toHaveAttribute("aria-hidden", "true");
  await expect(launcher).toBeFocused();
  await page.getByRole("button", { name: "Website action" }).click();
  await launcher.click();
  await expect(panel).toHaveAttribute("data-state", "open");
});

for (const mode of ["chat", "both", "voice"] as const) {
  test(`published ${mode} launcher applies label, glass and allowed controls`, async ({ page }) => {
    const embed = await readFile(new URL("../../public/obseri-widget.js", import.meta.url), "utf8");
    const soul = createSoul("http://127.0.0.2:8080");
    soul.appearance = {
      ...soul.appearance,
      theme: "glass",
      launcherMode: mode,
      launcherLabel: "Meet our team",
    };
    let voiceRequests = 0;
    await page.route("**/api/voice/speak", (route) => {
      voiceRequests++;
      return route.fulfill({ status: 503, json: {} });
    });
    await page.route("**/obseri-widget.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: embed }),
    );
    await page.route("http://127.0.0.2:8080/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<html><body style="background:repeating-linear-gradient(30deg,#b8d6ea 0 60px,#e8d4c7 60px 120px);height:100vh"><script src="http://127.0.0.1:8080/obseri-widget.js" data-soul-id="${soul.id}" data-widget-token="test"></script></body></html>`,
      }),
    );
    await page.route("**/api/widgets/*/session?*", (route) =>
      route.fulfill({
        headers: { "access-control-allow-origin": "http://127.0.0.2:8080" },
        json: {
          session: "test",
          parentOrigin: "http://127.0.0.2:8080",
          appearance: soul.appearance,
        },
      }),
    );
    await page.route(`**/api/souls/${soul.id}`, (route) => route.fulfill({ json: { soul } }));
    await page.route("**/api/souls/*/analytics", (route) =>
      route.fulfill({
        headers: { "access-control-allow-origin": "http://127.0.0.2:8080" },
        json: { accepted: true },
      }),
    );
    await page.route("**/api/souls/*/events", (route) => route.fulfill({ json: { ok: true } }));
    await page.goto("http://127.0.0.2:8080/");
    const launcher = page.getByRole("button", { name: "Meet our team", exact: true });
    await expect(launcher).toBeVisible();
    await expect(launcher).toHaveCSS("backdrop-filter", "blur(28px) saturate(1.6)");
    await launcher.click();
    const frame = page.frameLocator('iframe[title="Obseri website assistant"]');
    await expect(frame.locator("[data-chat-theme]")).toHaveAttribute("data-chat-theme", "glass");
    await expect(page.locator(`[id="obseri-panel-${soul.id}"]`)).toHaveAttribute(
      "data-state",
      "open",
    );
    if (mode === "voice") {
      await expect(
        frame.getByRole("button", { name: "Start voice call", exact: true }),
      ).toBeVisible();
      await expect(frame.getByPlaceholder("Ask this website...")).toHaveCount(0);
      await expect(frame.getByRole("button", { name: "Open text chat" })).toHaveCount(0);
    } else {
      await expect(frame.getByPlaceholder("Ask this website...")).toBeVisible();
      expect(voiceRequests).toBe(0);
      if (mode === "chat") {
        await expect(frame.getByRole("button", { name: "Open voice chat" })).toHaveCount(0);
        await expect(frame.getByText("Voice uses your microphone", { exact: false })).toHaveCount(
          0,
        );
      } else {
        await frame.getByRole("button", { name: "Open voice chat" }).click();
        await expect(
          frame.getByRole("button", { name: "Start voice call", exact: true }),
        ).toBeVisible();
        await frame.getByRole("button", { name: "Open text chat" }).click();
        await expect(frame.getByText("Chat with us", { exact: true })).toBeVisible();
      }
    }
    await page.screenshot({ path: `test-results/launcher-${mode}-glass.png` });
    await frame.getByRole("button", { name: "Close conversation" }).click();
    await expect(launcher).toBeVisible();
  });
}
