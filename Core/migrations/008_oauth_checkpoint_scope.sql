-- Add checkpoint consent support after the unchanged 007_project_oauth.sql.
-- This changes the permitted scope vocabulary, not existing grants or tokens.
-- Apply only through the separately approved migration path; no auth activation.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

DO $migration$
DECLARE
  grants_oid oid;
  scopes_attribute smallint;
  baseline_constraint oid;
  baseline_expression text;
BEGIN
  grants_oid := to_regclass('public.bob_oauth_project_grants');
  IF grants_oid IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid = grants_oid AND relkind = 'r'
  ) THEN
    RAISE EXCEPTION 'Expected OAuth grants table is unavailable; migration stopped.';
  END IF;

  LOCK TABLE public.bob_oauth_project_grants IN ACCESS EXCLUSIVE MODE;

  SELECT attnum INTO scopes_attribute
  FROM pg_catalog.pg_attribute
  WHERE attrelid = grants_oid AND attname = 'scopes'
    AND atttypid = 'text[]'::regtype AND attnotnull AND NOT attisdropped;
  IF scopes_attribute IS NULL THEN
    RAISE EXCEPTION 'Expected OAuth scopes column is unavailable; migration stopped.';
  END IF;

  SELECT oid, pg_catalog.pg_get_expr(conbin, conrelid, false)
    INTO baseline_constraint, baseline_expression
  FROM pg_catalog.pg_constraint
  WHERE conrelid = grants_oid
    AND conname = 'bob_oauth_project_grants_scopes_check'
    AND contype = 'c' AND convalidated
    AND conkey = ARRAY[scopes_attribute]::smallint[];

  -- Fail on unknown schema drift rather than dropping an unreviewed rule.
  -- PostgreSQL's canonical deparse includes parentheses and text casts.
  IF baseline_constraint IS NULL OR
    pg_catalog.regexp_replace(baseline_expression, '[[:space:]]', '', 'g') <>
    '(scopes<@ARRAY[''offline_access''::text,''mcp:context:read''::text,''mcp:sync''::text,''mcp:event:write''::text,''mcp:task:write''::text,''mcp:decision:propose''::text])'
  THEN
    RAISE EXCEPTION 'OAuth scope constraint differs from migration 007; migration stopped.';
  END IF;

  ALTER TABLE public.bob_oauth_project_grants
    ADD CONSTRAINT bob_oauth_project_grants_scopes_checkpoint_check
    CHECK (scopes <@ ARRAY[
      'offline_access', 'mcp:context:read', 'mcp:sync', 'mcp:event:write',
      'mcp:task:write', 'mcp:decision:propose', 'handoffs:write'
    ]::text[]);
  ALTER TABLE public.bob_oauth_project_grants
    DROP CONSTRAINT bob_oauth_project_grants_scopes_check;
END
$migration$;

COMMIT;
