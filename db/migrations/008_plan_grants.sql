begin;

-- Operator-managed complimentary access, separate from payment-provider records.
create table if not exists obseri_plan_grants (
  id uuid primary key,
  owner_user_id text not null,
  plan_id text not null check (plan_id in ('launch', 'growth', 'scale', 'enterprise')),
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  check (expires_at is null or expires_at > created_at)
);
create unique index if not exists obseri_plan_grants_active_owner_idx
  on obseri_plan_grants (owner_user_id) where revoked_at is null;

commit;
