-- A durable maintenance schedule, independent of visitor chat requests.
alter table obseri_published_souls
  add column if not exists semantic_index_due_at timestamptz not null default now();
create index if not exists obseri_semantic_index_due_idx
  on obseri_published_souls (semantic_index_due_at) where owner_user_id is not null;
