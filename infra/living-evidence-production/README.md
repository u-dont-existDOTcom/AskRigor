# Production living-evidence repository runbook

Status: reviewed release candidate; activate only from an exact merged AskRigor
image with the base /opt/askrigor/compose.yaml.

## Fixed topology

The repository runs on the existing AskRigor VPS as a distinct pinned
PostgreSQL 17.6 service. It joins only the internal
living_evidence_private network and publishes no host port. The research MCP
keeps its existing public/default network and additionally joins that private
network. The unrelated annas-postgres-1 service is never used.

Both host and local bootstrap connections use SCRAM password authentication.
Local peer authentication is intentionally excluded because the digest-pinned
image runs as operating-system user `postgres` while the bootstrap database
role is the distinct `askrigor_migrator`; peer authentication would reject the
official entrypoint before it could create the database or reader role. The
container health check performs an authenticated `SELECT 1` against the exact
database rather than treating a socket that merely accepts connections as a
successful bootstrap.

Persistent database state is
/opt/askrigor/state/living-evidence-postgres, owned by UID/GID 70 and mode
0700. The database container runs as that non-root UID/GID with a read-only
root filesystem, all capabilities dropped, no-new-privileges, bounded CPU
and memory, and only its database bind plus two tmpfs paths writable.

Five independent random 32-byte hexadecimal passwords live only in:

- /opt/askrigor/secrets/living-evidence-migrator-password
- /opt/askrigor/secrets/living-evidence-reader-password
- /opt/askrigor/secrets/evidence-gap-intake-password
- /opt/askrigor/secrets/research-access-password
- /opt/askrigor/secrets/research-review-password

