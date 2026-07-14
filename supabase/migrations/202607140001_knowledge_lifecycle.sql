-- Production knowledge lifecycle: incremental HTTP refresh, document revisions,
-- crawl observability, source controls, and hybrid retrieval.

alter table public.knowledge_sources
  add column if not exists name text not null default '',
  add column if not exists include_patterns text[] not null default '{}',
  add column if not exists exclude_patterns text[] not null default '{}',
  add column if not exists auto_remove_missing boolean not null default false,
  add column if not exists next_crawl_at timestamptz;

alter table public.knowledge_pages
  add column if not exists etag text,
  add column if not exists last_modified text,
  add column if not exists language text,
  add column if not exists structured_data_types text[] not null default '{}',
  add column if not exists size_bytes integer not null default 0 check (size_bytes >= 0),
  add column if not exists enabled boolean not null default true,
  add column if not exists manual_override boolean not null default false,
  add column if not exists revision integer not null default 1 check (revision >= 1),
  add column if not exists change_type text not null default 'new'
    check (change_type in ('new', 'changed', 'unchanged', 'manual')),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.knowledge_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  soul_id uuid not null references public.souls(id) on delete cascade,
  page_id uuid not null references public.knowledge_pages(id) on delete cascade,
  revision integer not null check (revision >= 1),
  reason text not null check (reason in ('crawl', 'refresh', 'manual_edit', 'restore')),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  normalized_text text not null,
  word_count integer not null default 0 check (word_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (page_id, revision)
);

create table if not exists public.crawl_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  soul_id uuid not null references public.souls(id) on delete cascade,
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  trigger text not null default 'manual'
    check (trigger in ('initial', 'manual', 'schedule', 'api')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer check (duration_ms >= 0),
  stats jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.crawl_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.crawl_runs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stage text not null,
  event_type text not null,
  message text not null,
  url text,
  progress smallint not null default 0 check (progress between 0 and 100),
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_revisions_page_idx
  on public.knowledge_revisions (page_id, revision desc);
create index if not exists crawl_runs_source_idx
  on public.crawl_runs (source_id, started_at desc);
create index if not exists crawl_events_run_idx
  on public.crawl_events (run_id, id);
create index if not exists sources_next_crawl_idx
  on public.knowledge_sources (next_crawl_at)
  where status not in ('paused', 'crawling') and cadence <> 'manual';
create index if not exists pages_enabled_idx
  on public.knowledge_pages (soul_id, enabled)
  where enabled = true;

alter table public.knowledge_revisions enable row level security;
alter table public.crawl_runs enable row level security;
alter table public.crawl_events enable row level security;

create policy "members read knowledge revisions"
  on public.knowledge_revisions for select
  using (public.is_workspace_member(workspace_id));
create policy "members read crawl runs"
  on public.crawl_runs for select
  using (public.is_workspace_member(workspace_id));
create policy "members read crawl events"
  on public.crawl_events for select
  using (public.is_workspace_member(workspace_id));

-- Reciprocal-rank fusion keeps lexical matches strong while allowing semantic
-- matches to surface. The service role supplies embeddings after tenant checks.
create or replace function public.search_knowledge_chunks(
  target_soul_id uuid,
  query_text text,
  query_embedding vector(1536) default null,
  match_count integer default 8
)
returns table (
  chunk_id uuid,
  page_id uuid,
  content text,
  metadata jsonb,
  score double precision
)
language sql stable security invoker set search_path = public as $$
  with lexical as (
    select kc.id,
           row_number() over (order by ts_rank_cd(kc.search_vector, websearch_to_tsquery('english', query_text)) desc) as rank
    from public.knowledge_chunks kc
    join public.knowledge_pages kp on kp.id = kc.page_id
    where kc.soul_id = target_soul_id
      and kp.enabled = true
      and kc.search_vector @@ websearch_to_tsquery('english', query_text)
    limit greatest(match_count * 5, 20)
  ), semantic as (
    select kc.id,
           row_number() over (order by kc.embedding <=> query_embedding) as rank
    from public.knowledge_chunks kc
    join public.knowledge_pages kp on kp.id = kc.page_id
    where query_embedding is not null
      and kc.soul_id = target_soul_id
      and kp.enabled = true
      and kc.embedding is not null
    limit greatest(match_count * 5, 20)
  ), fused as (
    select coalesce(lexical.id, semantic.id) as id,
           coalesce(1.0 / (60 + lexical.rank), 0) +
           coalesce(1.0 / (60 + semantic.rank), 0) as score
    from lexical full join semantic using (id)
  )
  select kc.id, kc.page_id, kc.content, kc.metadata, fused.score
  from fused join public.knowledge_chunks kc on kc.id = fused.id
  order by fused.score desc
  limit least(greatest(match_count, 1), 50);
$$;

revoke all on function public.search_knowledge_chunks(uuid, text, vector, integer) from public;
grant execute on function public.search_knowledge_chunks(uuid, text, vector, integer) to authenticated;
