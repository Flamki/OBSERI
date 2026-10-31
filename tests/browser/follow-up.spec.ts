import { test, expect, type Page } from "@playwright/test";
import { createSoul } from "../../src/lib/soul";
import { DEFAULT_FOLLOW_UP } from "../../src/lib/follow-up";
import { BILLING_PLANS } from "../../src/lib/billing-plans";

async function widget(page: Page, soul: ReturnType<typeof createSoul>) {
  await page.addInitScript(() => {
    window.name = JSON.stringify({
      session: "test-session",
      parentOrigin: location.origin,
      path: "/",
    });
  });
  await page.route(/neonauth.*\/auth\//, (route) => route.fulfill({ json: null }));
  await page.route(`**/api/souls/${soul.id}`, (route) => route.fulfill({ json: { soul } }));
  await page.goto(`/widget/${soul.id}?mode=chat`);
}

test("widget supports custom contact forms, booking pages and disabled follow-up", async ({
  page,
}) => {
  const soul = createSoul("https://merchant.example");
  soul.personality.followUp = {
    ...DEFAULT_FOLLOW_UP,
    label: "Talk to our team",
    title: "Tell us about your project",
    description: "We will reply to your email.",
  };
  await widget(page, soul);
  await page.getByRole("button", { name: "Talk to our team" }).click();
  await expect(page.getByRole("dialog", { name: "Tell us about your project" })).toBeVisible();
  await expect(page.getByText("We will reply to your email.")).toBeVisible();
  await page.getByRole("button", { name: "Close contact form" }).click();
  soul.personality.followUp = {
    ...DEFAULT_FOLLOW_UP,
    mode: "booking",
    url: "https://cal.com/obseri-test/intro",
    label: "Book an intro",
  };
  await page.reload();
  const link = page.getByRole("link", { name: /Book an intro/ });
  await expect(link).toHaveAttribute("href", "https://cal.com/obseri-test/intro");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await page
    .context()
    .route("https://cal.com/obseri-test/intro", (route) =>
      route.fulfill({ contentType: "text/html", body: "<h1>Booking page</h1>" }),
    );
  const opened = page.waitForEvent("popup");
  await link.click();
  const popup = await opened;
  await expect(popup.getByRole("heading", { name: "Booking page" })).toBeVisible();
  await popup.close();
  soul.personality.leadCapture = false;
  await page.reload();
  await expect(page.getByPlaceholder("Ask this website...")).toBeVisible();
  await expect(page.getByRole("link", { name: /Book an intro/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /follow-up/ })).toHaveCount(0);
});

test("customer can save, preview, validate, publish and disable follow-up settings", async ({
  page,
}) => {
  const soul = createSoul("https://merchant.example");
  soul.status = "live";
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
  const published: ReturnType<typeof createSoul>[] = [];
  await page.route("**/api/souls/publish", (route) => {
    published.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { status: "live" } });
  });
  let submitted = 0;
  await page.route("**/api/souls/*/leads", (route) => {
    submitted++;
    return route.fulfill({ json: { accepted: true } });
  });
  await page.goto("/app?view=deploy");
  await page.getByRole("button", { name: "Follow-up", exact: true }).click();
  await page.getByLabel("Follow-up button text").fill("Contact our team");
  await page.getByLabel("Follow-up form title").fill("Plan your project");
  await page.getByRole("button", { name: "Contact our team", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Plan your project" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Preview — no request will be sent" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close contact form" }).click();
  expect(submitted).toBe(0);
  await page.getByRole("radio", { name: /Book a meeting/ }).check();
  await page.getByLabel("Follow-up button text").fill("Book a demo");
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Add a valid public HTTPS booking link for Cal.com.", { exact: true }),
  ).toBeVisible();
  expect(published).toHaveLength(0);
  await page.getByLabel("Scheduling provider").selectOption("google");
  await page.getByLabel("Public booking link").fill("https://calendar.app.google/obseri-test");
  await expect
    .poll(() => workspace.souls[0].personality.followUp?.url)
    .toBe("https://calendar.app.google/obseri-test");
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect.poll(() => published.length).toBe(1);
  expect(published[0].personality.followUp).toMatchObject({
    mode: "booking",
    provider: "google",
    label: "Book a demo",
    url: "https://calendar.app.google/obseri-test",
  });
  await page.screenshot({ path: "test-results/follow-up-desktop.png", fullPage: true });
  await page.reload();
  await page.getByRole("button", { name: "Follow-up", exact: true }).click();
  await expect(page.getByLabel("Public booking link")).toHaveValue(
    "https://calendar.app.google/obseri-test",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/follow-up-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByLabel("Public booking link").scrollIntoViewIfNeeded();
  await expect(page.getByLabel("Public booking link")).toBeInViewport();
  await page.screenshot({ path: "test-results/follow-up-mobile-booking.png" });
  await page.getByRole("switch", { name: "Show follow-up button" }).click();
  await expect(page.getByText("No follow-up button", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect.poll(() => published.length).toBe(2);
  expect(published[1].personality.leadCapture).toBe(false);
  expect(published[1].personality.followUp?.url).toBe("https://calendar.app.google/obseri-test");
});
