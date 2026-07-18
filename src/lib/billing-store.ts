import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { BILLING_PLANS, getBillingPlan, type BillingPlanId } from "@/lib/billing-plans";
import {
  billingPlanFromRazorpayPlanId,
  type BillingCycle,
  type RazorpaySubscription,
} from "@/lib/razorpay";
import type { SoulWorkspace } from "@/lib/soul";

export type UsageMetric = "text_responses" | "voice_seconds";

type Sql = ReturnType<typeof postgres>;
let client: Sql | undefined;

export class BillingStoreError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly code = "billing_store_error",
  ) {
    super(message);
    this.name = "BillingStoreError";
  }
}

function db(): Sql {
  if (client) return client;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new BillingStoreError(
      "Billing storage is not configured.",
      503,
      "database_not_configured",
    );
  }
  client = postgres(url, {
    max: 2,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return client;
}

type SubscriptionRow = {
  provider_subscription_id: string;
  owner_user_id: string;
  provider_plan_id: string;
  provider_customer_id: string | null;
  plan_id: BillingPlanId;
  billing_cycle: BillingCycle | "contract";
  status: string;
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  created_at: Date;
  updated_at: Date;
};

export async function recordPendingSubscription(input: {
  ownerUserId: string;
  providerSubscriptionId: string;
  providerPlanId: string;
  planId: Exclude<BillingPlanId, "free" | "enterprise">;
  cycle: BillingCycle;
  status: string;
}) {
  const sql = db();
  await sql`
    insert into obseri_billing_subscriptions (
      provider_subscription_id, owner_user_id, provider_plan_id, plan_id,
      billing_cycle, status
    ) values (
      ${input.providerSubscriptionId}, ${input.ownerUserId}, ${input.providerPlanId},
      ${input.planId}, ${input.cycle}, ${normalizeStatus(input.status)}
    )
    on conflict (provider_subscription_id) do update set
      status = excluded.status,
      updated_at = now()
  `;
}

export async function findOwnedSubscription(ownerUserId: string, subscriptionId: string) {
  const sql = db();
  const rows = await sql<SubscriptionRow[]>`
    select * from obseri_billing_subscriptions
    where owner_user_id = ${ownerUserId}
      and provider_subscription_id = ${subscriptionId}
    limit 1
  `;
  return rows[0] ?? null;
}

export async function syncRazorpaySubscription(subscription: RazorpaySubscription) {
  const sql = db();
  const rows = await sql<SubscriptionRow[]>`
    update obseri_billing_subscriptions set
      provider_customer_id = ${subscription.customer_id ?? null},
      status = ${normalizeStatus(subscription.status)},
      current_period_start = ${toDate(subscription.current_start)},
      current_period_end = ${toDate(subscription.current_end)},
      cancel_at_period_end = ${Boolean(subscription.has_scheduled_changes)},
      updated_at = now()
    where provider_subscription_id = ${subscription.id}
    returning *
  `;
  if (!rows[0]) {
    throw new BillingStoreError(
      "The subscription does not belong to an Obseri account.",
      404,
      "subscription_not_found",
    );
  }
  return rows[0];
}

export async function saveSubscriptionPlanChange(input: {
  ownerUserId: string;
  providerSubscriptionId: string;
  providerPlanId: string;
  planId: Exclude<BillingPlanId, "free" | "enterprise">;
  cycle: BillingCycle;
  subscription: RazorpaySubscription;
}) {
  const sql = db();
  const rows = await sql<SubscriptionRow[]>`
    update obseri_billing_subscriptions set
      provider_plan_id = ${input.providerPlanId},
      plan_id = ${input.planId},
      billing_cycle = ${input.cycle},
      provider_customer_id = ${input.subscription.customer_id ?? null},
      status = ${normalizeStatus(input.subscription.status)},
      current_period_start = ${toDate(input.subscription.current_start)},
      current_period_end = ${toDate(input.subscription.current_end)},
      cancel_at_period_end = ${Boolean(input.subscription.has_scheduled_changes)},
      updated_at = now()
    where owner_user_id = ${input.ownerUserId}
      and provider_subscription_id = ${input.providerSubscriptionId}
    returning *
  `;
  if (!rows[0]) {
    throw new BillingStoreError("Subscription not found.", 404, "subscription_not_found");
  }
  return rows[0];
}

export async function processRazorpayWebhook(input: {
  eventId: string;
  eventType: string;
  rawBody: string;
  subscription: RazorpaySubscription | null;
}) {
  if (!input.eventId || input.eventId.length > 160) {
    throw new BillingStoreError("The webhook event id is invalid.", 422, "invalid_event_id");
  }
  const sql = db();
  return sql.begin(async (transaction) => {
    const inserted = await transaction<{ provider_event_id: string }[]>`
      insert into obseri_billing_events (
        provider_event_id, event_type, payload_sha256
      ) values (
        ${input.eventId}, ${input.eventType.slice(0, 160)},
        ${createHash("sha256").update(input.rawBody).digest("hex")}
      )
      on conflict (provider_event_id) do nothing
      returning provider_event_id
    `;
    if (!inserted[0]) return { duplicate: true };

    if (input.subscription) {
      const mappedPlan = billingPlanFromRazorpayPlanId(input.subscription.plan_id);
      if (!mappedPlan) {
        throw new BillingStoreError(
          "The webhook references an unknown billing plan.",
          422,
          "unknown_provider_plan",
        );
      }
      const result = await transaction`
        update obseri_billing_subscriptions set
          provider_plan_id = ${input.subscription.plan_id},
          plan_id = ${mappedPlan.planId},
          billing_cycle = ${mappedPlan.cycle},
          provider_customer_id = ${input.subscription.customer_id ?? null},
          status = ${normalizeStatus(input.subscription.status)},
          current_period_start = ${toDate(input.subscription.current_start)},
          current_period_end = ${toDate(input.subscription.current_end)},
          cancel_at_period_end = ${
            Boolean(input.subscription.has_scheduled_changes) ||
            input.eventType === "subscription.cancelled" ||
            input.eventType === "subscription.completed"
          },
          updated_at = now()
        where provider_subscription_id = ${input.subscription.id}
      `;
      if (result.count === 0) {
        throw new BillingStoreError(
          "The webhook subscription is unknown.",
          404,
          "subscription_not_found",
        );
      }
    }
    return { duplicate: false };
  });
}

export async function billingSummary(ownerUserId: string) {
  const sql = db();
  const rows = await sql<SubscriptionRow[]>`
    select * from obseri_billing_subscriptions
    where owner_user_id = ${ownerUserId}
    order by
      case when status = 'active' then 0
           when status in ('authenticated', 'pending') then 1
           else 2 end,
      updated_at desc
    limit 1
  `;
  const subscription = rows[0] ?? null;
  const entitled = subscription && isEntitled(subscription) ? subscription.plan_id : "free";
  const plan = getBillingPlan(entitled);
  const period = billingPeriod(subscription);
  const usageRows = await sql<
    { metric: UsageMetric; used_units: number; reserved_units: number }[]
  >`
    select metric, used_units, reserved_units
    from obseri_usage_monthly
    where owner_user_id = ${ownerUserId} and period_start = ${period.start}
  `;
  const usage = Object.fromEntries(
    usageRows.map((row) => [row.metric, Number(row.used_units) + Number(row.reserved_units)]),
  ) as Partial<Record<UsageMetric, number>>;

  return {
    plan,
    period,
    subscription: subscription
      ? {
          id: subscription.provider_subscription_id,
          status: subscription.status,
          cycle: subscription.billing_cycle,
          currentPeriodEnd: subscription.current_period_end?.toISOString() ?? null,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        }
      : null,
    usage: {
      textResponses: usage.text_responses ?? 0,
      voiceSeconds: usage.voice_seconds ?? 0,
    },
  };
}

export async function assertWorkspaceWithinPlan(
  ownerUserId: string,
  workspace: Pick<SoulWorkspace, "souls">,
) {
  const { plan } = await billingSummary(ownerUserId);
  const websiteCount = workspace.souls.length;
  const indexedPages = workspace.souls.reduce(
    (total, soul) => total + soul.knowledge.pages.length,
    0,
  );
  if (plan.limits.websites !== null && websiteCount > plan.limits.websites) {
    throw new BillingStoreError(
      `${plan.name} supports ${plan.limits.websites} website${plan.limits.websites === 1 ? "" : "s"}. Upgrade before adding another website.`,
      402,
      "website_limit_reached",
    );
  }
  if (plan.limits.indexedPages !== null && indexedPages > plan.limits.indexedPages) {
    throw new BillingStoreError(
      `${plan.name} supports ${plan.limits.indexedPages.toLocaleString("en-IN")} indexed pages. Remove pages or upgrade to save this crawl.`,
      402,
      "indexed_page_limit_reached",
    );
  }
  return { plan, websiteCount, indexedPages };
}

export async function crawlPageAllowance(
  ownerUserId: string,
  workspace: Pick<SoulWorkspace, "souls"> | null,
  targetUrl: string,
) {
  const { plan } = await billingSummary(ownerUserId);
  if (plan.limits.indexedPages === null) return 50;
  const targetHost = safeHostname(targetUrl);
  let totalPages = 0;
  let replaceablePages = 0;
  for (const soul of workspace?.souls ?? []) {
    totalPages += soul.knowledge.pages.length;
    if (safeHostname(soul.siteUrl) === targetHost) replaceablePages += soul.knowledge.pages.length;
  }
  return Math.max(0, Math.min(50, plan.limits.indexedPages - totalPages + replaceablePages));
}

export async function assertPlanFeature(
  ownerUserId: string,
  feature: "webhooks" | "remove_branding" | "api_access",
) {
  const { plan } = await billingSummary(ownerUserId);
  const minimum: Record<typeof feature, BillingPlanId> = {
    webhooks: "growth",
    remove_branding: "growth",
    api_access: "scale",
  };
  const rank: Record<BillingPlanId, number> = {
    free: 0,
    launch: 1,
    growth: 2,
    scale: 3,
    enterprise: 4,
  };
  if (rank[plan.id] < rank[minimum[feature]]) {
    throw new BillingStoreError(
      `${feature === "webhooks" ? "Conversation webhooks" : feature === "remove_branding" ? "Removing Obseri branding" : "External API access"} requires the ${BILLING_PLANS[minimum[feature]].name} plan or higher.`,
      402,
      "feature_not_in_plan",
    );
  }
  return plan;
}

export async function reserveUsage(ownerUserId: string, metric: UsageMetric, units: number) {
  if (!Number.isSafeInteger(units) || units <= 0) {
    throw new BillingStoreError("Usage units must be a positive integer.", 422, "invalid_usage");
  }
  const summary = await billingSummary(ownerUserId);
  const included = includedUnits(summary.plan.id, metric);
  if (included === null) return { reservationId: null, unlimited: true };
  const sql = db();
  const reservationId = `usr_${randomUUID()}`;
  await sql.begin(async (transaction) => {
    const stale = await transaction<
      { owner_user_id: string; period_start: string; metric: UsageMetric; units: number }[]
    >`
      update obseri_usage_reservations
      set status = 'released', finalized_at = now()
      where owner_user_id = ${ownerUserId}
        and status = 'reserved'
        and expires_at <= now()
      returning owner_user_id, period_start, metric, units
    `;
    for (const reservation of stale) {
      await transaction`
        update obseri_usage_monthly
        set reserved_units = greatest(0, reserved_units - ${reservation.units}), updated_at = now()
        where owner_user_id = ${reservation.owner_user_id}
          and period_start = ${reservation.period_start}
          and metric = ${reservation.metric}
      `;
    }
    await transaction`
      insert into obseri_usage_monthly (
        owner_user_id, period_start, period_end, metric
      ) values (
        ${ownerUserId}, ${summary.period.start}, ${summary.period.end}, ${metric}
      ) on conflict (owner_user_id, period_start, metric) do nothing
    `;
    const rows = await transaction<{ used_units: number; reserved_units: number }[]>`
      select used_units, reserved_units from obseri_usage_monthly
      where owner_user_id = ${ownerUserId}
        and period_start = ${summary.period.start}
        and metric = ${metric}
      for update
    `;
    const grants = await transaction<{ remaining: number }[]>`
      select coalesce(sum(granted_units - consumed_units), 0)::bigint as remaining
      from obseri_usage_grants
      where owner_user_id = ${ownerUserId} and metric = ${metric} and expires_at > now()
    `;
    const total = included + Number(grants[0]?.remaining ?? 0);
    const consumed = Number(rows[0]?.used_units ?? 0) + Number(rows[0]?.reserved_units ?? 0);
    if (consumed + units > total) {
      throw new BillingStoreError(
        "This billing period's included usage has been reached.",
        402,
        "usage_limit_reached",
      );
    }
    await transaction`
      update obseri_usage_monthly set reserved_units = reserved_units + ${units}, updated_at = now()
      where owner_user_id = ${ownerUserId}
        and period_start = ${summary.period.start}
        and metric = ${metric}
    `;
    await transaction`
      insert into obseri_usage_reservations (
        reservation_id, owner_user_id, period_start, metric, units
      ) values (
        ${reservationId}, ${ownerUserId}, ${summary.period.start}, ${metric}, ${units}
      )
    `;
  });
  return { reservationId, unlimited: false };
}

export async function finalizeUsage(
  reservationId: string | null,
  commit: boolean,
  actualUnits?: number,
) {
  if (!reservationId) return;
  const sql = db();
  await sql.begin(async (transaction) => {
    const rows = await transaction<
      {
        owner_user_id: string;
        period_start: string;
        metric: UsageMetric;
        units: number;
        status: string;
      }[]
    >`
      select owner_user_id, period_start, metric, units, status
      from obseri_usage_reservations where reservation_id = ${reservationId} for update
    `;
    const reservation = rows[0];
    if (!reservation || reservation.status !== "reserved") return;
    const committedUnits = commit
      ? Math.max(0, Math.min(reservation.units, Math.floor(actualUnits ?? reservation.units)))
      : 0;
    await transaction`
      update obseri_usage_monthly set
        reserved_units = greatest(0, reserved_units - ${reservation.units}),
        used_units = used_units + ${committedUnits},
        updated_at = now()
      where owner_user_id = ${reservation.owner_user_id}
        and period_start = ${reservation.period_start}
        and metric = ${reservation.metric}
    `;
    await transaction`
      update obseri_usage_reservations set
        status = ${commit ? "committed" : "released"}, finalized_at = now()
      where reservation_id = ${reservationId}
    `;
  });
}

function safeHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isEntitled(subscription: SubscriptionRow) {
  if (subscription.status !== "active") return false;
  return !subscription.current_period_end || subscription.current_period_end.getTime() > Date.now();
}

function billingPeriod(subscription: SubscriptionRow | null) {
  if (
    subscription &&
    isEntitled(subscription) &&
    subscription.current_period_start &&
    subscription.current_period_end
  ) {
    return {
      start: subscription.current_period_start.toISOString().slice(0, 10),
      end: subscription.current_period_end.toISOString().slice(0, 10),
    };
  }
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function includedUnits(planId: BillingPlanId, metric: UsageMetric) {
  const limits = BILLING_PLANS[planId].limits;
  if (metric === "text_responses") return limits.textResponsesPerMonth;
  return limits.voiceMinutesPerMonth === null ? null : limits.voiceMinutesPerMonth * 60;
}

function normalizeStatus(value: string) {
  const allowed = new Set([
    "created",
    "authenticated",
    "active",
    "pending",
    "halted",
    "paused",
    "cancelled",
    "completed",
    "expired",
  ]);
  return allowed.has(value) ? value : "pending";
}

function toDate(value: number | null | undefined) {
  return value ? new Date(value * 1_000) : null;
}
