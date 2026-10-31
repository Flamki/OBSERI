begin;
create table if not exists obseri_workspace_members (
  owner_user_id text not null references obseri_user_workspaces(user_id) on delete cascade,
  user_id text not null,
  email text not null,
  role text not null default 'editor' check (role = 'editor'),
  created_at timestamptz not null default now(),
  primary key (owner_user_id, user_id),
  check (owner_user_id <> user_id)
);
create index if not exists obseri_workspace_members_user_idx on obseri_workspace_members(user_id);
create table if not exists obseri_workspace_invitations (
  id text primary key,
  owner_user_id text not null references obseri_user_workspaces(user_id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index if not exists obseri_workspace_invites_owner_idx on obseri_workspace_invitations(owner_user_id, expires_at);
create table if not exists obseri_operation_events (
  id bigint generated always as identity primary key,
  owner_user_id text not null,
  operation text not null,
  status text not null check (status in ('ok', 'failed', 'fallback')),
  code text not null,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists obseri_operations_owner_idx on obseri_operation_events(owner_user_id, created_at desc);
create table if not exists obseri_embedding_budgets (
  owner_user_id text not null,
  month text not null,
  characters bigint not null default 0,
  primary key (owner_user_id, month)
);
create table if not exists obseri_import_leases (
  id text primary key,
  owner_user_id text not null,
  expires_at timestamptz not null
);
create index if not exists obseri_import_leases_expiry_idx on obseri_import_leases(expires_at);
commit;
