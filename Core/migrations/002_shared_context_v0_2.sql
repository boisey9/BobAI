BEGIN;

CREATE TABLE IF NOT EXISTS public.bob_projects (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  project_key text NOT NULL,
  name text NOT NULL,
  description text,
  repository text,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT bob_projects_project_key_check
    CHECK (project_key ~ '^[a-z0-9][a-z0-9_-]{0,99}$'),
  CONSTRAINT bob_projects_name_length_check
    CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT bob_projects_description_length_check
    CHECK (description IS NULL OR char_length(description) <= 4000),
  CONSTRAINT bob_projects_repository_length_check
    CHECK (repository IS NULL OR char_length(repository) <= 500),
  CONSTRAINT bob_projects_status_check
    CHECK (status IN ('active', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS bob_projects_owner_key_unique
  ON public.bob_projects (owner_id, lower(project_key))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS bob_projects_owner_status_idx
  ON public.bob_projects (owner_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.bob_decisions (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.bob_projects(id) ON DELETE RESTRICT,
  title text NOT NULL,
  decision text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'active',
  supersedes_decision_id uuid REFERENCES public.bob_decisions(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bob_decisions_title_length_check
    CHECK (char_length(title) BETWEEN 1 AND 300),
  CONSTRAINT bob_decisions_decision_length_check
    CHECK (char_length(decision) BETWEEN 1 AND 6000),
  CONSTRAINT bob_decisions_reason_length_check
    CHECK (reason IS NULL OR char_length(reason) <= 6000),
  CONSTRAINT bob_decisions_status_check
    CHECK (status IN ('active', 'superseded', 'revoked'))
);

CREATE INDEX IF NOT EXISTS bob_decisions_project_status_updated_idx
  ON public.bob_decisions (owner_id, project_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.bob_tasks (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.bob_projects(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  source text NOT NULL DEFAULT 'manual',
  due_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT bob_tasks_title_length_check
    CHECK (char_length(title) BETWEEN 1 AND 300),
  CONSTRAINT bob_tasks_description_length_check
    CHECK (description IS NULL OR char_length(description) <= 6000),
  CONSTRAINT bob_tasks_status_check
    CHECK (status IN ('open', 'in_progress', 'blocked', 'done', 'cancelled')),
  CONSTRAINT bob_tasks_priority_check
    CHECK (priority IN ('low', 'normal', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS bob_tasks_project_status_priority_idx
  ON public.bob_tasks (owner_id, project_id, status, priority, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.bob_events (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  project_id uuid REFERENCES public.bob_projects(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  summary text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bob_events_event_type_length_check
    CHECK (char_length(event_type) BETWEEN 1 AND 100),
  CONSTRAINT bob_events_summary_length_check
    CHECK (char_length(summary) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS bob_events_project_created_idx
  ON public.bob_events (owner_id, project_id, created_at DESC);

-- Memory v0.1 deduplicated owner-wide. Shared Context needs the same memory
-- text to be valid in more than one project, so projectKey becomes part of
-- the active-memory identity while global memories continue using an empty key.
DROP INDEX IF EXISTS public.bob_memory_items_owner_content_unique;

CREATE UNIQUE INDEX IF NOT EXISTS bob_memory_items_owner_content_project_unique
  ON public.bob_memory_items (
    owner_id,
    lower(content),
    coalesce(metadata->>'projectKey', '')
  )
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS bob_memory_items_owner_project_key_idx
  ON public.bob_memory_items (owner_id, (metadata->>'projectKey'), updated_at DESC)
  WHERE deleted_at IS NULL AND metadata ? 'projectKey';

COMMENT ON TABLE public.bob_projects IS
  'Provider-independent Bob Core project registry used to assemble shared context.';

COMMENT ON TABLE public.bob_decisions IS
  'Structured project decisions that remain authoritative until superseded or revoked.';

COMMENT ON TABLE public.bob_tasks IS
  'Structured project work state shared across BobAI, Codex, ChatGPT, and later surfaces.';

COMMENT ON TABLE public.bob_events IS
  'Recent project activity and implementation events used for cross-surface continuity.';

COMMIT;
