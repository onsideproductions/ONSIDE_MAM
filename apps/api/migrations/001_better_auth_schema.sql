-- One-time migration to align the schema with better-auth.
-- Safe to run on a fresh DB or one that already has the legacy `users` table.
-- Idempotent: re-running is a no-op.

BEGIN;

-- 1. Drop old FK constraints that reference the legacy `users` table.
--    They'll be re-created at the end pointing to the new `user` table.
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_created_by_users_id_fk;
ALTER TABLE collections DROP CONSTRAINT IF EXISTS collections_created_by_users_id_fk;
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_users_id_fk;
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_created_by_users_id_fk;

-- 2. Drop the legacy `users` table (no real users yet, just schema).
DROP TABLE IF EXISTS users;

-- 3. Drizzle's db:push will create the new `user`, `session`, `account`,
--    `verification` tables and re-add FKs pointing to `user.id`.

COMMIT;
