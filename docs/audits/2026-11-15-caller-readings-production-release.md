# Production release, 2026-11-15 (a call can leave the final check's AI readings to the app that sends it)

- **Owner decision:** owner answer 310a. Question 310 (15 Nov 2026, corrected at 02:12 UTC): the owner's runner
  researches on the owner's Claude plan and can make the final check's three AI readings there, but the check needs
  the answer's text, and on a dev account every call that carries the text pays for AskRigor's review (about USD
  0.11). Option a: "build it and release it when its checks pass", and "`310a` covers the build and its release".
  The owner chose a in the Inbox on 15 Nov at 12:27 UTC, replied there at 12:30 UTC ("this should be for all
  accounts"), and typed "310a inbox" in chat at 12:36 UTC, in the session that released. Not a pure-fix release: it
  adds a mark an app may send.
- **Contents:** #469, four commits on `main` at `f7fcce16` (the live build):
  - `cb50d973`: the change. A `finalize_research` call marked `later_inputs.ai_readings` `"caller"` gets every rule
    check and no AI reading from the server, on any account: no review of the draft, no second reading, no meaning
    judge. The result says who made the readings (`ai_readings`: `by` `caller`, and `declared`, the count of what
    the call declared for the rule checks), a pass's `second_reading` is `skipped` with reason `left_to_caller`, its
    check line ends "Its rule checks ran on AskRigor's server; the app that ran this research made the check's AI
    readings.", and the finalization receipt signs `ar` `caller`. While `CALLER_READINGS_SAVE_CARDS` is false (the
    owner's question 311) such a call saves no findings card by any route, and its receipt signs `fs` `off` as a
    test run's does. Any other value leaves the readings to the server, with a note.
  - `c4d661fa`: a plan, `docs/superpowers/plans/2026-11-15-deep-research-and-atlas-needs.md`. Nothing of it is built
    by this release beyond the mark.
  - `46e44d02`: every result of a marked call carries `ai_readings`, also a call that could not be read and one on a
    server that cannot verify receipts. Found by trying the release probe against the build before the merge.
  - `aee433e6`: what the independent review found (below).

  The tool list is unchanged (35 tools): the input is a later input and the output fields are runtime only. No
  migration, role script, compose, privacy-notice or settings change: `runtime.env` changes its build line only.
  The site was not released.
- **Before deploying:**
  - `npm run verify`, Node 24.18.0, on `aee433e6`'s tree: the typecheck, 6,847 tests passed and 7 skipped, and the
    build. Hosted checks on `aee433e6`: all seven passed (read at 13:50:31 UTC). The private-map check on the merged
    range (four commits against 40 maps) found nothing to refuse.
  - Review: an independent reviewer (a fresh Claude agent given the diff, the stated intent and six questions, with
    no conclusions of the author's), 16 minutes, 76 tool uses, with its own temporary tests. No route saves a marked
    call's card (the automatic save, kept copies, a paid account's offer and map, `save_research_findings`), and
    none treats an unmarked call as marked (case, whitespace, lists, objects, inherited keys, text that is JSON
    twice over). Marked and unmarked calls agree on status, steps, limits, rounds, carried state and a pass after a
    pass. What it found was fixed before the merge, each with a test (`aee433e6`): a mark at the top level of the
    call was accepted and not read, so a dev account would have paid for the review it meant to leave out, untold
    (the mark is now read where `findings_save` is read); a marked call was asked for a findings card in a note
    saying its research is saved, and a paid account's result said a save follows the user's yes (neither is said
    now); a mark read from `later_inputs` given as text had no note. Three tests asserted less than their names said
    and are stronger now. It did not run the whole suite or the typecheck; the verify above did, on the fixed tree.
    Greptile: no review ran and none was asked for (the owner's credit rule of 13 Nov). Codex: not asked.
  - `npm run lessons:status` at 13:14:57 UTC: open 50; needs review 13; accepted but not incorporated 1;
    incorporated or closed 41; deletion eligible 2; no lane item unrecorded. The issue lists were read at 13:15 UTC:
    one bug report newer than AskRigor#464, AskRigor#467 (advance permission for the menu in the first message; not
    in this release), and no lesson candidate newer than AskRigor-lessons#68.
- **Source:** #469 merged at 13:50:42 UTC as `bc9a997f4855734da32bf13038d0c55c66bdd525`, whose tree equals the pull
  request head's (`aee433e6`); `main` had not moved since #466, and other agents' #443, #460, #463 and #468 were
  still open. Source archive `askrigor-bc9a997f4855734da32bf13038d0c55c66bdd525.tar.gz`, SHA-256
  `13891f62f378c9e77271cc009c50ae4cc10cd282cd57a2a9cedfb71e6690086e`.
- **Image:** built from that archive at 13:50:54 to 13:51:53 UTC; id
  `sha256:f71987cb3480d7b55e112f44a541843c78c3d62b1446f9967caf92d70bd26c23`, user `node`, workdir `/app`; the
  candidate started, answered `/healthz` and `/version` and was removed; image archive 122,434,831 bytes, SHA-256
  `b111bc1b420d4e7fd07e44a27600fb3ebab5c7d6271bf1092e5dfb6dc7ba7abe`.
- **Prior state (stage A):** (13:53:35 UTC) research-mcp on `f7fcce16`, healthy; the promotion timer enabled; the
  compose overlay and the two role scripts on the host are reviewed versions; `runtime.env` 90 names, the planner's
  six lines, no judge line and no second-reader line; 62 GB free. Read at 13:54:06 UTC, before stage B: the
  planner's and the review's state files had changed within the minute (15 Nov: USD 0.75 and USD 0.87, one account);
  the call record held 6,026 rows, 43 of them in the last 30 minutes and the newest 32 seconds old, all on the
  ChatGPT route: research was in progress, so stage B waited (it recreates the service and would break a call in
  flight). Six more reads between 13:54 and 14:01 UTC showed a call every minute or so. The read at 14:13:12 UTC
  showed none for 500 seconds, the newest a `finalize_research` at 14:04:52 UTC, and stage B started.
- **Stage B:** (14:13:32 to 14:14:16 UTC) the role scripts and the overlay on the host equal reviewed versions; the
  merged service's mounts are as expected; the image archive verified and loaded (the id above); the forum reader's
  self-test passed; the timer stopped; a dump of 18,051,417 bytes (SHA-256 `52e724b0bdecc569`...); migrate complete
  with nothing new to apply (0018 to 0035 recorded, each with its file's hash); both role scripts run from the
  release's bytes, the same files as before (36 and 15 functions); the boundaries from the catalog as at #466's
  release; learn mode's table: the reader cannot read it and PUBLIC cannot read it; it held six rows and one account
  had learn mode on. The prior image tagged `askrigor-research:rollback-pre-bc9a997f4855` and the prior files kept
  under `/opt/askrigor/rollbacks/pre-bc9a997f4855734da32bf13038d0c55c66bdd525` (both read back on the host at
  14:16:34 UTC: the tag names the image of `f7fcce16`, and the kept selector and `runtime.env` name that build);
  `runtime.env` 90 names, the build line changed and nothing else; the overlay installed again with the same bytes;
  research-mcp recreated and started at **14:14:07 UTC**, healthy; the planner, from the service's own settings:
  enabled, USD 3 a day, 20 new plans a day for an account; the review: enabled, USD 3 a day, 20 reviews a day for an
  account; the planner's state read back: 15 Nov, USD 0.75 spent, one account counted.
- **Stage C:** (14:14:33 to 14:15:10 UTC) `/version` names build `bc9a997f`, HRP 20.6.41 and Universal 20.5.46; the
  live `/mcp` lists 35 tools and equals the frozen fixture; the three tool-list versions equal their fixtures; the
  in-image probes passed. Two new lines show the mark in the deployed image: a marked call passed
  (`ready_with_limits`) with `ai_readings` by caller, `second_reading` skipped as left to the caller, the check line
  naming the app, and the note; a call with another value passed with no `ai_readings`, the note that it was not
  read as caller, and the ordinary check line. The log differs from #466's in hashes, dates and times, the order the
  writable mounts are listed in, those two lines, and one figure: the forum reader's thread probe read 124 of the
  thread's 195 comments (15 at #466's release; `state=read` each time).
- **Promotion:** the one-shot service found nothing pending; the timer was enabled again at 14:15 UTC.
- **The site:** not released. **Plugin:** receipt unchanged (0 of the 8 packaged files changed; the two installed
  copies equal the merge's; read at 14:16:30 UTC).
- **Connector probe (Codex's AskRigor app, the owner's account), read-only:** (14:16:31 to 14:16:58 UTC) 35 tools,
  build `bc9a997f`, HRP 20.6.41 and Universal 20.5.46 by their manifests, no out-of-date sentence. Two manifest
  calls, AskRigor's tools only. Nothing was registered, planned or checked, so the probe made no paid call.
- **The mark on the live server (this session's Claude connector, the owner's account, a dev account):** at 14:15:44
  UTC `get_protocol_manifest` named build `bc9a997f` with no out-of-date sentence. At 14:16:01 UTC one
  `finalize_research` call with an answer draft, no receipts, `later_inputs.ai_readings` `caller` and
  `findings_save` `off` passed in 0.9 seconds (`ready_with_limits`): `ai_readings` by caller with the eight declared
  counts, `second_reading` skipped as `left_to_caller`, the check line ending "Its rule checks ran on AskRigor's
  server; the app that ran this research made the check's AI readings.", the note, and a finalization receipt whose
  claims show `ar=caller` and `fs=off`. The review's state file, read on the host at 14:15:43 UTC and again at
  14:16:14 UTC, held USD 0.9814 and nine reviews both times, and the call record shows no other call between the two
  reads. The same account's unmarked check at 14:04:52 UTC, from ChatGPT on the earlier build, took 24.4 seconds and
  was the ninth review. Read in the running service at 14:15:43 UTC: the review and the planner are on, and the
  second reader and the meaning judge have no setting, so of the check's three AI readings only the review runs in
  production today.
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-bc9a997f4855` (the image of `f7fcce16`),
  restore `runtime.env` from `/opt/askrigor/rollbacks/pre-bc9a997f4855734da32bf13038d0c55c66bdd525` and recreate
  research-mcp. Nothing else changed on the host. An earlier build does not know `ai_readings`: it refuses the
  unknown later input and names the ones it takes, so no reading is skipped silently.
- **Not in this release:** saving a card from such a check (question 311); the runner's own use of the mark (its
  side, on the owner's laptop, and each real run on the owner's go); checking that an app made the readings it says
  it made, which the server cannot see; AskRigor#467; the video-links build (the owner's 307b), which is built and
  uncommitted on the owner's laptop and has to merge this release's changes when it is taken up.
