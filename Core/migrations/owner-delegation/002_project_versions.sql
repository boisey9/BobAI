-- Staged Core/workflow DB target; independent of auth proof-store DB.
BEGIN;
ALTER TABLE bob_workflow.grants ADD COLUMN delegation_version uuid NOT NULL DEFAULT gen_random_uuid();
CREATE FUNCTION bob_workflow.advance_owner_delegation_grant_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.delegation_version=gen_random_uuid(); RETURN NEW; END;
$$;
CREATE TRIGGER advance_owner_delegation_grant_version BEFORE UPDATE ON bob_workflow.grants FOR EACH ROW EXECUTE FUNCTION bob_workflow.advance_owner_delegation_grant_version();
COMMIT;
