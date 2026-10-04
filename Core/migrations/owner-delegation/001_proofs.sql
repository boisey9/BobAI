-- Staged only. No expiry deletion/retention authority implied.
BEGIN;
CREATE SCHEMA bob_owner_delegation;
CREATE TABLE bob_owner_delegation.proofs (
 proof_hash text PRIMARY KEY CHECK (proof_hash ~ '^[a-f0-9]{64}$'),
 claims jsonb NOT NULL, expires_at timestamptz NOT NULL,
 redeemed_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION bob_owner_delegation.immutable_claims() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.proof_hash IS DISTINCT FROM OLD.proof_hash OR NEW.claims IS DISTINCT FROM OLD.claims OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.created_at IS DISTINCT FROM OLD.created_at OR OLD.redeemed_at IS NOT NULL OR NEW.redeemed_at IS NULL THEN RAISE EXCEPTION 'immutable_owner_proof'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_owner_proof BEFORE UPDATE ON bob_owner_delegation.proofs FOR EACH ROW EXECUTE FUNCTION bob_owner_delegation.immutable_claims();
COMMIT;
