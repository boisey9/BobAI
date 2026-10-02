BEGIN;
SET LOCAL row_security=off;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM bob_workflow.policy_versions) THEN RAISE EXCEPTION 'immutable policy history exists'; END IF; END $$;
DROP TABLE bob_workflow.policy_versions;
COMMIT;
