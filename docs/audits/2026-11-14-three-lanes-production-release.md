# Production release, 2026-11-14 (three lanes for AskRigor's own plan; the plan asks less; the review's fifth point; two dependency updates; the planner's daily cap)

- **Owner decision:** the three lanes are owner answer 302, options a and b together: written in the owner's Inbox on
  14 Nov 2026 at 02:18 UTC ("could we do a combo of a and b, so if it's really for sure a light lookup askrigor
  wouldn't help with, go for a, otherwise if askrigor may help but it's still light, go with b?") and typed in chat,
  in the session that released, at 02:19 UTC ("yes 302a but also b?"). The planner's and the review's wording fixes
  answer three reports of 13 and 14 Nov (AskRigor#456, #457, #458) under the owner's standing permission of 12 Nov
  2026 for releases that carry no tradeoff; one effect was told to the owner before the release: the orange peel
  test question is asked in three API runs of five (in every run seen before), which #456 asks for ("A plan able to
  cover major readings in a short first pass should ordinarily proceed"). The dependency updates are owner answer
  276a (7 Nov 2026: updates whose checks pass). The planner's daily cap was announced to the owner on 13 Nov.
- **Contents:** #453, after #450's merge:
  - `9a5afc27`: the release record of #450.
  - `b2ce36be`, `cad77273` (merged in as `d4d9b0d2`, `e43ab06d`): `jose` 6.2.15 to 6.2.17 (#455) and
    `@anthropic-ai/sdk` 1.4.0 to 1.8.0 (#454), both with their own checks passed.
  - `1169377b` and `0ec93508`: the lanes (`research-planner.ts` rubric 2026-11-14.1 and `lane` in its reply; `aside` handed over by
    `register_plain_answer` with no menu and the fixed first sentence; `light` as a menu with `lane`, `LIGHT_LOOKUP`
    as `plan_research`'s go-ahead, and no review of the draft at the final check, found by the plan's words or by
    the research target for an hour in process memory); the rubric's rules on what to ask (#456, #457); the review's
    rubric 2026-11-14.1 with its fifth point (#458).

  The tool list is unchanged (35 tools). No migration, role script, compose, privacy-notice or site change.
  `runtime.env` changes one line: `ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD` from 1.5 to 3 (the planner's own ceiling
  under owner answer 298b while the meaning judge is off; with the review's USD 3 it is USD 6 of the USD 7 a day of
  owner answer 301a).
- **Before deploying:**
  - `npm run lessons:status` at 03:10:41 UTC: open 50; needs review 13; accepted but not incorporated 1; incorporated
    or closed 41; deletion eligible 1 (four new candidates of 13 Nov, AskRigor-lessons#65 to #68, not handled here).
  - `npm run verify`, Node 24.18.0, on the commit's tree: the typecheck, 6,663 tests passed and 6 skipped (366
    files), and the build. A second commit before the merge, `0ec93508`, makes AskRigor step aside only when the planning call had the person's own words (one line of code and one test): on its tree 6,664 passed and 6 skipped. Hosted checks on `0ec93508`: Deterministic verification, workflow-policy, CodeQL and its four analyses, all passed. The private-map check found nothing to refuse.
  - Review: Codex, read-only, on the uncommitted change (the kit's `codex-review-453.md`). No defect in how a
    reply's lane is read, in the step-aside registration and its result schemas, in what a caller-supplied `lane`
    can reach, in the final check's wiring or in what is kept. Fixed before the commit: a target's lane could
    outlive its plan (a plan registered again from the cache got a fresh hour); an older, slower registration could
    replace a newer one's lane; a light menu whose task the person gave no time still said to open the source; and
    a light plan's registration promised a review that is not made. Greptile: no review ran and none was asked for
    (the owner's credit rule of 13 Nov).
  - Plan workers (free): 62 runs over four wordings; all 8 look-ups in the intended lane in every run, every
    research question in research. The API, from the laptop, before the commit: 24 planning calls and 2 review
    calls, USD 1.51; two flaws that showed only there were fixed in the wording (a task that answers the question
    marked as detail; a question about where a quoted figure comes from). The record is in
    `docs/superpowers/plans/2026-11-09-research-steering.md`.
- **Source:** #453 merged at 03:30:29 UTC as `cf89e911dec241a549b265158e476f213b5eb5f9`, whose tree equals the pull request head's (`0ec93508`).
  Source archive `askrigor-cf89e911dec241a549b265158e476f213b5eb5f9.tar.gz`, SHA-256 `252ee5f0d2c1f5f8e61dee78498896e01bd5d050826b8d0ced99dbae2ae962f1`.
- **Image:** built from that archive at 03:30:37 to 03:31:02 UTC (the layers were in the laptop's cache from a build of the same tree made while the hosted checks ran); id
  `sha256:9fd863bd389cc4dcaae8be276db3447ecffb1b45a7866fb56435bcdb9c8052a1`, user `node`, workdir `/app`; the candidate
  started, answered `/healthz` and `/version` and was removed; image archive 122,350,186 bytes, SHA-256
  `30141b9c079fd9070e5b734e6e7dc0167a8e676baa6f4ef75d7cc39543a78d3b`.
- **Prior state (stage A):** (03:32:17 UTC) research-mcp on `5a6a6e78`, healthy; the promotion timer enabled; the compose
  overlay on the host is the reviewed one (`15d3cc3a`...); `runtime.env` 90 names, the planner's six lines, no judge line; the
  planner's state folder 0700 1000:1000; 62 GB free. Before stage B the planner's and the review's state files had last
  changed 78 and 76 minutes earlier (14 Nov: USD 0.42 for six plans and USD 0.22 for two reviews, one account), so no
  planned research was in progress.
- **Stage B:** (03:32:42 to 03:33:46 UTC) the role scripts on the host equal reviewed versions, and the overlay is the
  reviewed one, unchanged; the merged service's mounts are as expected; the image archive verified and loaded (the id
  above); the forum reader's self-test passed; the timer stopped; a dump of 18,006,685 bytes (SHA-256
  `9ce7993caa7a4616`...); migrate complete with no new migration; both role scripts run from the release's bytes (36 and
  15 functions, the boundaries as before); the prior image tagged `askrigor-research:rollback-pre-cf89e911dec2` and the
  prior files kept under `/opt/askrigor/rollbacks/pre-cf89e911dec241a549b265158e476f213b5eb5f9` (both read back on the
  host after the release: the tag names the image of `5a6a6e78`, and the kept `runtime.env` has the earlier build line
  and the cap of 1.5); `runtime.env` 90 names: the build line changed and the planner's cap line now 3; the planner's
  state file kept as it was; the overlay installed again with the same bytes; research-mcp recreated and started at
  **03:33:37 UTC**, healthy; the planner, from the service's own settings: enabled, USD 3 a day, 20 new plans a day for
  an account; the review: enabled, USD 3 a day, 20 reviews a day for an account; the planner's state read back: 14 Nov,
  USD 0.42 spent, one account counted.
- **Stage C:** (03:33:46 to 03:34:39 UTC) `/version` names build `cf89e911`, HRP 20.6.41 and Universal 20.5.46; the live
  `/mcp` lists 35 tools and equals the frozen fixture; the three tool-list versions equal their fixtures; the in-image
  probes passed. The log differs from #450's only in hashes, dates, times and the order of the writable mounts in one
  line.
- **Promotion:** the one-shot service found nothing pending; the timer was enabled again at 03:34:39 UTC.
- **The site:** not released (no site file changed). **Plugin:** receipt unchanged (0 of the 8 packaged files changed; the two installed copies equal
  the merge's).
- **Connector probe (Codex's AskRigor app, a dev account), with two real plans and one real review:** (03:35:34 to 03:36:35 UTC) 35 tools, build
  `cf89e911`, HRP 20.6.41, no out-of-date sentence; `inspect` asks for `later_inputs.asked`.
  - **Step aside:** "what does MADRS stand for?" registered in 12.3 seconds: `research_plan.lane` `aside`, two
    searches, no `planned_later_inputs`, the receipt present, and the first text as written ("... So AskRigor steps
    aside: make no AskRigor research call for it, and do not call plan_research or finalize_research. ... Start the
    answer with this sentence, in the person's language: "AskRigor says this question doesn't need AskRigor's
    research. Here is the regular AI's answer:" ...").
  - **Light:** the PITCH question ("How often did diarrhoea happen in the PITCH trial of paracetamol plus ibuprofen
    for fever in children? I'm looking at Hay et al. 2008 in the BMJ, DOI 10.1136/bmj.a1302.") registered in 12.6
    seconds: lane `light`, no question, one task of kind `full_text` ("Find how many children in each group
    (paracetamol, ibuprofen, both) had diarrhoea, by opening the Hay 2008 BMJ paper and quoting its adverse-effects
    table row"), the menu's `lane` `light`. `plan_research`: `go_on`, lane `light`, no `say_reading_first`, no sentence
    asking for a people's-reports task, and `next_step` the light go-ahead word for word. Its final check, given the
    person's words with a later message added ("you decide"), answered in 1.0 second, `ready_with_limits`, with no
    review note: the lane was found by the research target.
  - **Research:** a final check of a short draft for another research target ("Preliminary answer. Probably yes, by
    a few minutes: ... This was a first pass and more research is needed.") answered in 24.0 seconds with the
    review's note; its first point: "Which study, and how many minutes longer did it take people to fall asleep after
    caffeine an hour before bed?". The 900 characters asked for end inside the second point, so whether this live
    review also named the draft's "preliminary" is not recorded here; the laptop's API call with the same rubric did.
  - The call record's lines for these calls show `plan_research: go_on` and no lane, as expected. After the probe
    the server's state files read: planner USD 0.53 for eight plans on 14 Nov, review USD 0.31 for three reviews, no
    failure line in the service's log.
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-cf89e911dec2` (the image of `5a6a6e78`), restore
  `runtime.env` from `/opt/askrigor/rollbacks/pre-cf89e911dec241a549b265158e476f213b5eb5f9` and recreate research-mcp. The earlier build reads the same
  state files.
- **Not in this release:** the lane in the call record (it keeps nothing of a result but `plan_research`'s
  decision), so how often AskRigor steps aside is not counted; learn mode (owner answer 303a, chosen in the Inbox on
  14 Nov, to be released after "303a" is typed in chat); a check that a light look-up's quoted line stands in the
  source; the final check's own first-pass limit, which is as vague as the drafts #458 describes; AskRigor#459 (two
  species treated as one), read and not handled; the seventh defect of the blind replay (a video claims report sent
  twice to apps other than ChatGPT); the reviewers' other findings from the two replays, unchecked.
