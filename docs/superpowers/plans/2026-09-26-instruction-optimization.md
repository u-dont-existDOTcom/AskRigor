# AskRigor instruction optimization plan

Status: Phase 0 complete (2026-09-26). Next: fix broken tool references, build the
test runner, run the baseline pilot, then the server session and finalize gate.
Branch: `claude/askrigour-instruction-optimization-cffyp2`.
Phase 0 findings: `docs/audits/2026-09-26-instruction-optimization-phase0.md`.

## Owner outcome

AskRigor research results at least as rigorous with far less instruction text
and more rules enforced by the server. If adherence and intelligence improve,
AskRigor can run well on GPT's unlimited consumer chats instead of relying on
Claude Opus 5.5 (owner, 2026-09-26).

## Owner decisions recorded in the Claude Code session of 2026-09-26

1. Refactor first, with the minimum testing needed to show adherence and
   intelligence improve. A full MAST rerun is not a goal: MAST runs with tools
   off, so it cannot exercise AskRigor's research machinery.
2. Test questions are real-user-style questions with no answer key. Good
   answers surface credible non-mainstream options with community and forum
   signal, appraise studies rigorously, and separate plausible heterodox signal
   from crackpot claims.
3. Judges for hard cases: GPT-6 Pro (ChatGPT) and Claude Opus 5.5 at max effort.
4. Test in product conditions: each product's normal system prompt plus the
   AskRigor connector. Exclude only developer-only instructions.
5. Reach ChatGPT through Mission Control's ChatGPT chats on the VPS, not Codex.
6. Hold out as many questions as makes sense (6 of 11).
7. Change whatever rules need changing, including the rule that
   `load_protocol` returns the complete canonical text. Clinical or scientific
   method changes in HRP are batched into one list for explicit owner approval,
   as the original brief requires.
8. Zero spend: Claude plan usage and ChatGPT consumer chats only; no paid API
   calls. Keep Claude usage credits off.
9. Standing holds: the Mission Control A19–A20 alignment task stays on hold and
   is not resent; PR #234 is frozen unless the owner says otherwise.

## Owner decisions of 2026-09-27

1. Euphemism rule: replaced by precise clinical terms (Universal 20.5.29).
2. Treatment discovery (HRP 20.6.1): the fixed 8-video / 6-program minimum
   goes. A first pass is a broad sweep with a cap, not a minimum. It searches
   in rounds from new angles, including patient phrasing and methods named in
   comments, and stops at the earliest of:
   - saturation: two consecutive rounds from different angles add nothing
     new; a niche topic may end with one video or none;
   - about six fully audited videos;
   - about four rounds.

   If discovery has not saturated, the answer is provisional. It ends with the
   open leads (topic, why more signal is likely, rough cost of another pass)
   and asks whether to continue. Deep research, asked for by the user or set by
   an automated brief, runs to saturation. The owner rejected open-ended
   saturation alone ("might search for DAYS").
   - `finalize_research` enforces it from discovery receipts, which now carry a
     query digest and are issued for empty rounds too. A first pass that stops
     unsaturated must list `open_leads`.
   - `assess_treatment_landscape_coverage` returns `first_pass_with_open_leads`
     when only breadth gaps remain after the cap. Skipped directional searches,
     invalid records and unfinished audits still block.
