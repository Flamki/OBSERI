-- Obseri production data model for Supabase/Postgres.
-- Apply to a new project when moving from local founder mode to hosted accounts.

create extension if not exists pgcrypto;
create extension if not exists vector;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'spark' check (plan in ('spark', 'alive', 'presence', 'enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'builder', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id and user_id = auth.uid()
  );
$$;

create table public.souls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  site_url text not null check (char_length(site_url) <= 2048),
  status text not null default 'draft' check (status in ('draft', 'learning', 'live', 'paused')),
  personality jsonb not null default '{}'::jsonb,
  voice jsonb not null default '{}'::jsonb,
  appearance jsonb not null default '{}'::jsonb,
  channels jsonb not null default '{}'::jsonb,
  published_revision integer not null default 0,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  soul_id uuid not null references public.souls(id) on delete cascade,
  root_url text not null check (char_length(root_url) <= 2048),
  source_type text not null default 'website' check (source_type in ('website', 'sitemap', 'document', 'manual')),
  crawl_depth smallint not null default 2 check (crawl_depth between 0 and 5),
  page_limit integer not null default 25 check (page_limit between 1 and 10000),
  cadence text not null default 'manual' check (cadence in ('manual', 'daily', 'weekly', 'monthly')),
  status text not null default 'pending' check (status in ('pending', 'crawling', 'ready', 'warning', 'error', 'paused')),
  last_crawled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (soul_id, root_url)
);

create table public.knowledge_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  soul_id uuid not null references public.souls(id) on delete cascade,
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  url text not null check (char_length(url) <= 2048),
  canonical_url text not null check (char_length(canonical_url) <= 2048),
  title text not null default '',
  description text not null default '',
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  normalized_text text not null,
  word_count integer not null default 0 check (word_count >= 0),
  http_status integer,
  content_type text,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (soul_id, canonical_url)
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  soul_id uuid not null references public.souls(id) on delete cascade,
  page_id uuid not null references public.knowledge_pages(id) on delete cascade,
  chunk_order integer not null check (chunk_order >= 0),
  content text not null check (char_length(content) between 1 and 4000),
  token_estimate integer not null default 0 check (token_estimate >= 0),
  search_vector tsvector generated always as (to_tsvector('english', content)) stored,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (page_id, chunk_order)
);

create table public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  soul_id uuid not null references public.souls(id) on delete cascade,
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts integer not null default 0,
  scheduled_for timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_message text,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.voice_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  soul_id uuid references public.souls(id) on delete set null,
  provider text not null check (provider in ('browser', 'voicebox')),
  provider_profile_id text,
  name text not null check (char_length(name) between 1 and 120),
  language text not null default 'en',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.voice_consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  voice_profile_id uuid references public.voice_profiles(id) on delete set null,
  speaker_user_id uuid references auth.users(id) on delete set null,
  rights_basis text not null check (rights_basis in ('self', 'permission', 'licensed')),
  attestation text not null,
  recorded_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  soul_id uuid not null references public.souls(id) on delete cascade,
  channel text not null check (channel in ('playground', 'widget', 'api', 'webhook')),
  visitor_id text,
  visitor_label text,
  lead_intent text not null default 'none' check (lead_intent in ('none', 'low', 'medium', 'high')),
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  soul_id uuid not null references public.souls(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('visitor', 'assistant', 'system', 'tool')),
  content text not null check (char_length(content) <= 12000),
  citations jsonb not null default '[]'::jsonb,
  model text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  soul_id uuid not null references public.souls(id) on delete cascade,
  url text not null check (char_length(url) <= 2048),
  signing_secret_ciphertext text not null,
  enabled boolean not null default true,
  events text[] not null default array['conversation.updated', 'lead.detected'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  event_id text not null unique,
  event_type text not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed', 'dead_letter')),
  attempts integer not null default 0,
  response_status integer,
  response_excerpt text,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index souls_workspace_idx on public.souls (workspace_id, updated_at desc);
create index pages_soul_idx on public.knowledge_pages (soul_id, captured_at desc);
create index chunks_soul_idx on public.knowledge_chunks (soul_id);
create index chunks_search_idx on public.knowledge_chunks using gin (search_vector);
create index chunks_embedding_idx on public.knowledge_chunks using hnsw (embedding vector_cosine_ops) where embedding is not null;
create index ingestion_queue_idx on public.ingestion_jobs (status, scheduled_for) where status = 'queued';
create index conversations_soul_idx on public.conversations (soul_id, updated_at desc);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index webhook_retry_idx on public.webhook_deliveries (status, next_attempt_at) where status in ('pending', 'failed');

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.souls enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_pages enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.voice_profiles enable row level security;
alter table public.voice_consents enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;

create policy "users can create workspaces" on public.workspaces for insert with check (owner_id = auth.uid());
create policy "members can read workspaces" on public.workspaces for select using (public.is_workspace_member(id));
create policy "owners can update workspaces" on public.workspaces for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "members can read memberships" on public.workspace_members for select using (public.is_workspace_member(workspace_id));
create policy "owners can manage memberships" on public.workspace_members for all using (
  exists (select 1 from public.workspaces where id = workspace_id and owner_id = auth.uid())
) with check (
  exists (select 1 from public.workspaces where id = workspace_id and owner_id = auth.uid())
);

-- All tenant tables use the same membership boundary. Background workers use the
-- service role only after validating a queued job's workspace and soul ownership.
create policy "members manage souls" on public.souls for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage knowledge sources" on public.knowledge_sources for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members read knowledge pages" on public.knowledge_pages for select using (public.is_workspace_member(workspace_id));
create policy "members read knowledge chunks" on public.knowledge_chunks for select using (public.is_workspace_member(workspace_id));
create policy "members read ingestion jobs" on public.ingestion_jobs for select using (public.is_workspace_member(workspace_id));
create policy "members manage voice profiles" on public.voice_profiles for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members read voice consent" on public.voice_consents for select using (public.is_workspace_member(workspace_id));
create policy "members read conversations" on public.conversations for select using (public.is_workspace_member(workspace_id));
create policy "members read messages" on public.messages for select using (public.is_workspace_member(workspace_id));
create policy "members manage webhook endpoints" on public.webhook_endpoints for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members read webhook deliveries" on public.webhook_deliveries for select using (public.is_workspace_member(workspace_id));

create or replace function public.create_workspace_with_owner(workspace_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_workspace_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  insert into public.workspaces (name, owner_id) values (workspace_name, auth.uid()) returning id into new_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (new_workspace_id, auth.uid(), 'owner');
  return new_workspace_id;
end;
$$;

revoke all on function public.create_workspace_with_owner(text) from public;
grant execute on function public.create_workspace_with_owner(text) to authenticated;

-- Public widgets never query these tables with the anonymous client. A server
-- endpoint loads a sanitized published revision and enforces allowed domains.
