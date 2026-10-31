import { test, expect, type Page } from "@playwright/test";
import { createSoul } from "../../src/lib/soul";
import { permissionPreset } from "../../src/lib/workspace-access";
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
  await page.route("**/api/team?view=access", (route) =>
    route.fulfill({ json: { access: { role: "editor", permissions: permissionPreset("write") } } }),
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
  return workspace;
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
        expect(body.permissions).toEqual({ ...permissionPreset("read"), voice: "none" });
        invitations = [{ id: "invite-id", email: body.email, expiresAt: "2099-01-01" }];
        return route.fulfill({ json: { token: "a".repeat(43) } });
      }
      expect(body.action).toBe("revoke");
      invitations = [];
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { members: [], invitations, seatLimit: 5, plan: "Growth" } });
  });
  await page.goto("/app?view=team");
  await page.getByRole("textbox", { name: "Teammate email" }).fill("editor@example.com");
  await page.getByRole("button", { name: "Create invite link" }).click();
  const dialog = page.getByRole("dialog", { name: "Choose invitation access" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading")).toHaveCSS("color", "rgb(23, 23, 23)");
  await expect(dialog.getByRole("combobox", { name: "Dashboard access", exact: true })).toHaveCSS(
    "color",
    "rgb(23, 23, 23)",
  );
  await expect(
    dialog.getByRole("combobox", { name: "Dashboard access", exact: true }).locator("option"),
  ).toHaveText(["No access", "Can view"]);
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await dialog.getByRole("button", { name: "Confirm & create link" }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "Confirm & create link" })).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole("heading").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/obseri-team-access-dialog.png" });
  expect(invitations).toHaveLength(0);
  await dialog.getByRole("combobox", { name: "Permission preset" }).selectOption("viewer");
  await dialog.getByRole("combobox", { name: "Voice access", exact: true }).selectOption("none");
  await dialog.getByRole("button", { name: "Confirm & create link" }).click();
  await expect(page.getByRole("textbox", { name: "Invitation link" })).toHaveValue(
    /\/app#invite=a{43}$/,
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { __copiedLink?: string }).__copiedLink = text;
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => (window as Window & { __copiedLink?: string }).__copiedLink),
  ).toMatch(/\/app#invite=a{43}$/);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("2 / 5 seats · Growth")).toBeVisible();
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(page.getByText("1 / 5 seats · Growth")).toBeVisible();
});

