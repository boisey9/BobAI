CREATE TABLE IF NOT EXISTS public.bob_memory_items (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  scope text NOT NULL,
  subject text,
  content text NOT NULL,
  source text NOT NULL DEFAULT 'user_explicit',
  sensitivity text NOT NULL DEFAULT 'normal',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  search_document tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(subject, '') || ' ' || content)
  ) STORED,
  CONSTRAINT bob_memory_items_scope_check
    CHECK (scope IN ('personal', 'project', 'preference', 'fact')),
  CONSTRAINT bob_memory_items_sensitivity_check
    CHECK (sensitivity IN ('normal', 'sensitive')),
  CONSTRAINT bob_memory_items_content_length_check
    CHECK (char_length(content) BETWEEN 1 AND 2000),
  CONSTRAINT bob_memory_items_subject_length_check
    CHECK (subject IS NULL OR char_length(subject) BETWEEN 1 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS bob_memory_items_owner_content_unique
  ON public.bob_memory_items (owner_id, lower(content))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS bob_memory_items_search_idx
  ON public.bob_memory_items USING gin (search_document)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS bob_memory_items_owner_scope_created_idx
  ON public.bob_memory_items (owner_id, scope, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.bob_memory_events (
  id uuid PRIMARY KEY,
  memory_id uuid REFERENCES public.bob_memory_items(id) ON DELETE SET NULL,
  owner_id text NOT NULL,
  action text NOT NULL,
  request_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bob_memory_events_action_check
    CHECK (action IN ('created', 'updated', 'forgotten', 'restored'))
);

CREATE INDEX IF NOT EXISTS bob_memory_events_owner_created_idx
  ON public.bob_memory_events (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bob_memory_events_memory_created_idx
  ON public.bob_memory_events (memory_id, created_at DESC);

COMMENT ON TABLE public.bob_memory_items IS
  'User-approved, provider-independent Bob Core memories.';

COMMENT ON TABLE public.bob_memory_events IS
  'Audit trail for Bob Core memory mutations without storing secrets or chat transcripts.';