3. Estimates of live state (quota, CI, relay health) are never reported as
   facts. This goes into UDA as the observed-state check
   (u-dont-existDOTcom/universal-dev-architecture#274).
4. YouTube quota: the owner's extension request has been pending with Google
   for over a month. Extra Cloud projects for the same app are not allowed
   (YouTube developer policy III.D.1.c), and automated browsing of comments
   would breach YouTube's Terms of Service. The plan is to cut per-research
   quota (scout-first discovery, a short-lived cache within III.E.4.d, per-user
   budgets).
5. Find the recent version whose Gemini Spark discovery handled the hip case
   well, then test search strategies on development questions with a
   discovery-only bench.
6. Batch 2 method-section wording (approved): adopted as HRP 20.6.2 after two
   independent meaning reviews found and fixed 13 meaning changes.
7. Scout-first discovery (approved): the Gemini scout becomes the primary way
   to find videos, and YouTube search goes mainly to exact-title lookups. The
   owner asked why the Spark workflow stopped. In the repository history,
   Spark skill v13 (20 August) ran a two-stage loop: broad discovery with a
   remedy scan, then targeted rediscovery of remedies and videos named in
   audited comments. Later that day the skill was cut from 36 KB to 8 KB to
   pass Gemini's upload security scan and to make evidence traceable. That
   dropped the remedy scan and the rediscovery mode. On 23 August the manual
   Spark handoff was replaced by the API scout, which has Google Search but
   not the Gemini app's YouTube tool. The loop is now rebuilt in the automated
   scout: after comment audits, the model passes the remedies, videos and
   creators the comments name back to the scout as `rediscovery_leads`, and
   the next round searches them. The skill, the Project router, the Forum
   Signal module, the server instructions and `finalize_research` now put the
   scout first. Any discovery round (scout, survey or search) counts as
   community discovery, and `survey_youtube_community` is the fallback.

## Discovery bench findings (2026-09-27)

The bench (`evaluation/instruction-optimization/discovery-bench/`) runs only
the automated Gemini scout plus YouTube identity checks on a neutral target:
"Adults with severe hip osteoarthritis who want to avoid or delay a hip
replacement: what they tried on their own and what happened". Tinnitus is the
generalization check. Hip is development data; nothing here confirms
generalization.

- Why recent runs missed what Gemini Spark (staged skill v13, 001a47b) found:
  the consumer Gemini app's YouTube tool returns real video IDs, but API
  Google Search grounding usually shows no watch URL. The API scout spent
  searches hunting for IDs (124 of 258 queries, 48%, before the fix),
  invented IDs, or dropped finds.
- The key first-person video ("GROWING MY HIP BACK", XpZHKGGCK-o) surfaced
  in 1 of 7 production-skill runs. The patient-probe skill variant searched
  its exact title in each of 3 measured runs and lost it at the ID step every
  time.
- Fix (e4bc7e5): the scout reports such finds by title and the MCP tool
  looks up at most four per call by exact title. First runs recovered 2, 1,
  4 and 0 videos per call, e.g. "Can Fasting Really Help Tinnitus?". The
  last run hit the search cap described below.
- YouTube search cap (observed 2026-09-27 03:38 UTC): search.list is limited
  to 100 calls per day per project (`defaultSearchListPerDayPerProject`),
  reported as HTTP 429; the window starts 07:00 UTC. Saved hip runs made at
  most 22, 24 and 49 searches (counted from tool inputs), mostly
  `survey_youtube_community` at up to 6 searches per call, so the cap allows
  about 2 to 4 research runs a day. d45ce15 reports the cap as the daily
  search quota instead of a retryable rate limit.
- Round 5 (2026-09-27 07:12 UTC, after the cap reset, all with title
  lookups):
  - ID hunting fell to 9 of 60 searches (15%), and lookups recovered 3 to 4
    videos per run.
  - Collagen surfaced in all 3 hip runs of the generic patient-probe variant
    (`skill-variant-patient-probes-generic.md`, no hip title) and in none of
    3 production-skill runs.
  - Gelatin, hydration and the key "GROWING MY HIP BACK" video surfaced in
    none, so the comment-led rediscovery loop has to carry those.
  - Tinnitus was comparable between the two skills.
  - The variant's probes are now in the production scout skill (compacted;
    size bound raised from 8,000 to 9,000 bytes).
  - This is development evidence (n = 3 per arm) and needs held-out
    confirmation.
  - The v13 skill could not run through the API scout: at 36 KB it exceeds
    the scout's 30 KB instruction bound. Its missing piece, targeted
    rediscovery from comments, is now `rediscovery_leads`. Owner decision proposed: move directional YouTube
  discovery from survey keyword searches (up to 6 search.list calls each) to
  the Gemini scout, keeping YouTube searches for exact-title lookups.

