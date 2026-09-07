-- Additive migration. Apply to an isolated branch before production.
BEGIN;

ALTER TABLE public.bob_tasks ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0);

-- All writers, including owner approval routes and import tooling, advance versions.
CREATE OR REPLACE FUNCTION public.bob_advance_task_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bob_task_version ON public.bob_tasks;
CREATE TRIGGER bob_task_version BEFORE UPDATE ON public.bob_tasks
FOR EACH ROW EXECUTE FUNCTION public.bob_advance_task_version();

CREATE TABLE IF NOT EXISTS public.bob_operation_receipts (
  owner_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.bob_projects(id),
  operation_id text NOT NULL CHECK (length(operation_id) BETWEEN 8 AND 120),
  request_fingerprint text NOT NULL CHECK (length(request_fingerprint) = 64),
  kind text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, project_id, operation_id)
);

CREATE INDEX IF NOT EXISTS bob_events_operation_lookup
  ON public.bob_events (owner_id, project_id, (details->>'operationId'))
  WHERE details ? 'operationId';
CREATE INDEX IF NOT EXISTS bob_memory_workspace_context
  ON public.bob_memory_items (owner_id, (lower(trim(coalesce(metadata->>'projectKey', '')))), updated_at DESC)
  WHERE deleted_at IS NULL AND sensitivity = 'normal';

-- A workspace has no repository/import requirement. Existing unassigned memories
-- are deliberately left untouched and read only within Personal.
INSERT INTO public.bob_projects (id, owner_id, project_key, name, description, repository, status, metadata)
SELECT gen_random_uuid(), owner_id, 'personal', 'Personal', 'Personal inbox and daily commitments.', NULL, 'active',
  '{"workspaceKind":"personal"}'::jsonb
FROM (SELECT DISTINCT owner_id FROM public.bob_projects UNION SELECT DISTINCT owner_id FROM public.bob_memory_items) owners
WHERE NOT EXISTS (SELECT 1 FROM public.bob_projects p WHERE p.owner_id = owners.owner_id AND lower(p.project_key) = 'personal' AND p.deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS public.bob_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.bob_projects(id),
  outcome text NOT NULL,
  unresolved jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bob_handoffs_project_created ON public.bob_handoffs(owner_id, project_id, created_at DESC);

COMMIT;