test("editor uses the selected workspace and cannot see billing or invitation controls", async ({
  page,
}) => {
  await setup(page, true);
  const request = page.waitForRequest((req) => req.url().endsWith("/api/workspace"));
  await page.goto("/app?view=team");
  expect((await request).headers()["x-obseri-workspace-owner"]).toBe("company");
  await expect(page.getByRole("combobox", { name: "Switch workspace" })).toHaveValue("company");
  await expect(page.getByText("Your owner controls access.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create invite link" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel subscription" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Plans and billing", exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Switch workspace" }).selectOption("actor");
  await expect(page.getByRole("combobox", { name: "Switch workspace" })).toHaveValue("actor");
});

test("revoked workspace fails closed without showing cached customer data", async ({ page }) => {
  await setup(page, true);
  await page.route("**/api/team?view=access", (route) => route.fulfill({ status: 403, json: {} }));
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ status: 403, json: { error: { message: "Access revoked" } } }),
  );
  await page.goto("/app?view=conversations");
  await expect(page.getByRole("alertdialog")).toContainText("Your workspace access was revoked");
  await expect(page.getByRole("button", { name: "Open my workspace" })).toBeVisible();
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
  await page.goto("/app?view=team");
  await expect(page.getByText("Your plan includes only your seat.")).toBeVisible();
  await page.getByRole("textbox", { name: "Teammate email" }).fill("editor@example.com");
  await expect(page.getByRole("button", { name: "Create invite link" })).toBeDisabled();
  await page.getByRole("textbox", { name: "Teammate email" }).press("Enter");
  expect(posts).toBe(0);
  await expect(page.getByText("No email is sent.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "View team plans" }).click();
  await expect(page.getByText("Choose the plan that fits your traffic")).toBeVisible();
});

test("complimentary Growth is current without implying a paid subscription", async ({ page }) => {
  await setup(page);
  await page.route("**/api/billing/summary", (route) =>
    route.fulfill({
      json: {
        plan: BILLING_PLANS.growth,
        subscription: {
          id: "sub_unpaid",
          status: "created",
          cycle: "monthly",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
        complimentary: { expiresAt: null },
        usage: { textResponses: 0, voiceSeconds: 0 },
      },
    }),
  );
  await page.route("**/api/team", (route) =>
    route.fulfill({ json: { members: [], invitations: [], seatLimit: 5, plan: "Growth" } }),
  );
  await page.goto("/app?view=team");
  await expect(page.getByText("1 / 5 seats · Growth")).toBeVisible();
  await page.goto("/app?view=billing");
  await expect(
    page.getByText("Complimentary Growth access. No subscription charge or automatic renewal."),
  ).toBeVisible();
  await expect(page.getByText("Active subscription", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Current plan", exact: true })).toBeVisible();
});

test("owner sets section access and reads the audit log", async ({ page }) => {
  await setup(page);
  let policy = permissionPreset("write");
  await page.route("**/api/team", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body.action).toBe("permissions");
      expect(body.userId).toBe("member");
      policy = body.permissions;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        members: [{ userId: "member", email: "member@example.com", permissions: policy }],
        invitations: [],
        seatLimit: 5,
        plan: "Growth",
      },
    });
  });
  await page.route("**/api/team?view=activity", (route) =>
    route.fulfill({
      json: {
        events: [
          {
            id: "1",
            actorEmail: "member@example.com",
            action: "workspace.updated",
            changes: [
              {
                section: "voice",
                field: "speed",
                website: "merchant.example",
                operation: "updated",
              },
            ],
            revision: "2",
            createdAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
      },
    }),
  );
  await page.goto("/app?view=team");
  await page.getByRole("button", { name: "Edit access" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Knowledge access", exact: true })
    .selectOption("read");
  await dialog
    .getByRole("combobox", { name: "Personality access", exact: true })
    .selectOption("none");
  await dialog.getByRole("button", { name: "Save access" }).click();
  await expect(dialog).toHaveCount(0);
  expect(policy.knowledge).toBe("read");
  expect(policy.personality).toBe("none");
  await page.getByRole("tab", { name: "Activity log" }).click();
  await expect(page.getByText("Revision 2")).toBeVisible();
  await expect(page.getByText("merchant.example · Voice · speed · updated")).toBeVisible();
});

test("activity handles legacy JSON text and damaged entries without crashing", async ({ page }) => {
  await setup(page);
  const crashes: string[] = [];
  page.on("pageerror", (error) => crashes.push(error.message));
  await page.route("**/api/team", (route) =>
    route.fulfill({ json: { members: [], invitations: [], seatLimit: 5, plan: "Growth" } }),
  );
  let brokenResponse = false;
  await page.route("**/api/team?view=activity", (route) =>
    route.fulfill({
      json: brokenResponse
        ? { events: null }
        : {
            events: [
              {
                id: "1",
                actorEmail: "",
                action: "invitation.created",
                changes: JSON.stringify([
                  { email: "teammate@example.com", permissions: permissionPreset("read") },
                ]),
                createdAt: new Date().toISOString(),
              },
              {
                id: "2",
                actorEmail: "",
                action: "workspace.updated",
                changes: [null],
                createdAt: new Date().toISOString(),
              },
              {
                id: "3",
                actorEmail: "",
                action: "member.joined",
                changes: [],
                createdAt: new Date().toISOString(),
              },
            ],
            nextCursor: null,
          },
    }),
  );
  await page.goto("/app?view=team");
  await page.getByRole("tab", { name: "Activity log" }).click();
  await expect(page.getByText("teammate@example.com")).toBeVisible();
  await expect(page.getByText("viewer access", { exact: true })).toBeVisible();
  await expect(page.getByText("Details for this entry are unavailable.")).toBeVisible();
  await expect(page.getByText("· Joined workspace", { exact: true })).toBeVisible();
  brokenResponse = true;
  await page.getByRole("button", { name: "Refresh log" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not load activity");
  await expect(page.getByText("teammate@example.com")).toBeVisible();
  brokenResponse = false;
  await page.getByRole("button", { name: "Refresh log" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(crashes).toEqual([]);
});

test("restricted teammate sees only allowed sections and read-only knowledge", async ({ page }) => {
  const workspace = await setup(page, true);
  const permissions = { ...permissionPreset("none"), knowledge: "read", voice: "write" };
  await page.route("**/api/team?view=workspaces", (route) =>
    route.fulfill({
      json: { workspaces: [{ ownerId: "company", name: "Company", role: "custom", permissions }] },
    }),
  );
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ json: { workspace, access: { role: "custom", permissions } } }),
  );
  await page.route("**/api/team?view=access", (route) =>
    route.fulfill({ json: { access: { role: "custom", permissions } } }),
  );
  await page.goto("/app?view=knowledge");
  await expect(page.getByRole("button", { name: "Personality", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Voice", exact: true })).toBeVisible();
  await expect(page.locator("fieldset[disabled]")).toHaveCount(1);
  await page.goto("/app?view=personality");
  await expect(
    page.getByRole("heading", { name: "This section is not shared with you" }),
  ).toBeVisible();
});

test("remote workspace edits arrive without a reload", async ({ page }) => {
  const initial = await setup(page);
  let workspace = { ...initial, revision: 1 };
  await page.route("**/api/workspace", (route) => route.fulfill({ json: { workspace } }));
  await page.route("**/api/team", (route) =>
    route.fulfill({ json: { members: [], invitations: [], seatLimit: 5, plan: "Growth" } }),
  );
  await page.goto("/app?view=team");
  await expect(page.locator('input[value="Company"]')).toHaveCount(1);
  workspace = { ...workspace, name: "Updated by teammate", revision: 2 };
  await expect(page.locator('input[value="Updated by teammate"]')).toBeVisible({ timeout: 8000 });
});

test("Dashboard access does not expose summaries or actions for unshared sections", async ({
  page,
}) => {
  const workspace = await setup(page, true);
  const permissions = { ...permissionPreset("none"), dashboard: "read" };
  await page.route("**/api/team?view=workspaces", (route) =>
    route.fulfill({
      json: {
        workspaces: [{ ownerId: "company", name: "Company", role: "custom", permissions }],
      },
    }),
  );
  await page.route("**/api/team?view=access", (route) =>
    route.fulfill({ json: { access: { role: "custom", permissions } } }),
  );
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ json: { workspace, access: { role: "custom", permissions } } }),
  );
  await page.goto("/app?view=overview");
  await expect(
    page.getByText("No dashboard summaries are shared with you yet.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "View conversations", exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Preview", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Knowledge", exact: true })).toHaveCount(0);
  await page.goto("/app?view=knowledge");
  await expect(
    page.getByRole("heading", { name: "This section is not shared with you" }),
  ).toBeVisible();
});

test("revoking an active teammate removes the workspace and its cached data", async ({ page }) => {
  await setup(page, true);
  let revoked = false;
  await page.route("**/api/team?view=access", (route) =>
    revoked
      ? route.fulfill({ status: 403, json: {} })
      : route.fulfill({
          json: { access: { role: "editor", permissions: permissionPreset("write") } },
        }),
  );
  await page.goto("/app?view=knowledge");
  await expect(page.getByRole("button", { name: "Knowledge", exact: true })).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem("obseri.soul-studio.v1:actor:company", "private cached content"),
  );
  revoked = true;
  const notice = page.getByRole("alertdialog");
  await expect(notice).toContainText("Your workspace access was revoked", { timeout: 8000 });
  await expect(page.getByRole("button", { name: "Knowledge", exact: true })).toHaveCount(0);
  await expect(notice.getByRole("heading")).toHaveCSS("color", "rgb(23, 23, 23)");
  expect(
    await page.evaluate(() => localStorage.getItem("obseri.soul-studio.v1:actor:company")),
  ).toBeNull();
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page.getByRole("combobox", { name: "Switch workspace" })).toHaveValue("actor");
});

test("permission changes interrupt a conflicted editor while outages do not revoke access", async ({
  page,
}) => {
  const workspace = await setup(page, true);
  let status = 200;
  let permissions = permissionPreset("write");
  let checks = 0;
  await page.route("**/api/team?view=access", (route) => {
    checks++;
    return route.fulfill({ status, json: { access: { role: "editor", permissions } } });
  });
  await page.route("**/api/workspace", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 409,
          json: { error: { message: "A teammate changed the same field." } },
        })
      : route.fulfill({ json: { workspace: { ...workspace, revision: 1 } } }),
  );
  await page.goto("/app?view=personality");
  // Create an unsaved edit and conflict, which pauses the regular content sync.
  const input = page.locator("input").filter({ visible: true }).first();
  await input.fill("Unsaved assistant name");
  await expect(page.getByRole("button", { name: "Download local edits" })).toBeVisible();
  status = 503;
  const previousChecks = checks;
  await expect.poll(() => checks, { timeout: 8000 }).toBeGreaterThan(previousChecks);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  status = 200;
  permissions = permissionPreset("none");
  await expect(page.getByRole("alertdialog")).toContainText("Your access has changed", {
    timeout: 8000,
  });
  await expect(page.getByRole("button", { name: "Download local edits" })).toHaveCount(0);
  await expect(page.locator('input[value="Unsaved assistant name"]')).toHaveCount(0);
});

test("a conflicting save preserves local edits and offers an export", async ({ page }) => {
  const initial = await setup(page);
  await page.route("**/api/workspace", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 409,
          json: {
            error: {
              message:
                "A teammate changed the same field. Download your local edits before reloading.",
            },
          },
        })
      : route.fulfill({ json: { workspace: { ...initial, revision: 1 } } }),
  );
  await page.route("**/api/team", (route) =>
    route.fulfill({ json: { members: [], invitations: [], seatLimit: 5, plan: "Growth" } }),
  );
  await page.goto("/app?view=team");
  await page.locator('input[value="Company"]').fill("My unsaved name");
  await expect(page.getByRole("button", { name: "Download local edits" })).toBeVisible();
  await expect(page.locator('input[value="My unsaved name"]')).toBeVisible();
});

