import { createFileRoute } from "@tanstack/react-router";
import { findOwnedSubscription } from "@/lib/billing-store";
import { fetchRazorpayInvoices } from "@/lib/razorpay";
import { requireUser } from "@/lib/user-auth";

export const Route = createFileRoute("/api/billing/invoices")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const subscriptionId = new URL(request.url).searchParams.get("subscriptionId");
          if (!subscriptionId) return apiError("Subscription is required.", 422);
          const owned = await findOwnedSubscription(user.id, subscriptionId);
          if (!owned) return apiError("Subscription not found.", 404);
          const invoices = await fetchRazorpayInvoices(subscriptionId);
          return Response.json(
            {
              invoices: invoices.slice(0, 12).map((invoice) => ({
                id: invoice.id,
                number: invoice.invoice_number ?? invoice.id,
                status: invoice.status,
                amountPaise: invoice.amount_paid ?? invoice.gross_amount ?? invoice.amount ?? 0,
                issuedAt: invoice.issued_at
                  ? new Date(invoice.issued_at * 1_000).toISOString()
                  : null,
                paidAt: invoice.paid_at ? new Date(invoice.paid_at * 1_000).toISOString() : null,
                url:
                  typeof invoice.short_url === "string" && /^https:\/\//.test(invoice.short_url)
                    ? invoice.short_url
                    : null,
              })),
            },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          const status =
            typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
          return apiError(
            status >= 500
              ? "Invoices are temporarily unavailable."
              : error instanceof Error
                ? error.message
                : "Invoice request failed.",
            status,
          );
        }
      },
    },
  },
});

function apiError(message: string, status: number) {
  return Response.json(
    { error: { code: "invoice_request_failed", message } },
    { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  );
}
