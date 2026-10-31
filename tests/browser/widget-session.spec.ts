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
  await page.getByRole("button", { name: "Ask a question", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Obseri website assistant"]');
  await expect(frame.getByPlaceholder("Ask this website...")).toBeVisible();
  expect(voiceRequests).toBe(0);
  await frame.getByRole("button", { name: "Close conversation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ask a question", exact: true })).toBeVisible();
});
