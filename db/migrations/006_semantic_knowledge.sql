-- Vectors are a disposable, tenant-scoped cache. Retrieval only looks up active content hashes.
CREATE TABLE IF NOT EXISTS obseri_knowledge_vectors (
  owner_user_id text NOT NULL,
  model text NOT NULL,
  content_hash text NOT NULL,
  vector jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (owner_user_id, model, content_hash)
);
CREATE INDEX IF NOT EXISTS obseri_knowledge_vectors_expiry_idx ON obseri_knowledge_vectors (expires_at);
