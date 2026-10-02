BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM bob_workflow.grants) THEN RAISE EXCEPTION 'project_authority_history_requires_review'; END IF; END $$;
DROP TRIGGER advance_owner_delegation_grant_version ON bob_workflow.grants;
DROP FUNCTION bob_workflow.advance_owner_delegation_grant_version();
ALTER TABLE bob_workflow.grants DROP COLUMN delegation_version;
COMMIT;
