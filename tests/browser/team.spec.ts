import { test, expect, type Page } from "@playwright/test";
import { createSoul } from "../../src/lib/soul";
import { BILLING_PLANS } from "../../src/lib/billing-plans";

async function setup(page: Page, shared = false) {
  const soul = createSoul("https://merchant.example");
  soul.status = "live";
  const workspace = { id: soul.workspaceId, name: "Company", activeSoulId: soul.id, souls: [soul] };
  const user = {
    id: "actor",
    name: "Tester",
    email: "tester@example.com",
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
              expiresAt: "2099-01-01T00:00:00Z",
            },
          }
        : { token: "test.jwt.token" },
    }),
  );
  await page.route("**/api/team?view=workspaces", (route) =>
    route.fulfill({
      json: {
        workspaces: [
          { ownerId: "actor", name: "Personal", role: "owner" },
          { ownerId: "company", name: "Company", role: "editor" },
        ],
      },
    }),
  );
  await page.route("**/api/workspace", (route) => route.fulfill({ json: { workspace } }));
  await page.route("**/api/billing/summary", (route) =>
    route.fulfill({
      json: {
        plan: BILLING_PLANS.growth,
        subscription: null,
        usage: { textResponses: 0, voiceSeconds: 0 },
      },
    }),
  );
  await page.route("**/api/operations", (route) => route.fulfill({ json: { events: [] } }));
  if (shared)
    await page.addInitScript(
      () =>
        sessionStorage.getItem("obseri-active-workspace:actor") ||
        sessionStorage.setItem("obseri-active-workspace:actor", "company"),
    );
}

test("owner creates an email-bound invitation link and can revoke it", async ({ page }) => {
  await setup(page);
  let invitations: { id: string; email: string; expiresAt: string }[] = [];
  await page.route("**/api/team", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(route.request().headers()["x-obseri-workspace-owner"]).toBe("actor");
      if (body.action === "invite") {
        expect(body.email).toBe("editor@example.com");
        invitations = [{ id: "invite-id", email: body.email, expiresAt: "2099-01-01" }];
        return route.fulfill({ json: { token: "a".repeat(43) } });
      }
      expect(body.action).toBe("revoke");
      invitations = [];
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { members: [], invitations, seatLimit: 5, plan: "Growth" } });
  });
  await page.goto("/app?view=profile");
  await page.getByRole("textbox", { name: "Teammate email" }).fill("editor@example.com");
  await page.getByRole("button", { name: "Create invite link" }).click();
  await expect(page.getByRole("textbox", { name: "Invitation link" })).toHaveValue(
    /\/app#invite=a{43}$/,
  );
  await expect(page.getByText("2 / 5 seats · Growth")).toBeVisible();
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(page.getByText("1 / 5 seats · Growth")).toBeVisible();
});

test("editor uses the selected workspace and cannot see billing or invitation controls", async ({
  page,
}) => {
  await setup(page, true);
  const request = page.waitForRequest((req) => req.url().endsWith("/api/workspace"));
  await page.goto("/app?view=profile");
  expect((await request).headers()["x-obseri-workspace-owner"]).toBe("company");
  await expect(page.getByRole("combobox", { name: "Switch workspace" })).toHaveValue("company");
  await expect(
    page.getByText("Ask the owner to manage billing and invitations.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create invite link" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel subscription" })).toHaveCount(0);
  await page.getByRole("button", { name: "Plans and billing", exact: true }).click();
  await expect(page.getByText("Billing is managed by the workspace owner.")).toBeVisible();
  await expect(page.getByText("Choose the plan that fits your traffic")).toHaveCount(0);
  await page.getByRole("button", { name: "Close plans" }).click();
  await page.getByRole("combobox", { name: "Switch workspace" }).selectOption("actor");
  await expect(page.getByRole("combobox", { name: "Switch workspace" })).toHaveValue("actor");
});

test("revoked workspace fails closed without showing cached customer data", async ({ page }) => {
  await setup(page, true);
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ status: 403, json: { error: { message: "Access revoked" } } }),
  );
  await page.goto("/app?view=conversations");
  await expect(page.getByRole("alert")).toContainText("Your access may have changed");
  await expect(page.getByRole("button", { name: "Reload workspace" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Conversation messages" })).toHaveCount(0);
});

test("invitation is removed from URL and requires explicit acceptance", async ({ page }) => {
  await setup(page);
  let accepted = false;
  await page.route("**/api/team", (route) => {
    accepted = true;
    expect(route.request().postDataJSON()).toEqual({ action: "accept", token: "b".repeat(43) });
    return route.fulfill({
      status: 403,
      json: { error: { message: "Sign in with the email address this invitation was sent to." } },
    });
  });
  await page.goto(`/app#invite=${"b".repeat(43)}`);
  await expect(page.getByRole("button", { name: "Accept invitation" })).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  expect(accepted).toBe(false);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByRole("alert")).toContainText("Sign in with the email address");
});

test("full Free workspace explains the limit before submitting and opens team plans", async ({
  page,
}) => {
  await setup(page);
  let posts = 0;
  await page.route("**/api/team", (route) => {
    if (route.request().method() === "POST") posts++;
    return route.fulfill({ json: { members: [], invitations: [], seatLimit: 1, plan: "Free" } });
  });
  await page.goto("/app?view=profile");
  await expect(page.getByText("Your plan includes only your seat.")).toBeVisible();
  await page.getByRole("textbox", { name: "Teammate email" }).fill("editor@example.com");
  await expect(page.getByRole("button", { name: "Create invite link" })).toBeDisabled();
  await page.getByRole("textbox", { name: "Teammate email" }).press("Enter");
  expect(posts).toBe(0);
  await expect(page.getByText("No email is sent.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "View team plans" }).click();
  await expect(page.getByText("Choose the plan that fits your traffic")).toBeVisible();
});
