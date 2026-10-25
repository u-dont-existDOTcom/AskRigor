# Decision 173: findings drawn from YouTube comments, held for the owner's review until deleted

Status: built on the release branch `claude/release-167-youtube-30-days-20261025` (from `5fd63a02`, the build owner
question 167 names), merged into the build branch, not yet released. Commit `d4c53b05` (owner answer 170) already
leaves those findings out of every stored card.

The owner's decisions, 25 Oct 2026:

- Answer to question 173: keep the findings drawn from YouTube comments, apart from the card, for the owner's review;
  no refreshing, and nothing lost meanwhile. As first built, they were deleted 30 days after their save.
- The owner then changed the rule, word for word: "don't delete the summaries unless YT tells us to do that". So the
  held findings are kept until they are deleted: on request, by the owner, when their card is forgotten, or because
  YouTube asks. There is no 30-day deletion, no expiry and no purge.

## What is built

1. **Held findings, apart from the card.** When a saved card leaves findings out (`withoutYouTubeData`), each is held
   in `held_youtube_findings` (migration `0019_held_youtube_findings`), never in the GitHub card: the claim,
   certainty, applies_to, why_not_usual, what_would_change_it, kind, subject and direction when declared, and its tags
   and verified bases. Never its sources, a link (a link keeps its words), the answer quote, the contributor or thread
   key, or any comment text, name, channel, comment or video ID: the table has no column for them, and the function
   refuses any other key. Each row has the card's ARF issue number, the checked card's SHA-256, the finding's place on
   that card (from 1) and the save time, to the millisecond; no expiry. The same findings saved again keep their first
   save time.
2. **A card whose findings all rest on YouTube comments.** It is still not saved as a card (no GitHub issue;
   `youtube_findings_only`), but its findings are held the same way with no card number, keyed by the checked card's
   SHA-256 and their place, together with the card's own general wording of the research question and its topic's key
   and label (AskRigor's text, through the same link stripping; the privacy page says the summary is kept "with the
   answer's research question"). A check holds that a saved card's rows carry no question or topic and a card-less row
   carries its question and a whole topic or none; a unique index on (card number or 0, SHA-256, place) keeps one row
   per finding of one save. The save's result says "Not saved as a card: its findings all rest on YouTube comments,
   which AskRigor keeps only for its owner's review." (and finalize_research the same words in its sentence form:
   "not saved as a card: its findings all rest on YouTube comments, which AskRigor keeps only for its owner's review"),
   no longer that AskRigor stores nothing until YouTube confirms it may.
3. **Kept until deleted.** Every read returns every held row. The owner deletes a card's or a card-less save's
   (`delete_youtube_findings` with `card` or `cardSha256`); `forget_card` deletes a card's with the card; and
   `delete_all_youtube_findings` deletes every held finding at once, of every card and every save with no card, for
   the day YouTube asks. It answers `needs_confirmation` and deletes nothing unless the call says `confirm: true`,
   which the model sends only after the owner said to. The research server runs no purge.
4. **The owner sees them.** `inspect_finding` on a card lists `card.heldYoutubeFindings` with the day each was saved;
   `list_youtube_findings` lists those with no card (`heldWithoutCard`), newest first, each save with its question,
   topic and save day, 25 saves a page: its `nextCursor`, sent back as `cursor`, shows the next page, so every held
   finding can be seen. They are never items of a card, so no decision takes one, and nothing publishes, accepts or
   offers them. The connector stays at 33 tools: four actions and one field (`cards`) on
   `review_research_contribution`, whose `cursor` also serves `list_youtube_findings`.
5. **Cards stored before.** `move_youtube_findings` (cards such as `["ARF-0007", "ARF-0012", "ARF-0209"]`) holds every
   one of their findings drawn from YouTube comments, each with its own save's time, and rewrites the card body and
   each later save exactly as a save today would write it (`storedCardWithoutYouTubeFindings`, the same
   `withoutYouTubeData`, signed bases kept, the checked card's SHA-256, stamp and marker unchanged); a later save left
   with no finding is deleted. It holds before it rewrites, and rewrites nothing unless the store reports each finding
   held, so a failure is finished by calling again. It changes nothing on a stored card whose findings all rest on
   YouTube comments, or where a decision names a finding the move would remove or renumber (decisions name findings by
   place). It also changes nothing if the card has any publication, including withdrawn ones, unless that
   publication's card was forgotten; publications also name findings by place. The reply lists the GitHub edit
   histories for the owner to clear.
6. **Database access.** Six SECURITY DEFINER functions, each revoked from PUBLIC; no role gets the table, and each
   migrate removes every grant on it but the migrator's (the reader's default-privilege SELECT included). The
   research-access role (save path) executes `hold_youtube_findings` alone; the review role executes it,
   `inspect_held_youtube_findings`, `inspect_cardless_held_youtube_findings` (a page of saves after a given save),
   `delete_held_youtube_findings`, `delete_cardless_held_youtube_findings` and `delete_all_held_youtube_findings`.

## How the save reaches the database

`FindingsSaveService` (findings/service.ts) gets the research-access role's `PostgresHeldYouTubeFindingsStore`
(findings/held-youtube-findings.ts, from `ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL`). After the GitHub queue returns the
card's issue number, or at once for a card not saved as a card, the hold starts in the background: the save's result
never waits for it, so a store that fails, throws or never answers neither fails nor delays the save (the free
contributor's 10-second deadline waits for the save alone), and the findings are then simply not kept. The pool's
connection, query and statement timeouts are 5 seconds.

## Checks

- `tests/held-youtube-findings.test.ts`: the store's semantics with an injected clock (with a card and without, no
  expiry however old the save, paging that never splits a save and returns every one, deleting them all), what is
  kept and never kept, the save path (failing, throwing and hanging stores; a card not saved as a card), that the
  server module runs no purge, the owner's actions and their access checks (the card view, the card-less list and its
  pages, both deletions, deleting them all only with `confirm: true`), the move (byte-for-byte card body, a save of
  any age, a store that does not hold every finding, later saves, decisions, failures), and the user's words.
- `tests/living-evidence-production-deployment.test.ts`: the migration's columns (no expiry), checks, indexes,
  functions, revokes and the exact grants of both provisioning scripts.
- `scripts/research-contributor-access-postgres-acceptance.mts` (`verifyHeldYouTubeFindings`, Docker): the grants as
  each role logs in, insert, no refreshing, a save of any age, refused keys and card shapes, every row read with no
  expiry, paging, both deletions, deleting them all (review role only), card-less rows apart from a card's, and a
  second migrate.

## Left to the owner

The privacy page's paragraph is the owner's wording of 25 Oct; the effective date is unchanged. After the release:
`move_youtube_findings` for ARF-0007, ARF-0012 and ARF-0209, then the GitHub edit histories. A save with no card has no
`ARF-####` id for a deletion request to name, so its held findings go on the owner's word. `forget_card` deletes the
held findings of the person's own cards; those of the person's later saves on other people's cards stay, held under
that card, until they are deleted (their comment, which alone tied them to the person, is deleted). With no 30-day
deletion they no longer go by age: the owner deletes them with that card's held findings, or all at once.