test("Profile is separate from workspace and team settings", async ({ page }) => {
  await setup(page);
  await page.route("**/api/team", (route) =>
    route.fulfill({ json: { members: [], invitations: [], seatLimit: 5, plan: "Growth" } }),
  );
  await page.goto("/app?view=profile");
  await expect(page.locator('input[value="tester@example.com"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team access" })).toHaveCount(0);
  await expect(page.getByText("Workspace name", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Knowledge health" })).toHaveCount(0);
  await page.getByRole("button", { name: "Manage team", exact: true }).click();
  await expect(page).toHaveURL(/view=team/);
  await expect(page.getByRole("heading", { name: "Team access" })).toBeVisible();
});

test("invitation can be cancelled, retried after failure, and copied manually", async ({
  page,
}) => {
  await setup(page);
  let attempts = 0;
  await page.route("**/api/team", (route) => {
    if (route.request().method() === "POST") {
      attempts++;
      return attempts === 1
        ? route.fulfill({ status: 503, json: { error: { message: "Please try again shortly." } } })
        : route.fulfill({ json: { token: "b".repeat(43) } });
    }
    return route.fulfill({ json: { members: [], invitations: [], seatLimit: 5, plan: "Growth" } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app?view=team");
  await page.getByRole("textbox", { name: "Teammate email" }).fill("person@example.com");
  await page.getByRole("button", { name: "Create invite link" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(attempts).toBe(0);
  await expect(page.getByRole("textbox", { name: "Teammate email" })).toBeFocused();
  await page.getByRole("button", { name: "Create invite link" }).click();
  await page.getByRole("button", { name: "Confirm & create link" }).click();
  await expect(page.getByRole("alert")).toContainText("Please try again shortly.");
  await expect(page.getByRole("textbox", { name: "Invitation link" })).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm & create link" }).click();
  await expect(page.getByRole("textbox", { name: "Invitation link" })).toHaveValue(/invite=b{43}$/);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Blocked");
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("copy it manually");
  await expect(page.getByRole("button", { name: "Copied", exact: true })).toHaveCount(0);
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});
