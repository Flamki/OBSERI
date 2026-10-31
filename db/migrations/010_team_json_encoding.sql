-- Preserve early collaboration records accidentally stored as JSON strings.
-- Invalid or differently shaped data remains untouched for diagnosis.
CREATE OR REPLACE FUNCTION pg_temp.obseri_decode_team_json(value jsonb, expected_type text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE decoded jsonb;
BEGIN
  IF jsonb_typeof(value) = 'string' THEN
    BEGIN
      decoded := (value #>> '{}')::jsonb;
      IF jsonb_typeof(decoded) = expected_type THEN RETURN decoded; END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN value;
    END;
  END IF;
  RETURN value;
END;
$$;

UPDATE obseri_team_activity
SET changes = pg_temp.obseri_decode_team_json(changes, 'array')
WHERE jsonb_typeof(changes) = 'string';
UPDATE obseri_workspace_members
SET permissions = pg_temp.obseri_decode_team_json(permissions, 'object')
WHERE jsonb_typeof(permissions) = 'string';
UPDATE obseri_workspace_invitations
SET permissions = pg_temp.obseri_decode_team_json(permissions, 'object')
WHERE jsonb_typeof(permissions) = 'string';
