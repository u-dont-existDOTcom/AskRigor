# Production release, 2026-11-13 (Greptile's five findings fixed; the question named on dev accounts, owner answer 296b)

- **Owner decision:** two bases, both the owner's.
  - The fixes went out under the owner's standing permission of 12 Nov 2026 for releases that carry no tradeoff ("you
    can do releases without my yes if you don't think there's any downside to the decisions, and we can roll back if it
    looks like the release made things worse"). The owner asked for them in chat on 13 Nov 2026 at 00:55 UTC: "inbox.
    and fix what greptile found", with the report of another session's Greptile reviews.
  - The question named on a dev account is the owner's answer 296b, chosen in their Inbox on 13 Nov 2026 at 00:53 UTC,
    with the reply "for pewdiepie, i do recall it answered mostly the wrong question". Question 296's option b named
    the change and its release to dev accounts. The owner was told in chat at 01:02 UTC that both would go out when
    they passed, without another question.
  - `person_answered` on every account is a fix under the same standing permission: an allocation the person did not
    give was never their answer. The owner was told at 00:48 and 01:02 UTC that it would go out unless they objected.
- **Contents:** #441, eight commits after the release record of #440:
  - **The menu** (`a84665fb`, `35a638cb`). A research target that is not the registered one holds the tasks back:
    `next_step` says the correction first (`TARGET_NOT_REGISTERED`), before any ask and in place of the go-ahead, and
    the text of a menu that would go on says the same (Greptile's review of 12 Nov, P1: `next_step` said only to do
    the tasks and finalize, so an app that hands its model the structured content went on and the answer ended without
    the comparison with the quick answer). On a dev account a short menu plans nothing until it carries
    `steering_choice`, the one question the AI would ask this person, or the word none (owner answer 296b); a named
    question asks, the reply puts it to the person, and the rule for their answer says that what they answer decides
    what the research checks, and that a reply that answers it and gives no allocation leaves the allocation to the
    AI (`NAMED_ANSWER_STEERS`; its second sentence from Greptile's review of this pull request, P2). On every account
    an allocation is the person's answer only with `person_answered` true (dev accounts only since #440), and the
    handed-over "you decide" call carries `"person_answered": "<true|false>"`.
  - **Forum pages** (`fb44d97a`, Greptile P1): the reader lists at most 50 links to later pages, its own thread's
    first, wherever they stand; a cut list with none of the thread's own reaches no end, so the thread is part read.
    Until now 50 links to other threads' later pages standing first hid the thread's own page 2, and page 1 read as
    the whole thread.
  - **A YouTube audit's continuation handle** (`af4ca682`, Greptile P1): given back whenever the call did not commit;
    a call refused for its input used to leave it claimed.
  - **A refused study audit** (`c9ff7562`, Greptile P1): its repair instructions are also structured content that fits
    the published output schema (`status: "audit_not_validated"`, the error, each failed source check with what was
    sent and the document's own, the fields to change, and a truthful `coverage_receipt`). ChatGPT showed the
    text-only error as "The tool failed internally". Not fixed: `validate_review_method_audit`, whose published schema
    requires a receipt a refused audit does not have.
  - **A repeat pass** (`27910688`, Greptile P2 of 12 Nov): a pass after a pass in the same turn says one thing: no
    note asks for the check again, no closing questions, no call to restore a quick-answer comparison.
  - **A full-text lead is no reading** (`dac22cce`, Greptile P1): one lead in the state ABSTRACT_ONLY gave "AskRigor
    read 1 study only as an abstract.", though a lead's result gives the AI none of the copy's text. The research-wide
    sentence, the panel's "What AskRigor read", linked studies and the read-depth step's words no longer count it.
    What an entry may say without being held back is unchanged (51,380,224 verdicts compared, none differs). The
    step names what the receipts do show read beside such a lead (`7b9511b0`, Greptile's review of this pull request
    on GitHub, P2: with a PubMed record's abstract beside a lead that found part of the text readable, the new words
    said they showed "no reading of it").

  The tool list is unchanged (35 tools; fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`) and so are the server instructions, so no app needs a refresh. No migration, role script,
  compose, settings, privacy-notice or site change; only the build line of `runtime.env` changes. No file under
  `site/`, `ops/`, `infra/`, the migrations, the plugin package or `protocols/` differs from `1e7d662e`.
- **Before deploying:**
  - `npm run lessons:status` at 02:25:40 UTC: open 46; needs review 9; accepted but not incorporated 1;
    incorporated or closed 41; deletion eligible 1.
  - `npm run verify`: on `dac22cce`'s tree 6,512 passed and 6 skipped (02:11 UTC); on `35a638cb`'s tree 6,513
    passed and 6 skipped (02:21 UTC); on the head `7b9511b0`'s tree 6,513 passed and 6 skipped, the typecheck and the
    build (02:32 UTC). All seven required and security checks passed on `35a638cb` (Deterministic verification 5m23s)
    and on the head `7b9511b0` (02:39:21 UTC, Deterministic verification 7m3s). The private-map check found nothing
    to refuse (9 commits).
  - Greptile: its local review of `dac22cce` against `origin/main` at 02:16 UTC (4 of 5, "appears safe to merge",
    one P2: a reply that only answers the named question had no way forward), fixed in `35a638cb`; its review of
    `35a638cb` at 02:24 UTC: 5 of 5, "Previous finding #1 is addressed. No new actionable issues were found." Its
    review on GitHub of `dac22cce` at 02:21 UTC left one thread (P2, the read-depth step's words beside a lead),
    fixed in `7b9511b0` and resolved; no review thread was open at the merge.
- **Source:** #441 merged at 02:39:38 UTC as `ea3a92830067189bb6b937aae22af74acf12d7c5`, whose tree equals
  the head's (`7b9511b0`).
- **Image:**
  - source archive SHA-256 `48a8964f973c997df8a2beeaf65db3bc8a7ba943433f7e40296b264be8cf57e5`;
  - ID `sha256:afcadda79d8d52061b0996d7c6c29b9066d71cf95afa3d48ea6cf15fbfcfa60b`, user `node`;
  - image archive 122,117,573 bytes, SHA-256 `3eea749fa3147b5259a247a112d7d7e6b33cf9f8434865ee91a237d5539db522`,
    copied with `rsync --partial` and checked on the host.

  The no-secret gate passed: `/healthz` ok, HRP 20.6.41 and Universal 20.5.46, and one log line, naming no credential.
- **Prior state (stage A, 02:45:22 UTC):** research-mcp on `1e7d662e`, healthy; `compose.living-evidence.yaml`
  `196da407`; the role scripts `a40256a6` and `7f361afa`; `runtime.env` 80 names, one of them the OpenAlex key's; the
  promotion timer enabled; the site release `1d877300`. The owner's maps file copied, the same bytes as before. No call
  from the owner's account since 01:19 UTC, so the switch cut no research of theirs.
- **Stage B (02:45:51 to 02:46:34 UTC):**
  - the new image read Reddit through production's key (`READER_OK`); the timer stopped;
  - rollback kept in `/opt/askrigor/rollbacks/pre-ea3a92830067189bb6b937aae22af74acf12d7c5` (the selector,
    `runtime.env`, both compose files and both role scripts), the prior image, `1e7d662e`'s
    (`sha256:50a74a6de948c5b4…`), tagged `rollback-pre-ea3a92830067`, and a `living_evidence` dump of 17,916,103
    bytes, SHA-256 `ad5f981b80fe551e…`;
  - migrate: nothing new to apply; 0018 to 0034 recorded with the release files' hashes;
  - both role scripts re-run with the same bytes; the review role may run exactly its script's 36 functions and the
    access role its 15; the boundaries as before (the reader can't read the held YouTube findings or the call record,
    and reads the 11 Atlas tables);
  - `runtime.env`: 80 names, only the build line changed; the selector names
    `askrigor-research:ea3a92830067189bb6b937aae22af74acf12d7c5`; the maps file reinstalled with the same bytes; the
    compose file unchanged;
  - research-mcp recreated at 02:46:27 UTC, healthy, with the reader and maps mounts read-only; the running service has
    the OpenAlex key set (checked without printing it).
- **Stage C (02:46:34 to 02:47:31 UTC):** `/version` names build `ea3a9283`, HRP 20.6.41; an unauthenticated POST
  gets 401; `/mcp` lists 35 tools, equal to the frozen fixture, and the three tool lists equal their fixtures in the
  image; the site's pages and the Atlas pages answer as before; the in-image probes pass as for `1e7d662e` (the two
  logs differ from that release's only in hashes, sizes and times: a passing final check, the full-text, forum-reader
  and shared-answers probes; the review actions' schema line reads "missing" as before, and the full-text probe's
  second paper ends as before, with its open routes exhausted); the all-journal search from production found the 1999
  Syrian rue oil paper (`10.1080/12538078.1999.10515822`) first, and the key appears nowhere in the result; one log
  line, with no credential-like marker.
- **Promotion:** the hardened one-shot service ran once (success, exit 0), the timer was enabled again with its next
  trigger at 02:50:06 UTC, and the selector binds the deployed image.
- **The site:** not reinstalled. No file under `site/` or `ops/public-site` differs from `1e7d662e`
  (`git diff --stat 1e7d662e..ea3a9283 -- site ops infra packages/evidence-repository/migrations .codex-plugin assets
  skills protocols` is empty), so the `1d877300` site release stays in place; its pages answered 200 in stage C. The
  What's new entry for this release is on the next build's branch, with this record, and goes out with its site
  release.
- **Plugin (02:48:12 UTC):** no packaged file changed since `1e7d662e` (0 of 8); the source and the installed copy
  each equal the merge's files, receipt `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`, so it
  was not reinstalled.
- **Connector probe (Codex's AskRigor app, a dev account, 02:48:12 to 02:50:17 UTC):** 35 tools; `tool_list_version`
  `0d6016087ee4bc5a`; HRP 20.6.41 (`e1705d3e958ea5d0`), running build `ea3a9283`; no out-of-date sentence; `inspect`
  ACTIVE, FREE_CONTRIBUTOR, balanced. A short menu with no `steering_choice`: refused, `invalid_request`, with
  `corrected_later_inputs` whose `steering_choice` is `<the one question you would ask this person, or none>`. The
  same menu with `steering_could_help` true alone: refused again ("steering_choice: left out; name the one question
  you would ask this person, or write none"). With a named question: `ask`, the question back as
  `researchMenu.steering_choice`, a `menu_digest`, `you_decide_later_inputs` carrying `person_answered` `<true|false>`
  and the question, and a `next_step` that says to put the question to the person and ends with what their answer
  does. That call sent back as it was: not refused, `ask` again, `allocation_not_used` true, and the stop first in
  `next_step` and in `problems`. The same call with `person_answered` true, as a check of the declared value:
  `go_on`, with the allocation as recommended. The first menu with the word none: `go_on`, `steering_could_help`
  false, no `steering_choice` in the result. The call record read refused, refused, `ask`, `ask`, `go_on`, `go_on`.
- **Claude's connector (a dev account, 02:48 to 02:49 UTC):** the same steps gave the same results on `/mcp/claude`.
  And with a plain answer registered for one research target, a menu for a reworded target that carried none: `next`
  `go_on`, `target_matches_plain_answer` false, and `next_step` "This menu's research_target is not the one registered
  with the plain answer ... Do none of this menu's tasks before that: the go-ahead comes with that call's result."
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-ea3a92830067` (the image of `1e7d662e`),
  restore `runtime.env` from the rollback folder (only its build line differs), and recreate research-mcp
  (`infra/living-evidence-production/README.md`). No migration and no site release to undo.
- **After the release, the five test prompts again in the owner's ChatGPT (13 Nov, 02:51 to 03:18 UTC; Extra High; card
  saving off from 02:50:40 to 03:17:59 UTC; up to five chats at once):**
  - **The control (one figure from one named trial):** two menu calls handed back (the shape, then the question left
    out), the third carried `steering_choice` none, the result said go on, and the turn ended with a checked answer
    and no question (31 of 156 children, 19.9%, by group from the paper's Table 5), 9m 13s, two final checks. Asked
    why none: "your question identified the exact study, DOI, and outcome, leaving no meaningful ambiguity or research
    choice that required clarification".
  - **The PewDiePie question** ("what has pewdiepie achieved with ajax that china couldn't"), which went straight to
    an answer on `1e7d662e`: the third menu call named the question, the result asked, and the reply put it first:
    "Are you referring to Chinese researchers reportedly trying to extract OpenAI's hidden reasoning, or to China
    being unable to build a comparable AI model?", then three checks at 2 minutes each. No call followed the ask. A
    reply that answered only that question ("the first one: ...", no minutes, no "you decide") went on at the first
    `plan_research` call, 32 seconds later, with the handed-over allocation and `person_answered` true; one final
    check 4 minutes after it; a checked answer for that reading after about 6 minutes. Asked how it decided: "I
    interpreted your reply, "the first one," as resolving the comparison question and implicitly leaving the research
    allocation to my discretion".
  - **Syrian rue oil:** the first readable menu named the question (one refused call), the result asked, and the reply
    put it first: "Which type of Syrian rue oil are you interested in: steam-distilled essential oil, cold-pressed
    seed oil, an oil infusion, or a concentrated extract?", then four tasks. The reply "cold-pressed seed oil" went on
    at the first call, 19 seconds later, and the answer was for that oil; it ends by saying AskRigor's check did not
    pass, so it is provisional.
  - **Orange peel and SMILES went on without asking:** each carried `steering_choice` none, and each turn ended with a
    checked answer (about 22 and 12 minutes). By the plan's criteria these are two misses. In both, the AI's first
    call, before AskRigor had asked for any question, already carried `steering_could_help` false with a reason
    ("the research path is clearly bounded and can proceed without preferences"; "a narrowly defined claim about one
    named study"), and the refusal for the question did not change it. Asked afterwards, it named a question both
    times: for orange peel "Is your main priority improving soil water retention during drought, restoring soil
    fertility, or both?", adding that "none" was not fully justified; for SMILES which of two fourfold figures was
    meant, both of which its answer had covered.
  - **Cost:** two refused calls per first menu on four prompts, one on the fifth (round 4: 2, 2, 2, 1, 2), within
    the plan's limit of two. No run researched after an ask, and no allocation was sent that the person had not
    given or left.

  So the fixes are live, and the named question did what the owner asked for on the question they had named ("for
  pewdiepie, i do recall it answered mostly the wrong question"): it asked, with the question, and the answer followed
  the reply. Two open questions still went straight to an answer because the AI decided "no question" before it knew
  one was wanted: it learns of `steering_choice` only from the refusal. By the plan that is the owner's to see before
  any further change (owner question 297). Nothing was changed or rolled back.
