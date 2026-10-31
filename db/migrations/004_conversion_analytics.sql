begin;

create table if not exists obseri_analytics_events (
  soul_id text not null references obseri_published_souls(soul_id) on delete cascade,
  event_id uuid not null,
  session_id uuid not null,
  name text not null check (name in ('page_view', 'widget_opened', 'conversation_started', 'help_shown', 'help_clicked')),
  path text not null,
  referrer text not null default '',
  source text not null default '',
  campaign text not null default '',
  created_at timestamptz not null default now(),
  primary key (soul_id, event_id)
);
create index if not exists obseri_analytics_window_idx on obseri_analytics_events (soul_id, created_at desc);
create index if not exists obseri_analytics_session_idx on obseri_analytics_events (soul_id, session_id, created_at);

create table if not exists obseri_leads (
  id uuid primary key,
  soul_id text not null references obseri_published_souls(soul_id) on delete cascade,
  conversation_id uuid not null,
  session_id uuid,
  name text not null,
  email text not null,
  message text not null,
  path text not null default '/',
  consent_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'qualified', 'won', 'closed')),
  created_at timestamptz not null default now(),
  unique (soul_id, conversation_id)
);
create index if not exists obseri_leads_window_idx on obseri_leads (soul_id, created_at desc);
commit;
