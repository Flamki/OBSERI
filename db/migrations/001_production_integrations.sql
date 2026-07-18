begin;

create table if not exists obseri_published_souls (
  soul_id text primary key,
  workspace_id text not null,
  owner_key_hash char(64) not null,
  widget_token_hash char(64) not null,
  soul jsonb not null,
  widget_enabled boolean not null default true,
  allowed_domains jsonb not null default '[]'::jsonb,
  webhook_enabled boolean not null default false,
  webhook_url text,
  webhook_secret text not null default '',
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists obseri_published_souls_widget_token_idx
  on obseri_published_souls (widget_token_hash);
create index if not exists obseri_published_souls_workspace_idx
  on obseri_published_souls (workspace_id);

create table if not exists obseri_conversations (
  conversation_id text primary key,
  soul_id text not null references obseri_published_souls(soul_id) on delete cascade,
  origin text not null,
  channel text not null check (channel in ('widget', 'playground', 'webhook')),
  visitor_label text not null,
  lead_intent text not null check (lead_intent in ('none', 'low', 'medium', 'high')),
  messages jsonb not null,
  started_at timestamptz not null,
  updated_at timestamptz not null
);
create index if not exists obseri_conversations_soul_updated_idx
  on obseri_conversations (soul_id, updated_at desc);

create table if not exists obseri_webhook_deliveries (
  event_id text primary key,
  soul_id text not null references obseri_published_souls(soul_id) on delete cascade,
  event jsonb not null,
  status text not null check (status in ('pending', 'delivering', 'delivered', 'failed')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_status integer,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists obseri_webhook_deliveries_pending_idx
  on obseri_webhook_deliveries (status, next_attempt_at)
  where status in ('pending', 'failed');

create table if not exists obseri_rate_limits (
  rate_key char(64) not null,
  bucket bigint not null,
  request_count integer not null,
  expires_at timestamptz not null,
  primary key (rate_key, bucket)
);
create index if not exists obseri_rate_limits_expiry_idx on obseri_rate_limits (expires_at);

commit;
