-- Null policies preserve existing editor access. Explicit policies default missing scopes to none.
ALTER TABLE obseri_workspace_members ADD COLUMN IF NOT EXISTS permissions jsonb;
ALTER TABLE obseri_workspace_invitations ADD COLUMN IF NOT EXISTS permissions jsonb;
CREATE TABLE IF NOT EXISTS obseri_team_activity (
  id bigserial PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES obseri_user_workspaces(user_id) ON DELETE CASCADE,
  actor_user_id text NOT NULL,
  actor_email text NOT NULL DEFAULT '',
  action text NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]',
  revision bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obseri_team_activity_owner_cursor ON obseri_team_activity(owner_user_id, id DESC);
