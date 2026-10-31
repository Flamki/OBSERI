import { createFileRoute } from "@tanstack/react-router";
import { billingSummary } from "@/lib/billing-store";
import { requireWorkspaceUser as requireUser } from "@/lib/server/team-store";

export const Route = createFileRoute("/api/billing/summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const summary = await billingSummary(user.id);
          return Response.json(
            user.role !== "owner"
              ? {
                  plan: summary.plan,
                  usage: summary.usage,
                  period: summary.period,
                  subscription: null,
                }
              : summary,
            {
              headers: { "cache-control": "no-store" },
            },
          );
        } catch (error) {
          return billingError(error);
        }
      },
    },
  },
});

function billingError(error: unknown) {
  const status =
    typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
  const message =
    status >= 500
      ? "Billing details are temporarily unavailable."
      : error instanceof Error
        ? error.message
        : "Request failed.";
  return Response.json(
    { error: { code: "billing_summary_failed", message } },
    { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  );
}
