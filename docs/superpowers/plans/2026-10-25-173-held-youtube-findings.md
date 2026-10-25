# Decision 173: findings drawn from YouTube comments, held 30 days and then deleted

Status: built on the release branch `claude/release-167-youtube-30-days-20261025` (from `5fd63a02`, the build owner
question 167 names), not yet released. Owner answer to question 173 (25 Oct 2026): keep the findings drawn from
YouTube comments for the 30 days YouTube's Developer Policies permit (section III.E.4, Non-Authorized Data), then delete
them; no refreshing, and nothing lost meanwhile. Commit `d4c53b05` (owner answer 170) already leaves those findings out
of every stored card.

## What is built

1. **Held findings, apart from the card.** When a saved card leaves findings out (`withoutYouTubeData`), each is held
   in `held_youtube_findings` (migration `0019_held_youtube_findings`), never in the GitHub card: the claim,
   certainty, applies_to, why_not_usual, what_would_change_it, kind, subject and direction when declared, and its tags
   and verified bases. Never its sources, a link (a link keeps its words), the answer quote, the contributor or thread
   key, or any comment text, name, channel, comment or video ID: the table has no column for them, and the function
   refuses any other key. Each row has the card's ARF issue number, the checked card's SHA-256, the finding's place on
   that card (from 1), the save time and an expiry exactly 720 hours later (a check holds it). The same findings saved
   again keep their first expiry.
2. **A card whose findings all rest on YouTube comments.** It is still not saved as a card (no GitHub issue;
   `youtube_findings_only`), but its findings are held the same way with no card number, keyed by the checked card's
   SHA-256 and their place, together with the card's own general wording of the research question and its topic's key
   and label (AskRigor's text, through the same link stripping; the email and the privacy page say the summary is kept
   "with the answer's research question"). A check holds that a saved card's rows carry no question or topic and a
   card-less row carries its question and a whole topic or none; a unique index on (card number or 0, SHA-256, place)
   keeps one row per finding of one save. The save's result says "Not saved as a card: its findings all rest on YouTube
   comments, which AskRigor keeps only for its owner's review and deletes after 30 days." (and finalize_research the
   same words in its sentence form), no longer that AskRigor stores nothing until YouTube confirms it may.
3. **Deletion on day 30.** `purge_expired_held_youtube_findings()` deletes expired rows by the database's clock, with a
   card or without; the research server runs it at start and then every hour from its own process
   (`startHeldYouTubeFindingsPurge`, from `index.ts`). Every read (`inspect_held_youtube_findings`,
   `inspect_cardless_held_youtube_findings`) leaves out expired rows. The owner deletes a card's early or a card-less
   save's (`delete_youtube_findings` with `card` or `cardSha256`), and `forget_card` deletes a card's with the card.
4. **The owner sees them.** `inspect_finding` on a card lists `card.heldYoutubeFindings` with the day each is deleted;
   `list_youtube_findings` lists those with no card (`heldWithoutCard`), newest first, each save with its question,
   topic and deletion day, at most the newest 500 findings. They are never items of a card, so no decision takes one,
   and nothing publishes, accepts or offers them. The connector stays at 33 tools: three actions and one field
   (`cards`) on `review_research_contribution`.
5. **Cards stored before.** `move_youtube_findings` (cards such as `["ARF-0007", "ARF-0012", "ARF-0209"]`) holds
   their findings drawn from YouTube comments from each save's own time, deletes one past 30 days, and rewrites the
   card body and each later save exactly as a save today would write it (`storedCardWithoutYouTubeFindings`, the same
   `withoutYouTubeData`, signed bases kept, the checked card's SHA-256, stamp and marker unchanged); a later save left
   with no finding is deleted. It holds before it rewrites, so a failure is finished by calling again. It changes
   nothing on a stored card whose findings all rest on YouTube comments, or where a decision names a finding the move
   would remove or renumber (decisions name findings by place). The reply lists the GitHub edit histories for the
   owner to clear.
6. **Database access.** Six SECURITY DEFINER functions, each revoked from PUBLIC; no role gets the table, and each
   migrate removes every grant on it but the migrator's (the reader's default-privilege SELECT included). The
   research-access role (save path) executes `hold_youtube_findings` and the purge; the review role executes those two,
   `inspect_held_youtube_findings`, `inspect_cardless_held_youtube_findings`, `delete_held_youtube_findings` and
   `delete_cardless_held_youtube_findings`.

## How the save reaches the database

`FindingsSaveService` (findings/service.ts) gets the research-access role's `PostgresHeldYouTubeFindingsStore`
(findings/held-youtube-findings.ts, from `ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL`). After the GitHub queue returns the
card's issue number, or at once for a card not saved as a card, the hold starts in the background: the save's result
never waits for it, so a store that fails, throws or never answers neither fails nor delays the save (the free
contributor's 10-second deadline waits for the save alone), and the findings are then simply not kept. The pool's
connection, query and statement timeouts are 5 seconds.

## Checks

- `tests/held-youtube-findings.test.ts`: the store's semantics with an injected clock (with a card and without), what
  is kept and never kept, the save path (failing, throwing and hanging stores; a card not saved as a card), the purge
  schedule, the owner's actions and their access checks (the card view, the card-less list, both early deletions), the
  move (byte-for-byte card body, a finding past 30 days, later saves, decisions, failures), and the user's words.
- `tests/living-evidence-production-deployment.test.ts`: the migration's columns, checks, unique index, functions,
  expiry check, revokes and the exact grants of both provisioning scripts.
- `scripts/research-contributor-access-postgres-acceptance.mts` (`verifyHeldYouTubeFindings`, Docker): the grants as
  each role logs in, insert, no refreshing, a finding past 30 days, refused keys and card shapes, expired rows unread
  before the purge, the purge, both early deletions, card-less rows apart from a card's, and a second migrate.

## Left to the owner

The privacy page's paragraph (question 175) is in the page, awaiting approval with the release; the effective date is
unchanged. After the release: `move_youtube_findings` for ARF-0007, ARF-0012 and ARF-0209, then the GitHub edit
histories. A save with no card has no `ARF-####` id for a deletion request to name, so its held findings go on the
owner's word or at day 30. `forget_card` deletes the held findings of the person's own cards; those of the person's
later saves on other people's cards are left to their 30 days (their comment, which alone ties them to the person, is
deleted).