## Smoke run on 4d4fae8 (2026-09-27, HRP 20.6.2, scout-first)

Question `dev-hip-avoid-replacement`, Claude Opus 5.5 at max effort. The
run went from 07:12 to 09:44 UTC.

| Run | Minutes | Tool calls | Output tokens | Scout / survey / audit / coverage-check calls |
|---|---:|---:|---:|---|
| main | 19 | 89 | 115K | 0 / 4 / 17 / 0 |
| e1176f8 | 27 | 145 | 153K | 2 / 4 / 20 / 0 |
| 6e2763d | 111 | 212 | 584K | 5 / 7 / 61 / 5 |
| 4d4fae8 | 152 | 313 | 827K | 8 / 5 / 82 / 4 |

- **The comment-led loop worked.** One initial scout round, then two
  rediscovery rounds, each with 8 leads the model took from audited
  comments. The leads included collagen, turmeric and glucosamine, a
  low-carb diet, red light therapy, an unloader brace, radiofrequency
  ablation and low-dose radiation.
- **Audit failures.** 16 of 82 comment-audit calls failed. Every audit that
  resumed after a full top-level page failed, a defect on main since
  2026-09-01, fixed in cd5e325. Four material videos stayed unaudited,
  `finalize_research` stayed `not_ready`, and the model answered anyway.
- **Where the time went** (time before each tool call):
  - about 48 minutes on comment audits;
  - about 39 minutes composing four `assess_treatment_landscape_coverage`
    ledgers, plus much of about 23 minutes of reasoning after them. The
    first check returned about 140 blockers, nearly all ledger bookkeeping
    (reciprocal records, batch links, boundary wording), and the model
    rebuilt the ledger with four more surveys;
  - about 15 minutes on study audits.
- **Answer content.**
  - Named physical-therapy and exercise methods: 17 mentions, against 2
    to 14 in the earlier arms.
  - Also covered: radiofrequency ablation, an unloader brace, PRP and stem
    cells.
  - Still missing: gelatin, collagen and hydration.
- **Blind judges** (Opus at max effort with web spot-checks, arm identities
  hidden):
  - **4d4fae8 beat e1176f8, the previous best (medium confidence).**
    - It won options and heterodox judgment; appraisal and safety tied.
    - e1176f8 won usefulness. The 4d4fae8 answer buried its plan among
      internal R0–R5 codes, a 28-video list, open leads given as YouTube
      IDs and a technical forum-audit prompt.
  - **4d4fae8 beat main (medium confidence).**
    - It won options, safety, heterodox judgment and, narrowly,
      usefulness.
    - main won appraisal, partly for the 77% two-year crossover-to-surgery
      figure that 4d4fae8 missed.
  - Follow-up: `finalize_research` now asks for the open leads in plain
    language, with no video IDs or internal codes. It had echoed the
    model's lead topics, IDs included.
  - All arms are still one development question.
- **Leftover minimum (fixed in HRP 20.6.3).** The first-pass rule of HRP
  20.6.1 had not reached four places:
  - final self-check FS188 and the FourDistinctVideosPresentedAsBroadCoverage
    regression case still required at least eight fully audited videos
    across six programs;
  - the Project router still said a valid ledger blocks below 8 audited
    videos and 6 programs;
  - the router and the Forum Signal module still said to keep searching
    while more work would improve the answer, with no first-pass stop.

  All now state the first-pass stop and its open leads. HRP's completion-gate
  text now names discovery receipts rather than survey receipts. Whether
  these lines affected the 4d4fae8 run is not measured.
