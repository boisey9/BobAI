-- Staged only; no live owner acceptance, grants or activation.
BEGIN;
CREATE TABLE bob_workflow.policy_versions (
 owner_id text NOT NULL, project_key text NOT NULL, version_id text NOT NULL,
 policy jsonb NOT NULL CHECK(policy->>'versionId'=version_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,project_key,version_id),
 FOREIGN KEY(owner_id,project_key) REFERENCES bob_workflow.projects
);
REVOKE ALL ON bob_workflow.policy_versions FROM PUBLIC;
CREATE TRIGGER immutable_policy_versions BEFORE UPDATE OR DELETE ON bob_workflow.policy_versions
 FOR EACH ROW EXECUTE FUNCTION bob_workflow.immutable_record();
ALTER TABLE bob_workflow.policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bob_workflow.policy_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped_policy_versions ON bob_workflow.policy_versions USING
 (owner_id=current_setting('bob.workflow_owner',true) AND project_key=current_setting('bob.workflow_project',true)) WITH CHECK
 (owner_id=current_setting('bob.workflow_owner',true) AND project_key=current_setting('bob.workflow_project',true));
COMMIT;
