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

1. Euphemism rule: replaced by precise clinical terms (Universal 20.5.30;
   20.5.29 before the merge with main's task-mode integration, below).
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
8. Owner answers of 15:0x UTC:
   - Treatment-coverage check: option A. The server builds most of the
     coverage ledger from the signed discovery and audit receipts; the model
     supplies only treatment categories and program details. This replaces
     the plan to measure the checker's cost first.
   - The HRP 20.6.3 conformance (old minimum removed) was already approved;
     do not ask again before applying an approved rule.
   - Custom GPT: OpenAI is replacing Custom GPTs with plugins, so drop Custom
     GPT work wherever it limits the design. `/mcp` (ChatGPT) and
     `/mcp/claude` stay supported.
   - Spending: Gemini is the owner's exception. The key has no billing, so the
     scout fits the written zero-spend policy with `ASKRIGOR_GEMINI_BILLING=none`;
     the connector's scout is switched on at deployment. A billed key would
     need the exception and a cap recorded in the governance policy first.
   - Names in scout targets: the recommendation stands (model instructions
     plus the server screen, with the lowercase-name gap in the privacy map).
     Google's Gemini API terms (effective 2026-03-23) forbid personal
     information on unpaid services and allow human review of free-tier
     prompts, which the screen is built for.
   - Owner questions live on one private page that is kept current:
     https://claude.ai/artifact/8MQ4AY8V7HTQXtC1LVEMwz (numbered, each fully
     explained with a recommendation; replies say only what changed there).
   - ChatGPT plugins: keep only the newest AskRigor connector. The owner
     removes the others in ChatGPT settings; this session cannot reach them.
9. Owner answers of about 15:55 UTC:
   - "1: merge": universal-dev-architecture#274 was rechecked (mergeable,
     7/7 checks) and squash-merged as `4563be0`.
   - Lessons submitted on 26 Sep (private repo `AskRigor-lessons`):
     - `askrigor.treatment-use-context-before-safety-label.v1` (ledger,
       provisional): advice to use less of a medication in ongoing use was
       read as advice to withhold it in an emergency. HRP's
       `RelevanceBeforeWarning` checks AskRigor's own warnings against the
       use context, not the source's advice. Proposed one sentence in that
       rule plus a regression case, as HRP 20.6.4; owner question 2, since
       it is method text. The owner approved it ("2 yes") at about 16:10
       UTC; it is HRP 20.6.4, with stress case
       `ReductionAdviceReadAsRescueWithholding`. The lesson record in the
       lessons repository moves from provisional once this reaches main.
     - Issue #17 (three older Universal drafts): forum denominators are
       mostly covered by `SilentDenominator`; causal coupling has no rule;
       subgroup nulls are covered for time windows only. Default: draft the
       two missing rules after AskRigor#246 merges.
