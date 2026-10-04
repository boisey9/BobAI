BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM bob_owner_delegation.proofs) THEN RAISE EXCEPTION 'owner_proof_history_requires_review'; END IF; END $$;
DROP SCHEMA bob_owner_delegation CASCADE;
COMMIT;
