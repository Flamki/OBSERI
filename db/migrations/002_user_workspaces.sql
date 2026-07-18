begin;

create table if not exists obseri_user_workspaces (
  user_id text primary key,
  workspace_id text not null unique,
  workspace jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists obseri_user_workspaces_updated_idx
  on obseri_user_workspaces (updated_at desc);

alter table obseri_published_souls
  add column if not exists owner_user_id text;
create index if not exists obseri_published_souls_owner_user_idx
  on obseri_published_souls (owner_user_id, updated_at desc);

commit;