- **Coverage checker replay.** The 4d4fae8 run's four
  `assess_treatment_landscape_coverage` ledgers (95 to 151 KB each), replayed
  through the checker offline, showed why it never passed:
  - The checker showed only 11 of up to 138 messages per call, so each
    rewrite uncovered a few more problems.
  - By the last ledger, the first pass was complete and discovery had
    saturated, but 100 selection blockers remained. 24 were unread result
    pages of discovery searches and 8 were specific-program searches not
    yet run. Both are breadth gaps under HRP 20.6.1, yet the checker
    treated them as hard blockers.
  - A terminal access boundary (a trial with no open full text) also forced
    `continue_research` in a first pass, although nothing was executable.

  Fixes: in a first pass these become open leads (`breadth_gaps`, a new
  output list):
  - unread discovery pages;
  - unsearched classes;
  - unfinished specific-program searches;
  - open formal return passes, which HRP's bidirectional rule already offers
    as leads when a first pass stops.

  Also:
  - A found specific-program result no longer needs every page read;
    zero-result claims still do.
  - A terminal boundary stays a stated limit of the first-pass answer.
  - Repeated messages are grouped by record, with record problems listed
    first.

  Deep research is unchanged. On replay, the second ledger would have
  needed three record fixes, plus two audits cut short by the resume
  defect (fixed in cd5e325), before ending the first pass with open leads.
  The full test gate also found a defect from 37384c4:
  - The Custom GPT research-session controller crashed on a first-pass
    result, because its diagnostics list no first-pass ending.
  - It now asks the checker for deep coverage explicitly. Its statuses
    (complete, terminal, in progress) have no first-pass ending yet, so the
    first-pass stop is currently enforced on MCP only.

  Two tests tampered with signed data by setting its last character to
  "A". That is a no-op whenever the value already ends in "A" (1 in 16 for
  a permit signature), which explains an earlier one-off failure. They now
  change the first character instead.
- **Codex review of c623eb8** (three findings, all confirmed and fixed):
  - `finalize_research` counted a receipt passed several times as several
    rounds, so one round passed four times reached the first-pass cap. It
    now counts each receipt once, and counts rounds toward the cap by
    distinct query.
  - The scout receipt's `open` count left out titles it had not yet looked
    up, so two such rounds could count as saturated. Titles that were not
    searched, or whose search failed or hit the quota, now count as open.
  - One MCP scout call could poll Gemini for about 70 seconds, past
    Claude's 60-second tool timeout. Polling now takes a deadline: a
    further poll starts only if its 20-second timeout ends by 40 seconds.
    Title searches run only if they can end by 55 seconds; otherwise the
    titles stay open leads.
- **Codex review of 2e7a7c8** (two findings, both confirmed and fixed):
  - `acquire_open_full_text` signed a `full_text_lead` receipt for any
    acquisition without text, including a provider outage or rate limit.
    That let `finalize_research` accept the study as `lead_only`. A source
    that failed now yields no receipt, and the tool asks for a retry.
  - The coverage checker still counted every valid batch toward the
    four-round cap, so four batches of one query completed a first pass.
    It now counts distinct normalized queries, as `finalize_research`
    does.
- **Codex review of 47ec138** (two findings):
  - A PMID without a DOI was accepted as a lead even when PubMed lists an
    open copy in PubMed Central; the PubMed parser dropped the PMC ID.
    Records and receipts now carry the PMCID. Such a study is no longer a
    lead: `acquire_open_full_text` needs a DOI, so the next step is to find
    its DOI or leave it out of the key sources and label it unverified.
  - `receipts_unavailable` (a server without a signing secret) gave no next
    step. HRP's FinalizeResearch rule already says to state that completion
    was not server-verified, and the deployment requires the secret at
    startup when research Actions are enabled. So the status is not made
    blocking: the model cannot fix server configuration. The
    `finalize_research` description now tells every client what to do.
