import { describe, expect, it } from "vitest";
import { BILLING_PLANS } from "./billing-plans";
import {
  BillingStoreError,
  applyWorkspacePlanPolicy,
  assertWorkspaceFitsPlan,
} from "./billing-store";
import { createSoul, type SoulConversation, type SoulWorkspace } from "./soul";

function workspaceWithSouls(count: number): SoulWorkspace {
  const souls = Array.from({ length: count }, (_, index) =>
    createSoul(`https://site-${index + 1}.example`),
  );
  return {
    id: "workspace_test",
    name: "Test workspace",
    souls,
    activeSoulId: souls[0]?.id ?? null,
  };
}

function conversation(id: string, updatedAt: string): SoulConversation {
  return {
    id,
    startedAt: updatedAt,
    updatedAt,
    channel: "widget",
    visitorLabel: "Visitor",
    leadIntent: "none",
    messages: [],
  };
}

describe("billing workspace policy", () => {
  it("rejects website counts above the selected plan", () => {
    expect(() => assertWorkspaceFitsPlan(workspaceWithSouls(2), BILLING_PLANS.free)).toThrow(
      BillingStoreError,
    );
    expect(() =>
      assertWorkspaceFitsPlan(workspaceWithSouls(3), BILLING_PLANS.growth),
    ).not.toThrow();
  });

  it("removes expired history and disables unavailable webhooks", () => {
    const workspace = workspaceWithSouls(1);
    workspace.souls[0].channels.webhookEnabled = true;
    workspace.souls[0].conversations = [
      conversation("expired", "2026-06-01T00:00:00.000Z"),
      conversation("current", "2026-07-18T00:00:00.000Z"),
    ];

    const result = applyWorkspacePlanPolicy(
      workspace,
      BILLING_PLANS.free,
      new Date("2026-07-19T00:00:00.000Z"),
    );

    expect(result.souls[0].channels.webhookEnabled).toBe(false);
    expect(result.souls[0].conversations.map((item) => item.id)).toEqual(["current"]);
  });

  it("preserves webhooks for Growth", () => {
    const workspace = workspaceWithSouls(1);
    workspace.souls[0].channels.webhookEnabled = true;
    expect(
      applyWorkspacePlanPolicy(workspace, BILLING_PLANS.growth).souls[0].channels.webhookEnabled,
    ).toBe(true);
  });
});
