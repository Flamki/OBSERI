begin;

-- Keep team workflow independent of visitor transcript replacements.
create table if not exists obseri_conversation_inbox (
  conversation_id text primary key references obseri_conversations(conversation_id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'waiting', 'resolved')),
  assignee_id text,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists obseri_conversation_notes (
  id uuid primary key,
  conversation_id text not null references obseri_conversations(conversation_id) on delete cascade,
  actor_id text not null,
  actor_email text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists obseri_conversation_notes_history
  on obseri_conversation_notes(conversation_id, created_at desc, id desc);

commit;