- **Codex review of a028d9d** (two findings, both fixed):
  - Zero spend. The MCP scout could start a Gemini interaction with any
    configured key, and `docs/custom-gpt-actions-setup.md` describes the
    production key as a paid project key.
    - A new scout on MCP now runs only when the deployment sets
      `ASKRIGOR_GEMINI_BILLING=none` for a key without billing; otherwise the
      model uses the survey. Polling a started scout costs nothing more.
    - The owner confirmed on 2026-09-26 that this environment's key has no
      billing, so the runner sets the flag.
    - Enabling the scout in production is a deployment decision for the
      owner: either the key has no billing, or a newer explicit spend
      decision.
  - Privacy. The shared de-identification screen accepted a named person
    ("Jane Doe, age 47, in Boston has a rare cancer"). MCP scout targets now
    also pass a population-level screen, which refuses:
    - third-person singular pronouns;
    - a single person's age;
    - a title before a name;
    - a common given name followed by a surname or narrative verb.

    Leads keep the base screen, since they may name public creators. The
    Custom GPT Action and controlled routes on main use only the base screen;
    hardening them changes the Custom GPT's behavior, so it needs its own
    acceptance.
- **Codex review of d1c9c99** (two findings, both fixed; CodeQL also flagged a
  polynomial regular expression in the new screen, fixed in 062e38a):
  - The name check relied on a list of common given names, so "Xiomara Garcia
    in Boston has a rare cancer" passed. The screen now fails closed:
    - the target must name a group of people;
    - two capitalized words in a row are refused unless they form a medical
      or method term (or are title-case styling);
    - a capitalized word before a narrative verb is refused unless it names
      a group.

    A bare condition ("hip osteoarthritis: avoiding a replacement") is now
    refused. The error and the tool description ask for a group of people.
  - A validated ID whose YouTube title differed from the declared title,
    while the channel matched, was trusted, and could be another video from
    the same channel. The MCP tool now confirms such IDs by looking up the
    declared title; they count as found only if that lookup finds them.
    - The shared validator was left unchanged here; the 94d496c round below
      moved the check into it.
    - In the 4d4fae8 smoke run, 1 of 20 validated candidates took this path.
