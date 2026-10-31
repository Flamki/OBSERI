import { test, expect } from "@playwright/test";
import { createSoul } from "../../src/lib/soul";
import { BILLING_PLANS } from "../../src/lib/billing-plans";

test("PDF import saves page knowledge and exposes rendering choices", async ({ page }) => {
  const soul = createSoul("https://merchant.example");
  let workspace = { id: soul.workspaceId, name: "Test", activeSoulId: soul.id, souls: [soul] };
  const user = {
    id: "test-owner",
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
    if (route.request().method() === "PUT") workspace = route.request().postDataJSON();
    return route.fulfill({ json: { workspace } });
  });
  await page.route("**/api/billing/summary", (route) =>
    route.fulfill({ json: { plan: BILLING_PLANS.launch } }),
  );
  await page.route("**/api/souls/*/conversations*", (route) =>
    route.fulfill({ json: { conversations: [] } }),
  );
  await page.route("**/api/knowledge/pdf", (route) => {
    expect(route.request().headers()["content-type"]).toBe("application/pdf");
    expect(route.request().postData()).toContain("%PDF-");
    return route.fulfill({
      json: {
        knowledge: {
          schemaVersion: 2,
          rootUrl: "document://guide",
          status: "ready",
          keywords: [],
          errors: [],
          sources: [
            {
              id: "pdf-guide",
              type: "document",
              name: "Guide.pdf",
              rootUrl: "document://guide",
              status: "ready",
              pageLimit: 50,
              crawlDepth: 0,
              cadence: "manual",
              includePatterns: [],
              excludePatterns: [],
              autoRemoveMissing: false,
              createdAt: new Date().toISOString(),
            },
          ],
          pages: [
            {
              id: "guide-page-1",
              url: "document://guide/page/1",
              title: "Guide.pdf · Page 1",
              content: "Returns are accepted within thirty days of purchase.",
              description: "Returns policy",
              status: "ready",
              enabled: true,
              sourceId: "pdf-guide",
              revision: 1,
              wordCount: 9,
              contentType: "application/pdf",
              chunks: [
                {
                  id: "guide-chunk",
                  pageUrl: "document://guide/page/1",
                  pageTitle: "Guide.pdf · Page 1",
                  text: "Returns are accepted within thirty days of purchase.",
                  order: 0,
                  tokenEstimate: 15,
                },
              ],
            },
          ],
        },
      },
    });
  });
  await page.goto("/app?view=knowledge");
  await page.getByRole("button", { name: "Add source", exact: true }).click();
  await expect(page.getByLabel("JavaScript content")).toHaveValue("auto");
  await page.getByLabel("JavaScript content").selectOption("always");
  await page.getByRole("button", { name: "PDF upload", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "Guide.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nBrowser upload fixture"),
  });
  await page.getByRole("button", { name: "Import PDF", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(() => workspace.souls[0].knowledge.pages.some((p) => p.title === "Guide.pdf · Page 1"))
    .toBe(true);
  await page.reload();
  await expect(page.getByText("Guide.pdf · Page 1", { exact: true })).toBeVisible();
});
