# The build after #394

Branch `claude/next-build-20261102` (draft PR #398), from main's merge of #394 (`b9e658e2`, live since 11:52 UTC on 2
Nov, owner answers 215a and 217b). Built under owner rule 148a; a release needs the owner's explicit yes. Main was
taken in again on 3 Nov at `b2014dee` (#404, #406 and #407) and `c9d98611` (#410, owner answer 234a).

## Built

Before the regression run was judged:

1. **#394's release record** (`8a2f2db4`).
2. **The panel lists the checked answer's figures** (owner answer 220a, `f22fba50`).
3. **The meaning judge** on a dev account's passing check (owner answer 221: `f9f095c2` records it, `f787d323` builds it).
4. **Findings say whether they draw on YouTube comments** (owner answer 219b, `5ef44cf7`).
5. **The review-first declaration** (224a, #400), reverted when the owner dropped 224a's category holds (`f3cf3db7`).
6. **The judgment of the regression run on #394's build** (`docs/audits/2026-11-03-owner-regressions-394-judgment.md`,
   `b08bdc19`). Everything below comes from it.

From the judgment, one commit each:

1. **The forum reader's threads count as key sources** (`bf84410e`). The sources check refused threads that
   `read_forum_thread` had read, although their verified `forum_thread_read` receipts were passed (`r376-forum-500`,
   `r376-later-phase`). It now accepts that receipt, matched by the thread's comparable link, and asks a thread for no
   DOI, full text or lead. The note that asks for a study to be added to `key_sources` (`n389-forum-depth`, recurring
   from #393) now names only sources the sources check would accept there, and asks for the others to be looked up
   first. The published `key_sources` description waits for the next tool list (`e99ef051`,
   `docs/tool-list-changes-waiting.md`).
2. **Reddit searches ask for a page of 25 and say whether more exist** (`82e3f9c1`). 138 of 148 searches had returned
   exactly 7 threads, with no next page, because the client sent no page size. The result now says whether more pages
   exist, the page was all there is, or it can't tell. The search receipt signs it when known, and the forum note calls
   the threads found a page count, not a total, unless every search's page was its last.
3. **Busy reads say when to try again** (`899e6545`). In `q128-oral-liver`, seven parallel reads came back busy together.
   A call now ends within 50 seconds, its wait included, and waits at most 10 seconds for its turn. A call that can't
   start answers busy with a retry hint, which reaches the AI with the request to read threads one after another.
4. **A paper without a DOI is fetched by PMID or PMCID** (`ed58213f`). The check still said the full-text tool requires
   a DOI (`n389-forum-depth`), and its `NO_DOI` limit blamed a missing DOI for a paper never tried (`o355-scoped-list`).
   Such a paper now gets the step a DOI paper gets: try `acquire_open_full_text` with its PMID and any PMCID, before
   citing it as a lead. Its lead receipt then gives the real reason it stayed unread.
5. **The forum note counts the reader's receipts** (`5e6b61c1`). `l49-b-label` declared 3 of the 9 threads the reader
   read. Each thread now counts once, by its comparable link, whether declared or shown read by a verified receipt.
6. **A community read here gets a limit for its unread pages** (`cd34aa61`). "Reports there are not included" was given
   for communities the answer used (`q120-sleep-inside-outside`'s second turn, `q135-low-stakes`), because the check
   wrote each entry's boundary limit without looking at the community's reads. With a verified read there, the limit
   now says some pages stopped and only their reports are left out.
7. **The plain-answer note** (`1a265971`):
   - an unbacked "corrected" item now reads "This research did not check that.", as unbacked "confirmed" and
     "qualified" items do (`l32-negative-controls`). The published description of a first-turn correction's sources
     waits for the next tool list;
   - registering a plain answer no longer says "registered before research", which the server can't know
     (`q136-weak-lead-given`). The `after_research` reason says to pass the plain answer registered first. The check
     already compares that one when both receipts are passed for the same target. One registered under another
     wording of the target can't be kept: the receipt binds the target's digest, and whether two wordings name one
     question is a judgment of meaning;
   - no stray full stop after a quote that ends its sentence inside bold markers.
8. **The meaning judge's daily cap defaults to USD 3** (`064c9a82`), as owner question 221 put it ("a hard cap of $3 a
   day") and the owner approved. It had defaulted to 10. `docs/final-check.md`, the privacy data map and the development
   measurement's cost line now say 3.
9. **Full-text calls return in time** (`09ce6491`). 15 `acquire_open_full_text` calls ran past the app's limit while
   InfoAccess answered busy, and the AI lost each whole result. The library route now ends 40 seconds after the call
   starts. A route that runs out is recorded as an owner-library failure (`failure_kind` timeout), with a retry
   receipt.

After the web-app trial (3 Nov):

10. **A signed-out reader says so** (`b5f4d756`). From the morning of 3 Nov the reader host answered `LOGIN_REQUIRED`
    to every thread read, while searches still worked. Its own Reddit sign-in had lapsed. AskRigor passed it on as
    `unavailable`, so the AI kept trying (six reads in one trial run) and couldn't say why. The host's code now maps
    to `not_available`, and the result says the reader stays signed out until AskRigor's operator signs it in again:
    don't call it again in this research, leave Reddit to the AI's own search, and say why in the answer.
11. **Every failure the reader host names, named** (owner answer 230a, `dac56359`). The host's browser reader has more
    codes than the three AskRigor knew, and every other one came back as `unavailable`, so the AI and a run's logs
    couldn't tell a lapsed sign-in from a moment's error. On 2 Nov, from 19:19 to 23:55 UTC, reads and searches failed
    within 1.5 seconds for one to six minutes at a time and then worked again, and nothing records what the host
    said. The host's codes now map by a table taken from its source:
    - `HUMAN_CHECK_REQUIRED` and `BROWSER_UNAVAILABLE` join `LOGIN_REQUIRED` as `not_available`, each with its own
      note, since only AskRigor's operator can clear them;
    - `BROWSER_BUSY` (another client holds the host's one browser) is `busy`, with a retry hint;
    - `ACCESS_DENIED` (Reddit's network-security block) is `blocked`, and the reader stops for that research, since
      sites that refuse stay refused;
    - `NOT_PUBLIC` (a private community) is `blocked`, and that community is left out;
    - any other code stays `unavailable`, and its note names it ("The Reddit reader's host answered ...").

    Only the code's name passes on, never the host's message. The tool list is unchanged.
12. **Comments read outside an audit count for the findings hold** (owner answer 219b, `3fbd1446`). Comments read only
    through `get_youtube_comments` or `search_youtube_comments` gave no receipt, so a finding that rested on them and
    declared nothing was published. Each tool now signs `youtube_comments_read` when comments came back: the video and
    how many records, never their text. The final check reads it for the card alone: it asks for the declaration,
    holds a finding with none, and lets the meaning judge run. It is no audit, so community evidence is checked as
    before. The tool list is unchanged: the receipt rides in the runtime output schema, as `get_youtube_video`'s does.
13. **Dependabot alert 34** (`cb8ea85a`, Dependabot's #408): `@hono/node-server` 2.1.0 to 2.1.6 in the lockfile. The MCP
    SDK brings it in, and AskRigor doesn't use the affected `serveStatic`. `npm audit --omit=dev` finds nothing.

## The numbers chosen

- **Reddit's page, 25** (fix 2):
  - Reddit's own default page; its maximum is 100. The host's own default gave 7.
  - So a search is a fuller page without asking Reddit for more than one.
  - 25 titles leave the AI a choice without filling its context.
  - The receipt already signed up to 25 thread digests.
- **The reader's waits** (fix 3):
  - A call ends within 50 seconds, its wait included. The strictest client limit the repository records is Claude's
    60 seconds for a tool (`2026-09-26-instruction-optimization.md`). Before, a call could wait 45 seconds for its
    turn and then read for 45 more.
  - A call waits at most 10 seconds for its turn. Waiting adds no load on Reddit.
  - The retry hint is 10 seconds for each call still ahead, from 5 to 120. A 34-comment thread was read in 7 seconds
    on 1 Nov.
  - Concurrency stays one request at a time (owner answer 213b). A second request at once would add load on Reddit,
    which already answered `unavailable` in bursts while runs overlapped.
- **The library route's deadline, 40 seconds from the call's start** (fix 9):
  - The repository's other MCP work keeps within 40 seconds of the same 60-second limit: the scout's polling, the
    video reader and the comment audits.
  - The 20 seconds left cover the PDF's extraction, the result and its transfer.
  - No request is sent with less than 10 seconds of the deadline left, since one given up at once would only lengthen
    InfoAccess's queue.
  - The busy wait stays at most 45 seconds, inside the deadline, and the retrieval at most 120.
- **The meaning judge's cap, USD 3 a day** (fix 8): about 100 checks a day at about USD 0.03 each.

## Left out, and why

- **The de-identification screen** refuses copper(I)'s "I" and a question that names no one. A word pattern decides a
  question of meaning there, and the fix needs a design, not another pattern.
- **Follow-up turns losing the plain-answer note** (`after_research`, `no_receipt`). Fix 7's work found no exact fix.
  A follow-up turn's plain answer is written after the earlier turn's research, whose receipts it passes. Whether it
  draws on that research is a judgment of meaning, so the check withholds the note by design. A receipt left out is
  the AI's omission, which the reason already explains.
- **"but not its figures" when the figures are shown** (`r382-aim-unknown`, recurring). Its condition is exact: a figure
  the claim writes (171 cm) is not among the figures the checked draft shows (the same height as 1.71 m). Reading the two
  as one quantity in other units is a judgment of meaning, so nothing is changed. The meaning judge's comparison job is
  where such a mismatch can be read.
- **Meaning questions the meaning judge's notes cover:** the absence-claim backing, the harm-screen misfire on made-up
  figures, the emergency note before triage, and the unblinded-test limit on symptom diaries.
- **Forum-only findings cards:** whether such findings belong on the Atlas is the owner's decision.
- **YouTube's "Internal error" answers and the video the reader can't read:** investigated separately.
- **Limits of the fixes above:**
  - A thread's receipt does not sign whether it was read to its end. So `read_depth` `full_text_read` still needs a
    paper's receipt, and a thread is declared `partial_text`.
  - The reader's `unavailable` bursts get no hint. Their cause is not known: Reddit's throttling is likely but not
    shown.
  - Fix 9 bounds the library route only. The earlier routes keep their own limits (20 seconds a request, up to five
    Unpaywall PDFs), so a call whose earlier routes are slow can still run long; the library route then sends
    nothing.
  - The judge's cap is checked before each call and charged after it, so calls running at once can pass it by their own
    cost (about USD 0.03 each). The development measurement script is held to the same cap per process.
  - Fix 12 needs the AI to pass the receipt: one left out gets no hold on a finding that declares nothing.
- **Waiting for the next tool list** (`docs/tool-list-changes-waiting.md`): the `key_sources` description and the
  description of a first-turn correction's sources.

## Release steps, waiting for the owner's yes

1. `npm run lessons:status`, the full gate on the final head, and CI's checks on PR #398.
2. Mark #398 ready and merge it at its checked head.
3. Build the image and run its no-secret gate. The tool list is unchanged (35 tools, the frozen fixtures), so the apps
   need no refresh. HRP stays 20.6.36 and Universal 20.5.46. Migration 0024 (#410) is the one migration, and the Atlas
   pages change with it. There is no plugin file.
4. Switch production as for #394:
   - record the prior state;
   - load the image and stop the promotion timer;
   - dump the schema, migrate (0024) and run the role scripts, since the review role gains the two functions of #410;
   - recreate `research-mcp`.

   The meaning judge stays off unless the owner switches it on for the dev accounts, by mounting its key file
   read-only and adding its settings to `runtime.env`.
5. Acceptance:
   - `/version`, and 35 tools equal to the fixtures;
   - the reader (`READER_OK`, which reads a thread, so it fails while the reader host is signed out of Reddit: the
     owner signs it in first), the full-text probe and the blocking probe;
   - the promotion one-shot and the timer.

   Then the plugin receipt, a connector probe in each app, and the release record with its rollback.
6. Keep the 74 cards and the 41 findings for AskRigor's research, as "After release" in
   `2026-11-03-atlas-kept-for-research.md` says (owner answers 229a, 231a and 233a), and check that they still answer
   the Atlas lookup and leave the lists.
7. On the new build, rerun:
   - the two runs OpenAI's capacity stopped (`r382-other-aims-metabolic`, and `r377-continue`'s second turn);
   - `r332-agar-yields` and `s359-t5-aerobic`, once InfoAccess answers again.

   Then the owner's regression list, judged against #394's run.