- **Codex review of 2dbe52d** (two findings):
  - The discovery-bench probe called the Gemini executor directly and
    skipped the unbilled-key gate. It now refuses unless
    `ASKRIGOR_GEMINI_BILLING=none` is set.
  - A lowercase name after an example marker passed the screen ("adults like
    xiomara garcia with a rare cancer"). Identity and example markers are now
    refused in any capitalization: "named", "called", "like" before a word
    that is not a group, "such as", "e.g.", "including". No pattern check can
    catch every name: a lowercase name with no marker still passes. The
    privacy map records that limit, and the tool contract still asks the
    calling model for a population-level target. MCP scouting stays off unless
    the owner sets the unbilled-key flag, so the owner accepts this residual
    risk or keeps it off at deployment.
- **Codex review of 94d496c** (two findings, both fixed):
  - 9f6d0f1 let a scout report up to 200 Google searches, but one $1
    reservation pays for at most 71 at $0.014 each. A costlier run was
    committed at the clamped $1, so the ledger undercounted it. The accepted
    count now derives from the reservation (71). A scout whose reported usage
    costs more than $1 is refused (`gemini_scout_request_over_budget`, not
    retryable) and charged the full reservation. Limit: the ledger cannot
    record a refused run's real cost above $1. The scout prompt asks for 8–18
    searches.
  - Only the MCP route caught a same-channel ID with a different title; the
    Custom GPT Action and the session controller still used it as validated.
    The shared validator now leaves such an ID unresolved
    (`youtube_candidate_title_conflict`, not retryable). That is not a
    terminal rejection, so HRP's both-differ rule still holds. The MCP tool
    looks these IDs up by the declared title as before. The d1c9c99 note
    that the session flow would get stuck was wrong: a non-retryable
    unresolved candidate leaves the session on its validated subset, and
    native discovery continues.
- **Codex review of cba8dd8** (three findings, all fixed):
  - The runner labeled any Gemini key as unbilled. It now passes the key to
    the server only when the operator sets `ASKRIGOR_GEMINI_BILLING=none`;
    otherwise the server gets no Gemini key at all, so no route can start a
    paid scout. The owner has said the evaluation Gemini key has no automatic
    billing, so evaluation runs set the flag.
  - A title lookup accepted any result sharing 60% of the declared words,
    and with no declared channel took the first one. On the discovery bench
    that matched "Exercise for Instant Hip Pain Relief #Shorts" to another
    Shorts video. A result now needs the declared channel to agree, or a
    nearly identical title: the same words in the same order, or a declared
    title of four or more words that YouTube's longer title contains.
  - Comments without a channel ID were keyed by display name, which merged
    different people with the same name. They now get a per-comment key.

## Assurance lanes (UDA `patterns/development-assurance-lanes.md`)

- Iteration for each candidate: focused tests plus one or two development
  questions.
- Decision for the final before/after comparison on held-out questions.
- Release (full `npm run verify`, Codex review, owner approval naming the PRs,
  deployment with rollback, plugin receipt) only at merge/deploy.

## Measures (always reported separately)

1. Research quality: blinded side-by-side comparison, old versus new, per
   question and per model; judges GPT-6 Pro and Opus 5.5 max.
2. Gate compliance: receipts obtained before synthesis (from the server ledger
   once it exists; from run transcripts before that).
3. Instruction load: bytes and estimated tokens per typical run, per surface.
4. Cost and latency: tool calls, wall time, tokens (Claude Code reports an
   API-equivalent estimate; actual spend is $0 on the plan).

## Test design

- Questions: `evaluation/instruction-optimization/questions.json`: 5 development
  (including the owner's two real hip questions) and 6 held out. Held-out
  questions run only in the final comparison, after the refactor is frozen.
- Claude runs: local AskRigor server (old = `main`, new = branch) and a child
  `claude -p` session per run, started outside the repository so developer
  instructions are not loaded, connected through `--mcp-config`. Community tools
  need a YouTube Data API key in the environment.
- GPT runs: ChatGPT chats on the VPS through Mission Control. The relay service
  is not running and is pinned to GPT-5.6 Sol labels; a GPT-6 route is still to
  be built. The "new" arm on ChatGPT needs a staging connector.
- Judging: blinded pairs (old versus new) with a short rubric: credible options
  beyond the mainstream answer, correct study appraisal (judges spot-check
  citations), plausible versus crackpot separation, safety (never talks people
  out of care they need), usefulness to the person.

## Phases

| Phase | Status | Notes |
|---|---|---|
| 0 Orient: sources, sizes, rule inventory, server map | Done | Findings doc above |
| 1 Baseline pilot: one run per model on a development question | Next | Needs runner; YouTube key for Claude-side community tools |
| 2 Fix broken tool references and stray text; runtime view without stress tests, revision history, maintainer rules | Planned | No method change |
| 3 MCP research session, ledger, finalize gate (community receipts, study validator receipts, no open continuations) | Built | Signed receipts plus `finalize_research`; see below |
| 4 Consolidate protocol text; resolve contradictions; owner approval list for method changes | Planned | Batches, smoke-tested |
| 5 Serve the protocol by step | Planned | Keep canonical files and hashes |
| 6 Final comparison, cross-family check (GPT-6 Pro), PRs, owner-approved deploy | Planned | Release lane |

## Pilot run 1 (2026-09-26, not a clean baseline)

`main`, Claude Opus 5.5 at max effort, Claude Code tool surface (file-reading
and sub-agent tools available), question `dev-hip-avoid-replacement`, no
YouTube key: 21.6 minutes, 80 tool calls, about 12.4M tokens processed (11.7M
cached reads, 0.53M cache writes, 96K output), API-equivalent estimate $9.71
(actual spend $0 on the plan). `load_protocol` failed on size; the model read
about 780,000 characters of the saved results from disk with `Read`, which
drives most of the token cost. Four full-text chains were read to the end and
validated; the YouTube survey was inaccessible; PubMed and Crossref calls
failed intermittently; the local server process then crashed on an unhandled
socket `ECONNRESET` (the runner uses the production server factory, so this
may affect production). The answer was labelled partial. Later baseline runs
use the Claude app tool surface and need the YouTube key.

## Server gate: research receipts and `finalize_research` (built 2026-09-26)

Before this change no MCP tool issued a verifiable completion receipt: the
survey and audit receipts were plain JSON, full-text handles lived in a
process-local store, and `assess_treatment_landscape_coverage` checked only the
internal consistency of what the model reported. The gate now works like this:

- Five tools return a signed `research_receipt` when a unit of work finishes:
  `survey_youtube_community` (at least one completed search),
  `audit_youtube_video_community` and `audit_youtube_community` (terminal
  completion state only), `acquire_open_full_text` (only when it returns
  `possibly_useful_lead`, proving the attempt), and both method-audit
  validators (only when validated; the receipt names the study's DOI, PMID and
  PMCID from the server-held document index).
- Receipts are HMAC-SHA256 tokens with readable claims
  (`rr1~kind~claims~issued~mac`), keyed by a domain-separated key from
  `ASKRIGOR_FINALIZATION_SIGNING_SECRET` or else the existing YouTube
  continuation secret, so production needs no new configuration. They are
  stateless (survive restarts), carry only public identifiers and counts, and
  expire after 24 hours.
- `finalize_research` takes the receipts, the community decision (researched,
  or not relevant with a reason), and the key studies (validated or lead-only).
  It returns `not_ready` with next steps (no survey, an unaudited material
  video, a key study without a validator receipt, a DOI lead without an
  acquisition attempt, a forged or altered receipt), `ready_with_limits` with the
  limits the answer must state (bounded audits, server-confirmed leads), or
  `ready`, plus a signed finalization receipt that the run ledger records.
- Instruction side: one sentence in the skill (replacing 60 words of meta text)
  and in the MCP server instructions, which were also cut from 2,531 to 2,030
  characters because Claude clients truncate server instructions near 2,048
  characters (the old text lost its last sentences there). The protocol and
  router edits that point to the gate, and the deletion of the prose gates it
  replaces, go in the next protocol batch.
- MCP only: the tool is not a Custom GPT Action (the controlled session keeps
  its own finalization permits) and is left out of the Gemini catalog budget.

## Clean baseline pair (2026-09-26, running)

Claude app tool surface (AskRigor tools plus `Skill` and `ToolSearch`), Opus
5.5 at max effort, `dev-hip-avoid-replacement`, YouTube key working, Gemini
scout available on the branch (free-tier key, no billing; local budget ledger
capped at USD 50 as in production):

- `main`: `load_protocol` still fails on size, so this arm researches with no
  protocol text at all (the skill and tool descriptions only).
- `e1176f8` (section loading): the model loaded the Universal and HRP indexes
  and then 62 sections one by one, about 569,000 characters (about 140K
  tokens), nearly every runtime section. Section loading makes the protocol
  reachable but does not by itself reduce instruction load; that needs the
  consolidation phase and server-enforced gates.

The pair is therefore also a natural test of whether the protocol text adds
research quality for a strong model: no protocol versus nearly all of it.

YouTube Data API quota bounds the test rate: about 10,000 units per day per
project, 100 units per search, up to 6 searches per `survey_youtube_community`
call, so roughly 2,000 to 3,000 units per research run, or about 3 to 4
community-heavy Claude runs per day on the test key. Production runs (ChatGPT
arm) use the production key's separate quota.

### Results of the pair and the first blinded judgment

| Arm | Wall time | Tool calls | Protocol text loaded | Cache reads | API-equivalent | Answer |
|---|---|---|---|---|---|---|
| `main` (no protocol text) | 19.2 min | 89 | 0 (load failed on size) | 4.9M | $7.77 | 11.5K chars, complete |
| `e1176f8` (section loading) | 26.9 min | 145 (64 protocol loads) | about 569K chars | 13.1M | $12.25 | 18.0K chars, partial: local server crashed mid-run |

Judge (Opus 5.5 at max effort through `claude -p`, blinded order and
redacted protocol identifiers, three citation spot-checks per answer):
`e1176f8` won all five criteria (options, appraisal, heterodox judgment,
safety, usefulness), overall confidence medium. `main`'s headline figure
("about 77% had the operation within two years") is not in the paper it
cites; all spot-checked `e1176f8` figures held. The judge faulted `e1176f8`
for length and research-process clutter (status notes first, a forum-audit
prompt and research handoff at the end). Reading: the protocol's substance
(red flags, option coverage, concrete next steps) helps; its process and
output clutter hurts. Consolidation should keep the substance and cut the
process text, which the server gate now covers. One question and one judge
is weak evidence; the held-out comparison decides.

### Third arm: the finalize gate (6e2763d, same question)

`6e2763d` added signed receipts, `finalize_research` and MCP size budgets (HRP
still 20.5.30): 110.7 min, 212 tool calls, 31 protocol loads (326K characters),
29.4M cache reads, API-equivalent $36.38, answer 27.1K characters. The gate
verified all 48 receipts the model passed back (none rejected) and returned
`not_ready` twice: three material videos were never fully audited, because a
continuation bug (an echoed `analysis_limit`, fixed in `1ca754f`) failed their
later pages. The model then answered with the limits stated. Most of the cost
came from 61 video-audit calls (about 60 comments per bounded response, repeated
re-audits of the same videos) and long reasoning (584K output tokens); compact
comment records (`9c13287`) and the continuation fixes target that waste.

Blinded judgments (Opus 5.5 max, citation spot-checks):
- `main` vs `6e2763d`: `6e2763d` won overall (medium): options, heterodox
  judgment, safety and usefulness; `main` narrowly won appraisal.
- `e1176f8` vs `6e2763d`: `e1176f8` narrowly won overall (low): `6e2763d` won
  appraisal and heterodox judgment, options tied, `e1176f8` won safety and
  usefulness (a tighter, more actionable plan; guideline-based medicine advice
  that `6e2763d` could not source because the guidelines were lead-only).
- Every judgment faulted the protocol arms for length and research-process
  clutter (status notes first, audit lists, forum prompt, research to-do list).
  HRP 20.6.0's output rules (no opener, one short limits note at the end,
  capped handoff) target exactly this; the next smoke run measures it.

Both answers stayed mostly mainstream: neither surfaced firsthand community
options such as diet changes, gelatin or collagen, or named physiotherapy
methods. The `e1176f8` run left 12 of 20 video audits incomplete (continuation
not followed); the server gate now blocks that.

## GPT route: state and owner decision needed

The Mission Control ChatGPT relay on the VPS
(`mission-control-chatgpt-relay@cloudbrowser`) is installed but inactive and
disabled. By design it sends only exact Mission Control route packets to
allowlisted ChatGPT chats and never reads ChatGPT output (OpenAI's terms
prohibit automated output extraction), so answers must come back through the
chat's own connector or by hand. Starting it could release queued Mission
Control work, and the A19–A20 alignment task must stay on hold, so it stays off
until the owner decides. Options:

1. Manual GPT arm: the owner pastes each question into a GPT-6 chat with the
   AskRigor connector and saves the answer (old arm: production connector; new
   arm: a staging connector after a staging deploy).
2. Relay: the owner confirms which chats the relay may use and that no queued
   packets would be sent, adds a staging connector for the new arm (an account
   change), and each chat saves its answer to a file through its GitHub
   connector.
3. GPT-6 Pro as judge only: blinded answer packets pasted by hand.

## Time and cost estimate (to be replaced by pilot measurements)

- Phase 0 used about 4.1M subagent tokens on the Claude plan, about 40 minutes
  wall clock in parallel, $0 spend.
- Final comparison: 6 held-out questions × old/new × GPT-6 and Opus 5.5 = 24
  research runs, plus 12 blinded pairs × 2 judges. Assumed 30–60 minutes per
  research run; the ChatGPT side is the bottleneck (about 10-minute gaps between
  consumer sends were needed in September). Roughly 1–1.5 days of mostly
  unattended running.
- Smoke checks: one or two development runs per candidate batch.

## Boundaries

No paid API calls. No production change without the owner's explicit approval
naming the PRs. No credentials in logs, commits, or packets. No private data in
cross-provider review packets. Do not touch queued Mission Control work.
