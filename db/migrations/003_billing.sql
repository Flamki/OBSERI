begin;

create table if not exists obseri_billing_subscriptions (
  provider_subscription_id text primary key,
  owner_user_id text not null,
  provider text not null default 'razorpay' check (provider in ('razorpay')),
  provider_plan_id text not null,
  provider_customer_id text,
  plan_id text not null check (plan_id in ('launch', 'growth', 'scale', 'enterprise')),
  billing_cycle text not null check (billing_cycle in ('monthly', 'annual', 'contract')),
  status text not null check (
    status in ('created', 'authenticated', 'active', 'pending', 'halted', 'paused', 'cancelled', 'completed', 'expired')
  ),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists obseri_billing_subscriptions_owner_idx
  on obseri_billing_subscriptions (owner_user_id, updated_at desc);
create index if not exists obseri_billing_subscriptions_customer_idx
  on obseri_billing_subscriptions (provider_customer_id)
  where provider_customer_id is not null;

create table if not exists obseri_billing_events (
  provider_event_id text primary key,
  provider text not null default 'razorpay' check (provider in ('razorpay')),
  event_type text not null,
  payload_sha256 text not null,
  processed_at timestamptz not null default now()
);
create index if not exists obseri_billing_events_processed_idx
  on obseri_billing_events (processed_at desc);

create table if not exists obseri_usage_monthly (
  owner_user_id text not null,
  period_start date not null,
  period_end date not null,
  metric text not null check (metric in ('text_responses', 'voice_seconds')),
  used_units bigint not null default 0 check (used_units >= 0),
  reserved_units bigint not null default 0 check (reserved_units >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, period_start, metric),
  check (period_end > period_start)
);

create table if not exists obseri_usage_grants (
  grant_id text primary key,
  owner_user_id text not null,
  metric text not null check (metric in ('text_responses', 'voice_seconds')),
  granted_units bigint not null check (granted_units > 0),
  consumed_units bigint not null default 0 check (consumed_units >= 0 and consumed_units <= granted_units),
  provider_payment_id text unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists obseri_usage_grants_owner_idx
  on obseri_usage_grants (owner_user_id, metric, expires_at);

create table if not exists obseri_usage_reservations (
  reservation_id text primary key,
  owner_user_id text not null,
  period_start date not null,
  metric text not null check (metric in ('text_responses', 'voice_seconds')),
  units bigint not null check (units > 0),
  status text not null default 'reserved' check (status in ('reserved', 'committed', 'released')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  finalized_at timestamptz
);
alter table obseri_usage_reservations
  add column if not exists expires_at timestamptz not null default (now() + interval '15 minutes');
create index if not exists obseri_usage_reservations_owner_idx
  on obseri_usage_reservations (owner_user_id, created_at desc);

commit;
