import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createSoul } from "../../src/lib/soul";
import { BILLING_PLANS } from "../../src/lib/billing-plans";

test("landing explains the conversion flow and displays INR on desktop and mobile", async ({
  page,
}) => {
  await page.route(/neonauth.*\/auth\//, (route) => route.fulfill({ json: null }));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("See the interest.");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await expect(page.getByText("Give the conversation somewhere to go.")).toBeVisible();
  await expect(page.getByText("Illustrative journey.", { exact: false })).toBeVisible();
  await page.screenshot({ path: "test-results/landing-desktop.png", fullPage: true });
  await page.goto("/pricing");
  await expect(page.getByText("₹3,499", { exact: true })).toBeVisible();
  await expect(page.getByText("₹10,999", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("USD");
  await page.getByRole("button", { name: /annual/i }).click();
  await expect(page.getByText(/₹35,690 billed yearly/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/landing-mobile.png", fullPage: true });
});

async function merchant(page: Page, attributes = "") {
  await page.clock.install();
  const batches: Array<{ sessionId: string; events: Array<{ name: string; path: string }> }> = [];
  const script = await readFile(new URL("../../public/obseri-widget.js", import.meta.url), "utf8");
  await page.route("https://merchant.example/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><body><h1>Pricing</h1><script src="https://obseri.example/obseri-widget.js" data-soul-id="test" data-widget-token="obswgt_test" ${attributes}></script></body></html>`,
    }),
  );
  await page.route("https://obseri.example/**", async (route) => {
    const url = route.request().url();
    const headers = {
      "access-control-allow-origin": "https://merchant.example",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "POST,GET,OPTIONS",
    };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.endsWith(".js"))
      return route.fulfill({ contentType: "application/javascript", body: script });
    if (url.includes("/session?"))
      return route.fulfill({
        headers,
        json: { session: "test-session", parentOrigin: "https://merchant.example" },
      });
    if (url.endsWith("/analytics")) {
      batches.push(route.request().postDataJSON());
      return route.fulfill({ headers, json: { accepted: true } });
    }
    return route.fulfill({ contentType: "text/html", body: "<p>Assistant</p>" });
  });
  await page.goto("https://merchant.example/pricing?email=secret@example.com&utm_source=google");
  return batches;
}

test("tracking waits for consent, strips URL secrets, and stops on withdrawal", async ({
  page,
}) => {
  const batches = await merchant(page, 'data-consent="required"');
  await page.clock.fastForward(4000);
  expect(batches).toHaveLength(0);
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("obseri:consent", { detail: { granted: true } })),
  );
  await page.clock.fastForward(4000);
  await expect.poll(() => batches.length).toBe(1);
  expect(batches[0].events[0].path).toBe("/pricing");
  expect(JSON.stringify(batches)).not.toContain("secret@example.com");
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("obseri:consent", { detail: { granted: false } })),
  );
  await page.evaluate(() => history.pushState({}, "", "/products/example"));
  await page.clock.fastForward(8000);
  expect(batches).toHaveLength(1);
  await page.getByRole("button", { name: "Ask a question", exact: true }).click();
  await expect(page.locator("iframe")).toHaveAttribute("src", /mode=chat/);
});

test("tracks SPA navigation and offers only one dismissible invitation", async ({ page }) => {
  const batches = await merchant(page);
  await page.clock.fastForward(21000);
  await expect(page.getByRole("button", { name: "Dismiss help" })).toBeVisible();
  await page.getByRole("button", { name: "Dismiss help" }).click();
  await page.evaluate(() => history.pushState({}, "", "/products/example"));
  await page.clock.fastForward(25000);
  await expect(page.getByRole("button", { name: "Dismiss help" })).toHaveCount(0);
  await expect
    .poll(() =>
      batches.flatMap((batch) => batch.events).some((event) => event.path === "/products/example"),
    )
    .toBe(true);
});

