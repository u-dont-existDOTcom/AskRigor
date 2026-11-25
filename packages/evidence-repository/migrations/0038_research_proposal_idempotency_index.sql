SET search_path TO __SCHEMA__, public;

-- The research-access role's lookup of an account's own proposal by its idempotency key
-- (PostgresResearchContributorAccessStore.findOwnProposalByIdempotencyKey), which every server-built analysis runs
-- before it is filed, compares payload_json ->> 'idempotencyKey' with no index for it: each lookup reads and
-- decompresses the payload of every proposal of the account, or of the whole table, so its cost grows with the
-- proposals kept. On 16 November 2026 nine such lookups, made together for one passing final check, were all cancelled
-- by the role's five-second statement timeout, and the nine analyses were not filed. This index answers the lookup from
-- a few pages: the account, the kind and the key, for the statuses the lookup reads.
--
-- An index only: no table, row, constraint or grant changes, and the query is unchanged. Every key fits (each proposal
-- kind's idempotencyKey is at most 200 characters). Built as every migration runs, in migrate()'s one transaction, so
-- not CONCURRENTLY: the build holds a SHARE lock on the table, which migrate() already holds more strongly (0009's and
-- 0012's DROP TRIGGER take ACCESS EXCLUSIVE), while it reads every proposal once. Safe to run again, and an earlier
-- image's migrate leaves it in place, where its own lookups use it too.
CREATE INDEX IF NOT EXISTS research_contribution_proposals_idempotency_idx
  ON research_contribution_proposals (account_key, proposal_kind, (payload_json ->> 'idempotencyKey'))
  WHERE status IN ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED');