Both host files are root-owned, group 70, mode 0440 so the non-root PostgreSQL
process can read the Compose bind-mounted secrets without making them
world-readable. The evidence-gap role has `SELECT`, `INSERT`, and `UPDATE`
only on `living_evidence.evidence_gap_submissions`; it has no access to other
repository tables and no `DELETE`, `TRUNCATE`, schema-create, role-create, or
database-create privilege. The research-access role has only the account,
entitlement-read, pending-proposal insert/read, and bounded pending-withdrawal
permissions documented below, and executes two held YouTube findings functions
of migration 0019 (hold and purge) and the nine Atlas participation functions
of migration 0022 (a participant's own state, display name, votes, comments,
reports, ending their sessions everywhere, checking a session, and deleting
everything they hold). The research-review role can
execute only the three bounded owner-review functions (inspect, decide, and the
review context of migration 0012), the five Atlas review functions of migration
0017 (inspect cards, decide a card item, record an intent, inspect intents, and
forget cards), the six held YouTube findings functions of migration 0019 (hold,
two reads, two deletions and purge), the six publication functions of migration
0021 (inspect, publish, decide, edit, withdraw, and erase the texts of the
Atlas's publications) and the five moderation functions of migration 0022 (list
comments, moderate a comment, stop or restore a commenter, and set and read the
home page's picks), and has no direct table or sequence privileges. The
ordinary research service receives the reader, evidence-gap intake,
research-access, and research-review URLs through the existing
root-owned mode-0600 runtime.env. The one-shot admin profile receives only the migrator URL
through root-owned mode-0600 living-evidence-writer.env. Neither URL or
password may be printed, checked into Git, copied into a release receipt, or
placed in Compose.

## Reversible activation

1. Record the exact current research image ID/tag, healthy container ID, base
   Compose hash, public 27-tool inventory, protocol manifests, state-directory
   modes, and a rollback copy of the base Compose file.
2. Copy the exact reviewed overlay to
   /opt/askrigor/compose.living-evidence.yaml and the exact reviewed init
   and role-provisioning scripts to
   /opt/askrigor/living-evidence/init-reader.sh and
   /opt/askrigor/living-evidence/provision-evidence-gap-role.sh and
   /opt/askrigor/living-evidence/provision-research-access-role.sh and
   /opt/askrigor/living-evidence/provision-research-review-role.sh. Record hashes
   and use root ownership/mode 0600 for the overlay and 0555 for each script.
3. Create the state directory as UID/GID 70 mode 0700; create the five secret
   files atomically under a root umask from independent openssl random-byte
   calls without printing any value, then set root:70 ownership and mode 0440.
   The third is the evidence-gap intake password, the fourth is the
   research-access password, and the fifth is the research-review password.
4. Create the writer environment and append the four reader configuration
   names to runtime.env with an in-memory, non-echoing editor. The exact
   non-secret settings are schema living_evidence, SSL mode disable on the
   Docker-internal network, and reuse switch true.
5. Render the combined base plus overlay configuration and verify the image,
   no PostgreSQL published port, internal network, mounts, security controls,
   and secret-file references. Start only living-evidence-postgres and wait
   for its health check.
6. Run the exact merged image's one-shot admin entry point with migrate. Then
   run `/usr/local/bin/provision-evidence-gap-role` and
   `/usr/local/bin/provision-research-access-role` and
   `/usr/local/bin/provision-research-review-role` inside only the PostgreSQL
   service. Each reads mounted secrets, revokes repository-wide access, and
   grants only its documented tables and operations. The research-access role
   may select/insert/update `research_use_accounts`, select entitlements,
   select/insert pending proposals, and execute the bounded pending-withdrawal
   function and, from migration 0022, the nine Atlas participation functions.
   It cannot grant entitlements, review proposals, or write canonical
   evidence.
   Verify migration identity and query the catalog as the migrator to prove
   askrigor_reader has CONNECT, schema USAGE, and SELECT on every table/view
   except `held_youtube_findings` (migration 0019) and the notice rollback hold
   tables, which only the migrator reads,
   has no INSERT/UPDATE/DELETE/TRUNCATE privileges, and defaults to read-only
   transactions. Separately connect as `askrigor_evidence_gap_intake` and prove
   that it can select/insert/update the intake table but cannot delete from it,
   select another repository table, create a persistent or temporary object,
   or use another schema. Connect separately as `askrigor_research_access` and
   prove those exact allowlisted operations work while entitlement writes,
   proposal review-state updates, canonical-table writes, deletes, truncation,
   temporary objects, and schema creation fail.
   Connect separately as `askrigor_research_review` and prove that the exact
   inspect/decide/context functions work while direct proposal-table reads or updates,
   canonical-table reads or writes, temporary objects, and schema creation fail.
   Prove too that the five Atlas functions work while the Atlas tables, the
   `atlas_public_number_seq` sequence, `erase_atlas_wording`,
   `atlas_redaction_permits`, `atlas_question_erasable` and
   `atlas_numbers_without_labels` are refused.
7. Recreate only research-mcp with the combined Compose selection. Verify it
   remains non-root/read-only/capability-free, joins exactly its prior network
   plus the internal repository network, stays healthy, and does not emit
   connection strings or database errors.
8. Run a repository miss and normal fresh audit, then import one reviewed
   source-linked audit and run an exact hit plus one deliberately stale/mutated
   forced-fresh case. Record only identifiers, hashes, states, timings, image
   identities, and allowlisted reason codes.

## Public evidence-gap and Auth0 activation

The public form reuses this private PostgreSQL service; Railway is not needed.
Assemble `ASKRIGOR_EVIDENCE_GAP_DATABASE_URL` in the mode-0600 runtime.env with
the dedicated intake role and its Docker-internal hostname. Add a separately
generated 32-byte base64url narrative key, a non-secret key ID, and a separate
high-entropy internal review key. Never print or receipt their values.

The external authorization server is Auth0. Configure the production tenant
for the canonical resource `https://mcp.askrigor.com/mcp`, enable Resource
Parameter Compatibility, Include Issuer in Authorization Responses, and
offline access. Define `research:use` for every connected research user and
`cases:review` only for the owner reviewer. Use a regular confidential OAuth
application with only authorization-code and refresh-token grants, OpenAI's
exact callback URL, and per-application user-delegated grants for those scopes.
Enable the reviewed public account connection for ordinary research users;
keep every unrelated connection disabled. Supply the
static client ID and secret directly in ChatGPT's OAuth setup; never put the
secret in Git or the runtime environment. The runtime receives only the
non-secret Auth0 issuer, JWKS URL, resource URL, exact allowed client ID, and
stable owner-reviewer subject. It rejects a validly signed token from another
client. The exact owner subject is checked independently only for cross-user
case review; it is not a global research-user allowlist. This path avoids Auth0's Enterprise-only
`private_key_jwt` and role-management features.

Before enabling the switches, deploy the public privacy/terms bytes that name
the case store, OpenAI ChatGPT review, Auth0 reviewer authentication, current
retention, withdrawal behavior, redaction limitations, reciprocal free mode,
and paid-private alternative. The public evidence-gap form remains separate
and pseudonymous; connected research uses Auth0.

Provision a distinct 32-byte canonical base64url identity-HMAC secret and add
the following non-secret research-access configuration to `runtime.env` along
with the dedicated role URL: `ASKRIGOR_RESEARCH_ACCESS_ENABLED=true`, schema
`living_evidence`, Docker-internal SSL mode `disable`, and the same Auth0 OAuth
resource configuration. Never receipt the connection string or identity
secret. There is no checkout in this release; `PAID_PRIVATE` activates only
after a maintainer has separately recorded an active entitlement.

Add `ASKRIGOR_RESEARCH_REVIEW_ENABLED=true`, the dedicated review-role URL,
schema `living_evidence`, and Docker-internal SSL mode `disable` to the same
mode-0600 runtime environment. The review URL must use
`askrigor_research_review`, not the access role or migrator. It can call only
the hash-bound inspect/decide functions, the read-only review context
function, the five Atlas review functions and the six held YouTube findings
functions, and cannot read tables directly.

Owner answer 140b (2026-10-20): paid private accounts and dev accounts register
a plain answer before research, and their checked answers end with a note
comparing the two. Mark an account dev with `ASKRIGOR_DEV_ACCOUNT_KEYS` in the
same runtime environment: a comma-separated list of account references, the
12 hexadecimal characters AskRigor shows a signed-in user who asks for their
account reference, which are the first 12 of the account's `account_key` in
`research_use_accounts` (a full 64-character key also works; neither is a
secret; an entry that is neither is ignored). Migration
`0013_research_plain_answer_note` adds each account's note setting
(`plain_answer_note`, on by default); the access role's existing table grant
covers it. Apply it with the one-shot admin `migrate` before an image that
reads it serves, since the access store reads that column on every research
call. An earlier image does not read it, so a rollback needs no step.

Owner answer 143a (2026-10-21): a paid private account files a research map
only with the user's yes to the answer's offer. Migration
`0014_research_map_consent` adds `consent_receipt_sha256` to
`research_contribution_proposals` (the SHA-256 of the finalization receipt
whose offer the user accepted, never the receipt), a check that only a
`RESEARCH_FRONTIER` proposal carries one, a unique index so one yes files one
map, and a new body for the proposal account guard that admits an active paid
private account's map with its digest and nothing else from that account. The
access role's existing table grant covers the column. Apply it with the
one-shot admin `migrate` before the image that files such maps serves. An
earlier image never files a paid private proposal, and the guard still admits
free contributors as before, so a rollback needs no step.

Owner question 154 (2026-10-21): an account's connector lessons carry a
detailed report only when the user turned detailed lesson reports on. Migration
`0015_research_detailed_lesson_reports` adds each account's setting
(`detailed_lesson_reports`, off by default; never a report, which is stored only
in the private lessons repository); the access role's account-settings grant
covers it. Apply it with the one-shot admin `migrate` before an image that
reads it serves, since the access store reads that column on every research
call. An earlier image does not read it and accepts no detailed report, so a
rollback needs no step.

Owner answer 171, default 5: migration `0023_research_findings_save_switch` adds the account's `findings_save`
setting, on by default. Only a dev account may change it through `manage_research_access`. The access role's
column-level UPDATE grant covers this setting, the plain-answer note, detailed lesson reports, and the columns
used for enrollment and revocation; it cannot update the account key or creation time. Apply the migration and
reprovision the access role before serving the image that reads the setting. The regression harness turns saving
off before a run and on afterwards, recording both. An earlier image ignores the setting, so rollback to it
requires pausing regressions to avoid saving their cards again; the column and choice can remain in place.

Earlier notice v3 (owner answers 159, 1b and 7, and 160b, 2026-10-22): the free
contributor notice's third version, `free-contributor-v3-2026-10-22`, says that findings
the owner accepts may be published in the public Atlas and what deleting a
findings card removes and what stays. Migration `0016_research_use_notice_v3`
replaces the account table's notice check, under the name 0011 gave it
(`research_use_accounts_free_notice_check`), with one that admits v1, v2 and
v3; it adds no column or grant. Apply it with the one-shot admin `migrate`
before an image that offers v3 serves, since that image stores v3 rows.

An earlier image, such as build `71f09f63`, reads only v1 and v2 and fails the
access check of an account whose row carries v3, so an image rollback below v3
holds those rows first. `research-use-notice-v3-hold.sql` copies each v3
account row, unchanged, into `research_use_notice_v3_hold` and marks the
account revoked, a state the earlier image reads; the person leaves it by
accepting that image's notice, v2, or by activating an entitled paid private
account. `research-use-notice-v3-restore.sql`, run once an image that reads v3
serves again, puts back each account still exactly in the held state and
empties the table. An account the person changed meanwhile keeps its newer
row, and the v3 image asks a v2 account to accept v3 as usual. Both scripts are
idempotent, run as the migrator in the form of the v2 scripts (the exact
command is in `../../docs/superpowers/plans/2026-10-01-pr246-production-release.md`),
and change no other table: entitlements, proposals and Atlas rows stay as they
are. Only the hold table's owner, the migrator, can read it; the hold removes
every other grant, including the reader's default-privilege one.
`npm run contributor-access:notice-v3-rollback-acceptance` checks both against
real PostgreSQL in Docker. The rollback's order, with migration 0017, is at the
end of the Atlas section below. A rollback to an image that reads only v1 also
runs `research-use-notice-v2-hold.sql`, and later its restore; the two holds
move different rows, so their order does not matter.

Owner answer 171 (2026-10-25; approved, built, not yet released): the free
contributor notice's fourth version, `free-contributor-v4-2026-10-25`, says free
cards publish on save, written without the person and marked "Not checked by
supervisors yet" until review, with votes and comments by signed-in accounts.
Deleting a card removes it from the Atlas unless its findings were accepted;
an accepted finding stays while valid. Paid private findings still publish
only after acceptance. Migration `0020_research_use_notice_v4` admits v1 to v4
under the same `research_use_accounts_free_notice_check`, without new columns
or grants, and is safe to run again. Run the one-shot admin `migrate` before
an image offering v4 serves. Earlier accounts accept v4 before free research.

For an image rollback below v4:

1. Stop and disable `askrigor-research-promotion.timer`.
2. As the migrator, run `research-use-notice-v4-hold.sql` before swapping images.
   It copies v4 rows unchanged into `research_use_notice_v4_hold`, removes all
   non-owner grants and marks those accounts revoked. The person may accept
   the earlier image's notice or activate an entitled paid private account.
3. Restore the selector and runtime settings from this release's rollback
   folder, recreate only `research-mcp` with the earlier reviewed image and
   check its health.
4. Run the v4 hold once more to catch acceptance between the first hold and
   the image swap, then re-enable the timer against the restored image.

Undo no migration: 0020 stays and widens only the notice check. Settings,
entitlements, proposals and Atlas rows stay unchanged. For a target below v3,
also use the v3 pair above; for a target below v2 use the v2 pair. Each hold
moves only its own notice version. To serve v4 again, run this release's
`migrate`, swap to its image, then as the migrator run
`research-use-notice-v4-restore.sql` only after that image serves. It restores
only accounts still exactly in the held state, keeps newer account choices,
and empties the hold table; both scripts are idempotent. The table stores only
the account fields already held, and only the migrator can read it.
`npm run contributor-access:notice-v4-rollback-acceptance` checks the scripts
with real PostgreSQL in Docker, including v1, v2 and v3 accounts, changed
accounts, settings and every other table. It is not part of the hermetic gate.

Atlas phase 2 (owner answers 159 and 160b, 2026-10-22; design
`../../docs/superpowers/plans/2026-10-22-atlas-phase-2-design.md`): the owner
accepts findings from saved findings cards into this database. Migration
`0017_atlas_findings` adds:

- two private review tables, which the review role reaches only through its
  functions: `atlas_card_decisions` (the owner's decision on each card item,
  the only rows that name a card, deleted when the card is forgotten) and
  `atlas_finding_intents` (each decision's hash-bound intent, queued for the
  runner), with the `atlas_public_number_seq` sequence that numbers findings
  from `F-1001`;
- eight canonical tables with the `append_only_guard` trigger:
  `atlas_findings`, `atlas_finding_versions`, `atlas_finding_changes`,
  `atlas_finding_links`, `atlas_finding_link_withdrawals`,
  `atlas_source_checks`, `atlas_redactions` and `atlas_intent_applications`,
  and the `atlas_finding_current` view;
- five SECURITY DEFINER review functions, each revoked from PUBLIC:
  `inspect_atlas_cards`, `decide_atlas_card_item`,
  `record_atlas_finding_intent`, `inspect_atlas_finding_intents` and
  `forget_atlas_cards`;
- writer-only `erase_atlas_wording`, `atlas_redaction_permits`,
  `atlas_question_erasable` and `atlas_numbers_without_labels`, and a new body
  for `reject_living_evidence_mutation()` whose one exception lets
  `erase_atlas_wording` set to a fixed marker, under a redaction row, the
  wording that row covers (decision 7): its version's claim and Atlas texts,
  wording keys (to 64 zeros), numbers' text labels and change notes, the
  rationale of each link touching its finding and each such link's withdrawal
  note, and the finding's question only while no other finding or research
  frontier uses it. Every other column, row and table stays refused, and
  nothing is ever deleted.

Canonical Atlas rows never hold an ARF number, a thread key, a receipt hash, an
account, an answer quote, or YouTube or community data. The owner's call
records a decision and its intent; only the one-shot admin
`promote-accepted` writes canonical rows, after the contribution queue in the
same activation, and it applies an erasure the same way: the redaction rows,
then `erase_atlas_wording`, then the cleared texts of the finished intents that
name the finding, in one transaction. `forget_card` deletes a card's decision
rows through `forget_atlas_cards` and changes no canonical row.

The release, in this order:

1. Run the one-shot admin `migrate`, which applies 0017 (and 0016 if it has not
   run yet), before the new image serves.
2. Re-run `/usr/local/bin/provision-research-review-role` inside the PostgreSQL
   service, so the review role gets the five Atlas grants (the script grants
   exactly those, after the three contribution grants), and prove the role
   boundary as step 6 above says.
3. Bind `/opt/askrigor/living-evidence-image.env` to the deployed image, start
   `askrigor-research-promotion.service` by hand, and expect
   `no_pending_promotion` for both queues (the contribution line and the line
   with `"queue":"atlas_findings"`). Then verify the next timer trigger.
4. Check the 33-tool catalog; the owner refreshes each connector's tool list.

The owner's Atlas actions stay closed behind `ASKRIGOR_ATLAS_REVIEW=enabled`
until all of that is verified. For a rollback, an earlier image never selects
an Atlas intent, so pending intents stay `PENDING` and are neither lost nor
failed; delete no decision, intent or canonical row. A rollback restores
nothing decision 7 removed: erased wording stays erased, and a forgotten card's
decision rows and stripped issues stay gone.

An image rollback below this release, to build `71f09f63` or another image that
reads notice v1 and v2 and no Atlas table, goes in this order:

1. Stop and disable `askrigor-research-promotion.timer`.
2. Run `research-use-notice-v3-hold.sql` as the migrator (notice v3 above).
3. Restore the selector (`/opt/askrigor/living-evidence-image.env`) and
   `runtime.env` from the release's rollback folder, recreate only
   `research-mcp` with the earlier image, and check its health.
4. Run the hold once more. It changes nothing unless an account accepted v3
   between steps 2 and 3, and then it holds that account too.
5. Re-enable the timer against the restored image.

Undo no migration: 0016 and 0017 stay, with every Atlas row. 0016 only widens
the notice check, which the earlier image tolerates; the canonical Atlas tables
are append-only, the earlier image reads no Atlas table, and neither script
touches one. The earlier image needs no `migrate`. If its `migrate` runs, it
ignores the 0016 and 0017 rows in `schema_migrations` and puts back 0001's body
of `reject_living_evidence_mutation()`, without the Atlas erasure exception, so
every guarded row stays refused until this release's `migrate` runs again.

To serve this release again: run its `migrate` before its image serves,
recreate `research-mcp` with that image, then run
`research-use-notice-v3-restore.sql` as the migrator (never while the earlier
image serves), and then steps 2 to 4 of the release above.

Atlas phase 3 (design
`../../docs/superpowers/plans/2026-10-22-atlas-phase-3-design.md`) stores the
fields a findings card's research AI declares for the Atlas pages. Migration
`0018_atlas_card_fields` adds three nullable columns to
`atlas_finding_versions`: `kind`, `subject_type` and `search_scope` (the
searches that found nothing, each a database and its query), under the check
`atlas_finding_versions_card_fields_check` (the kind's and the subject type's
values, and one to ten searches only on a version of kind `nothing_found`). A
finding's subject goes to `claim_versions.program_or_exposure`, its direction to
`claim_versions.direction`, and its first version's kind gives
`claims.claim_type`. It adds the writer-only
`atlas_search_scope_without_queries` and new bodies for
`atlas_redaction_permits` and `erase_atlas_wording`, so decision 7's erasure
also sets each search's query to the fixed marker and keeps its database. It
adds no table, role, grant or sequence, changes no row, and leaves 0017's body of
`reject_living_evidence_mutation()` in force. A version written before it holds
NULL in the new columns and reads back without the fields.

Its release: run the one-shot admin `migrate`, which applies 0018, before the new
image serves; the review role needs no new grant. Then steps 3 and 4 of the
release above: the promotion service by hand, and the 33-tool catalog, where
`finalize_research`, `save_research_findings` and
`review_research_contribution` take new optional fields, so the owner refreshes
each connector's tool list.

An image rollback below phase 3, to the image that serves phases 1 and 2, goes
in this order:

1. Stop and disable `askrigor-research-promotion.timer`.
2. Run `askrigor-research-promotion.service` once by hand with the phase 3
   image, and expect `no_pending_promotion` for the Atlas queue. The earlier
   image cannot parse an intent with the new fields: it leaves it `PENDING`,
   and every later Atlas intent waits behind it until phase 3 serves again.
3. Keep the owner's Atlas actions closed while the earlier image serves:
   `ASKRIGOR_ATLAS_REVIEW` is not `enabled` in the `runtime.env` it gets. A
   decision it recorded on a finding accepted with phase 3 would write a
   version without the new fields, and an erasure it recorded would leave the
   subject and the searches' queries in the private intents.
4. Restore the selector and `runtime.env` from the release's rollback folder.
   The restored `runtime.env` is the one phases 1 and 2 served with, which
   opens the owner's Atlas actions, so remove its
   `ASKRIGOR_ATLAS_REVIEW=enabled` line before recreating `research-mcp`, as
   step 3 says. Then recreate only `research-mcp` with the earlier image, and
   check its health and that the Atlas actions answer `atlas_review_closed`.
5. Re-enable the timer against the restored image.

The earlier image's findings card is strict, so a `finalize_research` call from
an app whose tool list was refreshed for phase 3 sends the topic and the new
finding fields, which that image refuses: it answers `input_invalid` until the
model leaves them out. After the rollback, each user refreshes the app's tool
list again (today the owner, the only free contributor), so the app sends the
fields the earlier image takes.

Undo no migration: 0018 stays, with its columns and rows. The earlier image
names no new column, so the versions it writes hold NULL there. It needs no
`migrate`; if its `migrate` runs, it ignores 0018's row in `schema_migrations`
and puts back 0017's bodies of `atlas_redaction_permits` and
`erase_atlas_wording`, which leave the searches' queries in place, until phase
3's `migrate` runs again. To serve phase 3 again: run its `migrate` before its
image serves, recreate `research-mcp` with that image, have each user refresh
the app's tool list once more, and only then put the
`ASKRIGOR_ATLAS_REVIEW=enabled` line back and open the owner's Atlas actions.

Held YouTube findings (owner answer 173, 2026-10-25; YouTube Developer Policies,
section III.E.4, for Non-Authorized Data): the findings drawn from YouTube
comments that a saved findings card leaves out (owner answer 170) are kept in
this database for 30 days, apart from the card, for the owner's review, and then
deleted, with no refreshing; so are the findings of a card whose findings all
rest on YouTube comments, which is not saved as a card. Migration
`0019_held_youtube_findings` adds:

- the private table `held_youtube_findings`: for each held finding, the saved
  card's ARF issue number (none for a card not saved, which keeps instead the
  card's own general wording of the research question and its topic's key and
  label), the checked card's SHA-256 and the finding's place on that card,
  AskRigor's texts (the claim, whom it applies to, why the usual answer misses
  it, what would change it, and the subject when the card declared one), its
  certainty, kind and direction, its tags and verified bases, the save time and
  the expiry, which a check holds at exactly 720 hours later. A unique index keeps
  one row per finding of one save, with a card or without. No column holds a
  source, a link, the answer quote, a contributor or thread key, or any comment
  text, name, channel, comment or video ID. Each `migrate` removes every grant on
  it but the migrator's own, the reader's default-privilege SELECT included;
