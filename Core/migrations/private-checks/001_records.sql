-- Additive staged schema only. No role/grant creation, live target or automatic startup.
BEGIN;
CREATE SCHEMA bob_private_checks;
CREATE TABLE bob_private_checks.authorities(
 owner_id text NOT NULL,project_key text NOT NULL CHECK(project_key <> 'personal'),
 version uuid NOT NULL DEFAULT gen_random_uuid(),enabled boolean NOT NULL DEFAULT false,
 PRIMARY KEY(owner_id,project_key)
);
CREATE TABLE bob_private_checks.records(
 record_id uuid PRIMARY KEY,sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 owner_id text NOT NULL,project_key text NOT NULL,authority_version uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('context','issuer','report','manual')),
 logical_id text NOT NULL CHECK(logical_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 actor_id text NOT NULL,body_digest text NOT NULL CHECK(body_digest ~ '^[a-f0-9]{64}$'),
 body jsonb NOT NULL CHECK(octet_length(body::text)<=2097152),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(owner_id,project_key) REFERENCES bob_private_checks.authorities(owner_id,project_key)
);
CREATE INDEX private_record_lookup ON bob_private_checks.records(owner_id,project_key,authority_version,kind,logical_id,sequence DESC);
CREATE TABLE bob_private_checks.capture_receipts(
 owner_id text NOT NULL,project_key text NOT NULL,actor_id text NOT NULL,operation_id text NOT NULL,
 authority_version uuid NOT NULL,fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 record_id uuid NOT NULL REFERENCES bob_private_checks.records(record_id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_id,project_key,actor_id,operation_id)
);
CREATE FUNCTION bob_private_checks.immutable_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable_private_check_history'; END $$;
CREATE TRIGGER immutable_records BEFORE UPDATE OR DELETE ON bob_private_checks.records FOR EACH ROW EXECUTE FUNCTION bob_private_checks.immutable_history();
CREATE TRIGGER immutable_receipts BEFORE UPDATE OR DELETE ON bob_private_checks.capture_receipts FOR EACH ROW EXECUTE FUNCTION bob_private_checks.immutable_history();
CREATE FUNCTION bob_private_checks.advance_authority() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(NEW.owner_id,NEW.project_key)::text,0)); IF NEW.version=OLD.version THEN NEW.version=gen_random_uuid(); END IF; RETURN NEW; END $$;
CREATE TRIGGER authority_generation BEFORE UPDATE ON bob_private_checks.authorities FOR EACH ROW EXECUTE FUNCTION bob_private_checks.advance_authority();
ALTER TABLE bob_private_checks.authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE bob_private_checks.authorities FORCE ROW LEVEL SECURITY;
ALTER TABLE bob_private_checks.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE bob_private_checks.records FORCE ROW LEVEL SECURITY;
ALTER TABLE bob_private_checks.capture_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bob_private_checks.capture_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY authority_scope ON bob_private_checks.authorities FOR SELECT USING(owner_id=current_setting('bob.private_owner',true) AND project_key=current_setting('bob.private_project',true));
CREATE POLICY record_read_scope ON bob_private_checks.records FOR SELECT USING(owner_id=current_setting('bob.private_owner',true) AND project_key=current_setting('bob.private_project',true));
CREATE POLICY report_capture_scope ON bob_private_checks.records FOR INSERT WITH CHECK(
 owner_id=current_setting('bob.private_owner',true) AND project_key=current_setting('bob.private_project',true)
 AND actor_id=current_setting('bob.private_actor',true) AND kind='report'
 AND EXISTS(SELECT 1 FROM bob_private_checks.authorities a WHERE a.owner_id=records.owner_id AND a.project_key=records.project_key AND a.version=records.authority_version AND a.enabled));
CREATE POLICY receipt_read_scope ON bob_private_checks.capture_receipts FOR SELECT USING(owner_id=current_setting('bob.private_owner',true) AND project_key=current_setting('bob.private_project',true) AND actor_id=current_setting('bob.private_actor',true));
CREATE POLICY receipt_capture_scope ON bob_private_checks.capture_receipts FOR INSERT WITH CHECK(owner_id=current_setting('bob.private_owner',true) AND project_key=current_setting('bob.private_project',true) AND actor_id=current_setting('bob.private_actor',true));
COMMIT;
