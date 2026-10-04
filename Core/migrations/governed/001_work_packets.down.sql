-- Local rollback drill only. Refuse to discard durable packet data.
BEGIN;
SET LOCAL row_security = off;
DO $$ DECLARE history_exists boolean; BEGIN
  IF to_regclass('bob_workflow.policy_versions') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM bob_workflow.policy_versions)' INTO history_exists;
    IF history_exists THEN RAISE EXCEPTION 'immutable policy history exists'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM bob_workflow.packets) OR EXISTS (SELECT 1 FROM bob_workflow.receipts) THEN
    RAISE EXCEPTION 'workflow data exists: preserve/export data before a separately reviewed destructive rollback';
  END IF;
END $$;
DROP SCHEMA bob_workflow CASCADE;
COMMIT;
