BEGIN;
CREATE TABLE IF NOT EXISTS public.bob_backup_runs (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  instance_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','verified','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  failed_at timestamptz,
  retention_checked_at timestamptz,
  archive_key text,
  manifest_key text,
  receipt_key text,
  ciphertext_sha256 text,
  size_bytes bigint,
  failure_code text
);
CREATE INDEX IF NOT EXISTS bob_backup_runs_owner_started
  ON public.bob_backup_runs(owner_id, started_at DESC);
COMMIT;