- six SECURITY DEFINER functions, each revoked from PUBLIC:
  `hold_youtube_findings` (a save's findings, with its card's number or its
  question and topic, never one already past its 30 days, and never refreshing
  one held before), `inspect_held_youtube_findings` (a card's findings whose 30
  days have not ended), `inspect_cardless_held_youtube_findings` (those with no
  card, newest first), `delete_held_youtube_findings` (a card's, early),
  `delete_cardless_held_youtube_findings` (a save's with no card, by its checked
  card's SHA-256, early) and `purge_expired_held_youtube_findings` (every row
  past its expiry by the database's clock; it takes no time from its caller, so
  no caller deletes a finding early through it).

The research server holds a saved card's left-out findings through the
research-access role, in the background: a failure never fails or delays the
save, and the findings are then not kept. It purges expired rows at start and
then every hour, from its own process, through both roles. The owner's review
tool reads, deletes early and moves findings through the review role, and
`forget_card` deletes a card's held findings with it. No read returns a row past
its expiry, purged yet or not. `npm run contributor-access:postgres-acceptance`
checks the table, the functions, the grants, holding, expiry and the purge
against real PostgreSQL in Docker.

Its release, in this order, before the new image serves:

1. Run the one-shot admin `migrate`, which applies 0019.
2. Inside the PostgreSQL service, re-run `/usr/local/bin/provision-research-access-role` and
   `/usr/local/bin/provision-research-review-role`: the access role gets
   `hold_youtube_findings` and `purge_expired_held_youtube_findings`, and the
   review role those two with `inspect_held_youtube_findings`,
   `inspect_cardless_held_youtube_findings`, `delete_held_youtube_findings` and
   `delete_cardless_held_youtube_findings`. Prove the boundary as step 6 above
   says: each role executes its functions, neither reads, writes or deletes the
   table directly, and the reader cannot read it.
3. Recreate only `research-mcp` with the new image, and check the 33-tool
   catalog: `review_research_contribution` takes three new actions
   (`list_youtube_findings`, `move_youtube_findings` and
   `delete_youtube_findings`) and one new field (`cards`), so the owner
   refreshes each connector's tool list.
4. The owner moves the findings drawn from YouTube comments of the cards stored
   before (ARF-0007, ARF-0012 and ARF-0209) with `move_youtube_findings`, and
   then deletes the earlier revisions GitHub keeps in each rewritten card's edit
   history, as the reply lists them.

An image that serves before step 2 holds nothing (its holds fail, and each card
is saved as before), and its owner's card view says the held findings cannot be
read.

An image rollback below this release recreates only `research-mcp` with the
earlier image, which stores cards without their findings drawn from YouTube
comments, as before, and never holds, reads or purges held findings. Undo no
migration. Since nothing purges them while it serves, delete the held rows as
the migrator, so none outlives its 30 days: `DELETE FROM
living_evidence.held_youtube_findings;` (or, for a rollback of a few days,
`SELECT living_evidence.purge_expired_held_youtube_findings();` once a day until
this release serves again). If the earlier image's `migrate` runs, it ignores
0019's row in `schema_migrations` and leaves the table and functions in place.

Decision 171, section 4B (plan
`../../docs/superpowers/plans/2026-10-25-171-atlas-publishing-votes-comments.md`)
publishes a free contributor's findings card in the Atlas as soon as it is
saved. Migration `0021_atlas_publications` adds one private table,
`atlas_publications` (one row per published finding: its public number P-1001
onward from the new sequence `atlas_publication_number_seq`, the card's issue
number and digest with the finding's place for moderation and idempotent
publishing, the published fields, and the state `unreviewed`, `accepted`,
`edited`, `rejected`, `withdrawn` or `held`), and six SECURITY DEFINER
functions for the review role: `inspect_atlas_publications`,
`publish_atlas_findings`, `decide_atlas_publications`,
`edit_atlas_publications`, `withdraw_atlas_publications` and
`erase_atlas_publication_texts`. The reader can select the table, as every
table; the pages read only its published fields. It touches no canonical table
and leaves the guard's body in force. The runtime publishes at a save, and the
owner's publication actions answer, only while `ASKRIGOR_ATLAS_REVIEW=enabled`
and the research-review URL are set.

Its release: run the one-shot admin `migrate`, which applies 0021 (after 0019,
the held YouTube findings, and 0020, notice version 4), before the new image
serves; then re-run
`/usr/local/bin/provision-research-review-role` inside the PostgreSQL container,
which grants the six functions; then the 33-tool catalog, where
`review_research_contribution` takes the new publication actions and fields, so
the owner refreshes each connector's tool list. Before anything is published,
the owner sets the test cards aside (`set_aside_cards` with `cardsFrom` ARF-0116
and `cardsTo` ARF-0239, sent again until no card waits).

An image rollback below 0021 needs no drain: the earlier image never reads the
table, publishes nothing at a save, and has no publication action. Undo no
migration: 0021 stays, with its rows, which the earlier image ignores; its grant
script leaves the six grants in place, harmlessly. To serve 0021 again, run its
`migrate` before its image serves.

Decision 171, section 4C (design
`../../docs/superpowers/plans/2026-10-25-171-pages-sign-in-design.md`, section
C) serves the public Atlas pages from `research-mcp`: `/atlas` (recently
published, recently checked and contested findings), `/atlas/topics/<topic
key>`, `/atlas/findings/P-<n>`, `/atlas/changes` and the stylesheet
`/atlas/atlas.css`; any other `/atlas` path answers 404. Every `/atlas` path
answers 404 unless `runtime.env` holds `ASKRIGOR_ATLAS_PAGES=enabled`. The pages
read through the SELECT-only reader (`ASKRIGOR_LIVING_EVIDENCE_REUSE_ENABLED=true`
with `ASKRIGOR_LIVING_EVIDENCE_READER_DATABASE_URL`), one read-only snapshot per
page, and select only a publication's public number, state, F number, published
fields and dates; switched on without the reader, they answer 503 and the MCP
server runs on. An unreviewed publication shows with the label "Not checked by
supervisors yet"; an accepted or edited one shows as its F number's latest
version, once the promotion timer has written it; held, rejected and withdrawn
ones never show. Every `/atlas` response carries `Content-Security-Policy:
default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self';
frame-ancestors 'none'; base-uri 'none'; object-src 'none'`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin` and `X-Frame-Options: DENY`, and none sets a
cookie. Rendered pages are cached in memory for 60 seconds (at most 256 pages
and 8 MiB) and dropped on every publication or review write the process makes;
each address may load 60 pages at once, then one a second (an IPv6 address is
counted by its /64).

The apex site's Caddy (`../../ops/public-site/Caddyfile.site`) proxies exactly
`askrigor.com/atlas` and the paths below it (`@atlas path /atlas /atlas/*`)
straight to the research server's container, keeping `Host: askrigor.com`, and
sets the pages' headers there in place of the site's (whose `form-action
'none'` would otherwise join their policy); the site's own headers skip those
paths. The block also sets `X-AskRigor-Client-IP` to the reader's address from
the connection (`{remote_host}`), replacing any value a client sent. The
research server believes that header only on a request whose Host is the public
origin's host (`ASKRIGOR_ATLAS_PUBLIC_ORIGIN`, `https://askrigor.com` by
default), which only this block sends, so a request that reaches
`mcp.askrigor.com` directly cannot choose its address; every other request is
counted by its connection's address. If a CDN is ever put in front of the apex,
use `{client_ip}` in the block instead, with the CDN's address ranges as
`trusted_proxies` in Caddy's global server options.

The installer needs the upstream: run it as
`ASKRIGOR_ATLAS_UPSTREAM=<host:port> install-public-site.sh ...`, with the
research server's container as the production Caddyfile already proxies to it
(for example `research-mcp:3000`). It refuses anything that is not a plain
host:port, a public name, or an upstream the production Caddyfile does not
already use, and puts the checked value in place of `{$ASKRIGOR_ATLAS_UPSTREAM}`
before Caddy validates the combined file. Read the production Caddyfile's
`mcp.askrigor.com` block (read-only) at release to confirm the value.

Its release needs no migration and no grant: the reader can already select
`atlas_publications` (0021 above). When the owner says so, add
`ASKRIGOR_ATLAS_PAGES=enabled` to `runtime.env`, recreate `research-mcp`, check
that `https://mcp.askrigor.com/atlas` answers 200 with the headers above, and
install the public-site packet with the upstream, after which
`https://askrigor.com/atlas` answers the same.

Rollback: remove the `ASKRIGOR_ATLAS_PAGES=enabled` line and recreate
`research-mcp`, and every `/atlas` path answers 404 again; the Caddy route can
stay (it passes those 404s on with the pages' headers), or reinstall the
previous public-site packet to drop it. The pages store nothing, so nothing
else is undone.

Decision 171, sections 4D and 4E (design
`../../docs/superpowers/plans/2026-10-25-171-pages-sign-in-design.md`, sections
D and E) add votes and comments to the finding pages, for people signed in with
the AskRigor login of the apps. Migration `0022_atlas_votes_comments`
(after 0021, the publications, and before 0023, the findings save switch) adds six
private tables: `atlas_participants` (a participant key derived from the account
key the connector derives, never an email address or OAuth subject; the
commenter tag the owner's review names them by; the display name chosen with
the first comment; whether the owner stopped them from commenting),
`atlas_votes` (one `agree` or `disagree` per participant and publication),
`atlas_comments` (C-1001 onward from `atlas_comment_number_seq`, the display
name at posting, a body of at most 2,000 characters, `shown` or `hidden`, a
report count), `atlas_comment_reports` (one per comment and reporter: a
participant key, or a hash of the address under a salt the server keeps in
memory for one day), `atlas_home_picks` (the owner's picks, up to five, with
their public reasons) and `atlas_session_ends` (when a participant signed out
everywhere or deleted everything, by a hash of their key, kept 30 days so every
earlier session is refused). It adds nine SECURITY DEFINER functions for the
research-access role (`inspect_atlas_participant`, `set_atlas_display_name`,
`set_atlas_vote`, `post_atlas_comment`, `delete_atlas_comment`,
`report_atlas_comment`, `end_atlas_sessions`, `atlas_session_current` and
`forget_atlas_participant`) and five for the review
role (`inspect_atlas_comments`, `moderate_atlas_comment`,
`set_atlas_commenter_stopped`, `set_atlas_home_picks` and
`inspect_atlas_home_picks`); neither role gets a table or the sequence. The
reader can select the tables, as every table, and the pages select only vote
totals, shown comments, the signed-in reader's own state and the picks. It
touches no canonical table and no publication.

All of it is off unless `runtime.env` holds `ASKRIGOR_ATLAS_PARTICIPATION=enabled`
with every part: `ASKRIGOR_ATLAS_AUTH0_CLIENT_ID` and
`ASKRIGOR_ATLAS_AUTH0_CLIENT_SECRET`; `ASKRIGOR_ATLAS_SESSION_KEY_BASE64URL`
and `ASKRIGOR_ATLAS_PARTICIPANT_SECRET_BASE64URL`, each 32 random bytes in
canonical base64url, different from each other and from the identity secret;
the research-access URL and `ASKRIGOR_RESEARCH_IDENTITY_SECRET_BASE64URL`; and
the connector's `ASKRIGOR_OAUTH_ISSUER_URL` and `ASKRIGOR_OAUTH_JWKS_URL`.
`ASKRIGOR_ATLAS_PUBLIC_ORIGIN` defaults to `https://askrigor.com`. Without any
part, the pages show no form and no sign-in link and the sign-in and form routes
answer 404, so the release can go out before the Auth0 application exists.

The owner's step: in the tenant the connector uses, create a Regular Web
Application for the Atlas with the same connections as the apps' login, allowed
callback URL `https://askrigor.com/atlas/auth/callback`, allowed logout URL
`https://askrigor.com/atlas`, the authorization code grant, client-secret
authentication at the token endpoint and RS256 ID tokens; its client ID and
secret go into `runtime.env` with an in-memory, non-echoing editor, never into
chat, Git or a receipt. Make the session key and the participant secret as the
identity secret above: two independent 32-byte random values in canonical
unpadded base64url, never printed. Changing the session
key signs everyone out; changing the participant secret detaches everyone from
their votes and comments, so it is kept.

Its release: run the one-shot admin `migrate`, which applies 0022, before the
new image serves; then re-run `/usr/local/bin/provision-research-access-role`
and `/usr/local/bin/provision-research-review-role` inside the PostgreSQL
container, which grant the nine and the five functions; then the 33-tool
catalog, where `review_research_contribution` takes the comment actions and
`set_picks`, so the owner refreshes each connector's tool list. With
participation on, check that a finding page shows the vote totals and the
sign-in link, that `/atlas/auth/login` redirects to the tenant's `/authorize`
with `scope=openid`, `code_challenge_method=S256` and the callback above, and,
signed in, that a vote, a comment and its deletion round-trip. A reader who
reports a comment without signing in is counted by the address the apex block
forwards (an IPv6 address by its /64); a public-site packet from before this
change proxied with `Host: mcp.askrigor.com` and no forwarded address, so every
such reader would share one address hash: install the current packet before
relying on anonymous reports.

Rollback: remove the `ASKRIGOR_ATLAS_PARTICIPATION=enabled` line and recreate
`research-mcp`; the forms, the sign-in link and the routes go, and the pages
show no votes or comments, while the rows stay in the database unread. An image
rollback below 0022 needs no drain: the earlier image never reads the tables.
Undo no migration: 0022 stays, with its rows; the earlier image's grant scripts
leave the twelve grants in place, harmlessly. Nothing in a rollback deletes a
vote or a comment.

When OAuth research access is active, the server omits legacy research Action
routes so they cannot bypass the mode choice. The separately governed lesson
Action is unaffected. Verify all 27 MCP operations: the mode, proposal, and
owner-review operations are declared non-destructive writes, the other 24 are
read-only, ordinary research requires `research:use`, and cross-user case and
proposal review additionally require the owner subject plus `cases:review`.

Every later Compose command must use both the base and living-evidence overlay;
otherwise the database remains running but the research container loses its
private-network attachment after recreation.

## Curated import

The living-evidence admin import-study-audit command accepts one strict JSON
object on stdin containing the ephemeral exact document index, its already
validated audit receipt, audit timestamps, and a current freshness receipt. It
loads the canonical protocol manifests itself, reruns the existing validator,
rejects prohibited persistent keys, and contributes only the source-free
structured audit. Raw article blocks are never written to the repository or
emitted in the admin receipt.

Use the Compose admin profile and stream the object directly over stdin. Do not
create an import file on the VPS, log stdin, or keep a shell history entry that
contains source text or a database URL. A failed import emits only a bounded
error code. Automatic public-run canonical write-through is not part of this
release; the free-contributor path can create only a pending proposal.

The separate `import-frontier` command accepts one strict, de-identified formal
research-frontier contribution. It verifies the exact current HRP and Universal
manifests, rejects raw/provider/private/community keys, and writes one hashed
append-only transaction. Its formal source classes cannot represent YouTube,
comments, replies, channels, users, or person profiles. Requested and confirmed
date windows remain separate, and gapped deltas require an open coverage-gap
trail. Every lane keeps one temporal coverage basis. A candidate can link to an
audited source family only when the source classes are compatible and the two
records share an exact formal identifier. Stream the JSON object over stdin
using the same one-shot admin profile; do not create a VPS import file or log
the payload.

After the owner accepts an exact proposal, invoke `promote-accepted` through
the one-shot admin profile. Each invocation promotes at most one pending
intent and emits only a bounded receipt; an intent whose canonical write
conflicts deterministically ends `FAILED` with its fixed code on the way, and
the invocation tries the next one. The initial owner-review release used
manual repetition until `no_pending_promotion`. The separately reviewed
promotion-scheduler slice installs a hardened five-minute systemd timer that
invokes this exact command without arguments or a shell; its activation and
rollback contract is in
`../../docs/research-contribution-promotion-scheduler.md`. A failed process
after the canonical writer commit leaves the intent pending, and the next
invocation completes it through the writer's idempotent replay path.
The same invocation then promotes the oldest pending Atlas intent (Atlas phase
2), strictly first in, first out: one SERIALIZABLE transaction holds the writer
lock and the intent's row lock, writes the canonical rows and records the
intent's receipt or fixed failure code together, so an Atlas pass is atomic.
The exact production installation, safe first-attempt recovery, manual run, and
real timer-triggered acceptance are preserved in
`../../docs/audits/2026-09-01-promotion-scheduler-production-release.md` and its
machine JSON.

## Failure and rollback

- Reader timeout, database unavailability, corrupt record, stale freshness,
  unfinished impact propagation, or compatibility mismatch returns the normal
  fresh_study_audit_required boundary. It never blocks a new audit.
- Disable ASKRIGOR_LIVING_EVIDENCE_REUSE_ENABLED, restore the prior research
  image/base Compose selection, and recreate only research-mcp for immediate
  product rollback. Repository rows are retained.
- Disable `ASKRIGOR_EVIDENCE_GAP_INTAKE_ENABLED` and `ASKRIGOR_OAUTH_ENABLED`
  and recreate only research-mcp to remove the form and protected review tool
  from the active runtime without deleting participant rows. Revoke the Auth0
  client grant separately if authorization must be disabled immediately.
- To roll back reciprocal research access, restore the prior reviewed image and
  runtime configuration, then recreate only research-mcp. Merely disabling the
  research-access store while OAuth remains enabled intentionally fails
  research closed; it does not restore anonymous access. Retain account and
  proposal rows for explicit review/deletion rather than deleting them during
  code rollback.
- An image rollback below a free contributor notice that accounts have
  accepted holds that notice's account rows first and restores them once the
  newer image serves again: `research-use-notice-v4-hold.sql` and
  `research-use-notice-v4-restore.sql` in the v4 order above, plus the v3 pair
  for a target reading only v1 and v2, and the v2 pair for one reading only v1.
- Stop the database only after the research service no longer selects the
  overlay. Do not delete its state, secrets, or logical exports as part of a
  code rollback.
- This first production phase adds no automatic off-host backup. Treat host
  loss as a declared durability limitation until a reviewed encrypted backup,
  restore, retention, and deletion design is activated.
