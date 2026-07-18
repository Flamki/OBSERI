import { createHmac, timingSafeEqual } from "node:crypto";
import { SELF_SERVE_PLAN_IDS, type BillingPlanId } from "@/lib/billing-plans";

export type BillingCycle = "monthly" | "annual";

export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  customer_id?: string | null;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  created_at?: number | null;
  has_scheduled_changes?: boolean;
  change_scheduled_at?: number | null;
};

export type RazorpayInvoice = {
  id: string;
  subscription_id?: string | null;
  invoice_number?: string | null;
  status: string;
  gross_amount?: number | null;
  amount?: number | null;
  amount_paid?: number | null;
  issued_at?: number | null;
  paid_at?: number | null;
  short_url?: string | null;
};

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly code = "razorpay_error",
  ) {
    super(message);
    this.name = "RazorpayError";
  }
}

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw new RazorpayError(
      "Billing checkout is not configured yet.",
      503,
      "billing_not_configured",
    );
  }
  return { keyId, keySecret };
}

export function publicRazorpayKeyId() {
  return credentials().keyId;
}

export function razorpayPlanId(planId: BillingPlanId, cycle: BillingCycle) {
  if (planId === "free" || planId === "enterprise") {
    throw new RazorpayError("Choose a paid self-serve plan.", 422, "invalid_plan");
  }
  const envName = `RAZORPAY_PLAN_${planId.toUpperCase()}_${cycle.toUpperCase()}`;
  const value = process.env[envName]?.trim();
  if (!value) {
    throw new RazorpayError(
      `The ${planId} ${cycle} checkout is not configured.`,
      503,
      "plan_not_configured",
    );
  }
  return value;
}

export function billingPlanFromRazorpayPlanId(providerPlanId: string) {
  for (const planId of SELF_SERVE_PLAN_IDS) {
    if (planId === "free") continue;
    for (const cycle of ["monthly", "annual"] as const) {
      const envName = `RAZORPAY_PLAN_${planId.toUpperCase()}_${cycle.toUpperCase()}`;
      if (process.env[envName]?.trim() === providerPlanId) return { planId, cycle };
    }
  }
  return null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { keyId, keySecret } = credentials();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "content-type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => null)) as {
    error?: { description?: string; code?: string };
  } | null;
  if (!response.ok) {
    throw new RazorpayError(
      body?.error?.description ?? "The billing provider rejected the request.",
      response.status >= 500 ? 502 : 422,
      body?.error?.code ?? "razorpay_request_failed",
    );
  }
  return body as T;
}

export async function createRazorpaySubscription(input: {
  planId: BillingPlanId;
  cycle: BillingCycle;
  ownerUserId: string;
  email?: string;
}) {
  const providerPlanId = razorpayPlanId(input.planId, input.cycle);
  const subscription = await request<RazorpaySubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      plan_id: providerPlanId,
      total_count: input.cycle === "monthly" ? 120 : 10,
      quantity: 1,
      customer_notify: true,
      notes: {
        obseri_user_id: input.ownerUserId,
        obseri_plan_id: input.planId,
        obseri_cycle: input.cycle,
        ...(input.email ? { obseri_email: input.email.slice(0, 120) } : {}),
      },
    }),
  });
  return { subscription, providerPlanId };
}

export function fetchRazorpaySubscription(subscriptionId: string) {
  assertProviderId(subscriptionId, "sub_");
  return request<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

export async function fetchRazorpayInvoices(subscriptionId: string) {
  assertProviderId(subscriptionId, "sub_");
  const result = await request<{ count: number; items: RazorpayInvoice[] }>(
    `/invoices?subscription_id=${encodeURIComponent(subscriptionId)}`,
  );
  return result.items ?? [];
}

export function cancelRazorpaySubscription(subscriptionId: string, atCycleEnd = true) {
  assertProviderId(subscriptionId, "sub_");
  return request<RazorpaySubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: atCycleEnd ? 1 : 0 }) },
  );
}

export function updateRazorpaySubscription(input: {
  subscriptionId: string;
  planId: BillingPlanId;
  cycle: BillingCycle;
}) {
  assertProviderId(input.subscriptionId, "sub_");
  return request<RazorpaySubscription>(
    `/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        plan_id: razorpayPlanId(input.planId, input.cycle),
        quantity: 1,
        schedule_change_at: "now",
        customer_notify: true,
      }),
    },
  );
}

export function verifyRazorpayCheckoutSignature(input: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}) {
  const { keySecret } = credentials();
  assertProviderId(input.paymentId, "pay_");
  assertProviderId(input.subscriptionId, "sub_");
  return safeEqual(
    createHmac("sha256", keySecret)
      .update(`${input.paymentId}|${input.subscriptionId}`)
      .digest("hex"),
    input.signature,
  );
}

export function verifyRazorpayWebhook(body: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new RazorpayError(
      "Billing webhooks are not configured.",
      503,
      "billing_webhook_not_configured",
    );
  }
  if (!signature) return false;
  return safeEqual(createHmac("sha256", secret).update(body).digest("hex"), signature);
}

function safeEqual(expected: string, received: string) {
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function assertProviderId(value: string, prefix: string) {
  if (!value.startsWith(prefix) || value.length > 100 || !/^[A-Za-z0-9_]+$/.test(value)) {
    throw new RazorpayError("The billing reference is invalid.", 422, "invalid_billing_id");
  }
}
