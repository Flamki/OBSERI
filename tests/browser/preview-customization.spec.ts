import { test, expect } from "@playwright/test";
import { createSoul } from "../../src/lib/soul";
import { BILLING_PLANS } from "../../src/lib/billing-plans";

for (const viewport of [
  { width: 1440, height: 600 },
  { width: 390, height: 500 },
]) {
  test(`preview customization stays usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const soul = createSoul("https://merchant.example");
    soul.status = "live";
    let workspace = { id: soul.workspaceId, name: "Test", activeSoulId: soul.id, souls: [soul] };
    const user = {
      id: "owner",
      name: "Owner",
      email: "owner@example.com",
      emailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await page.route("**/api/team?view=workspaces", (route) =>
      route.fulfill({
        json: { workspaces: [{ ownerId: user.id, name: "Test workspace", role: "owner" }] },
      }),
    );
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
      if (route.request().method() === "PUT") workspace = route.request().postDataJSON().workspace;
      return route.fulfill({ json: { workspace } });
    });
    await page.route("**/api/billing/summary", (route) =>
      route.fulfill({ json: { plan: BILLING_PLANS.launch } }),
    );
    await page.route("**/api/souls/*/conversations*", (route) =>
      route.fulfill({ json: { conversations: [] } }),
    );
    await page.route("https://merchant.example/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<html><body style="margin:0;background:#faf9f6;font-family:sans-serif"><div style="padding:40px"><h1>Merchant website</h1><p>Explore our services.</p><button onclick="this.textContent=\'Preview works\'">Try website</button><div style="height:1600px"></div></div></body></html>',
      }),
    );
    await page.route("**/api/voice/speak", (route) => route.fulfill({ status: 503, json: {} }));
    await page.goto("/app?view=playground");
    const drawer = page.getByRole("complementary", { name: "Visitor experience customization" });
    const settings = page.getByRole("region", { name: "Customization settings" });
    const preview = page.getByRole("region", { name: "Website preview", exact: true });
    await expect(drawer).toHaveCount(0);
    await page.getByRole("button", { name: "Open customization drawer" }).click();
    await expect(drawer).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const heading = drawer.getByText("Visitor experience", { exact: true });
    const integrate = drawer.getByRole("button", { name: "Looks right — integrate it" });
    await expect(integrate).toBeInViewport();
    await expect(heading).toBeInViewport();
    const headerY = (await heading.boundingBox())!.y;
    const footerY = (await integrate.boundingBox())!.y;
    await settings.hover();
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => settings.evaluate((element) => element.scrollTop)).toBeGreaterThan(200);
    expect((await heading.boundingBox())!.y).toBe(headerY);
    expect((await integrate.boundingBox())!.y).toBe(footerY);
    expect(await page.locator("main").evaluate((element) => element.scrollTop)).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const frame = page.frameLocator('iframe[title="Merchant website preview"]');
    expect(await frame.locator("body").evaluate(() => window.scrollY)).toBe(0);

    if (viewport.width > 1024) {
      await expect
        .poll(async () => {
          const left = await preview.boundingBox();
          const right = await drawer.boundingBox();
          return Math.abs(left!.x + left!.width - right!.x);
        })
        .toBeLessThan(1);
      // The real website remains interactive while editing its widget.
      await frame.getByRole("button", { name: "Try website" }).click();
      await expect(frame.getByRole("button", { name: "Preview works" })).toBeVisible();
    }
    await drawer.getByRole("button", { name: "Midnight Focused and cinematic" }).click();
    await expect(
      drawer.getByRole("button", { name: "Midnight Focused and cinematic" }),
    ).toHaveAttribute("aria-pressed", "true");
    await drawer.getByRole("button", { name: "Use accent #7dd3fc" }).click();
    await drawer.getByLabel("Launcher position").selectOption("bottom-left");
    await expect.poll(() => workspace.souls[0].appearance.position).toBe("bottom-left");
    expect(workspace.souls[0].appearance.theme).toBe("dark");
    expect(workspace.souls[0].appearance.accent).toBe("#7dd3fc");
    await page.screenshot({ path: `test-results/preview-customization-${viewport.width}.png` });
    await drawer.getByRole("button", { name: "Close customization drawer" }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ask a question" })).toBeInViewport();
    if (viewport.width > 1024) {
      await page.getByRole("button", { name: "Ask a question", exact: true }).click();
      const panel = page.locator("[data-chat-theme]");
      await panel.getByRole("button", { name: "Open voice chat", exact: true }).click();
      await expect(panel).toHaveCSS("background-color", "rgb(19, 18, 17)");
      await expect(panel.getByRole("button", { name: "Start voice call", exact: true })).toHaveCSS(
        "background-color",
        "rgb(125, 211, 252)",
      );
      await page.getByRole("button", { name: "Open customization drawer" }).click();
      await drawer.getByRole("button", { name: "Clean Bright and minimal" }).click();
      await expect(panel).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await drawer.getByRole("button", { name: "Use accent #0b0b0c" }).click();
      await expect(panel.getByRole("button", { name: "Start voice call", exact: true })).toHaveCSS(
        "color",
        "rgb(255, 255, 255)",
      );
      await drawer.getByRole("button", { name: "Midnight Focused and cinematic" }).click();
      await expect.poll(() => workspace.souls[0].appearance.theme).toBe("dark");
    }
    if (viewport.width <= 1024)
      await page.getByRole("button", { name: "Open customization drawer" }).click();
    await drawer.getByLabel("Launcher mode").selectOption("voice");
    const label = drawer.getByLabel("Launcher text", { exact: true });
    await label.fill("Talk with our team today please");
    await expect(label).toHaveValue("Talk with our team");
    await label.fill("abcdefghijklmnopqrstuvwxyz");
    await expect(label).toHaveValue("abcdefghijklmnopqrstuvwx");
    await label.fill("");
    await label.pressSequentially("Speak to us");
    await expect.poll(() => workspace.souls[0].appearance.launcherLabel).toBe("Speak to us");
    await expect.poll(() => workspace.souls[0].appearance.launcherMode).toBe("voice");
    await page.screenshot({ path: `test-results/launcher-settings-${viewport.width}.png` });
    await page.reload();
    await page.getByRole("button", { name: "Open customization drawer" }).click();
    await expect(
      drawer.getByRole("button", { name: "Midnight Focused and cinematic" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(drawer.getByLabel("Launcher position")).toHaveValue("bottom-left");
    await expect(drawer.getByLabel("Launcher mode")).toHaveValue("voice");
    await expect(drawer.getByLabel("Launcher text", { exact: true })).toHaveValue("Speak to us");
    await integrate.click();
    await expect(page).toHaveURL(/view=deploy/);
  });
}