test("contact request stays editable after a failed save and confirms only after success", async ({
  page,
}) => {
  const soul = createSoul("https://merchant.example");
  soul.personality.leadCapture = true;
  const sessionId = crypto.randomUUID();
  await page.addInitScript(
    ({ sessionId }) => {
      window.name = JSON.stringify({
        session: "test-session",
        parentOrigin: location.origin,
        sessionId,
        path: "/pricing",
      });
    },
    { sessionId },
  );
  await page.route(/neonauth.*\/auth\//, (route) => route.fulfill({ json: null }));
  await page.route(`**/api/souls/${soul.id}`, (route) => route.fulfill({ json: { soul } }));
  let attempts = 0;
  let firstId = "";
  await page.route(`**/api/souls/${soul.id}/leads`, (route) => {
    const data = route.request().postDataJSON();
    expect(data.consent).toBe(true);
    expect(data.sessionId).toBe(sessionId);
    if (!firstId) firstId = data.id;
    else expect(data.id).toBe(firstId);
    return ++attempts === 1
      ? route.fulfill({ status: 503, json: { error: { message: "Please retry your request." } } })
      : route.fulfill({ json: { accepted: true } });
  });
  await page.goto(`/widget/${soul.id}?mode=chat`);
  await page.getByRole("button", { name: "Want a personal follow-up?" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Sam");
  await page.getByLabel("Email", { exact: true }).fill("sam@example.com");
  await page.getByLabel("What would you like help with?").fill("Please help me choose a package.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send my request" }).click();
  await expect(page.getByRole("alert")).toHaveText("Please retry your request.");
  await page.getByRole("button", { name: "Send my request" }).click();
  await expect(page.getByRole("heading", { name: "You’re on their radar." })).toBeVisible();
  expect(attempts).toBe(2);
});

test("owner dashboard shows real response data, status changes, and empty states", async ({
  page,
}) => {
  const soul = createSoul("https://merchant.example");
  soul.status = "live";
  const workspace = {
    id: soul.workspaceId,
    name: "Test workspace",
    activeSoulId: soul.id,
    souls: [soul],
  };
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
  let status = "new";
  let empty = false;
  const leadId = crypto.randomUUID();
  await page.route("**/api/souls/*/analytics?*", (route) =>
    route.fulfill({
      json: {
        days: 30,
        totals: {
          sessions: empty ? 0 : 10,
          pageViews: empty ? 0 : 20,
          engaged: empty ? 0 : 3,
          assisted: empty ? 0 : 1,
          contacts: empty ? 0 : 1,
          qualified: status === "qualified" ? 1 : 0,
          won: 0,
        },
        sources: [],
        pages: [],
        daily: [
          { date: "2026-10-30", sessions: 4, views: 8 },
          { date: "2026-10-31", sessions: 6, views: 12 },
        ],
        countries: empty
          ? []
          : [
              { country: "IN", sessions: 6, contacts: 1 },
              { country: "US", sessions: 3, contacts: 0 },
              { country: null, sessions: 1, contacts: 0 },
            ],
        devices: [
          { name: "Mobile", sessions: 6 },
          { name: "Desktop", sessions: 4 },
        ],
        browsers: [{ name: "Chrome", sessions: 10 }],
        journeys: [
          {
            sessionId: "session-one",
            country: "IN",
            device: "Mobile",
            browser: "Chrome",
            source: "google",
            startedAt: new Date().toISOString(),
            events: [{ name: "page_view", path: "/pricing", createdAt: new Date().toISOString() }],
          },
        ],
        leads: empty
          ? []
          : [
              {
                id: leadId,
                sessionId: "session-one",
                name: "Sam",
                email: "sam@example.com",
                message: "Please help me choose",
                path: "/pricing",
                status,
                consent: true,
                createdAt: new Date().toISOString(),
              },
            ],
      },
    }),
  );
  await page.route("**/api/souls/*/leads", (route) => {
    status = route.request().postDataJSON().status;
    return route.fulfill({ json: { updated: true } });
  });
  await page.goto("/app?view=analytics");
  await expect(page.getByRole("heading", { name: "Website analytics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Traffic over time" })).toBeVisible();
  await expect(page.getByText("sam@example.com", { exact: true })).not.toBeVisible();
  await page.getByRole("tab", { name: "audience", exact: true }).click();
  await expect(page.getByRole("cell", { name: "India" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Unknown", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "India: 6 sessions" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "audience", exact: true })).toHaveCSS(
    "background-color",
    "oklch(0.205 0 0)",
  );
  await page.screenshot({ path: "test-results/audience-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "India: 6 sessions" }).click();
  await expect(page.getByLabel("Search countries")).toHaveValue("India");
  await expect(page.getByRole("cell", { name: "United States" })).not.toBeVisible();
  await page.getByLabel("Search countries").fill("zzzz");
  await expect(page.getByText("No matching countries.")).toBeVisible();
  await page.getByLabel("Search countries").fill("");
  await page.getByRole("tab", { name: "conversions", exact: true }).click();
  await expect(page.getByText("sam@example.com", { exact: true })).toBeVisible();
  await page.getByLabel("Outcome for Sam").selectOption("qualified");
  await expect(page.getByLabel("Outcome for Sam")).toHaveValue("qualified");
  await page.screenshot({ path: "test-results/conversions-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/conversions-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "View visitor journey" }).click();
  await expect(page.getByRole("tab", { name: "journeys", exact: true })).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(page.getByText("Contact request received from Sam")).toBeVisible();
  await page.getByRole("tab", { name: "audience", exact: true }).click();
  await expect(page.getByRole("button", { name: "India: 6 sessions" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "audience", exact: true })).toHaveCSS(
    "background-color",
    "oklch(0.205 0 0)",
  );
  await page.screenshot({ path: "test-results/audience-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByLabel("Reporting period").selectOption("7");
  await expect(page.getByRole("cell", { name: "India" })).toBeVisible();
  empty = true;
  await page.getByRole("button", { name: "Refresh analytics" }).click();
  await expect(page.getByText("Waiting for your first visit")).toBeVisible();
});
