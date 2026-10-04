-- LOCAL DISPOSABLE FIXTURE ONLY: destructive rollback deletes immutable report history.
-- Hosted rollback must preserve records and disable the mount/authority instead.
DROP SCHEMA bob_private_checks CASCADE;
