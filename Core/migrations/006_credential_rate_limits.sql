BEGIN;
-- One rolling minute bucket per owner/credential/class; no request payloads or
-- bearer tokens. Distinct AI and essential buckets preserve direct capture.
CREATE TABLE IF NOT EXISTS public.bob_credential_rate_limits (
  owner_id text NOT NULL,
  credential_hash text NOT NULL CHECK (length(credential_hash)=64),
  operation_class text NOT NULL CHECK (operation_class IN ('core','ai')),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count>0),
  PRIMARY KEY (owner_id,credential_hash,operation_class)
);
COMMIT;