10. Owner answer of 19:14 UTC to question 3 (the pasted deep-forum prompt that
    both blind judges counted as clutter): the user should know what the
    deeper research would focus on before approving it; offer "show me the
    full deeper-research prompt and help me fine-tune it", or show a simple
    prompt right there. Built as HRP 20.6.5, an output change with no method
    change:
    - `LimitsNote` holds the offer: what the deeper research would focus on
      (options or open leads, population, sources or communities), what it
      could change in the answer, and how to start it. A prompt of about 60
      words or fewer is shown; a longer one comes when the user asks, with
      help adjusting its scope.
    - `DeepForumAuditActivationPrompt`: the one-line "Check forums for…"
      command is the short form shown with the offer; the full template comes
      on request.
    - `ModeSpecificPromptAndHandoff`: after analysis, a long Deep Research
      prompt follows the same offer, with the mode to select and why. Before
      research (preflight) nothing changes.
    - Stress case `PastedDeepResearchPromptHidesItsFocus`. Codex on b62675e
      (P1): `DeepResearchRecommendedWithoutPrompt` still required the full
      prompt automatically; it and `UserControlledModeClaimedWithoutSelection`
      and `ModeSelection` now keep that before research and use the offer
      after analysis.
    - Tradeoff: someone who must run a long prompt in another tool needs one
      more turn to get it; in exchange every answer stays short and the user
      can adjust the prompt before it runs.

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
- **Codex review of 45fac2e** (two findings, both fixed):
  - The Custom GPT Action runs the same audit handler as MCP. Since 9c13287
    that handler returned the compact MCP sample, and since the receipt work
    a `research_receipt`; the Action adapter's strict parse rejected both, so
    a completed audit failed on the Action, including inside the Custom GPT's
    session controller. The adapter now marks its calls, the audit handler
    returns the full audit to them, and Action responses carry no research
    receipts (MCP's `finalize_research` is their only consumer). A new test
    runs the real handler through the Action route with receipts enabled.
  - The runner recorded each audit's video from an input field audits don't
    use, so every audit was filed under "null". It now reads the audited
    video from the result.
- **Codex review of 6d805b8** (two P1 findings, both fixed):
  - `finalize_research` ignored `assess_treatment_landscape_coverage`, so a
    blocked treatment comparison could still finalize. The Project router
    and skill already require the check for treatment answers; the server
    now enforces it. The checker issues a signed `treatment_coverage`
    receipt (answer boundary and lock), and the latest one passed binds the
    answer:
    - `continue_research` blocks;
    - `bounded_nonranking_only` becomes a limit (no ranking);
    - a first-pass result is a limit in a first pass, and blocks deep
      research.

    `finalize_research` takes a required `treatment_choice`. `compared`
    with no coverage receipt is `not_ready`. Each video the check judged must
    come from a discovery receipt passed in the same call, so a check made
    for another question cannot pass.
  - Rediscovery leads kept only the base screen, so a lead such as "Jane Doe
    in Boston says chemotherapy cured her" reached Gemini. A lead is now a
    short lowercase public term (at most eight words) that fails closed on
    the target screen's person markers and on report verbs, or
    `video:<id>`, which the server replaces with YouTube's own title and
    channel (one quota unit per video). As with the target, a name written
    without capitals can still pass.
- **Codex review of 9197f32** (two P1 findings, both fixed):
  - A coverage receipt did not say which question it was for, so a passing
    check from another question with no videos, or only shared ones, could
    satisfy the gate. The receipt now signs a 12-hex digest of the check's
    research target, and `finalize_research` takes `research_target` and
    counts only checks for that target.
  - Search, survey and one-call audit receipts said nothing about unread
    result pages, so two first-page searches that added nothing could declare
    discovery saturated. They now sign `open` (searches with a next page),
    and a round with unread pages is not settled, as in the coverage
    checker's deep mode. First passes are unaffected: they end at the cap
    and hand back open leads. Scout rounds have no pages, so deep research
    can still saturate through the primary route.
- **Codex review of 6e9e6de** (one P1, two P2s, all fixed):
  - A coverage check labeled narrow (`broad_treatment_choice: false`) skips
    the directional-search and saturation checks, and a small incomplete
    ledger does not trip the checker's own widening. Coverage receipts now
    sign the flag, and a treatment comparison needs a broad check.
  - Receipts carry whole seconds, so two checks in the same second were
    ordered by the caller's list. All checks from the latest second now
    count, and the strictest binds.
  - PubMed's pacer spaced first attempts only; the shared HTTP retries went
    out unpaced during throttling. `beforeAttempt` may now wait, and PubMed
    takes an NCBI slot before every attempt.
- **Codex review of f815f80** (two P1s, one P2, all fixed):
  - Discovery receipts could be reused across questions: two saturated
    rounds and audits from one question could finalize another. Discovery
    receipts (survey, search, scout, one-call audit) now sign `target`, the
    12-hex digest of the research target, and `finalize_research` requires
    `research_target` and counts only matching rounds and videos. Others are
    listed in `receipts_rejected` as `other_research_target` or
    `no_research_target`. `search_youtube` gains an optional
    `research_target` (left out of the compact Gemini catalog, which has no
    `finalize_research`).
  - The public scout Action and the shared executors used only the
    de-identified screen, so a named person could reach Gemini through the
    Action or a Custom GPT session. Every route now applies the
    population-level screen: the Action returns its 422, and sessions and
    orchestration get a non-retryable `research_target_not_population_level`
    boundary and continue with the YouTube survey.
  - Rounds issued in the same second were ordered by the caller's list. Every
    MCP receipt now signs `t`, a millisecond issue time that strictly
    increases within the process, and the gate orders rounds and coverage
    checks by it. Rounds it cannot separate from the last two all count as
    recent, so a tie can only delay saturation.
- **Codex review of 168cbc5** (two P1s, both fixed):
  - A resumed scout refused by the population screen returned before the
    source layer could delete its stored (`store:true`) Gemini interaction.
    The executor now deletes it first, without another poll; if the delete
    fails, it hands the checkpoint back so the next call tries again, as the
    source layer does for its other terminal outcomes.
  - `finalize_research` marked every video of a one-call
    `audit_youtube_community` receipt as audited, so a material video could
    pass without its own video audit. That receipt now counts as a survey
    and discovery round only; each material video needs an
    `audit_youtube_video_community` receipt, as the ledger builder already
    required.
- **Codex review of 99a2c2a** (two P1s, one P2, all fixed): each was a way a
  stopped scout could leave its stored Gemini interaction behind, or spend.
  - The MCP zero-spend gate (`ASKRIGOR_GEMINI_BILLING=none`) applied only to
    new scouts, yet a resumed first interaction can start a repair request.
    Resumed scouts now pass the gate too; a refused one has its stored
    interaction deleted.
  - Without a Gemini key the refused scout's delete was skipped and its
    checkpoint dropped. A resumed scout now keeps its checkpoint
    (`held_by` in the executor's progress) while the delete has not
    succeeded or a provider key is missing; the MCP tool says the scout is
    on hold and to continue with the survey.
  - An expired continuation token was rejected before its stored interaction
    could be deleted. A token whose signature verifies still carries its
    state, so the tool deletes the interaction before reporting the expiry,
    and asks for the same token again if the delete failed.

## Option A: coverage ledger built from signed receipts (owner-chosen 2026-09-27)

Problem: in the 4d4fae8 smoke run the model wrote four
`assess_treatment_landscape_coverage` ledgers of 95 to 151 KB, about 39 of
152 minutes. Candidate videos took 35–38% of each ledger, program details
19–24%, copies of audit results 13–15%, discovery batches up to 9%.

Design (MCP only; the Custom GPT Action keeps the full ledger):

- The model passes its research receipts plus judgment only:
  - treatment classes and program fingerprints, as before;
  - which discovery rounds targeted which classes (`rounds`), with the exact
    executed queries where a round serves as a specific-program search;
  - selected videos with their four short texts;
  - screened but unselected videos with fingerprint, materiality and
    omission reason;
  - not-material videos as ID lists per class;
  - specific-program searches as round, class and terms;
  - directional search states and access boundaries, as before.
- The server derives everything mechanical from verified receipts for the
  same research target:
  - one discovery batch per round, in signed issue order, with its access,
    pagination and videos; its classes are the mapped classes plus those of
    the videos it found;
  - every candidate video with its batch links and the audited channel;
  - each selected video's discussion receipt, from the extended signed audit
    receipt (counts, flags, coverage, channel);
  - the scout frontier from scout receipts, which now sign unresolved and
    rejected IDs; scout candidates take the model's screening;
  - specific-search candidates by class and described components. The
    queries the model supplies must match the round's signed query digest.
- Every discovered video must be screened. An unscreened one enters as
  `uncertain` with an omission blocker (a breadth gap, as the full ledger
  would give), and an unscreened scout candidate blocks as before.
  Server-made records (an unassigned class, per-class not-material programs)
  are `not_material`, so they never satisfy a material check.
- Problems in the compact input (a video no receipt found, queries that do
  not match their digest, a listed video twice) are record blockers and
  force `continue_research`.
- The existing checker runs unchanged on the built ledger, so every check it
  enforced still applies.

Expected size: 100 candidates and 15 selected videos take about 15 KB instead
of about 70 KB; with classes and programs a full check is about 55–60 KB
instead of 95–151 KB. A later step can keep the ledger between calls.

## Rerun on 4fe4858 with option A (2026-09-27, 16:05 to 18:38 UTC)

- 154 minutes and 266 tool calls (smoke run on 4d4fae8: 152 minutes, 313
  calls). Claude Code's API-equivalent estimate: $43.86, on the plan, so no
  spend.
- Time before each call:
  - comment audits: 62 minutes over 40 calls, 6 of them in the tool;
  - five coverage checks: 31 minutes, about 6 each (about 10 before);
  - the answer: 6 minutes.
- Coverage checks under option A: inputs of 22 to 63 KB (95 to 151 KB before);
  every receipt verified, no input problems. Each still returned
  `continue_research`, on 4 to 23 problems in fields the model writes by hand:
  access boundaries (the YouTube search cap written as both retryable and
  terminal, then as a terminal rate limit), specific-search terms missing
  from the executed query, and once a dropped screening list. The model
  audited more videos instead (78 single-video `get_youtube_video` calls for
  screening), and `finalize_research` ended `not_ready`; the model answered
  anyway.
- The answer found new options through the rediscovery loop (carnivore or
  low-carb diet, collagen, turmeric, glucosamine, embolization); still no
  gelatin or hydration.
- Blind judges (Opus 5.5 at max effort, web spot-checks, seed 1), low
  confidence both times:
  - e1176f8 beat 4fe4858 overall. 4fe4858 won options, heterodox judgment
    and safety; appraisal tied; e1176f8 won usefulness.
  - 4d4fae8 beat 4fe4858 overall. 4fe4858 won appraisal; options,
    heterodox judgment and safety tied; 4d4fae8 won usefulness.
  - Both judges cited clutter: the internal action map under its
    `REQUIRED_NOW`/`CONTINGENT_LATER` labels, "R-level: R3" (HRP's oversight
    level, misnamed as "first-pass review"), attribution tags on every item,
    and a pasted `DeepForumAuditActivationPrompt`. HRP already keeps the
    first three internal (line 1243, the output rules near line 4466, FS190);
    the prompt is a Critical HRP rule.
- Next:
  - `finalize_research` checks the answer draft for leaked internal labels,
    and that an executed comment lane is present (server enforcement of
    existing HRP rules): built, see "Answer-draft check" below;
  - server-derived access boundaries for discovery rounds: built, see
    "Access limits from receipts" below;
  - owner question on the pasted deep-forum prompt: answered at 19:14 UTC
    and built as HRP 20.6.5 (decision 10 above).

## Owner error report: YouTube lane dropped from the answer (2026-09-27)

A sermorelin question ("does it work for sleep and digestion, what are the side
effects") ran `audit_youtube_community` with five directional searches: 10
candidates, 3 videos, one with 233 comments and replies, complete, lock
`pass`. The result was about 63,000 tokens and the client truncated it. PubMed,
FDA and Reddit searches followed, and the answer never mentioned YouTube.
Afterwards, zero hits from `search_youtube_comments` were read as "no YouTube
signal", which HRP already forbids. Fixes (server enforcement of existing HRP
rules, no protocol change):

- **Size.** On MCP the one-call audit returns compact records (pseudonymous
  author key, no names or channel IDs) within one 40,000-byte budget shared by
  its videos; manifests, hashes and the receipt still cover every record. The
  Custom GPT Action keeps the full audit.
- **Lock meaning.** Completed audit results now say the synthesis lock covers
  comment retrieval only, and ask the model to note what the comments show for
  `finalize_research`.
- **Carry-through.** `finalize_research` requires `community_findings`
  (benefit, no-effect and adverse reports, creators versus commenters, effect
  on the answer) whenever a comment audit ran, covering exactly the videos the
  audit receipts name, and returns it in `must_report` (also in the result
  text), so the lane is restated right before the answer, even when weak.
- **Zero matches.** `search_youtube_comments` results carry
  `absence_inference_permitted: false`, and their text says zero or few matches
  are no evidence about the other comments.
- Regression tests: the gate refuses a run whose comments were read without
  findings and returns a weak lane in `must_report`; a three-video, 1,500-record
  audit stays under 40,000 bytes on MCP; the comment search result carries the
  non-evidence flag.
- Codex on baf32b2 (one P1, one P2, both fixed): a video whose comments were
  disabled was counted as read, so findings were demanded for it and
  `must_report` claimed it was read. Findings are now required only for
  per-video audits that retrieved comments and for the videos a one-call audit
  read, which its receipt now signs (`read`); a listed boundary video is
  allowed but not counted. Separately, long echoed queries, the research
  question and video metadata could push even a zero-comment view past 40,000
  bytes; the MCP view shortens them, and a view that still cannot fit is an
  explicit `youtube_community_audit_response_too_large` error, never an
  oversized result.
- Codex on 2fdd6df (three P2s, all fixed): the 40,000-byte budget now covers
  the whole MCP result, text and receipt included (the view alone had been cut
  to it, and the regression test's result reached 40,930 bytes). The one-call
  receipt's `read` names only videos whose comments the view returns; when not
  even one comment per video fits, the text says to read them with
  `audit_youtube_video_community` instead of asking for findings. A later
  complete audit that finds no comments no longer erases an earlier audit's
  positive count, in either receipt order.
- Codex on 09c1efd (P2): a per-video view could still exceed the budget with
  no comments at all (a large continuation token, hundreds of reply-count
  mismatches). The view lists 20 mismatches with a stated limit, and a view
  that still cannot fit returns
  `youtube_video_community_audit_response_too_large`, never a cut result.

## Access limits from receipts (2026-09-27)

In the option A rerun, every coverage check returned `continue_research` in
part because YouTube's daily search cap stopped discovery rounds, and the
checker required a rate-limited boundary to stay retryable while treating any
retryable boundary as unfinished work: the model could not state the cap as a
limit (it wrote it as both retryable and terminal, then as a terminal rate
limit). Now:

- The checker treats a round stopped by a rate limit or daily quota like one
  with an unread page: an open lead in a first pass, still blocking in deep
  research. This follows the owner-directed first-pass rule; the 4fe4858
  answer already listed "results after the search limit resets" as a lead.
- The receipt-built ledger states a round's boundary from its receipt: a rate
  limit or quota (retryable once it resets) or a refusal or missing resource
  (terminal). A boundary the model supplies for such a round is set aside;
  it still supplies boundaries for rounds that are partial or failed for
  other reasons, and for videos and classes.
- Survey and one-call community audit receipts count incomplete and
  rate-limited searches (`inc`, `rl`), and a one-call audit signs its
  searches' access apart from any comment boundary.

## Answer-draft check (2026-09-27)

Both blind judges of the option A rerun marked the answer down for text HRP
already forbids: `REQUIRED_NOW`/`CONTINGENT_LATER`, lock and retrieval terms,
and a pasted deep-forum prompt. The sermorelin answer also dropped the YouTube
lane. `finalize_research` now takes `answer_draft`, the answer about to be
given, and reports `ready` or `ready_with_limits` only after reading it:

- snake-case labels (action-map labels, retrieval and error codes, tool
  names), receipt or lock names, and the canonical protocols' own rule,
  module and case names (745 compound names such as
  `DeepForumAuditActivationPrompt` and `NNTAndNNH`, read from the XML once per
  process), outside links (`ReaderFacingAnswer`, FS190);
- a video named by bare ID instead of a linked title (FS190): any discovered
  or audited video, and any mixed-case 11-character token with a digit or
  underscore;
- the full deep forum-audit template pasted into the answer (HRP 20.6.5);
- when comments were read, a YouTube comments section that leaves out any of
  `must_report`'s benefit, no-effect and adverse reports, how creators differ
  from commenters, or what the comments mean for the answer (each must be
  reported, or said to be absent; the last in words answers use for it, such
  as "supports" or "does not change the answer", or in the words of the
  findings' own `effect_on_answer`).

Each finding is a next step, so the model fixes the draft and calls again.
Replayed on saved answers: main, e1176f8 and 6e2763d pass; 4d4fae8 goes back
for 23 bare video IDs; 4fe4858 for `REQUIRED_NOW`, `CONTINGENT_LATER`,
`OPTIONAL_ALTERNATIVE`, `research_depth`, `finalize_research` and
`DeepForumAuditActivationPrompt`, the same defects the blind judges cited.
Links keep their IDs and underscores; R-levels stay allowed (the answer footer
lists them). The draft is read in memory for that call only, never stored,
logged or returned (privacy map). The server instructions and the tool
description ask for it. The runner records whether each call passed a draft
and whether the final answer is the last checked draft. Cost: one more
`finalize_research` call when the first omits the draft.

- Codex on cf2f720, 25a8742 and bc5f8de (four P1s, four P2s, all fixed):
  - Any mention of YouTube had satisfied the lane check; each comment finding
    must now appear near the section that mentions YouTube comments.
  - Protocol names with acronym runs (`COINotAutomaticDisqualification`) were
    missed; the draft's capitalized tokens are matched against the loaded
    names directly.
  - The scout's title lookup merged distinct titles by word overlap, so a
    second video was never searched and not counted as open; only exact
    title-and-channel repeats are merged now.
  - A per-video receipt signed the comments retrieved, not those its view
    returned (`shown`), so findings were demanded for comments the model never
    saw.
  - Page one of a search stayed open after page two was read. Search, survey
    and one-call receipts now sign the page they read (`pg`) and the page they
    left (`nx`), each as the query's 12-hex digest plus YouTube's page token,
    and a later page settles the one before it; a page that failed to load
    settles nothing.
  - CodeQL on b5078c9 (`js/insufficient-password-hash`, high): the first
    version signed a SHA-256 digest of the page token. CodeQL's name heuristic
    treats a call with an argument matching `api.?key` as returning a
    password, so `searchError("youtube_api_key_missing", …)` made every
    YouTube search result a "password", and hashing its page token an
    insecure password hash. No credential was involved. The receipts now sign
    the token itself, after the digest of the caller's own query (never a
    hash of result data), as they already sign result video IDs and access
    states.
- Codex on b5078c9 (one P1, one P2, both fixed):
  - The lane check did not ask what the comments mean for the answer, which
    `must_report` lists; it does now (above).
  - A background scout whose packet needed repair was charged from its
    30-search ledger, so without the provider's search count a run of 72 or
    more searches passed as 30 and escaped the $1 refusal. The repair
    checkpoint now carries the full count (`executed_search_count`, optional
    so stored checkpoints from before it still load).
- Codex on d280f31 (one P1, one P2, both fixed):
  - Scout identity accepted a paraphrased title even when the channel also
    differed, so "How I healed back pain" could validate an ID declared as
    "How I healed hip pain". Without channel agreement only a nearly
    identical title (the rule the title lookup already used, now shared as
    `youtubeTitlesNearlySame`) vouches for the ID; a partly matching title is
    a title conflict, which the MCP tool looks up by the declared title.
  - A v2 packet needed three ID-backed candidates and an ID-backed seed, so a
    scout whose search results showed few watch URLs failed before its
    title-only finds could be looked up. Title-only finds now count toward
    the three-video floor, a seed is needed only when there are ID-backed
    candidates, and a packet with none validates as accepted with an empty
    frontier (the Custom GPT session then continues without re-running the
    scout). The committed Action OpenAPI does not change.
  - Rounds a rate limit or the daily quota stopped were unsigned or counted as
    settled. They are now signed with their limits (`inc`, `rl`), including a
    wholly stopped survey or search and a one-call audit left incomplete. An
    incomplete search keeps discovery open: rerun in deep research; in a
    first pass a rate-limited one ends the pass as an open lead, and the
    answer says the limit stopped it (not that evidence is thin).
- Codex on 64869b5 (two P1s, both fixed):
  - Only the MCP scout tool read the zero-spend flag
    (`ASKRIGOR_GEMINI_BILLING=none`), so the Custom GPT Action and research
    sessions could still start or resume a Gemini scout on a billed key. The
    shared scout executors now check it. Without it the Action and sessions
    report `gemini_provider_not_configured` and continue with the YouTube
    survey, and a resumed scout's stored search is deleted.
  - The answer check never looked for the limits the gate listed, so a draft
    could drop "provisional", "not read in full" or the open leads and still
    pass. Each listed limit now carries a plain-words check, and the draft is
    sent back naming any it leaves out. A first pass must name each open lead
    and offer to continue. Every limit sentence passes its own check.
- Codex on a756cb7 (three P1s, all fixed): the limit checks still accepted
  matching words anywhere in the draft. "There was no quota problem" passed the
  rate-limit caveat; naming the open leads with a generic offer passed without
  their reasons or cost; one lead-only study's caveat covered every other lead.
  Each limit is now checked where it applies, sentence by sentence (a heading
  joins the paragraph after it):
  - a community limit shares a sentence with a mention of the community
    evidence;
  - the rate-limit caveat needs a sentence naming the limit (not "no quota" or
    "never hit the quota"), with it or its neighbor saying searches were
    stopped and that another pass can rerun them;
  - a lead-only study's caveat sits in the sentence that cites it by link or
    identifier (its DOI, PMID or PMCID, including those its PubMed record links),
    or in the next one unless that cites another key study; a video's caveat
    likewise sits beside its link;
  - each open lead is named with its reason (words from its `why`), and the
    answer says roughly what another pass would take (minutes or searches)
    and offers to continue.

  Two word lists were loose as well: "a few commenters" counted as saying
  community evidence is thin, and "some searches found" as saying the picture
  is incomplete. A lead whose topic has only short words ("tai chi") is named
  by its whole text, so it can be met. The `finalize_research` description now
  says the limits are checked where they apply. Ten mutations, one per
  binding or pattern, each fail a test.
- Codex on d5daf1e (three P1s, all fixed):
  - The pattern checks still took a denial as the caveat ("YouTube's quota did
    not stop any searches, but another pass can rerun them"), and matched the
    lead "PRP for hip pain" on "pain" alone. This was the third round of
    counterexamples to reading the model's own wording, so the answer no longer
    words its limits itself: the server writes each limit's caveat for the
    user (`caveats` in the result), and the answer must contain every caveat as
    written. The check compares text after ignoring spacing, case, quotes,
    dashes and emphasis, and a link by its target, so a video or study can keep
    its title as the link text. Open leads become caveats built from their
    topic and `why`, and a new input, `another_pass_estimate` (a number and a
    unit), gives what another pass would take. The sentence-level matching
    from d5daf1e is gone; the change removes 89 lines net.
  - A DOI-only full-text attempt was accepted as a lead even when a PubMed
    record linked the study to an open PubMed Central copy. That copy must now
    be tried (`acquire_open_full_text` with its pmcid) before the study is a
    lead.
  - The server instructions and skill now say to copy the caveats (the
    instructions stay at 2,047 of 2,048 characters).
  - Found in review before pushing: the first link pattern backtracked, so a
    draft of 20,000 "[" characters took about half a second (the 60,000
    allowed would take seconds). The pattern is now bounded and closed to
    brackets and parentheses, and reads such drafts in about a millisecond; a
    test pins it. A DOI's parentheses are percent-encoded in its link.
- Codex on 2f039e3 (one P1, fixed): the caveat could sit inside a denial
  ("It is false that …") or a quotation and still count. A caveat now counts
  only as a sentence of its own: it begins a paragraph, list item or heading
  (markers set aside) or follows a sentence's end, and it ends its sentence.
  A quotation block keeps its marker, so a quoted caveat does not count, and
  a wrapped line joins its paragraph. Four mutations, one per boundary rule,
  each fail a test. A later sentence that contradicts a caveat is not
  detected; the check guards against omitted and garbled limits, not a
  model arguing against them.
- Codex on 9d2a4ef (one P1, fixed): the caveat check stripped backticks, so a
  caveat shown as code still counted. Text an answer shows without stating
  is now left out before matching: fenced and indented code blocks, inline
  code in single or double backticks, and HTML comments (not displayed at
  all). An indented paragraph under a list item still continues it. Each
  exclusion reads a long draft in linear time; five mutations, one per rule,
  each fail a test.
- Codex on 9bb7d47 (one P1, fixed): inline code was matched with one or two
  backticks only, so a caveat in a four-backtick span still counted. Inline
  code is now found as CommonMark defines it: a run of backticks opens a span
  that the next run of the same length closes, and a run with no match is
  literal. Runs are paired in one pass, so any draft is read in linear time.
  A line that opens with inline code (three backticks, with more backticks
  later on the line) is no longer taken for a code fence, and a fence closes
  only on a line with nothing after its marker.
- Codex on dfa1f19 (one P1, fixed): lines were trimmed before fences were
  recognized, so a closing fence indented four spaces ended a code block that
  CommonMark keeps open. Indentation now decides, measured in columns (a tab
  reaches the next multiple of four). At the top level a fence opens or closes
  only within three spaces, and four spaces start indented code, as CommonMark
  says. Inside a list the parser does not track each item's content offset, so
  it fails closed: a fence opens at any depth and closes no deeper than it
  opened, a paragraph six or more spaces in is code, and list markers start
  nested items at any depth. Where it cannot tell, text counts as code; a
  caveat always counts as a plain paragraph. Five mutations each fail a test.
  A Markdown library was considered and not added: the usual choice has had
  regular-expression slowdown advisories, and this parser is linear.
- Codex on fd599dc (one P1, fixed): the fixed six-space rule inside lists let
  a caveat through that CommonMark renders as code: after `100. Search log`
  and a blank line, four spaces do not reach the item's content, so the line
  is top-level indented code. This was the eighth round of corner cases in a
  heuristic parser, so the parser was replaced rather than patched.
  - `apps/research-mcp/src/displayed-prose.ts` ports the line-by-line
    container matching of CommonMark's reference implementation
    (commonmark.js): block quotes, list items with their own content offset
    (marker offset plus marker width plus spaces), the empty-item and
    paragraph-interruption rules, lazy continuation, fences closed with their
    container, setext and ATX headings, and all seven kinds of HTML block.
  - Inline: code becomes a placeholder, raw HTML (comments, processing
    instructions, declarations, CDATA, tags and their attributes) is dropped,
    and an image ends its paragraph's prose, since its description is not
    shown. A paragraph that may open with a link reference definition is left
    out, and nesting past 64 levels fails closed, which also bounds the work
    at linear time.
  - The old parser counted 8 of the 9 new test drafts as stating the caveat,
    including Codex's case, a fence left open by its item, an HTML block, a
    link definition's title, a tag's attribute and a comment over a fence.
  - A differential test against commonmark.js 0.31 on about 594,000 random
    drafts with a marker word (list markers, fences, HTML, quotes, tabs,
    comments, images) found no draft where the gate counts text the reference
    hides. The first runs found two divergences, both fixed: the
    specification's text excludes `</pre>` alone on a line from the seventh
    kind of HTML block, but commonmark.js and micromark include it; and inline
    raw HTML other than comments (a declaration such as `<!X …>`, a tag's
    attributes) hides text too. About 6 to 7% of drafts go the other way (text
    left out that the reference shows), from the deliberate fail-closed
    choices above and backslash-escaped backticks.
  - All 25 earlier placement cases keep their results; 17 mutations, one per
    rule, each fail a test.
- Codex on ffb8760 (one P1, fixed): the YouTube-comments lane check read the
  raw draft, so the required words inside an HTML comment satisfied it. The
  checks that require text, the comments lane and the caveats, now read only
  the prose a reader sees. The checks that forbid text (internal labels, bare
  video IDs, the pasted forum template) still read the whole draft, which only
  makes them stricter. The lane leaves out quotations too, as the caveats do:
  it must be the answer's own report. Two mutations each fail a test.
- Codex on 76a455f (one P1, fixed): displayed prose kept Markdown link syntax,
  so the lane matched words in a link's hidden destination
  (`[details](/helped/no-effect/…)` shows only "details"); a link's title
  could likewise carry a caveat. Inline text is now read in one left-to-right
  pass in CommonMark's order: code, raw HTML, images and brackets, whichever
  starts first, with a link's destination and title read from the source when
  its closing bracket is reached (the first version handled code and HTML
  before links, which read an angle-bracket destination as a tag; a unit test
  caught it). Links are marked: the lane reads only their text, and the caveat
  check binds each link by its destination, with whitespace encoded so a
  destination can never supply caveat words. Titles and reference labels are
  dropped; nested and undefined-reference cases fail closed; a work budget
  keeps hostile brackets linear. A differential run with link constructs
  (about 355,000 drafts) found no text counted that commonmark.js hides; 8
  mutations each fail a test.

## Comment-audit call budget (2026-09-27)

- Each per-video audit call requests the replies of every top-level comment,
  so the 50-request cap covered about 49 comments per call. In the 4fe4858
  rerun, 21 audit calls had covered six videos when checked; a 723-comment
  video took 7 calls and was still unfinished. The model reasons between
  calls: 20 to 230 seconds per gap in that run.
- Measured on a 91-comment video: 50 requests took 6.4 seconds, so the
  request cap binds, not the 15-second budget (about 0.12 seconds a request).
- MCP calls now read for up to 40 seconds and 300 requests, inside the 60
  seconds Claude waits for a tool; the Custom GPT Action keeps 15 seconds and
  50 requests. Codex (on 75403a7) found that one client could then hold all
  16 public MCP permits for 40 seconds and drive about 120 YouTube requests
  a second, so only two calls at a time get the longer budget and the rest
  read with the Action's. The 91-comment video now completes in one call (7.7 seconds)
  instead of two (8.3 seconds). Measured after the rerun: the 723-comment
  video completes in 2 calls (32.1 and 8.3 seconds, 723 records), where the
  rerun had taken 7 calls to reach 641 records.
- Reply requests are still sequential; running them in parallel is a later
  option.

## Speed and community scope (2026-09-29)

Owner direction, 29 Sep: answers take too long; if YouTube scouting cannot be
made much faster, keep most of it optional, give a short first pass, and end
by offering deeper study or community research with focus questions. The
owner also filed a bug report: a comparative-safety question ("How much
healthier is injecting HGH vs testosterone?") was answered after a YouTube
audit alone, because the YouTube receipt said `synthesis_lock: pass` and no
check looked beyond YouTube (HRP PrincipalPlatformMapping,
MultipleIndependentCommunities, ActualSearchRequired).

Where the time went (runner metrics, hip question, Opus at max effort, one
run each; model time is the gap before each call):

| Version | Wall | Tool calls | Waiting on tools | Before comment audits | Before coverage checks |
|---|---|---|---|---|---|
| main | 19 min | 89 | 2 min | 2 min (17 calls) | none |
| e1176f8 | 27 min | 145 | 4 min | 5 min (20 calls) | none |
| 6e2763d | 111 min | 212 | 13 min | 30 min (61 calls) | 25 min (5 calls) |
| 4d4fae8 | 152 min | 313 | 10 min | 43 min (82 calls) | 39 min (4 calls) |
| 4fe4858 | 154 min | 266 | 9 min | 57 min (40 calls) | 31 min (5 calls) |

- Tools were rarely the wait; the model's steps were. Continuation pages of a
  long video's comment audit each returned the growing sample again (about
  38 KB a page), and the audits alone returned 1.9 MB to the model in 4d4fae8.
  Protocol pages added 0.4 MB there (48 calls).
- The last two runs also audited 30 videos where main audited 16, and the
  coverage checker took about 6 to 10 minutes of model time per call.

Built now (no method change):

- The per-video audit's MCP view sends the comment sample once, with the last
  page or when the chain stops, instead of on every page.
- YouTube results on MCP name their lock for what it covers:
  `video_comments_lock` and `youtube_comments_lock` with a `scope` sentence
  (YouTube only; not other communities, not research completion). The Custom
  GPT Action keeps its full result. Tool descriptions and server instructions
  say YouTube covers YouTube only and ask for the dominant community and an
  independent one, searched on the client's own web search.
- `finalize_research` takes `principal_communities` (the map, dominant first)
  and `community_searches` (queries, public threads read, findings or an access
  boundary). Community research is not done until the dominant community and
  at least one independent one are searched (YouTube counts once, however many
  entries name it), or a single-community reason is stated as a limit. YouTube
  checks apply only when YouTube is the dominant community or was researched. Each
  community read reaches `must_report`, and the answer must name it.
- Regression: the HGH versus testosterone case in the gate tests.

Codex on 79394c9 (three P1s, fixed in the next commit):

- A bare mention of a community passed the answer check. Each community read
  now needs its own lane, as the YouTube comments do: benefit, no-effect and
  adverse reports and what they mean for the answer, near its name.
- A search counted for a mapped community by name alone, so a "forum" named
  r/trt stood for the subreddit. The platform must match too.
- Searches on the client's own web search carry no receipt, so the server
  cannot prove they ran. They now make the result explicitly partial: the
  answer links a thread it read from each community and says AskRigor could
  not verify those searches, and the finalization receipt signs how many
  communities were unverified. A server-side search (a Gemini forum scout,
  like the YouTube scout) would make them verifiable; that is owner question 3.

Codex on 77f1bf4 (fixed in b77880d): each community's lane, thread link and
threads are bound to that community. A lane runs from the paragraph first
naming it to the next one naming another community read; its link must sit in
it; Reddit threads go under their own subreddit, named r/<name>; one thread
counts for one community.

Codex on b77880d (three P1s, fixed in the next commit):

- Rounds whose searches failed counted toward the first-pass cap of four
  rounds. Only completed rounds count now; a rate limit still ends a first
  pass as an open lead. The coverage checker had the same gap and now counts
  only complete or rate-limited batches.
- A subreddit's front page, wiki, search or share link passed as a thread
  read. A Reddit entry now lists threads only (`/r/<name>/comments/<id>`).
- Two links to one thread (a fragment, tracking parameters, another slug, a
  comment permalink, a short link) counted as two threads. Links now compare
  without those, and a Reddit post compares by its id; other query parameters
  stay, since they may be what names a forum thread.

Owner question 2, approved 2026-09-29 ("2. approve shorter first pass"),
built as HRP 20.6.6 with the five changes exactly as worded on the owner page:

- A first pass stops at about three fully audited videos or two rounds (was
  six and four) and also briefly searches the dominant community and an
  independent one, not only YouTube (BroadDiscoveryBeforeDeepAudit, FS188,
  the FourDistinctVideosPresentedAsBroadCoverage case). The gate, the coverage
  checker, the skill, the Project router and the Forum Signal module follow.
- A first pass does not run the treatment-coverage lock: a comparison needs no
  `assess_treatment_landscape_coverage` call, and `finalize_research` requires
  it to be presented as provisional, with no final ranking. Deep research keeps
  every block. The coverage tool's description says it is for deep research.
- After a first pass of research (community evidence researched, or a key study
  checked), `open_leads` carry a `direction` (studies or community), at least
  two per direction, and the answer must carry each focus as a sentence ("Study
  focus: ...", "Community focus: ...") and close with "Another pass would take
  ...; would you like to go deeper into the studies or the communities, and
  which focus matters most to you?" (HRP LimitsNote). This is what should make
  the deeper-research proposals the owner stopped seeing appear on every first
  pass.

Owner question 3 (a server-side forum check), 29 Sep: the owner doubts a Gemini
forum scout (quick passes, confabulation) and asked for a cheaper test. Tested
from this cloud container at no cost: Reddit's JSON pages answer "You've been
blocked by network security" (old.reddit asks for a login), MESO-Rx serves an
Incapsula bot challenge and ExcelMale returns 403; this session's web search
tool cannot reach reddit.com at all. Reddit's public embed endpoint does work
without an account: it returns a thread's real subreddit and title, or 404. A
made-up r/trt link came back as a post in another subreddit. Offered: (A) the
server checks each cited Reddit thread's existence, subreddit and title there
(free, no account); (B) later, a registered Reddit API app so the server can
read whole threads. The Gemini forum scout is dropped.

The owner answered on 29 Sep: "3. yes, chatgpt uses reddit fine, so we can
keep reddit as a chatgpt feature". Built as (A), with no registered Reddit app
(3b58ff8): `finalize_research` on MCP looks up each Reddit thread in
`community_searches` at `https://www.reddit.com/oembed?url=<canonical thread>`
(each post once, at most 40, 5-second timeout, eight at a time). The reply's
embedded link gives the thread's real subreddit, and its title is compared
leniently; the poster's name is discarded and nothing is kept. A thread Reddit
does not have (404), files under another subreddit, or titles differently goes
back as a next step; any other failure proves nothing and leaves the community
unverified. A subreddit whose threads all check out gets its own caveat: Reddit
confirmed the threads exist, but what they report is the assistant's own
reading. `www.reddit.com` joins the upstream allowlist for this endpoint only,
and the privacy map says what is sent. From this container Node's request to
reddit.com was refused by the egress policy ("Blocked by egress policy"), while
curl through the configured proxy got a 200, so the parser is tested on the
reply captured at 17:12 UTC; the lookup runs live from production at deployment.

Rerun on 733bf68 (HRP 20.6.6, web search on), 29 Sep 17:41–18:09 UTC, Opus 5.5
at max effort, one run:

| Version | Wall | Tool calls | Waiting on tools | Model time |
|---|---|---|---|---|
| main | 19 min | 89 | 2 min | about 17 min |
| e1176f8 | 27 min | 145 | 4 min | about 23 min |
| 4d4fae8 | 152 min | 313 | 10 min | about 142 min |
| 4fe4858 | 154 min | 266 | 9 min | about 145 min |
| 733bf68 | 28 min | 111 | 7 min | about 21 min |
| 380243e | 30 min | 120 | 5 min | about 25 min |

- Most model time went to writing the answer before its two
  `finalize_research` calls (7.3 min), study method audits (6.5 min) and
  comment audits (2.2 min); 35 protocol pages cost 0.7 min. No coverage check
  ran.
- The flow worked: the map named YouTube, r/hipreplacement, BoneSmart and Mayo
  Clinic Connect; Reddit was recorded as blocked (Claude's search cannot reach
  it); the forum lanes came from search-result summaries, which the model said.
  The first check sent back four steps (adverse reports missing from three
  lanes, caveats left out); the second passed (`ready_with_limits`). The answer
  ends with three study focuses, three community focuses, an estimate ("about
  30-40 minutes, about 12 YouTube searches, and 4-6 full-text audits") and the
  question.
- Defect found: the two largest discussions (about 1,200 and 700 comments)
  failed their audits with no records. Behind this container's proxy a reply
  request stalled until the call's 40-second deadline, and the segment code
  treated the timeout as an unknown error, dropping everything it had read.
  Fixed after the run: a timed-out or dropped request returns what was read
  with a cursor to retry it, and one request waits at most 10 seconds (the
  same videos then returned 323 and 186 comments per call through the proxy).
  Production does not use this proxy, but a stalled request anywhere had the
  same effect.
- Blind judges (Opus 5.5, max effort, web spot-checks; medium confidence):
  e1176f8 beat it overall (options, safety, usefulness; it won appraisal and
  heterodox judgment), and 4d4fae8 beat it overall (all but appraisal). Every
  citation spot-checked in all three answers was supported. Both judges faulted
  the same gap: the first pass left walking aids, weight loss and pain
  medicines unresearched ("I also didn't research ...") and listed them as a
  study focus, so a person who can barely walk got little for pain now; its red
  flags also missed spinal and clot signs. HRP's option-space rules already
  require those classes; the shorter pass made the model defer them instead of
  covering them briefly. The "garbled AskRigor line" both judges noted is the
  judge's own redaction of the protocol names in the attribution line.

Codex on 4640a2e (one P1, two P2s): a first-pass draft could still name a best
treatment, so `finalize_research` now sends back a draft that ranks the options
("is the best option", "your best bet", "top pick", "clear winner", "comes out on
top", "best overall") in every first pass and in deep research the coverage
check left `bounded_nonranking_only`; post-locator parameters (`p`, `pid`, `f`,
...) no longer split one forum thread when a thread id is present (e0ab19f). The
P2 asking for both directions when community evidence is not relevant was
answered as not changing: the pass left only the study direction open.

Codex on ec8dbd9 (one P1, fixed in e4d091f): a hedge anywhere in the sentence
excused every ranking in it ("Although it is too early to say whether exercise
lasts, surgery is the best option."). A hedge now excuses only a ranking that
ends after it in its own clause; a clause ends at a semicolon, colon, dash or
parenthesis, at a comma joining another clause (", but", ", surgery is"), and at
the comma closing a leading subordinate clause, but not at a list comma.

Coverage reminder (380243e, no method change): HRP's option-space rules already
require the standard option classes and red flags, but the 733bf68 answer left
them to "go deeper". The skill and the `open_leads` description now say focuses
deepen what the answer covers and a first pass still covers every plausible
option class and the red flags briefly. A rerun on 380243e checks whether the
gap closes.

Rerun on 380243e (the coverage reminder, web search on), 29 Sep 18:27–18:57
UTC, Opus 5.5 at max effort, one run (row above; tool time is the sum of call
durations, as in the other rows):

- Model time went to writing the answer before its two `finalize_research`
  calls (8.6 min), study method audits (4.0 min), protocol pages (2.7 min) and
  comment audits (2.7 min). The Gemini scout ran five times; six comment
  audits all completed (the segment fix held). Two discovery rounds, first pass
  complete; the first check sent back four steps (the YouTube comments lane,
  two forum lanes' missing report types, left-out caveats), the second passed
  (`ready_with_limits`). Claude's web search refused reddit.com twice, as
  expected; PubMed failed from this container (four searches, one record) and
  the model used Europe PMC.
- The answer now opens with when to get seen today, checks the diagnosis,
  and covers a cane or walker, weight loss, pain medicines and a steroid
  injection as a bridge before the weaker options and surgery, then a dated
  plan, questions for the surgeon, three study and three community focuses,
  and the question. No ranking phrase.
- Blind judges (Opus 5.5, max effort, web spot-checks; medium confidence):
  it beat e1176f8 overall (appraisal and heterodox judgment; safety and
  usefulness tied; e1176f8 won options with a concrete exercise protocol and
  pain rule). 4d4fae8 (the 152-minute run) still beat it overall (all but
  appraisal): broader options (nerve ablation, resurfacing, duloxetine,
  gels, structured cycling and pool programs), blood-clot signs in the red
  flags, and the randomized injection trial. Every checked citation was
  supported; one figure (75% vs 38% reaching an 8-point gain in PROHIP) could
  not be checked against the abstract. The judge also counted the three
  identical "full text was not openly available" caveats as boilerplate.
- Reading: the reminder closed the gap to the best fast version at about the
  same time (30 vs 27 minutes); the 152-minute run's breadth is what a deeper
  pass is for. Candidate next step: one caveat naming all lead-only studies
  instead of one sentence each.


Held-out check (owner answer to question 4, 29 Sep: "4. you can start with 2 more
questions"), fixed before any held-out answer exists:

- Questions: `ho-knee-cartilage` (a joint question like the hip) and
  `ho-hashimotos-fatigue` (not a joint question), chosen before any held-out
  run. The other four held-out questions stay unused.
- Arms: the new version at the frozen PR head (its exact ref recorded) and the
  live version (`main`), both Opus 5.5 at max effort with web search, the same
  runner, one run each. The two arms of a question run on the same YouTube quota
  day, so neither is starved by the daily limit; a run that hits the limit is
  discarded and rerun after the reset (07:00 UTC). Each run records the
  YouTube Data API requests its server sent and their quota units
  (`metrics.youtube_api`, counted in the runner since 29 Sep), so a pair's quota
  use is counted rather than guessed.
- Grading: the same blind judge as the development runs (`judge-claude.mjs`,
  Opus 5.5 at max effort, web spot-checks, seed 1): answer order randomized from
  the seed and the answers, protocol names redacted; a winner or tie overall and
  on options, appraisal, heterodox judgment, safety and usefulness, with
  confidence, the errors in each answer and checked citations. Time, tool calls,
  tool waiting and the final check's result are measured separately.
- Decision rule: the new version passes if it loses on safety in neither
  question and does not lose overall in both. One overall loss is reported with
  its reasons but does not block alone. Two questions with one run each can show
  a large regression, not a small difference; the judge shares the answering
  model's family, which blinding and citation checks only partly offset.

## Checks that work in any language (owner correction, 2026-09-29)

The owner asked why the checks were hardwired to English ("not everyone speaks
english"). Besides the title matching replaced earlier the same day, the answer
check read English words in four places. Each now works in any language, or is
gone with its limit stated:

- Community lanes. Word lists looked for benefit, no-effect and adverse reports,
  creators and "what this means for the answer" near a mention of YouTube or a
  community's name. Now the model copies, for each finding, the sentence(s) of
  its answer that report it (`answer_quotes` in `community_findings` and in each
  `community_searches` entry), and the gate checks that the displayed answer
  shows them. Case, spacing, emphasis and a link's text or target don't matter.
  A community beyond YouTube also needs a link to a thread read there, in a
  paragraph holding its quotes. Whether a sentence reports its finding is the
  model's call. That is the tradeoff: a false quote is a deliberate false
  statement, not an oversight, and forgetting (the failure behind the owner's
  sermorelin report) is still caught.
- Caveats. The gate still writes each caveat in English. An answer not in
  English states each one in its own language and gives that sentence in
  `caveat_renderings`, with `answer_language`. The gate checks that the sentence
  stands on its own (Unicode sentence-ending marks, so 。, ؟ and । count, with or
  without a space after them) and keeps the caveat's links. It cannot check the
  translation, and renderings count only when a language other than English is
  declared, so an English answer still carries each caveat as written.
- Ranking. The English word list that caught a first pass naming a "best
  option" is removed: it took six review rounds of fixes and still could not
  cover a paraphrase in English, let alone other languages. The required caveat
  (the comparison is provisional and does not rank the options) stays. An answer
  that states the caveat and still ranks is now past the gate; its reader sees
  both.
- `another_pass_estimate` needs a number in digits of any script (not English
  number words).

What stays pattern-matched is structural: internal labels, bare video IDs, link
targets, the pasted template (our own strings), and Reddit's title (compared
exactly). Cost: the `finalize_research` definition grew by 1,942 characters
(compact JSON, about 1% of the tool catalog), and the model copies a few
sentences per lane when it passes its draft. The gate source is 60 lines shorter.
Tests cover Spanish, Japanese and Arabic answers, and a French answer through
the MCP tool.

## Owner regression report: geosmin (2026-09-30)

The live version (HRP 20.5.29, Universal 20.5.26, without this PR's final check)
answered a question about smelling geosmin or humic acid with "I found no
evidence that 'smelling humic acid' treats neuroinflammation". The owner's
report found six failures:
1. the wording hid which state applied: not located by the searches, a direct
   null result, or a bounded exclusion;
2. the mandatory community audit was skipped without a reason;
3. no module ledger ran before research;
4. only modern terms were searched;
5. the exposure was not decomposed (humic acid is barely volatile);
6. the user's strong effect did not redirect the search.

HRP already had the rules (NonexistenceVersusNotFound, NoWeaselSafetySubstitution,
ForumSignalDefaultTrigger, HistoricalVocabularyAndCitationBackchain); they were
not applied. The server now enforces what it can check in any language:

- **Absence claims.** Once the answer is passed, `finalize_research` asks for
  `absence_claims`: each sentence saying something was not found, not studied,
  or has no evidence or no effect, copied from the answer, with its state.
  - `support_not_located`: the answer must carry a server-written caveat. It
    bounds the claim to the databases searched, named from the signed
    literature-search receipts, and to the search classes not covered (older or
    variant terms, citation chains, grey literature, from `search_coverage`).
    With no literature search receipt, the gate asks for a search first.
  - `direct_null_evidence` or `bounded_exclusion`: the claim must rest on key
    studies audited in full text, and its sentence must give numbers (the
    estimate and its interval).
- **Community audit.** `not_relevant` now needs one of HRP's non-trigger bases:
  no real-world outcome (a definition, calculation, or chemical or mechanistic
  question), or an emergency before triage. Any other question is researched. A
  topic nobody discusses is searched and its access boundary recorded. The
  geosmin question asks about benefits, so it no longer qualifies.
- **Searches.** `search_pubmed`, `search_europe_pmc` and `search_clinical_trials`
  sign receipts (the database, the query's digest and the counts). A search
  with 10 or fewer records says what to try before calling anything not found:
  synonyms, older terms, the parts of a mixed exposure, citation chains.
  `search_pubmed` returns each PMID's title, journal and year, so a small result
  set can be triaged in full instead of sampled.
- **Small result sets come back whole** (the owner's small-result-set rule). A
  first page of `search_pubmed` or `search_europe_pmc` that stops short of a
  total of 50 or fewer records is fetched again whole, so every record is
  visible before anything is called not found. This costs one more provider
  call, and only when the first page asked for fewer than the total. If that
  call fails or takes more than 10 seconds, the first page stands with its
  cursor, so the call stays within the client's 60-second wait. ClinicalTrials.gov
  reports no total, so its pages stay as asked. Whether the model reads each
  title is not checkable.

Report tests:
- A (search-negative wording) and C (a sparse, cheap intervention triggers the
  community audit) are enforced.
- B (a null trial) is enforced only in part: audited studies and numbers are
  required, but the gate cannot check that the numbers are an estimate and its
  interval.
- D (an inaccessible platform) was already covered: access boundaries become
  caveats.
- E (fragmented terminology) gets the nudge and the disclosure. Whether the
  vocabulary was broad enough is not checkable.
- F (feeding community reports back into the formal search) and failures 3, 5
  and 6 stay model behavior. HRP's BidirectionalEvidenceIterationDefaultTrigger
  already requires them, and the gate checks outcomes, not the order of work.

Limits:
- An absence sentence the model does not declare is not caught: judging
  meaning would need a word list, which fails in other languages.
- `search_coverage` is the model's own declaration.

Cost: tool definitions grow by 1,687 characters (0.9%); `finalize_research`
accounts for 1,489 of them. The Gemini-compatible catalog stays under its
25,000-byte bound. The question was added to the development set
(`dev-geosmin-smell`).

## Merge with main's task-mode integration (2026-09-30)

At 01:02 UTC on 30 Sep, main took Universal 20.5.27: the owner's task-mode
integration (#252). This branch had used 20.5.27 to 20.5.30 for its own
Universal changes, which were not yet released. The merge keeps main's
20.5.27 unchanged and moves this branch's four versions up by one, with their
text unchanged: section loading 20.5.28, the finalize_research completion
check 20.5.29, precise clinical terms 20.5.30, the recurrence trigger 20.5.31.
The merged file is Universal 20.5.31 (2026-09-30). Records written before the
merge use the old numbers.

The version-chain test (`tests/reasoning-selection-structure.test.ts`) first
undoes the merge: it removes main's task-mode text and restores the old
numbers, and checks that the result is byte-identical to this branch's recorded
20.5.30. The existing chain then steps back to 20.5.26. So the merged file is
exactly the branch's changes plus main's task-mode text. The README's protocol
receipts had also gone stale on this branch (HRP 20.5.29, Universal 20.5.26).
They now name HRP 20.6.6 and Universal 20.5.31, and the release-packet test
checks them against the files' own manifests instead of copied values.

## Owner decisions of 2026-09-30 (04:33 UTC) and the lesson report

- **5: merge.** UDA #285 (pattern-matching fit, recurring-finding check) was
  merged as `4bb55bb` after its checks passed and it was clean against UDA main.
- **7: A, HRP 20.6.7.** `SmallResultSetAndExposureDecomposition` (87 words)
  sits beside `HistoricalVocabularyAndCitationBackchain`. It says:
  - read every record's title in a set of up to about 50, and its abstract when
    the title does not settle relevance, before concluding that relevant
    evidence was not located;
  - search the outcome under its components and mechanisms;
  - split a mixed or ambiguous exposure into its parts.
  `HistoricalTerminologyAndEndpointExpansionTrigger` now routes to it. A test
  undoes exactly these edits and gets HRP 20.6.6's recorded bytes. The server
  side (whole small result sets, the sparse-search note, bounded absence
  claims) was already in place.
- **6: A.** The scout's search description is written in English and the
  person's language is passed separately. The privacy screen is unchanged.
- **Lesson report (owner, 2026-09-30).** A ChatGPT connector chat found a
  recurring AskRigor failure and went straight to an engineering report. It
  never said the lesson was worth saving and never showed the lesson. Causes:
  - Universal's corrections section said to turn a correction into a future
    rule, but not to offer the lesson;
  - the lesson flow (`project/LESSON_CAPTURE_MODULE.md`, the GPT's
    `submit_lesson_candidate` Action) exists only for the Custom GPT and
    ChatGPT Projects;
  - the connector has no lesson tool;
  - with section loading, the corrections section loaded only when the model
    judged it applied.

  Universal 20.5.32 (a model-behavior change) adds to
  `corrections_and_calibration`:
  - a correction rechecked and found valid, showing an AskRigor failure that
    could recur for others, brings a separate proposed lesson;
  - it is submitted only on the user's yes, through a lesson tool or Action
    the surface offers, or else the user is pointed to the lesson Action.

  The section is now a Universal core section, because corrections arrive at
  unpredictable points. A connector lesson tool would reverse the module's
  "not an MCP operation" design, so it is owner question 8.
- **Instruction load.**
  - Universal's always-loaded core grows from 16,883 to 19,466 bytes (+2,583,
    the corrections section with its new paragraph).
  - The Universal file grows by 1,188 bytes and HRP by 1,314. HRP's core is
    unchanged.

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

- Questions: `evaluation/instruction-optimization/questions.json`: 6 development
  (including the owner's two real hip questions and, since 2026-09-27, the
  sermorelin question from the owner's error report) and 6 held out. Held-out
  questions run only in the final comparison, after the refactor is frozen.
  Runner metrics record whether an answer mentions YouTube when a comment audit
  ran (`receipts.community_lane`).
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
