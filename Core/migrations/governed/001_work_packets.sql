-- Staged only. This migration is NOT part of automatic runtime startup.
BEGIN;
CREATE SCHEMA bob_workflow;
REVOKE ALL ON SCHEMA bob_workflow FROM PUBLIC;
CREATE TABLE bob_workflow.projects (
  owner_id text NOT NULL, project_key text NOT NULL,
  policy jsonb, paused boolean NOT NULL DEFAULT true,
  PRIMARY KEY (owner_id, project_key)
);
-- Only a separately reviewed governance operator may provision/change grants or policy.
CREATE TABLE bob_workflow.grants (
  owner_id text NOT NULL, project_key text NOT NULL, actor_id text NOT NULL,
  can_edit boolean NOT NULL DEFAULT false, can_review boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (owner_id, project_key, actor_id),
  FOREIGN KEY (owner_id, project_key) REFERENCES bob_workflow.projects
);
CREATE TABLE bob_workflow.packets (
  owner_id text NOT NULL, project_key text NOT NULL, id text NOT NULL,
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  PRIMARY KEY (owner_id, project_key, id),
  FOREIGN KEY (owner_id, project_key) REFERENCES bob_workflow.projects
);
CREATE TABLE bob_workflow.records (
  owner_id text NOT NULL, project_key text NOT NULL, id text NOT NULL,
  packet_id text NOT NULL, kind text NOT NULL CHECK (kind IN ('specification','candidate','evidence','approval')),
  content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, project_key, id),
  FOREIGN KEY (owner_id, project_key, packet_id) REFERENCES bob_workflow.packets
);
CREATE INDEX workflow_records_packet ON bob_workflow.records (owner_id, project_key, packet_id, created_at);
CREATE TABLE bob_workflow.receipts (
  owner_id text NOT NULL, project_key text NOT NULL, operation_id text NOT NULL,
  actor_id text NOT NULL, fingerprint text NOT NULL, result jsonb NOT NULL,
  approval_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, project_key, operation_id),
  UNIQUE (owner_id, project_key, approval_id),
  FOREIGN KEY (owner_id, project_key, approval_id) REFERENCES bob_workflow.records(owner_id, project_key, id),
  FOREIGN KEY (owner_id, project_key) REFERENCES bob_workflow.projects
);
CREATE TABLE bob_workflow.history (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id text NOT NULL, project_key text NOT NULL, packet_id text NOT NULL,
  operation_id text NOT NULL, actor_id text NOT NULL, action text NOT NULL,
  state text NOT NULL, version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, project_key, operation_id),
  FOREIGN KEY (owner_id, project_key, packet_id) REFERENCES bob_workflow.packets
);
CREATE INDEX workflow_history_scope ON bob_workflow.history (owner_id, project_key, sequence DESC);
-- Governance revocation/pause cannot race a transition, even when the trusted
-- operator is a different process. Scope changes require a separate new row.
CREATE FUNCTION bob_workflow.lock_governance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o text; p text;
BEGIN
  IF TG_OP='DELETE' THEN o=OLD.owner_id; p=OLD.project_key;
  ELSE o=NEW.owner_id; p=NEW.project_key; END IF;
  IF TG_OP='UPDATE' AND (NEW.owner_id<>OLD.owner_id OR NEW.project_key<>OLD.project_key) THEN
    RAISE EXCEPTION 'workflow governance scope is immutable';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bob-workflow:' || char_length(o) || ':' || o || ':' || p,0));
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER governance_project_lock BEFORE UPDATE OR DELETE ON bob_workflow.projects
  FOR EACH ROW EXECUTE FUNCTION bob_workflow.lock_governance();
CREATE TRIGGER governance_grant_lock BEFORE INSERT OR UPDATE OR DELETE ON bob_workflow.grants
  FOR EACH ROW EXECUTE FUNCTION bob_workflow.lock_governance();
CREATE FUNCTION bob_workflow.immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'workflow immutable record'; END $$;
CREATE TRIGGER immutable_records BEFORE UPDATE OR DELETE ON bob_workflow.records
  FOR EACH ROW EXECUTE FUNCTION bob_workflow.immutable_record();
CREATE TRIGGER immutable_receipts BEFORE UPDATE OR DELETE ON bob_workflow.receipts
  FOR EACH ROW EXECUTE FUNCTION bob_workflow.immutable_record();
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON bob_workflow.history
  FOR EACH ROW EXECUTE FUNCTION bob_workflow.immutable_record();
DO $$ DECLARE target text; BEGIN
  FOREACH target IN ARRAY ARRAY['projects','grants','packets','records','receipts','history'] LOOP
    EXECUTE format('ALTER TABLE bob_workflow.%I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE bob_workflow.%I FORCE ROW LEVEL SECURITY', target);
    EXECUTE format('CREATE POLICY scoped_workflow ON bob_workflow.%I USING
      (owner_id = current_setting(''bob.workflow_owner'', true)
       AND project_key = current_setting(''bob.workflow_project'', true)) WITH CHECK
      (owner_id = current_setting(''bob.workflow_owner'', true)
       AND project_key = current_setting(''bob.workflow_project'', true))', target);
  END LOOP;
END $$;
-- No role grants, policy acceptance, credentials, source adapters or release permission are created.
COMMIT;
