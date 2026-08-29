-- Compensating teardown for the disposable pilot only.
-- The caller must replace __SCHEMA__ with an exact validated pilot schema and
-- must export and verify the repository before executing this statement.
DROP SCHEMA __SCHEMA__ CASCADE;
