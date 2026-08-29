# AskRigor Codex Current State

## 2026-08-29 production living-evidence read-through active task

Task ID: `askrigor-living-evidence-readthrough-v1`

Branch: `agent/living-evidence-readthrough-20260829`

Assurance lane: release

The owner authorized production read-through integration without another
routine authorization checkpoint. The bounded objective is exact reuse of a
complete validated study-method audit through the existing full-text validator.
Reuse must fail closed to a fresh audit on any source hash, identifier,
protocol, rubric, freshness, access, impact, lineage, receipt, ambiguity, or
repository-availability mismatch. The current full text must still be read to
exhaustion and the existing validator must run; canonical protocol XML bytes do
not change.

The public path remains read-only in this phase. It does not automatically
persist user requests or tool calls. Raw source bodies, chat/prompts, private
health material, provider bodies, and all YouTube/community data remain outside
durable storage. The implementation plan is
`../docs/superpowers/plans/2026-08-29-production-living-evidence-readthrough.md`.

Owner clarification: cumulative intelligence means retaining a governed
research frontier, not merely caching prior answers. The durable future model
must include discovery passes, searched date/coverage windows, videos/studies
found and their decisions, comment coverage/count/exhaustion receipts when
policy permits, unresolved questions, unattempted or blocked trails, and
delta-oriented searches for newly relevant evidence. The cumulative design,
map, and work queue record this as the required next layer. The active task
remains the first bounded study-audit reuse slice and must not be represented as
the completed repository system.

The owner reports that OpenAI approved the organization request on 2026-08-29.
This clears the previously reported signup-timeout state, but its exact portal
scope is not inferred: organization/publisher identity selection and an
independent non-secret portal receipt remain open public-submission checks.

Release-candidate verification is recorded in
`../docs/audits/2026-08-29-production-living-evidence-readthrough.md`. The
complete gate passed 109 test files with one declared skip and 1,455 tests with
six declared skips, plus typecheck/build; the four-page site check and 28/28
deployment-policy tests pass. Real PostgreSQL acceptance passes 22/22 and
reproduces current canonical repository SHA-256
`5cb8e53daf012dd8ac430fc3a3401578d8e326e9342bda83be318c1487edf2c0`.
The older pilot record's `8b796f...` hash is retained as a non-reproducible
historical receipt; no cause is invented. Release lesson status is available
with 0 open, 0 needs review, 0 accepted-not-incorporated, 4
incorporated/closed, and 0 deletion eligible. Merge, exact deployment, curated
seed import, direct production acceptance, plugin receipt, and fresh ordinary
ChatGPT acceptance remain.

First command after resume:

```bash
npm run living-evidence:preflight
```

Task completion command:

```bash
npm run living-evidence:acceptance
```

The baseline is `42cf009028d4b8bad989d9c575067bf1a98959bd`; rollback is
`rollback/main-pre-living-evidence-readthrough-20260829`. Completed pilot,
historical browser, unrelated worktree, global queue, and optional-provider
task sources are suspended by `tasks/ACTIVE-TASK.json` until closeout.

## 2026-08-29 second-account regular-Chat acceptance and bounded latency failures

The owner-designated `2nd gpt` Brave profile can discover, attach, and invoke
the replacement **AskRigor Research** plugin in ordinary ChatGPT Pro / Chat
mode. Three fresh product cases are recorded in
`../docs/audits/2026-08-29-second-account-plugin-acceptance.md`.

The bounded connectivity case completed in 2m57s and correctly returned HRP
`20.5.23` plus PMID `40223676`, but mislabeled Universal as `1.7` while
rendering the exact canonical `20.5.15` revision date and SHA-256. A second
ordinary substantive case independently repeated the `1.7` label and was
stopped without a final answer after 15m03s. Direct live manifest output and
canonical bytes both remain correct at Universal `20.5.15`; this is a
ChatGPT composition/presentation defect, not a backend manifest defect.

The isolated full-text case copied manifest fields verbatim and therefore
rendered Universal `20.5.15` and HRP `20.5.23` correctly. It acquired the
known DOI `10.2340/17453674.2025.43332` Europe PMC JATS body as 37/37 blocks,
already exhausted, with zero continuation calls. The bound validator then
showed no new visible checkpoint for more than four minutes and produced no
receipt by the eight-minute cutoff. It was stopped without retry, reacquisition,
`Answer now`, or receipt inference. The three preserved conversations are:

- `https://chatgpt.com/c/6a9346d8-a094-83ea-9ad7-6ac683f7a4dd`
- `https://chatgpt.com/c/6a934852-1e3c-83ea-91c4-0e6f97b47856`
- `https://chatgpt.com/c/6a934be2-7924-83ea-a815-a3774968d2bb`

A direct read-only production timing probe then acquired the same 37-block
Europe PMC JATS document in 707 ms and validated a deliberately unresolved,
timing-only 13-domain payload in 94 ms after a 1,150 ms MCP connection. The
validator returned the exact same-handle/same-source-hash, exhausted,
audit-validated receipt. No source text or handle was printed or retained, and
the temporary probe was deleted. The product stall is therefore in ChatGPT's
audit construction/composition phase, not live acquisition or server-side
validator execution.

The YouTube field-by-field storage-policy clarification was sent in the
existing quota-review Gmail thread. Until Google answers, the living-evidence
pilot continues to persist zero YouTube/community records. Lesson issue #9 was
closed as incorporated with exact evidence receipts. The refreshed lesson
checkpoint is available with 0 open candidates, 0 needs review, 0 accepted but
not incorporated, 4 incorporated or closed, and 0 deletion eligible.

## 2026-08-29 cumulative living evidence pilot completed

Task ID: `askrigor-living-evidence-pilot-v1`

The owner approved implementation of the cumulative living-evidence repository
pilot and an isolated Railway environment. The owner also explicitly requires
AskRigor to store the complete study or review analysis to the extent actually
performed, including future clarifying analysis when more work is warranted.
Analysis versions must retain their full sections, domain findings, claim-
capability judgments, evidence bindings, uncertainty, unresolved fields,
limitations, disagreements, and follow-up questions. Later work appends a new
clarifying, correcting, superseding, or invalidating version; it never silently
rewrites the earlier analysis.

This approval does not authorize raw article/book bodies, transcripts,
comments/replies, creator/commenter identities, raw chat or prompts, private
health material, provider bodies, or credentials as default durable data. The
initial pilot uses public formal-evidence identifiers and AskRigor-authored
analysis only. YouTube/community persistence remains disabled until its exact
fields pass the separate compliance and owner gate.

The implementation branch was `agent/living-evidence-pilot-20260829`. Its integration
commit `59ee7846aa3b4d94fa0be2a4e5bc7d8aedb6ab6c` has local acceptance history
`78960d4f224abd45756817a9f9b358bea832d1bb` and remote main
`26bad64db4b3df7a9158d06c160d2b2c909d4ce2` as parents. Local pre-integration
history is additionally preserved by
`rollback/local-main-pre-living-evidence-20260829`. The checkpoint merge kept
all locally added owner authorization and acceptance sections; none was
discarded.

PR #128 merged exact green head
`67cd9102fe7936efac764bccf083bee8cb76ea65` as remote/local main commit
`3915900e5b045899b10ce6e93efb02d3cbf4c62c` on 2026-08-29. The original local
main checkout was fast-forwarded only after verifying direct ancestry; its
unrelated private untracked files were preserved. The task lock is complete.

First command after resume:

```bash
npm run living-evidence:preflight
```

Task completion command:

```bash
npm run living-evidence:acceptance
```

The machine-readable authority is `tasks/ACTIVE-TASK.json`. Historical browser,
Custom GPT, provider, deployment, work-queue, and unrelated-worktree handoffs
remain valid evidence and may again route later work now that this lock is
closed. The artifact acceptance, protected merge, exact documented Railway
access boundary, and durable closeout all completed.

Local implementation acceptance now passes against digest-pinned PostgreSQL
17.6. The pilot persists the exact formal-evidence full-text-audit section of
the surviving committed hip synthesis as a partial historical capture; it does
not import the report's community-derived sections. It also preserves exact
partial historical analysis for six source families without reconstructing
missing domain text. The schema and real-PostgreSQL acceptance prove lossless
complete-analysis storage for every analysis actually performed prospectively.
It has three linked topics, one structured question, seven claim
versions, exact evidence bindings, six transparent assessments, freshness
policies/checks, and one explicitly synthetic invalidation with a completed
impact job. Fixed exact, structured, full-text, current/history, topic-graph,
and transparent-ranking queries pass. Current-mode retrieval returns zero
because all surviving historical source checks are stale; seven claim versions
remain inspectable in historical mode with their access/freshness boundaries.
Generated JSON, Obsidian, Mermaid, and RO-Crate views contain no raw source or
community-derived analysis. Two independent clean imports produced the same
canonical repository SHA-256
`8b796f9b16540fcf5408165049f46953ed64cfb26bce6f98b00e615ca069909c`.
The latest logical dump is 139,706 bytes; the exact named schema was wiped and
restored with that same canonical hash. The pre-PR deterministic gate passed:
107 test files passed with one declared skip, 1,433 tests passed with six
declared skips, and typecheck/build completed against the final impact/cycle
hardening. The real-PostgreSQL acceptance passes 21 adversarial checks.

PR #128's first CodeQL pass found one high-severity polynomial-regex path in
the Markdown analysis splitter. The regex was replaced with a bounded
single-pass line scanner and focused CRLF/multi-space-heading coverage. The
focused test and typecheck passed. Exact repaired head
`f15ca1a7dc95df045419b52ee26c7fe284c4ede2` then passed hosted deterministic
verification, workflow policy, the CodeQL aggregate, and all Actions,
JavaScript/TypeScript, and Python analyses. Final receipt-only head
`67cd9102fe7936efac764bccf083bee8cb76ea65` repeated all hosted checks green
before PR #128 merged.

Railway remains deliberately unprovisioned. Current Railway controls make
compute hard limits workspace-wide with a $10 minimum, while paid volumes
default to at least 5 GB and cannot be downsized. Those controls cannot enforce
the approved $5/1-GB pilot boundary, and changing a workspace-wide limit could
affect unrelated services. No Railway resource, public endpoint, or workspace
billing control was created or changed. `infra/living-evidence-pilot/README.md`
records the exact platform boundary and the receipt required if the owner later
approves a relaxed limit.

## 2026-08-28 owner correction: regular ChatGPT plugin is the primary test surface

The owner reports that the installed Custom GPT has materially lower effective
reasoning quality than the owner's ordinary ChatGPT account and notes OpenAI's
non-guarantee of equivalent Custom GPT intelligence. Effective immediately,
use the signed-in regular ChatGPT Pro account with the installed AskRigor
plugin as the primary live intelligence, research-quality, and end-to-end
acceptance surface. Primary controlled research tests use GPT-5.6 Sol in Chat
mode at the maximum available reasoning effort (historically Extra High;
currently rendered as `Pro` / 5 of 5). The initial clean plugin connectivity
smoke used Ultra, but that is not the primary broad-research configuration.
The Custom GPT remains a secondary Action-compatibility and projection-
regression surface; do not use its output quality as the primary estimate of
AskRigor's achievable research quality.

Brave inspection confirmed the regular account is signed in, AskRigor appears
in the account's Installed plugins, and the existing
`AskRigor.com Plugin-Dependent` project offers new chats at Extra High. Its
existing `HRP Protocol Verification` thread visibly made three AskRigor tool
calls. The project's uploaded protocol sources are dated August 7--10 and are
not evidence of current canonical bytes. Every fresh primary acceptance run
must explicitly retrieve and verify the live HRP and Universal identities
through AskRigor before substantive research; project uploads, prior thread
prose, and generated excerpts cannot replace the live canonical protocols.

A clean non-project ChatGPT plugin chat was opened through AskRigor's installed
`Try in chat` action, avoiding the project's stale uploaded-source confound:
`https://chatgpt.com/c/6a91b986-ff1c-83ea-a810-d906c950b100`.
The bounded GPT-5.6 Sol / Ultra smoke test requested only the two live protocol
manifests. AskRigor returned HRP `20.5.23`, revised `2026-08-24`, SHA-256
`bf2adc1c4daea8241c47b2a111d4a19e6bf7427a6401ecf1b3ba75a58e046299`,
and Universal `20.5.15`, revised `2026-08-24`, SHA-256
`69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172`.
Both identities exactly match repository canonical-byte tests, both canonical
texts were reported available, and the response explicitly reported no
research session, research operation, or provider operation. This is a current
primary-surface connectivity/protocol smoke receipt, not a substantive research
quality acceptance.

A later broad hip-treatment prompt was accidentally started in Work mode at
Ultra. It was stopped once the mismatch was recognized and is not an acceptance
receipt. Do not resume that run. The next primary substantive acceptance must
use the installed AskRigor plugin in regular ChatGPT with GPT-5.6 Sol, Chat
mode, and Extra High.

The preserved Custom GPT hip-treatment session remains intact as historical
resumability/compatibility evidence. Minute polling stopped on this owner
correction after the last verified unchanged check at
`2026-08-28T16:28:36.635Z`. No additional Retry was sent and no replacement
research session was created. Do not resume repeated polling or issue another
Retry unless the owner explicitly reactivates that secondary test.

## 2026-08-28 YouTube API compliance follow-up sent

The owner approved the completed response to the YouTube API Services Team's
request for a sample report or visual reference showing both YouTube data flow
and the end result. No additional owner answers were required. The reply was
sent in the existing Gmail thread to
`youtube-disputes+2qf6bi6gn4qyr1n@google.com` at
`2026-08-28T21:38:35+00:00`. Gmail shows the new sent message in-thread with
the complete body and `2 Attachments`:

- `AskRigor-YouTube-API-visual-reference.png`, SHA-256
  `bc07ec33216a3c215c887830732287f8158aaba594cb9a28d21a45d7b5477833`
- `AskRigor-sample-end-user-report.pdf`, SHA-256
  `fb6a1a2064c0cefd45199bfae1c5a05cb3fe116353c123b84f28eb7e6d2f2f21`

The sent reply identifies the installed AskRigor plugin in regular ChatGPT as
the primary client surface and the AskRigor Custom GPT as a supported secondary
surface. The receipt is
`deliverables/youtube-api-compliance-2026-08-28/send-receipt.md`. This proves
submission of the requested supporting material, not quota approval or an
effective quota change.

## 2026-08-28 fresh regular-Chat Extra High acceptance reached bounded completion

A genuinely fresh regular ChatGPT conversation is preserved at
`https://chatgpt.com/c/6a9201c8-e3bc-83e9-b5dc-47e47bf258c0`. Before submission,
the visible controls were verified as Chat mode checked, Extra High selected,
and the installed AskRigor plugin present as the inline source pill. This is the
owner-designated primary intelligence and product surface.

The fixed synthetic prompt made both live canonical identities a hard first
gate and prohibited project uploads or prior-chat memory. The response loaded
and verified the complete HRP `20.5.23` and Universal `20.5.15` texts with the
exact expected dates and SHA-256 digests, then started a fresh AskRigor workflow
for surgery-indicated end-stage hip osteoarthritis. It did not reuse or resume
the stopped Work/Ultra run.

The live Chat response demonstrated substantive program- and population-level
reasoning before this checkpoint. It separated a broader
moderate-to-severe Finnish arthroplasty-versus-exercise trial from the strict
core population; identified PROHIP as an exact surgical-eligibility population
match; retained its supervised 12-week progressive-resistance dose, optional
12-week continuation, 6-month Oxford Hip Score comparison, crossover count,
and still-pending durability boundary; excluded prehabilitation studies from
the alternative-to-surgery comparison; and kept cycling plus education,
mobilization, proprioceptive-neuromuscular facilitation, neuromuscular
exercise, resistance training, and diet-plus-exercise as distinct
implementations rather than pooling them.

The response completed after a visible `Worked for 14m 14s` interval with 27
visible tool-call markers. A clean read-only recovery view showed a completed
response (`Copy response` present and no `Stop answering` control), proving
that the earlier structural-read timeouts reflected the very large rendered
tool trace rather than a stalled research run.

The response correctly labeled itself `Acceptance status: not finalized`. It
reported ten complete, unfiltered YouTube comment/reply corpora spanning the
required treatment space and excluded two larger corpora whose providers
failed after partial retrieval instead of treating those fragments as complete
samples. It preserved population and implementation distinctions, reported
benefit, null, worsening, harm, crossover, method, and applicability limits,
and used an explicit Crossref integrity-screen limitation rather than treating
absence of a metadata marker as proof of unretracted status.

The completion boundary is genuine future evidence, not a retryable execution
frontier: PROHIP's strict-core randomized long-term follow-up remains active,
with registry completion projected for December 2026. The response therefore
withheld the requested final comparative verdict and supplied only bounded
facts plus an evidence-gap statement. Do not send `Retry`, reopen discovery, or
create a replacement research run merely to force finalization. The preserved
conversation is a passing primary-surface reasoning/completion-boundary
receipt, not a server-issued product-acceptance receipt or a final clinical
ranking.

## 2026-08-28 independent citation-falsification acceptance

A second fresh regular ChatGPT plugin conversation is preserved at
`https://chatgpt.com/c/6a920843-2b44-83ea-9f81-8126fcfa84dc`. Immediately before
submission, the live controls showed Chat checked, Work unchecked, GPT-5.6 Sol
selected, maximum reasoning effort (`4` of `4` on the control, rendered as
`Pro thinking` / 5 of 5), and the AskRigor plugin attached. The narrow prompt
prohibited YouTube/community discovery, broad treatment research, a research
session, and medical synthesis.

The independent audit completed without intervention after `Worked for 8m
10s`. It reloaded and exactly verified both canonical protocols, used PubMed,
Europe PMC, ClinicalTrials.gov, and Crossref records, reported that no research
session was created or resumed, and marked the task complete with no next
capability. It independently confirmed the pivotal treatment-effect,
population, dose, crossover, registry-status, and design claims except for the
following important qualifications:

- PMID `40223676` assessed the waiting group at **at least** three months after
  waiting-list entry, not necessarily at exactly three months. The prior broad
  acceptance's shorthand `at 3 months` is therefore corrected.
- Absence of an indexed long-term PROHIP outcome publication cannot prove
  universal nonpublication. The exact current bounded statement is that the
  audit found no such report in its PubMed/Europe PMC trial-ID searches and the
  live registry returned `has_results:false`.
- The returned records did not directly cross-reference PMID `42061873` and
  NCT `05093361`; their exact identity linkage remains unavailable even though
  the trial characteristics closely match.

The audit verified NCT `04070027` as `ACTIVE_NOT_RECRUITING` with current
completion field `2026-12`. Direct PubMed and ClinicalTrials.gov hyperlinks
rendered correctly. The three Crossref DOI rows rendered their exact DOI
identifiers but exposed empty `href` values, so the requested direct-link
presentation is only partially satisfied. Treat this as a formatting/citation-
projection defect, not a contradiction in the underlying DOI identities.

A bounded correction-uptake follow-up in the same conversation prohibited all
tool use and requested exactly four bullets, including three explicit
`https://doi.org/` Markdown links. It completed in 37 seconds and correctly
restated the timing correction, bounded nonpublication wording, and unavailable
PMID/NCT linkage without new source retrieval. It nevertheless omitted the
literal `https://doi.org/` URLs; all three DOI labels again rendered with empty
`href` values. The direct-link presentation failure is therefore reproducible
after one explicit correction request. Do not loop the same formatting retry.

Two fresh controls localize that defect to the long audit conversation rather
than the general renderer or plugin attachment. A plain regular Chat control at
`https://chatgpt.com/c/6a920e07-7ae8-83e9-8bc8-e258ca74e39d` completed in 21
seconds and rendered all three exact `https://doi.org/` links with nonempty
targets. A new AskRigor-attached Chat control at
`https://chatgpt.com/c/6a920eaf-fa18-83ea-a8a3-12c5e5746642` completed in 13
seconds without tool calls and rendered the same three correct targets. Both
used GPT-5.6 Sol in Chat at maximum 5-of-5 reasoning effort. The earlier empty
links are therefore a context-local instruction/rendering miss in that one
correction response, not evidence of a platform-wide renderer failure or a
general AskRigor-plugin citation defect.

## 2026-08-28 PREDIMED publication-integrity benchmark completed

A fresh primary-account AskRigor plugin benchmark is preserved at
`https://chatgpt.com/c/6a920f65-ca0c-83ea-9d3b-587889789d92`. Submission
preflight verified Chat checked, Work unchecked, GPT-5.6 Sol selected, maximum
5-of-5 reasoning effort, and AskRigor attached. The fixed prompt treats every
PREDIMED claim as potentially false, requires exact atomic verdicts and
publication-event/method provenance, and prohibits dietary advice, community
research, and a broad efficacy synthesis.

The complete live protocol gate passed. The final claim ledger completed after
`Worked for 11m 44s` and correctly separated exact source statements from
methodological inference. Its decisive falsifications were:

- the trial was not participant-and-interventionist double-blind; only outcome
  adjudication was blinded;
- all-cause mortality was not significantly reduced in either arm or the
  combined comparison;
- the 2013 article was retracted and corrected/re-published in 2018, with the
  live sequence also retaining a 2014 erratum;
- the 1,588-participant exclusion was a sensitivity analysis, while the primary
  intention-to-treat analysis retained all 7,447 participants;
- corrected and sensitivity estimates remained broadly similar but were not
  numerically identical to the 2013 estimates;
- the republication adjusted for and disclosed allocation uncertainty rather
  than proving that every participant had been individually randomized; and
- NCT `00703651` is an unrelated influenza-vaccine study. The PREDIMED
  publications instead identify ISRCTN `35739639`.

The audit retained uncertainty where appropriate: public records cannot prove
the exact actual assignment route for every participant, and the 1,588-person
set included known or suspected deviations rather than participant-by-
participant proof. It retrieved PMID `19341446`, the exact retraction notice
PMID `29897867` / DOI `10.1056/NEJMc1806491`, Crossref publication-event
metadata, the unrelated ClinicalTrials.gov record, and direct official and
accessible full-text links.

After repeated web-search transitions stopped adding visible evidence, browser
control invoked the page's `Answer now` once. The UI briefly returned `Failed
to answer now. Please try again.`, then removed that message, advanced to
`Synthesized evidence`, continued without another intervention, and rendered
the completed ledger. No retry or replacement run was submitted.

The official NEJM full-text endpoints returned HTTP 403 in the retrieval
environment. The answer disclosed that boundary and inspected publisher-
formatted copies with exact journal/DOI identity. It reported that no research
session was created or resumed and that AskRigor exposed no separate read-only
study-method-validation operation; the validator was therefore marked
unavailable rather than claimed. The final response supplied direct
decision-relevant links, made no dietary recommendation or community search,
and ended with `Next step: none — this publication-integrity audit is
complete.` This is a passing primary-account reasoning and falsification
receipt with the stated validator/full-text access limits.

## 2026-08-28 secondary Custom GPT Action compatibility smoke

A fresh secondary-surface conversation is preserved at
`https://chatgpt.com/g/g-6a64103633d8819187f57c7b2986e505-askrigor-com-heterodox-research-protocol/c/6a9212cc-3440-83ea-8e72-c3a9ca2f0b82`.
This test intentionally assesses only the current five-operation Action
projection, not research intelligence.

The Custom GPT correctly reported that the Action exposes no standalone
protocol-manifest operation and therefore refused to claim live Universal/HRP
identity verification without starting or resuming a research session. This is
truthful fail-closed behavior and means the Custom GPT surface cannot replace
the primary installed plugin's manifest smoke.

A first read-only status call with a malformed synthetic ID returned
`action_input_invalid` and `retryable:false`; because that could be input-layer
validation, it was not treated as transport proof. A second call used valid-
format, deliberately nonexistent ID
`ars1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`. The response reported live execution
of `get_research_session_status` and returned server-owned boundary
`research_session_invalid_or_expired`, `retryable:false`. No session was
created, no provider operation was requested, and no old preserved research
session was resumed. This is a passing secondary Action transport and
fail-closed boundary receipt, not manifest, package-currency, or reasoning-
quality evidence.

## 2026-08-28 primary plugin catalog refresh and validator retest

The PREDIMED benchmark's statement that AskRigor exposed no separate
study-method validator described the stale catalog presented to that ChatGPT
conversation, not the reviewed current MCP contract. Repository source, the
committed inventory, and a fresh direct production `tools/list` call all expose
exactly 21 operations, including
`acquire_open_full_text`, `continue_open_full_text`,
`validate_study_method_audit`, and `validate_review_method_audit`.

A first fresh primary-account composition probe at
`https://chatgpt.com/c/6a9214e0-3dcc-83e9-91e4-2acb0d33589a`
completed after `Worked for 3m 3s`. It passed both exact protocol identities
but stopped before operation 1 because the ChatGPT-attached AskRigor catalog
presented only 17 operations and omitted all four full-text/audit operations.
The fail-closed stop was correct for that presented catalog, but the catalog
was stale relative to production.

ChatGPT's AskRigor management panel preserved the prior registration receipt:
endpoint `https://mcp.askrigor.com/mcp`, app ID
`asdk_app_6a7cd2a0156881918ce7dedecb715250`, version ID
`asdk_app_v_6a7cd2a015748191a410021ac85dc069`, connected 2026-08-12, and these
17 exact actions: `audit_youtube_community`,
`audit_youtube_video_community`, `check_retraction_status`,
`fetch_clinical_trial`, `fetch_pubmed_record`, `get_protocol_manifest`,
`get_youtube_comments`, `get_youtube_video`, `load_protocol`, `resolve_doi`,
`search_clinical_trials`, `search_europe_pmc`, `search_pubmed`,
`search_youtube`, `search_youtube_comments`, `survey_youtube_community`, and
`verify_protocol_integrity`.

The built-in `Refresh` control updated the same saved development app to 21
visible actions without changing its app or version IDs. The four additions
are exactly the production full-text/audit operations named above.

A fresh post-refresh primary run at
`https://chatgpt.com/c/6a9217b2-0e4c-83ea-8466-80cff33a703c` on GPT-5.6 Sol,
Chat mode, `Pro` 5 of 5 completed after `Worked for 6m 52s`. One bounded
`Answer now` activation during its tool-silent startup briefly returned
`Failed to answer now. Please try again.`, then cleared as execution continued;
it was not repeated.

The post-refresh execution proves the four operations are now callable from
the primary product surface. Both complete protocol gates passed. A preliminary
`acquire_open_full_text` attempt used unsupported `identifier` arguments and
was rejected before MCP execution. The corrected DOI call acquired
identity-verified Europe PMC JATS for PMCID `PMC11995426` / PMID `40223676`,
returned all 37 source blocks and segments, and was already exhausted with
source SHA-256
`9c0bba5c0c8c940f8e28974943ef5c23edf9f90551def1f647610c020d03e8b0`.
Therefore zero pre-validation continuation calls were required. A separate
direct production client reproduced that acquisition in 2.131 seconds with
the same source identity, count, exhaustion state, and SHA-256.

The model built all 13 required study-method domains from those source blocks.
The returned validator status was `source_linked_study_audit_validated`, with
receipt `askrigor_study_method_audit` 1.0, status
`complete_with_unresolved_fields`, all 37 blocks in scope, 28 cited blocks,
audit SHA-256
`33147273c46fec733efedcbd3bd708b424d5190bb3d1feb1eea53d9fb2203adb`,
`full_text_read_to_exhaustion:true`, `audit_validated:true`, and bounded claim
capabilities. Its method findings correctly limited this observational
target-trial emulation for selection, missing controls, unblinded subjective
outcomes, nonaligned treatment/outcome timing, an underdescribed waiting-list
comparator, absent harms and long-term outcomes, and unavailable data/code.

The exact single-handle chain did **not** pass. Acquisition reported handle
`aft1_VgpraP4UVH_zKpBVWFJJ18Q-VF26BYf8`, while the exact validator coverage
receipt reported `aft1_uWGE24YLZJrq7wm6xW1JApWAX9IYWs7R`. The final response
claimed the validator input was the first handle and explicitly disclosed the
mismatch. Current source constructs validation coverage from the parsed input
handle, and the focused test requires equality. The preserved product output
therefore implies either an unreported duplicate acquisition/second-handle
validation or incorrect reporting of the actual validator input; it cannot be
counted as exact single-chain acceptance. A redundant post-validation
continuation probe on the already-exhausted first handle correctly failed but
was unnecessary. Do not retry this same conversation merely to normalize the
receipt.

Focused source verification passes: `tests/open-full-text-action.test.ts` and
`tests/mcp-tools.test.ts` passed 61/61 through the required host boundary,
including exact acquisition-to-validation handle equality and the 21-tool
catalog. The first sandbox run passed the pure action file but recorded the 15
HTTP transport cases as unavailable because loopback bind returned `EPERM`;
the unchanged host-boundary rerun resolved all 15. This further localizes the
observed handle mismatch to the product/model execution report rather than the
reviewed backend binding rule.

A fresh strict control at
`https://chatgpt.com/c/6a921b89-5990-83ea-84a5-d507174a3929`
then isolated prompt-level composition. It used the same primary GPT-5.6 Sol /
Chat / `Pro` 5-of-5 surface but pinned the exact acquire JSON schema, exactly
one acquisition, zero continuation when already exhausted, no reacquisition,
exactly one validator call, and byte-equal input/output handle plus source-hash
invariants. It completed without intervention after `Worked for 8m 36s`.

The strict control passed both complete protocols, called acquisition exactly
once with only `{"doi":"10.2340/17453674.2025.43332"}`, returned all 37
segments already exhausted, made zero continuation calls, constructed all 13
domains, and called the validator once. Acquisition handle, validator input,
and terminal validator coverage were all exactly
`aft1_9LKUAbw1r8n_7Qknz2oSQHmhqEARsjCY`; the acquisition and validation source
hashes were both
`9c0bba5c0c8c940f8e28974943ef5c23edf9f90551def1f647610c020d03e8b0`.
The terminal coverage also returned `full_text_read_to_exhaustion:true`,
`audit_validated:true`, and
`synthesis_use:"bounded_by_validated_claim_capabilities"`, followed by
`PASS`.

This is a passing strict-composition control. It proves the refreshed primary
surface can execute the exact single-handle chain when the schema, call counts,
exhaustion branch, and output equality are explicit. It does not erase the
earlier default-prompt mismatch or establish that ordinary unpinned model
composition will preserve those invariants.

## 2026-08-28 Brave relaunch handoff

The owner is relaunching Codex in the ChatGPT app because that surface can use
the existing signed-in Brave session. Resume the exact installed AskRigor GPT
conversation and preserved research session
`ars1_54j0bi0xyvET_mNRNx7phdriYCVYRgkP`; do not create a replacement session
or repeat completed discovery, screening, formal-source, or transcript work.
The authoritative resume digest remains
`0776fd5990a9c8f87a1c85318c3e16c73834f6fa8d9cd5bc127a4b5a78be9d0d`.
Its current boundary is the separate retryable community-discussion provider
dependency `DISCUSSION_DEPTH_RETRYABLE`, not the repaired Spark/native video
discovery path. Inspect the existing conversation before deciding whether one
bounded same-session retry is useful; never loop retries.

This terminal's supported Brave reconnection was exhausted before relaunch.
Diagnostics found Brave installed as the default browser, the ChatGPT browser
extension installed and enabled in the Default profile, and the native-host
manifest correct. Brave was initially stopped, so the supported helper opened
a fresh Default-profile window. Connection still failed because the running
Codex browser transport imported removed service path version `26.820.60940`
while the installed Browser/Chrome plugin files are version `26.820.71523`.
Manual plugin-cache or native-host repair was intentionally not attempted.
On relaunch, use the Brave/Chrome browser-control surface afresh and claim the
existing AskRigor conversation tab; do not infer that the provider boundary
changed merely because browser control reconnects.

Repository baseline at handoff is `origin/main` merge
`ecf1c955bba1cfe50d96e66d6258729d6bc5d2d1` (PR #121). The original checkout
contains unrelated untracked local credential material and a module file;
preserve them and do not add them to Git. The 2026-08-28 lesson checkpoint was
available: open 1, needs review 1, accepted-not-incorporated 0,
incorporated/closed 3, deletion-eligible 0. Neither pending item expands this
browser-resume handoff.
## 2026-08-29 public full-text chain guidance production state

PR #123 merged reviewed head
`676531ca5ef1c774053452d6f8e0f851d481a6aa` as exact release
`db21d99447fcde10bc42d162fe03318e793f046d`. The public MCP wrapper and the
four open-full-text/audit tool descriptions now state the exact one-acquisition,
same-handle, same-source-hash, exhaustion, expiry, no-chain-combination, and
mismatch-blocking rules already enforced by the backend. Schemas, canonical
protocol bytes, the Action surface, providers, and plugin-package bytes are
unchanged.

Protected deterministic verification, workflow policy, and all CodeQL analyses
passed. Production is healthy in container `0bed8b9babe5` on image
`askrigor-research:db21d99447fcde10bc42d162fe03318e793f046d`, image ID
`sha256:1d7357c5d3cb388e2fe0419092f540d29497357f0635c2a3b9c9ff91dc0f9149`.
The active Compose SHA-256 is
`3b937b0c89e6b72c1ecb88b9ffe9d7df5325653cfeb262ae4501c781061d5c5c`.
Immediate rollback is `askrigor-research:rollback-db21d99-predeploy` plus
`/opt/askrigor/compose.yaml.rollback-db21d99`, SHA-256
`20d7db364cd06968a4b5312f13214d97e6a324788e296c2dd0355f1e72f59ccc`.
Caddy and both expected writable mounts are unchanged; the research container
remains non-root, read-only, capability-free, and `no-new-privileges`.

Public health, the unchanged five-operation Action schema, unauthenticated 401,
the exact ordered 21-tool catalog and four repaired descriptions, both live
protocol manifests, one read-only installed-connector probe, and complete
source/installed eight-member plugin receipts pass. A direct acquisition for
DOI `10.2340/17453674.2025.43332` returned all 37 Europe PMC JATS blocks,
`exhausted:true`, handle `aft1_jFKIlMQfXFEZANzp2P_lt1k1YK4P6Cvq`, and source
SHA-256
`9c0bba5c0c8c940f8e28974943ef5c23edf9f90551def1f647610c020d03e8b0`.

The old regular-account development app became unavailable as `Plugin not
found` but retained its exact-name reservation. Replacement app **AskRigor
Research** is connected to `https://mcp.askrigor.com/mcp` with all 21 exact
tools. Its app ID is `asdk_app_6a92d3ff450481919a162f8a8885f03c` and version
ID is `asdk_app_v_6a92d3ff45208191bc4f4e6319708e9d`.

A fresh ordinary-prompt run is preserved at
`https://chatgpt.com/c/6a92d63f-07ac-83ea-8ff2-186e71a9c0ed` on GPT-5.6 Sol,
Chat mode, `Pro` 5/5. It visibly completed protocol loading, metadata and
retraction checks, full-text acquisition, trial retrieval, and several
methodological/comparative stages. The exact headless Brave session then
disconnected while the response was still active. A different signed-in Brave
profile was not used. No prompt was resent and no replacement chat was created.
The exact profile was later recovered and the preserved run had completed after
23 minutes 25 seconds. Its terminal response reports both protocol-integrity
checks, all 37 JATS blocks read to exhaustion, document handle
`aft1_QvfX_6RdGgh2qYIOpTWJ0Cfb6KP1A0WQ`, source SHA-256
`9c0bba5c0c8c940f8e28974943ef5c23edf9f90551def1f647610c020d03e8b0`,
validated-audit SHA-256
`41f5bff78d6dbaf291013c4709f46eaf70627e69a3f031ae12b790fd63cd1c88`,
receipt `source_linked_study_audit_validated`, and completion state
`complete_with_unresolved_fields`. The rendered answer preserves methodological,
access, and validation gaps and bounds supported versus unsupported claims.
Ordinary-prompt product-interface acceptance is therefore complete at the
terminal artifact boundary. The ChatGPT activity summary does not expose raw
app-call cardinality as individually enumerable tool cards, so no hidden call
count is inferred beyond the single reported exhausted chain and terminal
matching validator receipt.

A separate primary-account plugin case is preserved at
`https://chatgpt.com/c/6a92f38b-84e8-83ea-85a0-a9923aeed485`. The owner's
`u-dont-exist.com` account exposed the personal **AskRigor** app associated with
`asdk_app_6a7cd2a0156881918ce7dedecb715250`. The test used ordinary GPT-5.6 Sol
with the app attached, Chat mode, and `Pro` 5/5, not the Custom GPT surface.

The prompt requested a full-text methods audit for systematic-review DOI
`10.7759/cureus.72057`. One transient tool-call error self-recovered. The
response then remained active through a long unchanged rendered interval and
completed without stop, reload, retry, or duplication after 37 minutes 24
seconds. The terminal artifact reports both exact current protocol identities,
PMCID `PMC11578636`, PMID `39569300`, all 58/58 full-text blocks exhausted,
source SHA-256
`d708fbfe67ebbb411c8937fdc55fc0021fe45a6188c2c503e50e820ce2b41cd3`,
validated structured audit state with unresolved fields preserved, and audit
receipt SHA-256
`66de15115f1b121ecba82298f1e87e93ba615d1e578e446c619e2b1d3c1c919a`.

The final audit stayed on hip osteoarthritis, covered the requested methods,
bounded claims, and preserved access/validation gaps. A single activity-summary
label incorrectly said `knee osteoarthritis`; no substantive line did. Record
this as a product presentation/topic-label defect and the 37-minute runtime as
a latency concern, not as audit failure. The UI did not render a document
handle, machine-readable receipt type/completion-state name, or enumerable raw
app calls, so none is inferred.

The lesson checkpoint remains available: open 1, needs review 1,
accepted-not-incorporated 0, incorporated/closed 3, deletion-eligible 0. The
owner's cumulative living-evidence repository discussion is queued in
`docs/WORK-QUEUE.md`; it does not authorize persistence or change current
privacy boundaries.

## 2026-08-28 Spark/native bounded-frontier production state

PRs #117, #118, and #119 implement the owner's correction that AskRigor must
continue from independently validated Spark video results even when native
YouTube discovery cannot complete. The final exact merge is
`fa7f9d0521f192c658924b73b58eb5584e2b21b7` from reviewed head
`7fbc9d664ea5835c64818c3fe9f4a85943669cf7`. Protected deterministic
verification passed 106 test files and 1,426 tests, with one declared live file
and six declared live tests skipped; workflow policy and every CodeQL analysis
also passed.

Production is healthy in container `15a5968d1d9b` on image
`askrigor-research:fa7f9d0521f192c658924b73b58eb5584e2b21b7`, image ID
`sha256:fef899dfacb4bb7505b234bdc2813bc979748e3782e7d74547f284415d31ed10`.
The exact 551-member, 1,701,391-byte archive SHA-256 is
`c59a9d3fe391c44eec81b4b0dea56ab93cf87953ac9b2a96337775cbfdcbd430`.
Active Compose SHA-256 is
`20d7db364cd06968a4b5312f13214d97e6a324788e296c2dd0355f1e72f59ccc`.
Immediate rollback is `askrigor-research:rollback-fa7f9d0-predeploy`, restoring
image ID
`sha256:0850e840dc1bbef66d54ff5f58713a75b9282638669c83936f8c2fb0b34bb717`,
plus `/opt/askrigor/compose.yaml.rollback-fa7f9d0`, SHA-256
`131d4488098a4577c3c75d8cb2cf208a8ce3034513b0515c73e74c63bb457347`.

Public health, the unchanged five-operation Action schema, HTTP 401, exact
ordered 21-tool MCP catalog, both live protocol manifests, the installed
connector probe, complete source/installed eight-member plugin receipts, and
container security/mount checks pass. Caddy remains unchanged in
`cb061473089c`.

The preserved session `ars1_54j0bi0xyvET_mNRNx7phdriYCVYRgkP` now migrates to
`NATIVE_IDENTITY_ACCESS_BOUNDED` and requires `candidate_screening`, not
`native_video_discovery`. Its authoritative checkpoint retains 6 validated
Spark identities, 20 validated native identities, 32 explicitly unresolved and
excluded native identities, and 26 reconciled screening candidates. One
same-session server continuation returned `perform_semantic_work /
candidate_screening`.

Browser control then sent authorized text `Retry` in the exact preserved
signed-in conversation. The visible GPT entered candidate screening without a
restart. The checkpoint completed candidate and formal-source screening,
reached 143 formal records, selected 17 videos, and advanced through all 17
transcript chains before their explicit terminal access boundaries. The next
community-discussion chain and one server-owned bounded recovery attempt ended
at retryable `DISCUSSION_DEPTH_RETRYABLE`; resume from digest
`0776fd5990a9c8f87a1c85318c3e16c73834f6fa8d9cd5bc127a4b5a78be9d0d`
when that separate provider boundary is available. Do not create a replacement
session or loop the retry. The Browser plugin connection reset after message
submission because its runtime referenced a removed older service version;
supported reconnection failed and manual host repair is prohibited. No final
product receipt is claimed.

The predeploy lesson checkpoint was available: open 1, needs review 1,
accepted-not-incorporated 0, incorporated/closed 3, deletion-eligible 0.

## 2026-08-27 YouTube search-quota resilience deployed

Owner direction authorizes two related controlled-workflow changes: request
100 top-level comment threads per YouTube provider page, and keep research
advancing from its independently validated candidate frontier when the
separate 100/day `search.list` allocation is exhausted.

PR #114 passed all protected checks on exact head
`785270e8a3d363cb51a4b5a587433ae1c92bc887` and merged as
`f2b39d637fef95b95b80ef4252a07a739aa5d151`. It maps only HTTP 403
`search.list` daily-quota exhaustion to the distinct sanitized code
`youtube_search_quota_exhausted`, while generic 429s, metadata failures,
unresolved identities, and other retryable errors remain retryable. The
controller preserves literal rate-limited native-search receipts, marks only
that search operation terminal for the immutable current execution, does not
project native discovery complete, and exposes candidate screening from the
already validated frontier instead of retry-looping. Any eventual answer
remains limited by the native-search coverage boundary.

The resumable discussion audit now requests `commentThreads.list` pages of 100
instead of 20. Existing 50-provider-request and 15-second per-call budgets,
page fingerprints, within-page cursors, overlap reconciliation, deterministic
sampling, and the 60 kB public Action response bound remain unchanged. A
100-thread regression crosses three exact within-page continuations and proves
no duplicate or omitted identifiers.

Six focused test files pass 221/221 tests. One first host-bound full rerun had
one unrelated 10-second timeout in the protocol Action continuation test; that
file then passed 4/4 in isolation. The clean complete `npm run verify` gate
passes 106 test files with one declared live file skipped, 1,417 tests with six
declared live tests skipped, and the production TypeScript build. The durable
implementation plan is `docs/superpowers/plans/2026-08-27-youtube-search-quota-fallback.md`.

The exact 550-member, 1,695,059-byte merge archive has SHA-256
`79156c9d5fd1af1c54c9bdd824d92c646d8fe4226068505d4bb0ead043ce5c95`.
Production is healthy on image ID
`sha256:2f9f9be37cbc75fb2f2e835b09b1b95aa525f321b618917079fdc9e61d69aaf7`
in container `9d952deda964`. Rollback retains prior image ID
`sha256:2a6ac954f85bf3529187bdf7e690f59864e954854597f04bc4a68d7d26fb5945`
as `askrigor-research:rollback-f2b39d6-predeploy` and prior Compose SHA-256
`f8c942fb370a29bcc23121cb594a2d120208b87ccfd408ad4fd2b46b7e9effbc`.
Active Compose SHA-256 is
`b716ee0609877e76b60b6b1ce5e27f4f938f683878131778a1631ae22f1bbd84`;
Caddy remained `cb061473089c`.

Public health, the unchanged exact five-Action schema, unauthenticated 401,
the exact 21-tool MCP catalog, both canonical protocol manifests, one
read-only installed-connector manifest call, and both complete eight-member
plugin receipts pass. Every non-manifest plugin member is byte-identical to
source. No editor or plugin installation transaction was required because
those bytes did not change. A live public-video discussion audit entered one
comment-thread page, processed 18 top-level comments and 11 replies, then
stopped at a generic retryable YouTube 403 during reply reconciliation. It did
not exercise or claim the separate `search.list` fallback. That exact boundary
cannot be manufactured while search capacity remains; the merged deterministic
provider/frontier/controller regressions are the acceptance evidence for it.

Fresh signed-in installed-GPT acceptance created preserved session
`ars1_54j0bi0xyvET_mNRNx7phdriYCVYRgkP`. The first run and one immediate retry
both stopped before native discovery at retryable boundary
`AUTOMATED_SCOUT_IDENTITIES_UNRESOLVED`: eight external candidate entries had
been observed, six identities validated, and one remained unresolved. Native
discovery and every downstream operation remained `NOT_STARTED`. The Custom
GPT withheld partial synthesis and instructed a later same-session retry. No
replacement session, finalization, or product-acceptance receipt exists.

The start-of-task lesson checkpoint is available: one open candidate, one
needs review, zero accepted but not incorporated, three incorporated/closed,
and zero deletion-eligible. Neither pending item expands or blocks this task.
Lesson disposition is project-specific/no-new-lesson: the dedicated YouTube
quota-bucket behavior belongs to AskRigor's provider controller, while the
general bounded-continuation and explicit-access-gap principles are already
captured by current project and universal guidance.

## 2026-08-27 identifier boundary and YouTube disclosures deployed; quota-bound continuation

PR #111 passed every protected check on exact head
`746ea03ef8daabec6f2f8f6c9e792632b0d7421d` and merged as
`4cf17ae73ad2c2ffcfb55ab7ad8160fd83c86742`. The exact merge archive
contains 549 members, measures 1,685,909 bytes, and has SHA-256
`40f09379e7dfafca94d166fdf468c4a2ca8c2a9f953da86e1082729953182be9`.
Production is healthy on image ID
`sha256:2a6ac954f85bf3529187bdf7e690f59864e954854597f04bc4a68d7d26fb5945`
in container `aef3c254f270`. Immediate rollback preserves prior image ID
`sha256:b5d90dd0e4dd96a620e7a92614d8e79214c264de7a37869bd1dd0f738ab9495b`
as `askrigor-research:rollback-4cf17ae-predeploy`, plus prior Compose
SHA-256
`9aafa28ef824ccf7975e95c0617797af416e282daa32afd4e3f7ab3d347e79b8`.
The active Compose SHA-256 is
`f8c942fb370a29bcc23121cb594a2d120208b87ccfd408ad4fd2b46b7e9effbc`.

The site installer transaction activated
`/opt/askrigor/site/releases/4cf17ae-20260827-youtube-api-disclosures/site`.
Live Privacy now links Google's Privacy Policy, names YouTube API Services,
and states the no-OAuth/no-Authorized-Data boundary; live Terms link YouTube's
Terms and state the user-agreement boundary. Public verification passes exact
five-Action semantic equality, unauthenticated 401, the exact 21-tool MCP
catalog, HRP 20.5.23, Universal 20.5.15, one installed-connector manifest
probe, and both complete eight-member plugin receipts. Every non-manifest
plugin member is byte-identical; only the intentional cache-buster version
differs in the installed manifest.

The preserved fixed acceptance session survived the deployment and reconciled
through the live Action surface. The repaired retry advanced immediately, then
73 same-session `community_discussion_audit` transitions recorded monotonic
forward progress without another identifier-membership restart. The next
transition returned a genuine retryable boundary. Google Cloud then showed
9,398/10,000 daily YouTube units used, 214.429/1,800,000 per minute, and zero
dedicated search requests. Stop retries until quota resets or is increased; do
not create a replacement session. No finalization or product-acceptance receipt
exists yet.

The owner supplied the applicant fields and authorized the signed-in Google
submission at action time. On 2026-08-27 the YouTube Data API Services Audit
and Quota Extension Form was submitted for 100,000 total units/day and a
1,000-unit peak/minute across the four read-only methods `search.list`,
`videos.list`, `commentThreads.list`, and `comments.list`. The separate search
limits remain 100/day and 100/minute with no requested search increase. The
three public Privacy, homepage, and Terms images were attached; because
Google's validator incorrectly required the non-applicable conditional field,
the already-authorized homepage feature image was attached there again rather
than asserting a conditional use case. The terminal receipt said `Your email
has been sent` and thanked the owner for submitting the form; no case ID was
displayed. This is a submission receipt, not a quota approval or effective
quota change. Keep the preserved product session stopped until daily quota
resets or an increase is observed. The public Privacy Notice still truthfully
discloses the separate best-effort unofficial transcript interface; do not
relabel it as an official YouTube Data API method.

The predeployment lesson checkpoint was available with one open candidate,
one needing review, zero accepted but not incorporated, three incorporated or
closed, and zero deletion-eligible.

Lesson disposition for the quota-form transaction is project-specific / no-new-
lesson. The mandatory conditional-upload behavior is a Google form validation
detail, while the durable submission-versus-approval distinction and truthful
provider-boundary reporting already follow current repository rules.

## 2026-08-27 candidate-screening semantic-contract repair candidate

A genuinely fresh signed-in fixed product-acceptance challenge started session
`ars1_1ayCoOm109wGXk4aBcBn-Lhu20weNUeZ` after the prior, postdeployment session
was correctly classified as resumability evidence rather than acceptance
evidence. The fresh session completed module applicability, recovered one
retryable automated-scout boundary, completed automated scouting with six
candidates, completed native discovery with 45 reconciled candidates, and
reached candidate screening.

The first candidate-screening semantic submission returned nonretryable
`research_semantic_work_mismatch`; a status read confirmed the authoritative
digest remained
`c1f38c29be0308426f2554073a4a4a4b26bf029c3f2d9977ebc3801220ba4272`.
The exact rejected result had 45 decisions for 45 unique packaged identities
and satisfied its public duplicate/selection shape, but its rationales showed
that it inferred duplicates from similar channels and treatment themes. The
server requires described-program redundancy to use the package's exact
`program_signature` groups. A single corrected package-bound submission using
that rule was accepted and advanced to digest
`5350b8fecb55461b8ffd9ffe7dd5d22d0c7f4e287c20baacafad9a1ee1a68641`,
`formal_evidence_search`, with 35 selected videos. No replacement session was
created.

The isolated candidate adds that exact all-identity and program-signature rule
to both the worker instruction and internal response-contract description;
server validation, Action/OpenAPI bytes, protocol bytes, and completion
authority are unchanged. Focused tests pass 13/13 and typechecking passes. The
complete deterministic gate passes 106 test files with one declared live file
skipped, 1,403 tests with six declared live tests skipped, and the production
build. Review, protected CI, exact deployment with rollback, and a new fresh
signed-in challenge are still required because deployment invalidates the
process-local acceptance trace.

The required lesson checkpoint is available: one open candidate, one needs
review, zero accepted but not incorporated, three incorporated/closed, and
zero deletion-eligible. The existing unreviewed candidate did not expand this
repair.

## 2026-08-26 signed-in product continuation stopped at recovery-call failure

The browser is now connected to the signed-in installed AskRigor GPT. A
continuation in the original fixed-acceptance conversation preserved session
`ars1_nxbYhtm-4VbuMomta5U4tgC-H4rO13LS` and reported recovery from the obsolete
client digest plus continuing formal-evidence work. Its ChatGPT response then
remained nonterminal without visible text changes for 30 minutes. The browser
tab was closed without deleting the saved conversation or submitting a retry.

A new AskRigor tab received an explicit instruction to continue only that same
session. The visible GPT summary said it recovered an in-progress authoritative
state, called the directed continuation, received a stale-state result, and
made one same-session recovery read. It said that call failed before returning
a new authoritative state. The GPT completed after 1 minute 12 seconds with
finalization unauthorized, no reader-facing report, and no
`product_acceptance_receipt`.

Do not infer exact Action-call history, checkpoint loss, or a repaired/known
server defect from the visible GPT summary alone. Preserve the session, obtain
sanitized Action/server diagnostics for the reported failed recovery read, and
classify the transport or route boundary before changing code or initiating
another product run. Phase K/K3 remains incomplete.

The postdeployment lesson checkpoint is available: one open candidate, one
needs review, zero accepted but not incorporated, three incorporated/closed,
and zero deletion-eligible.

## 2026-08-26 Phase K query-specificity repair deployed; signed-in UI remains

PR #105 passed every protected check on exact head
`d31dd3089fed5c6f98a8d402406507abad2a14e6`, merged as
`acd4d2f9664de0332f695a9099de111558aca918`, and was deployed from a
488-file, 1,667,999-byte exact archive with SHA-256
`29e838ef4a4f8ef1c2aeb8fdd05454048a0faa488fc74803288124dc6cc58101`.
Production is healthy on image ID
`sha256:760ef3989996b6a6f07c2aeef890829387144473c8d8ebf5519a28fc8f0dfa91`
and container `398cf359e697`. Immediate rollback retains prior image ID
`sha256:863bb44cfa0e16e7eb0e61b90d728d476428b79966566a25dd7d0f02f598fab3`
as `askrigor-research:rollback-acd4d2f-predeploy` plus prior Compose SHA-256
`c698cb6651b8c21d54fb3b8b1dc1546cb7b3817ba216ef51a05b3a7865cb9def`.
Active Compose SHA-256 is
`de623786089440754bc80c59ab8c0730a5dccf906782851940139f68ac08f53b`;
Caddy remained `fd1a7e709dab`.

Postdeployment public health, exact five-operation Action-schema equality,
unauthenticated rejection, the 21-tool MCP catalog, canonical Universal/HRP
manifests, one installed-connector protocol call, and both complete
eight-member plugin receipts pass. Every non-manifest plugin member is
byte-identical; no editor, Action/MCP URL, plugin-package, protocol, privacy,
credential, or public-inventory transaction was required.

The live image passed the exact checkpoint-derived query audit without network
or production-state writes: all 41 hypotheses remained, the new initializer
produced 40 unique queries of 180--581 characters, none included the complete
target, and all 32 undescribed material candidates used title fallback. The
only identical pair had no semantic discriminator. Authenticated production
Action calls then completed the already-active old PubMed chain and committed
that pair's two exact donor-provider bindings. The persisted checkpoint now
has seven completed hypotheses, one reused hypothesis, two reused provider
searches, and all 968 source relationships attached to the reused hypothesis.
The writer is stopped at untouched hypothesis index 7.

Fresh signed-in Custom GPT acceptance remains required and was not attempted
because the browser runtime reported no available browsers. There is no new
finalization or product-acceptance receipt, so Phase K is not complete.
Predeployment lesson status was available: one open, one needs review, zero
accepted but not incorporated, three incorporated/closed, zero
deletion-eligible.

## 2026-08-26 Phase K pagination repair deployed; query-specificity candidate verified

PR #104 passed deterministic verification, workflow policy, and every CodeQL
analysis on exact head `bdd4de6f9cb27735880e51b141805977a4c96893`, then
merged as `37bb2744cb73e4d0bbcee67b85eb7134f95d189a`. A secret-free
Git archive of the exact merge contained 488 tracked files, measured 1,662,801
bytes, and had SHA-256
`79d7dc1cf0e5002c8c290ab7e9cbaaea4b124844eefd763321a1444479d1ec49`.
Production runs image ID
`sha256:863bb44cfa0e16e7eb0e61b90d728d476428b79966566a25dd7d0f02f598fab3`
in healthy container `b268a7232c3f`. Immediate rollback retains the prior
image ID
`sha256:51cc770c4297b8ac6ee431d76f7f9698f15ad2b7a1bf7b2e7282f574ca672253`
as `askrigor-research:rollback-37bb274-predeploy` plus prior Compose SHA-256
`8162aaa3f235498a52bf6f32038da4f4299c97f43d2cab037a51f2352ea5455b`.
Active Compose SHA-256 is
`c698cb6651b8c21d54fb3b8b1dc1546cb7b3817ba216ef51a05b3a7865cb9def`;
Caddy remained container `fd1a7e709dab`.

Post-deployment public verification passes health, semantic equality with the
unchanged five-operation Action schema, unauthenticated HTTP 401, exactly 21
MCP tools, and exact Universal 20.5.15 / HRP 20.5.23 manifests. The installed
plugin's eight-member inventory remains byte-identical to source outside its
intentional manifest version cache-buster; source package SHA-256 is
`afe2c48b8fbab020e82f2cd884de7bbcb5abaa66d0ec1cfaaa88dcdd15ddeb6c`
and installed package SHA-256 is
`d383648b27a7cf4e50ce0858f2443c3d8e73f536a471befa321595593e39ed24`.
One installed-plugin read-only protocol probe returned the exact live
Universal identity. No editor, plugin, protocol, public inventory, privacy, or
credential transaction was required.

A non-committing replay of the exact failed transition now passes, advancing
from digest `ac40307c3d10ac89d879a0d30ed25c7201eb15e9769a58a22b645d3f9dc6a9d2`
to a valid successor and increasing deduplicated formal sources from 900 to
968. The authenticated controlled replay then resumed the same preserved
session and crossed repeated provider terminal pages without
`action_internal_error`. The writer was stopped deliberately without
finalization after sanitized inspection identified a separate development
defect: the 746-character target prefixed every formal query, 41 hypotheses
produced only 10 unique queries, one query was repeated 31 times, and each of
the first five completed hypotheses linked the same 968 sources.

The undeployed follow-up candidate bounds generated queries to 600 characters,
adds specific program/claim terms and source-title fallback, and preserves
indistinguishable hypotheses while reusing an exact terminal provider receipt
chain. Against a disposable copy of the same encrypted checkpoint, fresh
initialization yielded 40 unique queries of 180--581 characters, zero complete
target inclusions, and title fallback for all 32 undescribed material
candidates. The sole remaining duplicate pair was identical across program,
title, channel, claim, treatment class, and signature; both provider receipts
were reused with all 968 source links preserved and no executor call. Focused
typecheck and 40 tests pass. The complete host-bound `npm run verify` gate also
passes: 105 test files passed, one skipped; 1,400 tests passed, six skipped; and
the production TypeScript build passed. Protected review, exact deployment,
direct finalization, and a fresh signed-in product receipt remain required, so
Phase K is not complete.

## 2026-08-26 Phase K formal-provider terminal-page repair candidate

The next fresh signed-in fixed challenge preserved session
`ars1_nxbYhtm-4VbuMomta5U4tgC-H4rO13LS` but returned non-retryable
`action_internal_error` during formal-evidence search and correctly issued no
reader report or product-acceptance receipt. Sanitized checkpoint inspection
showed 41 formal hypotheses, 900 deduplicated provider candidates, one
completed PubMed search, one in-progress Europe PMC search, and 80 not-started
provider searches. The state remained at exact digest
`ac40307c3d10ac89d879a0d30ed25c7201eb15e9769a58a22b645d3f9dc6a9d2`;
no replacement session was created.

A non-committing replay of the exact next deterministic transition reproduced
the exception. When a paginated provider reached its final page, the controller
changed the search to `COMPLETE` but spread the preceding `next_cursor` back
into the terminal record. The authoritative schema rejected that impossible
complete-with-cursor state, and the Action router converted the uncaught
exception to `action_internal_error`. The defect is generic pagination-state
cleanup; it is not a 900-source limit, a provider outage, or a scientific-policy
change.

The candidate transition now explicitly discards the preceding cursor and
retry boundary before projecting the new provider-page state. A source-layer
regression covers both an in-progress cursor becoming complete and a retryable
provider boundary recovering to complete. A controlled-Action regression
starts from a server-owned formal frontier, executes two paginated pages, and
requires the terminal continuation to return a normal 200 transition with no
stale cursor. Focused verification passes 25/25 tests and typechecking passes
after the isolated worktree's locked npm workspace install was restored.

Reviewed merge, exact deployment with rollback, a complete direct controlled
replay through finalization, and a fresh signed-in product replay remain
required. The generated Instructions, Action schema/URL, MCP surface, protocol
bytes, and personal plugin are not changed by this server-only candidate.

## 2026-08-26 Phase K discovery repairs deployed; signed-in acceptance pending

The owner installed the current compact Custom GPT bundle and ran the fixed
synthetic challenge. Preserved session
`ars1_VfivvctoY04Mxpdu0sBa1S9zuKm6e_3u` ended after native discovery with a
terminal blocked directive and correctly returned no reader report or product
acceptance receipt.

Sanitized inspection of the encrypted server checkpoint proved two execution
defects. The synchronous Gemini scout reached its 45-second client timeout;
the transport exception had no HTTP status and was incorrectly classified as
non-retryable. Native fallback then sent six queries based on the complete
746-character challenge; the first was 767 characters and every search
exhausted with zero candidates. Bounded live comparisons returned candidates
for concise and deterministic-prefix variants, so the result was query
construction failure rather than an empty corpus.

PR #101 merged the generic repair as
`50a766e7eaddc7d718ceb7d0ad3ab65351e79a9a` after both required GitHub
checks passed. The exact merge is deployed as image
`askrigor-research:50a766e7eaddc7d718ceb7d0ad3ab65351e79a9a`, image ID
`sha256:699b066cdbab7793da792c8315e94a7699e7303140b5710dc93f981bcfb20a3f`,
in healthy container `d5e9e5aba261`. Immediate rollback preserves the prior
image as `askrigor-research:rollback-50a766e-predeploy` and the prior Compose
file at `/opt/askrigor/compose.yaml.rollback-50a766e`.

The repair bounds native fallback queries generically.
Native fallback uses a fixed 160-character word-boundary subject and a
200-character final-query ceiling. The controlled Gemini lane uses background
Interactions, records only one opaque bounded job checkpoint as controller
`IN_PROGRESS`, polls it without charging again, and requests provider deletion
before consuming an initial or correction result. Timeout/network failure is
retryable. The low-level technical scout remains storage-disabled. Controlled
temporary provider storage receives only the screened de-identified target and
public scout material; deletion is not described as erasing provider backups
or policy-retained data.

The test-first focused suites pass. The host-boundary complete suite passes
1,393 tests across 105 files with one file and six tests skipped only by their
declared credential gates. `npm run verify`, the four-page site validator,
28/28 site-deployment tests, and the zero-vulnerability production dependency
audit pass. Protocol bytes and public operation inventories are intentionally
unchanged. Regeneration proved the Custom GPT Instructions, OpenAPI, sync
ledger, and compiled bundle byte-identical to the already installed bundle, so
the editor Action URL and schema need no transaction for this server-only
repair. The personal plugin source and installed cache contain the exact eight
reviewed inventory members and match repository content byte-for-byte except
for the installed manifest's intentional cache-buster. Lesson status at the
release checkpoint was available: one open candidate, one needing review, zero
accepted-but-unincorporated, three incorporated/closed, and zero deletion
eligible. The privacy-site release
`50a766e-20260826-discovery-resilience` is live; the checked-in and live
privacy page bytes match exactly. Live MCP verification returned 21 tools and
exact Universal 20.5.15 and HRP 20.5.23 identities. The Action schema is
semantically equal to the checked-in five-operation document and rejects an
unauthenticated controlled call with HTTP 401.

A sanitized exact-target provider replay then passed the previously failing
frontier: Gemini completed after 20 polls and 14 grounded searches, returned
10 candidates, independently validated six, and requested deletion of the
temporary background interaction; the generic native fallback completed all
six searches with a maximum query length of 177 and returned one candidate.

The first direct production Action replay exposed one narrower projection
defect after that provider success. The controller validly persisted
`scout.status=IN_PROGRESS`, but `researchSessionViewSchema` omitted
`IN_PROGRESS` from its scout-status enum, so rendering the persisted progress
state produced `action_internal_error`. This is not a provider or candidate
failure. PR #102 added the missing
view state and a route-level hostile regression; its focused controller suites
pass 37/37. The standalone full suite and `npm run verify` both pass 1,394
tests across 105 files, with one file and six tests skipped only by their
declared credential gates; typecheck and build pass. Before merge, exact Git archive
`60672fca4e95e054e6ab5a56b20ccc63758c6adace963d3223d2c7da1b8af9c0`
was built as isolated image
`sha256:4d10dae907865c41cc34d27d29427fb8788bca28b090d13a14dd8d4226e8005c`.
The unexposed read-only candidate rendered three consecutive background
`IN_PROGRESS` transitions, completed Gemini with eight reconciled candidates,
completed native discovery, and reached candidate screening with 51 candidates.
Its temporary synthetic-session container was removed after the pass;
production remained healthy and unchanged.

PR #102 subsequently passed exact-head `Deterministic verification`,
`workflow-policy`, and CodeQL and merged as
`acf4766989c828900118e7e968fb3a76718b6d3c`. GitHub Actions was under a
declared major outage while checks queued; no required context was bypassed.
The exact 1,657,491-byte merge archive has SHA-256
`d2335a45aeba47e7736363ef494affad37cdf58dd5dadc59d76b396cf4f4b775`.
Production runs image
`askrigor-research:acf4766989c828900118e7e968fb3a76718b6d3c`, image ID
`sha256:51cc770c4297b8ac6ee431d76f7f9698f15ad2b7a1bf7b2e7282f574ca672253`,
in healthy container `2dfdda352bf1`. Immediate rollback is
`askrigor-research:rollback-acf4766-predeploy`, preserving prior image ID
`sha256:699b066cdbab7793da792c8315e94a7699e7303140b5710dc93f981bcfb20a3f`,
plus `/opt/askrigor/compose.yaml.rollback-acf4766` with SHA-256
`ec99db91201b02bf1f2c6d96908c3f0475b478a26b23d6e3bd6d0c3c1683bf11`.
The active Compose SHA-256 is
`8162aaa3f235498a52bf6f32038da4f4299c97f43d2cab037a51f2352ea5455b`;
Caddy remained container `fd1a7e709dab` with the same start time.

Post-deployment public verification passes health, semantic equality with the
five controlled Actions, unauthenticated HTTP 401, the 21-tool MCP catalog,
and exact Universal 20.5.15 / HRP 20.5.23 manifests. Controlled production
session `ars1_Hd9kXQQBTaL6esgtLqFprUu9taAmbGVp` rendered repeated
`IN_PROGRESS`/`progress_recorded` states at the repaired boundary. A later
Gemini failure was truthfully retained as `BLOCKED_RETRYABLE`; the same
session and digest remained executable. An explicit same-session retry resumed
background progress, completed Gemini with seven candidates, completed native
discovery with 49 reconciled candidates, and reached candidate screening. No
replacement session or caller completion claim was used.

The generated Instructions, Action schema, synchronization ledger, and plugin
content did not change, so the installed Custom GPT needs no editor import,
Action/MCP URL update, or plugin reinstall. The only remaining Phase K gate is
a fresh signed-in fixed acceptance challenge followed through finalization and
validation of the returned server-issued `product_acceptance_receipt`. Do not
claim Phase K complete before that receipt passes.

## 2026-08-25 PR #99 exact deployment; provider capacity and product replay pending

PR #99 merged as `c543cf94360e73937221861667b69f144d2029af`. A
secret-free Git archive of that exact merge contained 487 tracked files,
measured 1,637,125 bytes, and had SHA-256
`ebe5e51a63213369b136df927a4b7e1791ce105e5adfc585768699a50568c053`.
The server built immutable image
`askrigor-research:c543cf94360e73937221861667b69f144d2029af`, image ID
`sha256:dd86174f031dc4c92bae6c7ba380bbe5bdfb23e787a11105b3e11666bfe3b1d1`.
Only `research-mcp` was recreated; healthy container ID is
`dd275bca38b7e6ec1733f0b30e3a3b15ecde8d49ccac20a47148a855d4c2e3c1`.
Caddy was not recreated and remains container `62f77648cf1e`.

Immediate rollback is image
`askrigor-research:rollback-c543cf9-predeploy`, preserving image ID
`sha256:818f5d5dc5b39fc53ada9e5c63c676562f16b8904c82af4f6fb6041b74aa8a0c`,
plus `/opt/askrigor/compose.yaml.rollback-c543cf9`, SHA-256
`d710d529f4fb01fa97fc40145101231cfe769a51a5478346ed760ac9e75c5493`.
The active Compose SHA-256 is
`b790c1f6d98a2cf6fc5895eaf9b6045f6fd5f410ac93fc3133218df90192e289`.

Public verification passed health, semantic equality with the generated
five-operation Action schema, the unchanged 21-tool MCP catalog, Universal
20.5.15 and HRP 20.5.23 exact manifests, and HTTP 401 without Action
authentication. YouTube now returns a retryable quota boundary even for video
metadata, confirming that native provider capacity—not Spark candidate
generation or the controller repair—still blocks a fresh product replay. The
owner is creating one dedicated YouTube Data API project; sustained additional
capacity should use Google's formal quota-extension process rather than
repeated project creation.

The installed personal plugin remains current at
`0.1.0+codex.20260825134144`: all seven skill/asset files are byte-identical to
source, and the eighth inventory member differs only because the installed
manifest carries the intentional cache-buster version. No plugin reinstall is
required. The remaining Phase K work is secure installation of the replacement
YouTube key, one Custom GPT editor transaction using the generated Instructions
and Action URL, and a fresh signed-in acceptance replay yielding the server
receipt.

## 2026-08-25 Phase K3 retryable dependency projection repair candidate

PR #98 merged as `ab2433c5d774081dff4fecb2f78600b213b250a2` and that
exact commit is live in healthy production container
`a3cfd14478dd21de58cf64dd29c5aaacf7375ae44714ec5e9030740ea3ffd0ac`.
Public verification passed five controlled Action operations, the unchanged
21-tool MCP catalog, exact Universal 20.5.15 and HRP 20.5.23 manifests,
unauthenticated Action rejection, and a complete YouTube metadata retrieval.
The installed personal plugin's complete skill/asset inventory remains
byte-identical to source apart from its intentional cache-buster manifest
version, so no reinstall was required.

The next fresh signed-in acceptance replay ran for about eleven minutes before
returning a retryable dependency error and no acceptance receipt. Sanitized
checkpoint inspection showed that the GPT had created several new sessions
instead of preserving one. Every recent retryable session stopped at
`native_video_discovery`; one retained five Gemini candidates. A direct public
probe then reproduced `youtube_rate_limited` for YouTube search while ordinary
YouTube video metadata still completed. This proves that Gemini/Spark
integration and the YouTube credential remained functional; the immediate
external condition was search quota.

The product defect was broader than quota. The first rate-limited search was
truthfully recorded as retryable, but the compact projection still returned a
continue directive. An immediate unchanged retry then became a generic 409
dependency error, encouraging the GPT to start replacement sessions. Branch
`agent/retryable-controller-resume-20260825` makes a retry-blocked authoritative
capability project as stable `blocked` with the same session, digest, and next
capability. An unchanged explicit retry returns that same HTTP-200 view without
inventing a transition; a genuinely missing dependency still fails closed.
The compact Instructions preserve the session, prohibit immediate retry loops
and replacement sessions, and recover a retryable Action error through one
same-session status call. The public schema now also includes the already valid
terminal-blocked execution value.

Focused controller/generated-packet/OpenAPI tests pass 18/18. The exact
host-boundary `npm run verify` passes typecheck, 1,385 tests across 105 passing
files with one credential-gated file and six credential-gated tests skipped,
and the production build. The regenerated Instructions are 4,469 characters,
SHA-256
`cf22a1174deea0e15802749a8fe30c707da72035149a6021c01e99b5718b7b95`;
the synchronization-ledger SHA-256 is
`d235742745299d1e8a55dd8936c518136ecfbf90189559ab626f8182580b2b48`;
Action OpenAPI SHA-256 is
`cf7018c447baad2b1c9fce8d1ca880998863c2f15a4c3a36a9e672aec7e0d930`;
and installation-bundle digest is
`5aafafc5a43fb1d2be58086729154daee128def922735ca78aa2f904aa20652d`.
Review, merge, exact deployment, editor transaction, and a fresh acceptance
receipt remain pending. A new dedicated YouTube Data API
project/key or the provider's quota reset is also required before that replay.

The pre-PR lesson checkpoint was available at
`2026-08-25T21:36:57.004Z`: 1 open/needs-review candidate, 0 accepted but not
incorporated, 3 incorporated/closed, and 0 deletion-eligible. No new lesson
candidate was created because this repair directly implements the already
incorporated executable-frontier/coherent-retry guidance rather than adding a
new transferable architecture finding.

## 2026-08-25 Phase K3 terminal discovery and acceptance repair candidate

The first real controlled Custom GPT acceptance replay exposed a server-state
dead end rather than a model-only failure. The server returned
`CONTINUE_RESEARCH`, denied finalization, and supplied no next capability. The
controlled projection nevertheless told the GPT to finalize. The encrypted
checkpoint showed that a useful first Gemini/Spark frontier had been retained
(eight grounded searches, six source IDs, and two independently validated
videos), but a later invalid scout attempt changed the operation to terminal
while leaving the retained frontier retryable. Native YouTube discovery was
therefore suppressed and required module execution remained disconnected from
the operations implementing it.

Branch `agent/controller-terminal-boundary-finalization-20260825` repairs the
controller rather than adding another Custom GPT instruction exception. A
terminal external-scout boundary now preserves validated candidates and search
provenance while permitting independent native discovery; retryable work still
cannot be silently bypassed. Restored checkpoints reconcile operation and
frontier state. Complete or terminal discovery frontiers can reach screening
when at least one independently validated candidate exists. Required module
statuses are projected from their server-owned operation groups. A continue
state can never become a finalize directive, and a continue state with no
server-directed work returns a stable terminal-blocked view instead of entering
the observed loop or throwing an internal exception. Signed transition traces
now distinguish progress, retryable boundaries, terminal boundaries, and actual
operation completion. The fixed acceptance fixture enters the controller as a
specified diagnosis, matching its declared de-identified scenario.

The fixed product-acceptance target is now a concrete regression scenario for
end-stage hip osteoarthritis. It requires separate resistance, aquatic,
mobility, gait/movement, cycling/conditioning, multimodal rehabilitation,
injection, nutrition/supplement, waiting, and surgery trajectories; this is an
acceptance fixture, not a hip-specific protocol exception. A live pre-merge
replay of the current low-thinking compact scout ran nine grounded searches
but returned only four candidates, of which two passed independent identity
validation and two had channel mismatches. That evidence identified a second
implementation conflict: the compact transport weakened the richer scout skill
by inviting only three candidates and forcing low thinking. The candidate now
uses medium thinking and requests 8–16 materially distinct candidates for broad
treatment-choice targets while still allowing honest smaller results with a
recorded gap.

Focused controller and orchestration re-verification passes 51/51, and the
independent re-review passes 25/25 with no remaining finding in the repaired
paths. The compact Instructions remain 3,995 characters, SHA-256
`16be9335dfcfc1fe721d4ef2a7268c5ccc1508869e8d65df28c7dde586f97bab`.
The regenerated synchronization ledger SHA-256 is
`80597b039ffc8e8a483aca6e0424953e70dd3e773ba24c778a9b1c9a51617616`,
the Action OpenAPI SHA-256 is
`63ce76bfc7c763a6a5ffb77cba0e9badc17a89608f42ca5c42ce698b1db83681`,
and the installation-bundle digest is
`b7e76b819b1ac390cabe9ef97058b0e6f5d6b376644a8a68e1f322eb2abc62ba`.
The generated Action schema changed only to expose the truthful terminal and
progress transition values; the Instructions did not change. The exact final
`npm run verify` passes typecheck, 1,383 tests across 105 passing files with six
declared skips and one skipped credential-guarded file, and the production
build. A preceding parallel test checkpoint had one fixed-duration HTTP timeout
and correctly caught stale generated-artifact hashes; the HTTP test and updated
release packet passed 59/59 in isolation before the clean exact gate. Lesson
closeout, PR review, merge, exact deployment, plugin
synchronization, editor schema refresh, and a fresh signed-in Custom GPT
acceptance replay remain pending. Public Action and MCP operation counts,
canonical protocols, provider credentials, retention, and health-policy
boundaries are unchanged.

## 2026-08-25 complete plugin package receipt repair candidate

The installed AskRigor plugin now contains two declared skills, but the prior
package-receipt generator traversed only `skills/askrigor`. It could therefore
return a passing receipt while silently omitting every file in
`skills/browser-archive-downloading`. Branch
`agent/plugin-receipt-complete-inventory-20260825` repairs the receipt to cover
the complete manifest-declared `skills/` tree as well as the manifest and
assets. Hostile coverage proves that adding, removing, or changing a browser-
archive skill file invalidates the receipt.

The repaired generator derives an eight-file receipt for both the personal
plugin source and installed cache at version
`0.1.0+codex.20260825134144`; both produce exact package SHA-256
`d383648b27a7cf4e50ce0858f2443c3d8e73f536a471befa321595593e39ed24`.
Focused plugin/deployment tests pass 10/10. The complete gate passes with one
worker under current host load: 105 test files passed with one declared skip,
1,376 tests passed with six declared skips, and typecheck/build passed. A prior
normal-concurrency attempt reached 1,373 passing tests and only three fixed-
duration timeouts; each affected suite had already passed independently, and
hosted normal-concurrency CI remains the merge gate.

This repair changes no plugin bytes, installed plugin registration, public
Action or MCP inventory, canonical protocol, production runtime, provider,
credential, retention, or privacy boundary. It makes the existing source-versus-
installed currency claim complete and fail-closed rather than requiring another
reinstall of already identical bytes.

The pre-PR lesson checkpoint at `2026-08-25T14:44:05.788Z` was available:
1 open candidate, 1 needing review, 0 accepted but not incorporated, 3
incorporated or closed, and 0 deletion eligible. No queued lesson expands this
repair. Lesson disposition is project-specific/no-new-lesson: the change
enforces the already documented exact installed-package receipt requirement in
the repository test that owns it.

## 2026-08-25 Phase K2 controlled Custom GPT projection candidate

Phase K2 replaces the Custom GPT's low-level research tool collection with four
authenticated controller operations plus the isolated consented lesson write.
The server now issues bounded, signed, resumable semantic-work packages; rejects
stale state, forged evidence receipts, caller-authored completion fields, and
premature finalization; and keeps automatic Gemini/Spark scouting inside the
controller. The 21-tool MCP catalog is unchanged.

The dedicated compact Instructions are 3,995 characters, SHA-256
`16be9335dfcfc1fe721d4ef2a7268c5ccc1508869e8d65df28c7dde586f97bab`.
The synchronization ledger SHA-256 is
`624002ab904cb3593da8751039f26809214c8bc03907dfeb66a6542e62389c99`;
the candidate Action OpenAPI SHA-256 is
`6acfdc3b0b464746a6961dce738407216c42bc9978f9c01b66fb9198bbe91524`;
and the installation-bundle digest is
`c62820b1cd3cc431a445049545d7e4bff812b124702431544a7b9adfafafdf2d`.
Local verification is complete: `npm run test:run` and the test stage inside
`npm run verify` each passed 1,362 tests across 105 passing files, with one
credential-guarded file and six credential-guarded tests skipped; typecheck and
build passed. `npm run test:site` validated all four public pages and
`npm run test:site-deploy` passed 28/28. The pre-PR lesson checkpoint was
available with 1 open/needs-review candidate, 0 accepted-not-incorporated, 3
incorporated/closed, and 0 deletion-eligible. No new lesson candidate was
created: K2 implements the already-approved server-authority roadmap and did
not establish a new transferable failure.

This is repository candidate evidence only. K3 still requires reviewed merge,
reversible exact-commit deployment, one editor import, and fresh signed-in
product replays using server-issued acceptance receipts.

## 2026-08-25 execution-control Phase K K1 candidate

K0 merged through PR #85 at exact commit
`bf592f03d71a891edab3ab73f300fd3686a66cac`; all hosted and exact post-merge
checks passed. K1 runs on branch
`agent/execution-control-phase-k1-20260825` from that baseline.

K1 closes the remaining server-authoritative answer gap. Each selected video
now reaches a separate bounded evidence step after exact transcript and
discussion completion. Creator findings cite exact transcript-segment hashes
and receive server-derived timestamps; community findings cite exact sampled
comment hashes and retain only non-identifying wording, regimen clues, outcomes,
and counter-signals. Every creator and community finding carries its own exact
structured program, so a report cannot assign a claim to some other exercise,
rehabilitation, dietary, procedural, or multimodal program mentioned in the
same video. Direct identifiers and substantial verbatim copying are rejected.
Raw public source material lives only in a bounded
process-local cache. On cache loss, the server replays the completed transcript
and discussion from their first pages, compares exact receipt hashes, and fails
closed and revokes the cache if the reacquired frontier differs. Commenter names
and channel IDs are discarded as the cache ingests the public sample.

Completed study/review/notice audits now retain bounded reader evidence: exact
population/stage, program/comparator, outcome/horizon, method findings, and
claim capabilities linked to exact document block IDs and audit/source hashes.
Treatment finalization preserves the exact selected-video interpretations used
by the assessor rather than only their digest. Raw article blocks, transcript
text, comment text, and provider output are not added to controller state.

After treatment finalization, the controller issues one strict report-synthesis
package. The state-visible package contains only the evidence digest, scope,
target, and counts; exact bounded evidence is supplied transiently to the
worker. The server materializes stable claim IDs, validates every formal,
creator, community, audited-video, timestamp, and limitation reference, rejects
effect claims backed by bounded/effect-excluded/retracted sources, prohibits a
comparative conclusion in a bounded report, and caps the packet below the
existing Action response limit. A current report is required by the final
completion audit. Finalization permit v2 signs its exact digest and returns the
same reader packet; report mutation invalidates the decision.

Hostile coverage includes unknown/mutated report references, effect-excluded
support, report mutation, raw-comment identity exclusion, exact transcript and
comment citation binding, immutable evidence state, process-local cache
revocation, cache-loss receipt mismatch, source-block-linked method evidence,
and updated Hermes/n8n permit consumers. Typechecking and the focused K1 suites
pass, including the listener-backed private orchestration tests. The complete
host-bound `npm run verify` gate passes typechecking, 1,355 tests with six
intentional skips, and the production build. Final diff review, lesson
closeout, commit, PR, hosted checks, and merge remain pending.

The final pre-PR K1 lesson checkpoint at `2026-08-25T03:01:29.026Z` was available:
1 open candidate, 1 needs
review, 0 accepted but not incorporated, 3 incorporated or closed, and 0
deletion eligible. No unreviewed lesson expands K1. Lesson disposition is
project-specific/no-new-lesson: K1 enforces the already approved server-owned
report/program-fingerprint architecture and introduces no distinct generalized
failure pattern beyond the incorporated treatment-landscape lesson. Public Action/OpenAPI, the
21-tool MCP inventory, Custom GPT Instructions, plugin, deployment, paid
services, canonical protocols, checkpoint retention, and production activation
remain unchanged. K2 is the compact public Action and generated Custom GPT
projection after reviewed K1 merge.

## 2026-08-24 execution-control Phase J candidate

Phase I merged through PR #82 at exact commit
`cc78d495fc26b2a48d599c0b644fc5453e36c0cb`; all hosted checks passed and
local `main` was fast-forwarded to that commit. Phase J runs on branch
`agent/execution-control-phase-j-20260824` from that exact base and follows
`docs/superpowers/plans/2026-08-24-phase-j-n8n-control-plane-pilot.md`.

The candidate adds one state-digest-bound private `/advance` operation. The
AskRigor server alone derives whether the current step is deterministic
continuation or one exact Hermes semantic package, validates the exact result,
and commits through the existing session store. Callers cannot select work,
providers, counts, operations, or completion. Killed workers remain retryable;
malformed/unbound output and stale state do not advance. Final permits returned
through the private interface are reverified against current controller state,
protocol identity, expiry, signing key, payload hash, and signature.

The separate disabled n8n adapter accepts only opaque IDs. Its ephemeral store
retains a digest, safe directive, bounded retry/no-progress counters,
timestamps/reason codes, and only after authorization the output boundary and
permit payload hash. n8n receives no inner session ID, research target,
semantic/source content, report, or provider/controller credential. The
tracked workflow contains only built-in Webhook, HTTP, Switch, Wait, If,
Respond, and Stop/Error nodes. Continue/retry are bounded; owner-gate, stuck,
blocked, forged-completion, and incomplete paths cannot become a successful
research execution.

The exact official n8n `2.35.7` image is pinned at
`sha256:166d7e3ca384afdffe75394bf00046c299d84a4bf17b19b35d6cf7773af0a147`.
It passes a disposable import/export/publish/runtime smoke covering comparative
permit, bounded permit, retry-then-permit, blocked, forged-completion, and
still-incomplete paths. Execution saving is disabled and the temporary n8n
database is deleted. The branch was reconciled with current `main` at merge
commit `266b0ba`; the only merge conflict was the additive recovery document,
and both candidate sections were preserved.

Focused typechecking and 40 controller/adapter/workflow/Hermes/epistemic tests
pass. The workflow validator passes with 14 exact built-in nodes and SHA-256
`3ac005edf7182b389cb83ad426e654ca14ff41d28313b615ce5930c365870ca5`.
The validator also pins the complete executable workflow projection; hostile
tests reject endpoint exfiltration, unrelated environment-secret access,
unreviewed node parameters, and expanded success responses.
The final complete `npm run verify` passed typechecking, 1,344 tests with six
declared skips, and the production build at ordinary concurrency. Earlier
load-sensitive attempts had only unrelated fixed-timeout process/loopback
failures; each passed unchanged in isolation. Hosted CI remains the final merge
gate.

The pre-PR lesson checkpoint at `2026-08-24T23:04:20.032Z` was available: 1
open candidate, 1 needing review, 0 accepted but not incorporated, 3
incorporated or closed, and 0 deletion eligible. Neither queued item expands
Phase J. Lesson disposition is project-specific/no-new-lesson: this phase
implements the already approved server-authority and external-orchestrator
boundaries; its n8n bypass prevention is retained as executable project tests.
Final diff review, PR, hosted checks, and merge remain pending. Phase J changes
no public MCP or Action inventory, canonical protocol, generated Custom GPT
Instructions, plugin, production deployment, provider account, paid service,
credential, or retention. Phase K is next after reviewed merge.
## 2026-08-24 epistemic phase router candidate

Current `main` was fetched and fast-forwarded to `b9a9b4b`. That baseline had
temporary one-shot workflow/script machinery for an epistemic repair but had
not changed the canonical protocol bytes. The current isolated task branch
reimplements the repair directly from that latest baseline and removes the
self-modifying one-shot machinery.

The candidate advances Universal to `20.5.15` and HRP to `20.5.23`, both dated
2026-08-24. It adds a controlling DEVELOPMENT / DISCOVERY versus VALIDATION /
CONFIRMATION router before phase-sensitive anti-overfitting safeguards, permits
aggressive development search while withholding independent-confirmation
claims, and freezes the selected model before genuinely independent
validation. It also adds a bounded heuristic-attractor check: a correct rule
applied in the wrong phase is an error, and recurrence after user correction
requires diagnosis of the higher-level attractor rather than another local
exception.

The repair is present in both canonical XML files, HRP architecture and final
checks, the project router, and the worker-facing agent map. The generated
Custom GPT architecture remains intentionally dynamic: its compact editor
instructions load complete protocol bytes through runtime Actions and do not
embed a competing version-pinned protocol excerpt. Dedicated structural and
behavioral-scenario regressions cover post-hoc Dataset A formula discovery with
independent Dataset B confirmation and revealed development cases that must not
be blocked by a blind-validation freeze. Both XML files parse, the dedicated
phase-router regressions pass, and the complete `npm run verify` gate passes:
typechecking, 98 passing test files with one declared skip, 1,327 passing tests
with six declared skips, and the production build. An isolated package-entrypoint
smoke initially crossed its fixed ten-second timeout under host load and passed
unchanged on immediate isolated rerun in 5.68 seconds. The complete staged diff
was reviewed and contains only the authorized repair, manifest/test updates,
recovery evidence, and removal of the obsolete one-shot machinery. The required
pre-commit lesson checkpoint at
`2026-08-24T21:03:55.162Z` was available: 1 open candidate, 1 needing review,
0 accepted but not incorporated, 3 incorporated or closed, and 0 deletion
eligible. Neither queued item expands or blocks this owner-directed canonical
repair. Lesson disposition is no separate lesson artifact: the durable repair
is already the canonical Universal/HRP rule and its executable regressions.

## 2026-08-24 execution-control Phase I candidate

Phase H merged through PR #80 at exact commit
`8c292a4d1d22d482d1752016f24c17314f9c8c21`. All hosted checks passed and
local `main` was fast-forwarded to that commit. Phase I runs on branch
`agent/execution-control-phase-i-20260824` from that exact base and follows
`docs/superpowers/plans/2026-08-24-phase-i-hermes-worker-pilot-implementation.md`.

The current candidate adapts the official `NousResearch/hermes-agent` Python
library at reviewed release `v2026.8.19`, package version `0.20.5`, and exact
commit `fcbd1076a93841fa88855acce810e342a5b78101`. AskRigor does not create a
parallel agent runtime. A TypeScript parent drives the existing authenticated
private controller, requests deterministic work only through `/resume`, sends
one exact semantic package to a fresh Hermes process, and submits the strict
result through `/submit`.

The research-worker profile enables no Hermes tools, repository access,
context files, memory, trajectories, checkpoints, or background review. It
uses a clean exact-commit checkout, a Python environment outside that checkout,
a bounded child environment, and a fresh temporary directory deleted after the
turn. The child never receives the private orchestration credential or any
production research-provider secret. A separate read-only/no-tools development
context loader reads exact `AGENTS.md`, project instructions, and complete
canonical protocol bytes with hashes; it grants no write to `main`.

The fail-closed outer result contract rejects extra completion/count/provider
fields, stale or cross-session digests, mismatched work types, and cross-
frontier candidate output. The response guard releases prose only from an
authenticated server `AUTHORIZED` or `BOUNDED` decision with a matching permit.
Hermes token/cost fields remain diagnostics and cannot affect controller state.

Focused typechecking and the Phase I worker/private-controller suite pass 17/17
tests, including a real private-controller integration that completes
module routing, server-owned Gemini/native discovery, and public-candidate
screening, then stops at the unchanged server denial rather than inventing
later completion. The exact official Hermes runtime also passes two repeated
one-shot invocations against a loopback-only model fixture with zero worker
tools. The held-out controller benchmark includes authorized, bounded, and
rejected outcomes and keeps cost non-authoritative.

Before the final per-turn checkout/Python-path hardening, the complete
`npm run test:run` gate passed 1,321 tests with six declared skips and
`npm run verify` passed typechecking, that suite, and the production build.
After that hardening, focused tests, typechecking, the exact official-runtime
smoke, and build pass. The complete single-worker run passed 1,320/1,321 tests;
only the pre-existing package-entrypoint test exceeded its fixed 10-second
limit by 0.56 seconds while host load was near 16 and swap was exhausted. That
exact test immediately passed alone in 9.03 seconds without modifying its
timeout. Hosted standard-concurrency CI is therefore retained as the merge
gate. The public MCP and Action inventories, protocols, generated Custom GPT
instructions, plugin bytes, deployment, provider accounts, credentials, and
retention remain unchanged. The pre-PR lesson checkpoint at
`2026-08-24T18:13:20.491Z` was available: 1 open candidate, 1 needing review,
0 accepted but not incorporated, 3 incorporated or closed, and 0 deletion
eligible. Neither open item expands Phase I. Final diff review, PR, hosted
checks, and merge remain pending. A credentialed live model-quality evaluation
is optional release evidence rather than a controller-enforcement gate.

## 2026-08-24 execution-control Phase H candidate

Phase G merged through PR #79 at exact commit
`86c9455c63f94f832d3d933eb1a174d784e0a132`. Phase H runs on branch
`agent/execution-control-phase-h-20260824` from that exact commit and follows
`docs/superpowers/plans/2026-08-24-phase-h-private-orchestration-interface.md`.

The implementation adds a disabled-by-default private HTTP adapter at
`/internal/research/v1/*` for start, resume, minimized status/next work, exact
semantic submission, and finalize. It reuses the existing prototype routes,
research-session controller, and in-memory or Phase G encrypted checkpoint
store. It is not registered as an Action or MCP tool. Enabling it requires an
independent at-least-32-byte Bearer secret. Browser Origin requests are refused;
JSON bodies are limited to 256 KiB, responses to 512 KiB, the token bucket to
30 requests/minute/client, and process concurrency to four. Responses are
non-cacheable and omit the raw research target, diagnosis narrative, raw
provider/source bodies, transcript/comment/publication text, and credentials.

Phase H semantic submission accepts only the exact unresolved module-routing
set or the exact discovery-bound candidate-screening package, additionally
bound to the complete current controller-state digest. Strict schemas reject
extra completion flags, caller counts/lists, provider toggles, stale state,
duplicate decisions, and attempted demotion of already-required modules.
Deterministic provider coordination remains server-owned.

The integration work found and fixed three controller safety issues rather
than hiding them in transport prose: pre-terminal bidirectional status no
longer tries to derive a future evidence digest; transitions validate their
projected response before commit; and a restart after external-study evidence
but before linked-source completion or claim recalculation reopens the lost
exact external-evidence work after source reacquisition while retaining a
matching method audit. None of these repairs advances or weakens a completion
gate.

Focused Phase H typechecking and 40 HTTP/controller/formal/persistence tests
pass. The focused public-inventory/private-boundary suite passes 68/68 and
confirms exactly 21 MCP tools and 26 public Actions. The complete host-boundary
`npm run test:run` passes 1,309 tests with six declared skips; `npm run verify`
passes typechecking, that same suite, and the production build. Final diff
review, PR, hosted checks, and merge remain pending. Canonical protocols, generated
Custom GPT instructions, plugin bytes, provider accounts, credentials,
deployment, and production activation remain unchanged. Phase I is next after
the reviewed Phase H merge.

The pre-PR lesson checkpoint at `2026-08-24T17:01:38.077Z` was available:
1 open candidate, 1 needing review, 0 accepted but not incorporated, 3
incorporated or closed, and 0 deletion eligible. No unreviewed item expands
Phase H. Lesson disposition is project-specific/no-new-lesson: the phase
exercises the already promoted server-authority and durable-state patterns;
the projection-before-commit repair is preserved as executable AskRigor
transaction-order regression coverage rather than generalized from one
project instance.

## 2026-08-24 execution-control Phase G candidate

Phase F merged through PR #78 at exact commit
`5714ae44aa93b661a7b98b53b8b1f1dafef207da`; its former candidate section
below predates that merge. Phase G now runs on branch
`agent/execution-control-phase-g-20260824` from that exact commit.

The repository recovery/storage audit is recorded in
`docs/superpowers/plans/2026-08-24-phase-g-resumability-privacy-implementation.md`.
The recommendation is a bounded encrypted local-VPS controller checkpoint,
with raw comments/transcripts/article text/provider artifacts remaining
ephemeral, plus a separate host-managed public Retraction Watch mirror mounted
read-only into the application. No external database or new paid service is
recommended.

The owner delegated the proportionate implementation decision on 2026-08-24.
After weighing the recorded benefits and costs, Codex approved (A) 72-hour-
idle/seven-day-maximum encrypted private research-session retention without
backup and (C) a daily public Retraction Watch mirror retaining active plus
previous snapshots without backup. This does not authorize any external
database, paid service, horizontal shared store, general backup inclusion, or
broader retention. The implementation is locally verified; no production path
has been activated from this branch.

The optional encrypted file adapter persists only the controller state needed
to derive the next authoritative capability. AES-256-GCM authenticates state
and lifecycle metadata. The adapter enforces 72-hour idle and seven-day
absolute expiry, bounded counts/bytes, strict file modes, atomic writes,
explicit deletion, and five-minute fenced claims. Raw source/provider content
stays in memory. Restore reconciliation reopens lost transcript/discussion,
full-text, and bidirectional-search work without advancing state; exact-source
full-text reacquisition retains a completed method/external audit only when the
source identity and content hash still match.

The raw D2 evidence-artifact store remains ephemeral. The public Retraction
Watch mirror now prunes to active plus previous only after atomic activation,
and a compiled bounded sync CLI plus hardened systemd service/timer templates
are ready for the later reviewed deployment transaction. The application will
receive only a read-only mirror mount; the sync job receives no AskRigor runtime
secrets. Threat model, privacy map, backup exclusion, activation, recovery, and
rollback are documented.

Focused Phase G verification passes 85/85 tests. The complete host-boundary
suite passes 1,303 tests with six declared skips. `npm run verify` passes
typechecking, that same suite, and the production build; `systemd-analyze
verify` passes the tracked service/timer. The public inventory remains 21 MCP
tools and 26 Actions. Protocols, generated Custom GPT instructions, plugin
bytes, external providers/accounts, credentials, current deployment, and
production retention remain unchanged. Lesson closeout, PR, hosted checks, and
merge remain pending; Phase H is next after the reviewed merge.

The Phase G start lesson checkpoint at `2026-08-24T12:24:56.858Z` was
available: 1 open candidate, 1 needing review, 0 accepted but not incorporated,
3 incorporated or closed, and 0 deletion eligible. Neither open item expands
Phase G.

The pre-PR lesson checkpoint at `2026-08-24T15:36:56.397Z` was also
available with the same counts. Lesson disposition is project-specific/no-new-
lesson: Phase G applies the existing universal context/checkpoint recovery
pattern and the already approved server-authority architecture. Its encrypted
session schema, ephemeral-handle reconciliation, and Retraction Watch mirror
are AskRigor-specific enforcement rather than a new general workflow rule.

## 2026-08-24 execution-control Phase F candidate

Branch `agent/execution-control-phase-f-20260824` starts from exact merged
Phase E commit `191f0ee6894fed5d51c074e0d6fdd9be5d671839` and implements
Phase F of
`docs/superpowers/plans/2026-08-23-execution-control-productionization-roadmap.md`.
It changes only the unregistered, non-production research-session controller
and its bounded ephemeral evidence projection.

The controller now reaches `READY_TO_FINALIZE` only after its current
server-derived final completion audit passes. The separate finalization
operation can issue a comparative permit for that exact state, or a distinct
bounded-nonranking permit only for a recognized terminal treatment boundary.
The HMAC-SHA256 permit binds execution, exact protocol tuple, complete state,
authorization basis, limitation set, output boundary, key identity, and a
15-minute default validity window (one-hour hard maximum). Same-session replay
of unchanged state is valid before expiry; cross-session, cross-state,
cross-protocol, expired, malformed, wrong-key/secret, or tampered permits fail.
The permit has no raw/private research content.

Technical permit evidence and ordinary reader rendering are separate. The
response includes a plain permitted scope and server-derived limitations, with
the exact limitation set digest-bound to the permit. External-evidence state
now preserves bounded provider outcome/access status and attempt hashes,
publication-integrity state and event hashes, and exact server-derived
claim-local limitation text/hashes. Provider no-match language is limited to
that provider, unavailable optional providers stay explicit, and active
retraction/withdrawal state cannot retain ordinary effect-claim permission.

Typechecking and the focused controller/prototype/formal/external-evidence
suite pass 46/46; the focused public-inventory suite passes 121/121. The
complete `npm run verify` gate passes typechecking, 1,281 tests with six
declared skips, and the production build. The first two full-suite attempts
exposed one pre-existing archive checksum test whose default five-second
timeout failed only under suite load while the test passed alone in 3.6
seconds. It now has the same 15-second limit as the adjacent archive/evidence
test, without changing its assertions. Lesson closeout, PR, hosted CI/security
review, and merge remain pending.

The pre-PR lesson checkpoint at `2026-08-24T12:16:39.909Z` was available:
1 open candidate, 1 needing review, 0 accepted but not incorporated, 3
incorporated or closed, and 0 deletion eligible. Neither open item expands
Phase F. Lesson disposition is project-specific/no-new-lesson: this phase
implements the already owner-approved server-authority, bounded-output, and
integrity-permit architecture without exposing a new transferable failure.

The public inventory remains 21 MCP tools and 26 Actions. Canonical protocol
bytes, generated Custom GPT instructions, plugin bytes, production runtime,
provider configuration, credentials, deployment, durable storage, and
retention remain unchanged. Phase G next requires a privacy/resumability owner
decision before any durable store or production write capability is activated.

## 2026-08-24 execution-control Phase E candidate

Branch `agent/execution-control-phase-e-20260824` starts from exact Phase D5
merge `16bc4bd9a312d2c6a34c0629bd2467bbf3158341` and implements Phase E of
`docs/superpowers/plans/2026-08-23-execution-control-productionization-roadmap.md`.
Phase D6 remains deliberately provider/owner-gated; Phase E adds no Scite,
Ripeta, provider account, credential, or transport.

The existing non-production research-session controller now owns explicit
community-to-formal and formal-to-community iteration. Work packages enumerate
every exact selected-video receipt and formal hypothesis/source reference in
both directions. Strict semantic submissions must assess every source once;
invented, omitted, stale, unsupported-terminal, or caller-completed records are
rejected. Material community findings append cryptographically identified
formal hypotheses and reopen the existing PubMed/Europe PMC, lawful full-text,
method, external-evidence, linked-work, and claim-capability path. Formal
discriminators create bounded searches only inside already audited discussion
pools, with receipt hashes/counts and separate result assessment; raw comments
do not enter session state.

The controller derives treatment classes, program fingerprints, discovery
batches, source identities, depth receipts, formal follow-up, and external
scout reconciliation from authoritative session records. Workers can annotate
specific-program search meaning, directional batches, selected-video value,
and whether expansion remains useful, but cannot submit counts, access states,
locks, assessor output, or completion. The existing deterministic treatment
assessor remains the sole selection/depth/synthesis lock. Broad comparisons
with omitted directions stay executable even when a worker says to stop.
Screened nonmaterial unspecified mentions do not invalidate real coverage, and
nonretryable formal gaps are structured as bounded nonranking limitations
rather than silently counted as completed formal follow-up.

The new server-derived final completion audit is bound to the current complete
session basis and checks protocol currency, module applicability/completion,
all upstream operations, treatment locks, bidirectional currency, and every
potentially decision-changing linked item. Its exact checks/status/digest are
revalidated by the session schema. Passing state derives
`FINALIZATION_ALLOWED` readiness, while Phase F permit issuance remains
disabled and `evaluateResearchFinalization` still denies authorization. A
terminally bounded treatment state can expose only
`BOUNDED_NONRANKING_ONLY`.

Focused Phase E tests pass 68/68. The first complete sandbox run was invalid
only for the known loopback/IPC `EPERM` boundary; 1,202 other tests passed
there. Two unrelated, load-sensitive timeout checks each passed when isolated,
and the complete host-boundary `npm run verify` gate subsequently passed
typechecking, 1,279 tests with six declared skips, and the production build.
The pre-PR lesson checkpoint at
`2026-08-24T10:53:24.285Z` was available with 1 open candidate, 1 needing
review, 0 accepted but not incorporated, 3 incorporated or closed, and 0
deletion eligible. No unreviewed lesson expanded this phase. Lesson disposition
is project-specific/no-new-lesson: Phase E implements the already approved
server-authority and breadth-before-depth architecture without exposing a new
cross-project lesson. PR, hosted CI, and merge receipts remain pending.

The prototype stays outside production inventory. Public inventory remains 21
MCP tools and 26 Actions; canonical protocol bytes, generated Custom GPT
Instructions, plugin bytes, production runtime, provider footprint,
credentials, and durable retention are unchanged. Phase F is next after the
reviewed merge.

## 2026-08-24 execution-control Phase D5 candidate

Branch `agent/execution-control-phase-d5-20260824` starts from exact merged
Phase D4 commit `1fd17c89a514a04f1f8a2b35d032964c231e33ad` and implements
Phase D5 of
`docs/superpowers/plans/2026-08-23-execution-control-productionization-roadmap.md`.
It extends the existing external-study evidence source and coordinator path; it
does not create another controller, authority, public operation, or model-
selectable provider.

Strict versioned authorized-provider record adapters now normalize PubPeer
post-publication threads and Epistemonikos review ancestry. Both require the
exact queried DOI and reject unknown fields, oversized content/collections,
duplicate identities, count mismatches, malformed pagination, and identifier
mismatch. PubPeer preserves visible/edited/deleted-or-unavailable state,
identified-author replies, posted/updated/revision identity, raw
classification source/label, bounded excerpts/links, provider counts, cursor,
and exhaustion. Epistemonikos preserves include/exclude/cite/update relation,
current/removed/unknown state, provider record/raw relation/classification,
bounded review identity, cursor, and exhaustion. Provider labels remain
metadata rather than evidence quality or scientific truth.

The existing server-owned coordinator accepts either executor only at
construction. Every configured provider executes after exact Crossref identity
verification, is stored in the existing bounded in-memory artifact store, and
has its attempt/artifact/status bound into the signed receipt. Partial or
retryable configured coverage cannot become complete; an executor that throws
produces no signed success. Unconfigured providers remain explicit coverage
gaps. Visible PubPeer messages and exact current review links create source-
linked audit work. Deleted/unavailable messages and removed, unresolved, or
bibliographic-only review links remain bounded limitations and cannot support
claims. Method-audit references use the actual ancestry provider.

Focused adapter/coordinator/formal verification passes 53 tests. Public
inventory checks pass the unchanged 21 MCP tools and 26 Actions. The complete
host-bound deterministic suite passes 1,263 tests with six declared skips, and
`npm run verify` passes typechecking, that suite, and the production build.
The production dependency audit reports zero known vulnerabilities. The first
sandboxed full-suite attempt was invalid because loopback listeners were
denied with `EPERM`; the unchanged suite passed through the required host
boundary.

PubPeer and Epistemonikos live access remain disabled because current official
authorized contracts/terms and credentials were not available for this phase.
No PubPeer/Epistemonikos key, token, account, endpoint, hostname, allowlist,
live request, durable store, protocol, deployment, plugin, Custom GPT, or
production configuration change is included. The required pre-PR lesson checkpoint at
`2026-08-24T09:08:53.516Z` was available with 1 open candidate, 1 needing
review, 0 accepted but not incorporated, 3 incorporated or closed, and 0
deletion eligible. No unreviewed lesson expanded this phase. Lesson disposition
is project-specific/no-new-lesson: D5 faithfully implements the approved
configured-provider and source-provenance architecture without exposing a new
cross-project failure pattern. PR, hosted CI, and merge receipts remain
pending. Phase D6 stays provider-gated; after merge, reconcile that deliberate
deferral and continue to the first non-gated Phase E requirement.

## 2026-08-24 execution-control Phase D4 candidate

Branch `agent/execution-control-phase-d4-20260824` starts from exact merged
Phase D3 commit `4bb6203951d9bf0f5ef701c7bdca7645ab8134d7` and implements
Phase D4 of
`docs/superpowers/plans/2026-08-23-execution-control-productionization-roadmap.md`.
It extends the existing signed external-study evidence coordinator and source
package; it creates no second controller, completion authority, or public
operation.

The controlled operator sync resolves only Crossref's official Retraction
Watch GitLab project, main ref, and `retraction_watch.csv`, then downloads the
file from the exact returned 40-hex commit. It records source commit/time,
file SHA-256/bytes, exact accepted header/hash, row and index counts, and sync
time. The user-request HTTP allowlist is unchanged and research requests cannot
trigger this dataset download.

Pinned `csv-parse` streaming accepts the live 20 documented fields plus the
provider's trailing empty compatibility column and its documented 1756 AM
timestamp outlier. It handles quoted commas, doubled quotes, CRLF, and embedded
newlines while rejecting missing/reordered/duplicate/extra headers,
malformed/oversized rows, duplicate IDs, impossible dates/times, changed source
identity, and unsafe paths. Bounded normalized records retain role-aware
original/notice identifiers; notice-only DOI matches are disclosed but are not
misapplied to the notice itself.

Each immutable snapshot has a source-derived ID, exact manifest,
`records.ndjson`, and DOI/PMID offset indexes. Runtime re-verifies all file
hashes/sizes/counts, reconstructs both indexes from normalized records, checks
every reference/role/offset, and rejects symlinks or tampering. Staging occurs
inside the verified root for same-filesystem rename; `active.json` changes only
after verification and directory fsync. Current and previous snapshots each
retain their own source-check time. Rollback completely verifies the prior
snapshot and restores its own freshness time before atomically swapping; a
corrupt prior snapshot leaves the active pointer unchanged.

The external-evidence coordinator accepts a Retraction Watch executor only as
a server dependency. When absent it preserves the existing explicit
`not_configured` provider attempt. When present it executes the exact DOI,
stores the normalized envelope through the existing bounded artifact store,
and binds snapshot ID, provider attempt, artifact hash, provider assertions,
limitations, directives, combined publication state, and bundle hash into the
existing signed receipt. Stale coverage is partial, retryable failure remains
blocked, nonretryable failure remains bounded, no-match remains provider-
scoped, and retraction/correction/expression-of-concern/reinstatement events
cannot silently disappear from the downstream claim-recalculation path.

Focused snapshot/coordinator verification passes 29 tests. The complete
deterministic suite passes 1,233 tests with six declared skips, and
`npm run verify` passes typechecking, that suite, and the production build. The
pinned MIT `csv-parse` 7.0.2 production dependency audit reports zero known
vulnerabilities. Public inventory remains 21 MCP tools and 26 Actions.
Canonical protocol bytes, generated Custom GPT Instructions, plugin bytes,
credentials, provider configuration, production runtime, and deployment are
unchanged.

No real Retraction Watch dataset was downloaded or committed. D4 deliberately
does not choose a production directory, durable retention/pruning policy,
backup, schedule, configuration binding, or deployment. Production activation
remains the Phase G privacy/owner gate. The pre-PR lesson checkpoint at
`2026-08-24T07:47:00.998Z` was available with 1 open candidate, 1 needing
review, 0 accepted but not incorporated, 3 incorporated or closed, and 0
deletion eligible. No unreviewed lesson expanded this phase. Lesson disposition
is project-specific/no-new-lesson: D4 implements the already approved verified
local-snapshot architecture and exposes no new transferable failure beyond the
existing source-identity, atomic-update, and server-authority lessons. PR #75
merged at `1fd17c89a514a04f1f8a2b35d032964c231e33ad`; all hosted checks passed.

## 2026-08-24 execution-control Phase D3 candidate

Branch `agent/execution-control-phase-d3-20260824` starts from exact Phase D2
merge `d75d316952baaf179857cdc48930b07aa23c4cac` and implements Phase D3 of
`docs/superpowers/plans/2026-08-23-execution-control-productionization-roadmap.md`.
It extends the existing non-production server-owned research session rather
than creating another controller or completion authority.

Completed candidate screening now deterministically creates one formal
hypothesis for each materially distinct program/outcome fingerprint. The
controller calls PubMed and Europe PMC itself, stores exact query/page/access
receipts and deduplicated DOI/PMID/PMCID identities, and requires a
frontier-bound semantic decision for every returned identity. A terminal
provider failure remains visible and bounded while other exact source work
continues; it cannot be rewritten as a zero-result search.

Every decision-important exact DOI enters the existing lawful Europe PMC then
Unpaywall acquisition engine. Session state records only access attempts,
opaque handle, source/version identity, content hash, block/segment totals,
and exhaustion receipt. It never stores article blocks. An expired partial
chain discards its counts and dependent work before exact-source restart.
Unseen or inaccessible sources remain possibly useful claim-local leads and
cannot supply unrestricted claims.

Method audit now executes through the same transport-independent validator as
the existing Action rather than accepting caller-authored completion output.
Study, review, and publication-notice receipts must match the exact exhausted
handle, source identifier, content hash, audit kind, domains, and real block
IDs. Each audited DOI study then schedules the Phase D2 signed Crossref/FORRT
operation. The controller preserves compact provider-attempt, bundle,
directive, linked-work, and limitation hashes; missing mandatory attempts,
mixed/cross-protocol receipts, and provider failures cannot advance ordinary
claim use.

Publication notices, replications/reproductions, and linked reviews with exact
DOIs become decision-important sources in the same full-text/method/external
pipeline. Provider-reported outcome labels stay leads. Verified new linked
sources may reopen completed downstream gates, but the state schema and
transition guard reject caller-authored operation projection or regression.
After all linked work, every study still requires a new method audit bound to
the exact signed external bundle. Its submission must reference every
controller-required external item/coverage gap. Partial external coverage can
never be recalculated into unrestricted use; active retraction keeps effect
claims excluded.

The bounded session view now exposes exact formal-source screening,
method-audit, external-evidence, and claim-recalculation work packages plus
aggregate diagnostics. Successful finalization remains deliberately disabled
until Phase F. The prototype remains unregistered and ephemeral: public
inventory stays 21 MCP tools and 26 Actions; canonical protocol bytes,
generated Custom GPT Instructions, plugin bytes, provider configuration,
deployment, credentials, and durable retention are unchanged.

Focused formal/full-text/method/external/controller/inventory verification
passes 112 tests. The complete host-boundary deterministic suite passes 1,215
tests with six declared skips, and `npm run verify` passes typechecking, that
same complete suite, and the production build. The pre-PR lesson checkpoint at
`2026-08-24T06:49:59.512Z` was available with 1 open candidate, 1 needing
review, 0 accepted but not incorporated, 3 incorporated or closed, and 0
deletion eligible. No unreviewed lesson expanded this phase. Lesson disposition
is project-specific/no-new-lesson: Phase D3 implements the already approved
execution-control architecture and exposes no new transferable failure beyond
the existing server-authority and source-depth lessons. Hosted CI passed on PR
#74 and the reviewed branch merged as exact commit
`4bb6203951d9bf0f5ef701c7bdca7645ab8134d7`. Phase D4 follows that merge; its
durable-snapshot/cron activation remains an explicit owner/privacy gate.

## 2026-08-24 execution-control Phase D2 candidate

Branch `agent/execution-control-phase-d2-20260824` starts from exact Phase D1
merge `bf716e40e04fc025e5fe0ceebd9ce199e51df3b5` and implements Phase D2 of
`docs/superpowers/plans/2026-08-23-execution-control-productionization-roadmap.md`.
It composes the Phase D1 Crossref/FORRT primitives into one internal server-
owned external-study evidence operation without creating a public endpoint or
advancing research-session state.

The coordinator accepts only an opaque authoritative session ID and one DOI.
Server dependencies supply exact Universal/HRP identities, Crossref
configuration, fixed provider executors, a bounded artifact store, clock,
server-held receipt secret, and nonsecret key ID. Exact Crossref identity is a
prerequisite for FORRT; identity failure stops before the second provider and
creates no signed receipt. Caller completion flags, providers, counts,
identities, directives, hashes, artifacts, and receipt fields are rejected.

The server normalizes mandatory Crossref/FORRT attempts plus explicit
unconfigured optional-provider gaps, derives deterministic publication-
notice/active-retraction/correction/reinstatement/linked-repetition work and
claim-local restrictions, and hashes the complete canonical evidence bundle.
No-match, partial, inaccessible, retryable, nonretryable, and malformed states
remain distinct. Provider-reported repetition outcomes remain unaudited leads;
the receipt contains no quality score or replication-verification shortcut.

The HMAC-SHA256 receipt binds the exact session, canonical study identity,
Universal/HRP identities and hashes, provider attempts, content-addressed
provider artifact IDs/hashes, bundle hash, issue time, and key ID. Verification
rejects tampered, cross-session, cross-study, cross-protocol, cross-bundle,
cross-artifact, and wrong-secret receipts. Its literal boundary proves
structural execution/provenance, not that provider assertions or AskRigor
interpretations are scientifically true.

The new `EvidenceArtifactStore` abstraction has only a bounded in-memory
implementation: 128 entries, 10 MiB per artifact, and 32 MiB total by default,
with clone-on-write/read, exact deduplication, explicit revocation, and no
timer, disk, database, object store, or production singleton. Portable receipts
carry only artifact references/hashes, not bodies or signing secrets. Durable
storage remains the later Phase G privacy/owner decision.

The existing public study-method audit remains unchanged. A separate internal
external-evidence-bound schema allows typed provider/item references only in
the replication/evidence-ancestry domain and validates them against the signed
current bundle. Other domains still require real acquired-document blocks;
invented or unknown `jats_*`/`pdf_*` blocks and changed external bindings fail.

Focused artifact/coordinator/provider/method-audit tests pass 81/81. Public
schema/inventory regressions pass 104/104 at the host boundary. The complete
deterministic suite passes 1,205 tests with six declared skips, and a clean
`npm run verify` passes typechecking, the same complete suite, and production
build. One earlier combined verification attempt hit only the existing
10-second package-entrypoint test ceiling under suite load; that test passed in
3.6 seconds alone and the complete clean rerun passed.

Public inventories remain 21 MCP tools and 26 Actions. Canonical protocol
bytes, public schemas, generated Custom GPT Instructions, plugin bytes,
provider hosts, deployment configuration, credentials, and production runtime
are unchanged. Phase D3 is next after reviewed merge. The Phase D2 lesson
checkpoint at `2026-08-24T01:27:59.389Z` was available with 1 open candidate,
1 needing review, 0 accepted but not incorporated, 3 incorporated or closed,
and 0 deletion eligible. No unreviewed lesson expanded this phase. Lesson
disposition is project-specific/no-new-lesson: D2 faithfully implements the
already owner-approved external-evidence architecture and exposes no new
transferable product failure beyond the existing execution-control lessons.

## 2026-08-24 execution-control Phase D1 candidate

Branch `agent/execution-control-phase-d1-20260824` starts from exact Phase C
merge `1d22fa0bd13682d79fc5a5c6a53629de492856e2` and implements Phase D1 of
`docs/superpowers/plans/2026-08-23-execution-control-productionization-roadmap.md`.
It adds provider-scoped external-study evidence primitives for later
controller phases without adding completion authority or a public endpoint.

The strict bounded contract distinguishes canonical study identity, provider
attempts, ordered publication-integrity assertions, replication/reproduction
relationships, post-publication threads, citation contexts, review ancestry,
result-specific imported risk-of-bias judgments, directives, unresolved
items, and claim-local limitations. It rejects global study-quality shortcuts,
caller completion claims, invalid identifiers, unknown fields, and oversized
collections.

The existing Crossref adapter now preserves complete ordered retraction,
withdrawal, expression-of-concern, correction, update, reinstatement, and other
events with original/notice DOI roles, direction, raw type/label, source,
reasons, record ID, and deterministic hashes. Conflicting current assertions
remain uncertain, and successful absence of a marker is only
`no_update_marker_found`. The existing public retraction lookup keeps its
backward-compatible payload and conservative precedence.

The new internal FORRT FLoRA DOI adapter accepts one canonical public DOI,
calls only the fixed `rep-api.forrt.org` endpoint, preserves forward
replications/reproductions and reverse original links, and keeps raw plus
strictly normalized provider-reported outcomes. Every relationship remains
explicitly not yet implementation-matched or source-audited. Successful null,
partial, malformed, inaccessible, rate-limited, not-found, upstream-failed, and
transport-failed states remain distinct. FLoRA CC BY 4.0 attribution is carried
in normalized metadata; raw provider error bodies are not exposed.

Focused contracts/Crossref/FORRT/HTTP tests pass 74/74. The complete
host-boundary deterministic suite passes 1,186 tests with six declared skips;
`npm run verify` passes typechecking, that same suite, and the production
build. Public inventory remains 21 MCP tools and 26 Actions. Canonical protocol
bytes, public schemas, generated Custom GPT Instructions, plugin bytes,
deployment, credentials, and production runtime are unchanged. No database,
durable provider-content store, new session retention, public operation, or
finalization path was added. Phase D2 is next after reviewed merge.

The opening lesson checkpoint at `2026-08-24T00:07:05.049Z` was available with
1 open candidate, 1 needing review, 0 accepted but not incorporated, 3
incorporated or closed, and 0 deletion eligible. No unreviewed lesson expanded
this phase. The pre-PR checkpoint at `2026-08-24T00:41:10.940Z` returned the
same counts. Lesson disposition is project-specific/no-new-lesson: D1
faithfully implements the already owner-approved external-evidence architecture
and does not expose a new transferable product failure.

## 2026-08-23 execution-control Phase C candidate

Branch `agent/execution-control-phase-c-20260823` starts from exact Phase B
merge `f4800e45e810a34e03657334949b6e8fef883b50` and implements Phase C of
`docs/superpowers/plans/2026-08-23-execution-control-productionization-roadmap.md`.
The existing transport-independent controller now owns selected-video
transcript and discussion depth instead of trusting a client to report that it
followed pagination or inspected every selected video.

Candidate screening is packaged under one server-derived discovery digest and
must decide every reconciled public identity exactly once. The server validates
identity, described-program signature, materiality, redundancy, duplicate
target, and selection relationships before selected videos initialize depth
state. This validation binds bounded worker judgment to exact evidence; it is
not itself proof that the semantic judgment is true.

Each selected public video has one transcript record and one community-
discussion record. The controller derives first-page calls from the selected
identity and continuation calls only from the prior server-issued short handle.
Internal chain runners continue successful pages automatically. Restarting one
expired/invalid chain discards its old receipt, count/hash, and handle and
increments only that video's attempt. Retryable work remains executable;
recognized terminal boundaries remain bounded and never become completion.

Transcript completion requires the existing server receipt to prove one
reconciled first-page chain, API-visible exhaustion, fixed caption-track
identity, and timestamp provenance. Discussion completion requires its server
receipt, cumulative/segment monotonicity, reconciled source identity, and a
passing synthesis lock. One completed video cannot complete a multi-video
operation. Session state retains only bounded public source fields, semantic
screening rationale, attempt/status, opaque Action handles, rolling hashes,
counts, and coverage receipts; it stores no transcript segments, comment text,
author identities, raw corpora, provider cursors, or credentials.

Hostile tests reject wrong-digest/omitted/renamed screening submissions,
wrong-video receipts, caller cursors/counts/exhaustion claims, replayed or
decreasing continuations, mixed chains, stale evidence after restart,
one-of-many completion, transcript-free creator completion, and discussion
depth without `synthesis_lock: pass`. The focused controller/frontier/prototype
suite passes 27/27. The complete host-boundary deterministic suite passes 1,161
tests with six declared skips; a sandbox-only run recorded only the known
loopback/IPC `EPERM` boundary.

The non-production prototype remains unregistered. Public inventory stays at
21 MCP tools and 26 Actions; canonical protocol bytes, generated Custom GPT
Instructions, public Action OpenAPI, plugin bytes, provider footprint,
deployment configuration, and production runtime are unchanged. Phase D1 is
next after reviewed merge. The opening lesson checkpoint at
`2026-08-23T23:13:41.851Z` was available with 1 open candidate, 1 needing
review, 0 accepted but not incorporated, 3 incorporated or closed, and 0
deletion eligible. The pre-PR checkpoint at `2026-08-23T23:48:56.958Z`
returned the same counts. No unreviewed lesson expanded this phase. Lesson
disposition is project-specific/no-new-lesson: this phase executes the already
approved server-owned depth architecture and exposes no new transferable
failure beyond the existing execution-control lessons.

## 2026-08-23 execution-control Phase B candidate

Branch `agent/execution-control-phase-b-20260823` starts from exact Phase A
merge `1dd18f91fa94da391c3b5e30c604850e3813f4de` and implements Phase B of
`docs/superpowers/plans/2026-08-23-execution-control-productionization-roadmap.md`.
The controller now owns two independent discovery frontiers instead of asking
a client to reconstruct a candidate list.

The existing automated Gemini/Spark path enters authoritative state only with
its exact packet, server-held provider response identity, independently
produced YouTube validation receipt, and verified frontier digest. Rejected or
unresolved public identities do not become decision-relevant candidate
records. A separate native YouTube survey is the next mandatory transition and
is derived from the recorded scout queries; the external scout alone cannot
open candidate screening.

Candidates are reconciled by stable YouTube video identity and preserve exact
frontier/query origins, provider access status, target and stage distance,
provisional treatment/program fields, normalized program signature, and
pending materiality/redundancy state. Every native search and candidate origin
has a reciprocal link. Missing program fields remain the literal
`program not described`; they are not inferred from titles or model memory.
Raw counts and signature groups are projected as diagnostics only and cannot
advance state.

Hostile tests reject packet/receipt mismatch, unresolved identities, skipped
external or native discovery, missing reciprocal links, caller-authored counts
or candidate lists, duplicate video inflation, stale retry origins, and renamed
candidates that attempt to count one normalized described program more than
once. Focused controller/frontier/prototype and inventory tests pass 27/27.
The complete `npm run verify` gate passes typechecking, 1,152 tests with six
declared skips, and the production build;
the sandbox-only run recorded the known local loopback/IPC `EPERM` boundary.

The non-production prototype remains unregistered. Public inventory stays at
21 MCP tools and 26 Actions; generated Custom GPT Instructions, public Action
OpenAPI, plugin bytes, protocol bytes, provider footprint, privacy retention,
deployment configuration, and production runtime are unchanged. Phase C is
next after reviewed merge. The Phase B opening lesson checkpoint at
`2026-08-23T22:28:25.668Z` was available with 1 open candidate, 1 needing
review, 0 accepted but not incorporated, 3 incorporated or closed, and 0
deletion eligible. No unreviewed lesson expanded this phase.
The pre-PR lesson checkpoint at `2026-08-23T22:58:32.675Z` returned the same
counts. Lesson disposition is project-specific/no-new-lesson: Phase B applies
the already approved server-owned-frontier architecture and did not expose a
new transferable failure beyond the existing execution-control lessons.

## 2026-08-23 execution-control Phase A candidate

Branch `agent/execution-control-phase-a-20260823` starts from exact current
`origin/main` commit `030d03abaac8f75a559d6e50ce862709cade9655` and implements
Phase A of
`docs/superpowers/plans/2026-08-23-execution-control-productionization-roadmap.md`.
The reviewed delivery vehicle is PR #69.
It does not create a parallel controller: the existing non-production research-
session prototype now delegates authoritative state and transitions to the new
transport-independent `research-session-controller.ts` core.

The controller binds exact HRP/Universal identities, represents all six router
modules explicitly, preserves unresolved applicability as fail-closed state,
makes `REQUIRED` monotonic, derives machine-readable next capabilities from
structured operation state, and rechecks protocol identities before every
authoritative continuation/finalization attempt. Exact drift becomes monotonic
`DRIFTED` state and requires a fresh execution under current protocol bytes.

One canonical boundary now distinguishes continued research, bounded nonranking
output, and future successful finalization. Existing treatment-landscape
outcomes map into it without treating a passing component ledger as global
completion. A compact finalization-permit schema is defined, but Phase A has no
issuance path: even a synthetic all-gates-complete fixture remains denied until
later controller phases are wired.

Hostile tests reject module demotion; caller-injected completion Booleans,
counts, arrays, and module claims; unknown/stale session advancement; silent
protocol drift; treatment-boundary escalation; and terminal-boundary-as-
completion. A mutation matrix removes every required module and operation in
turn and confirms the completion guard fails. Focused controller/prototype
tests pass 12/12. The complete host-boundary deterministic suite passes 1,146
tests with six declared skips, and `npm run verify` passes typechecking, that
same suite, and the production build. The sandbox-only suite recorded the known
loopback/IPC `EPERM` boundary; no controller/product assertion failed there.

The prototype remains unregistered. Public inventory is unchanged at 21 MCP
tools and 26 Actions; generated Custom GPT Instructions, Action OpenAPI,
plugin bytes, privacy retention, provider footprint, deployment configuration,
and production runtime are unchanged. Phase B is the next phase after reviewed
merge. The session-start lesson checkpoint was available with 1 open candidate,
1 needing review, 0 accepted but not incorporated, 3 incorporated or closed,
and 0 deletion eligible. The pre-PR checkpoint at
`2026-08-23T22:22:00.222Z` returned the same counts. No unreviewed lesson
expanded this phase; closeout is project-specific/no-new-lesson because this
implements the already approved controller architecture rather than exposing a
new transferable failure.

## 2026-08-23 automated Gemini YouTube scout deployed and live accepted

PR #67 merged as `8b26dcef2d4f9b892df909391f8253545dd67399`. Its exact
healthy production image is
`sha256:bac9483e2bb2b96c0ea3da6ff12f3af840ef3bc40e3176a2f9c0b4d3583de917`
in read-only `node` container `67768684e184`. Production exposes 26 Actions
and 21 MCP tools; compact OpenAPI SHA-256 is
`51ed214117ededcecd46162fddcfb08ede1f0b56067f6b6dd137c831d14190f4`.
Active Compose SHA-256 is
`91cb6137660e4335557dff98c4f5e8bba53792ca3225bf327b68e0bf99ceaa8b`;
rollback retains PR #66 image
`sha256:567c2a3d1ebf9dfec1463645268370302b106dcb6fde8ec85db2811942b4e241`
and Compose SHA-256
`9ba48dfaac2ba3e2e8a0ab47a75b89941973b852e7d84ab312038e9054ff291f`.
The live privacy page exactly matches source SHA-256
`05f3a15dd6918f27636b7d42dd03e1a1ddfe4ac8787fd533a2d5f5ef617515ff`.

One paid production replay exercised the repair rather than bypassing it. The
first compact packet failed strict validation, the single no-search correction
succeeded, and no second discovery batch ran. Ten reconciled searches yielded
8 source candidates; independent YouTube validation accepted 6, rejected 2
wrong-channel declarations, and left 0 unresolved. The validated candidates
span distinct glute-focused, avoid-aggravation, and progressive-strengthening
programs plus regenerative injection, nutrition, and corticosteroid-risk
directions. The rejected candidates were genuine surgery videos but cannot
count as accepted evidence until their identity declarations are correct.
Frontier digest is
`1a4201faa116002299bd2b339614f6ee7f6013ab8adde5575a03e4582c7d631d`.
The Action returned no blocking boundary and truthfully reported
`correction_attempted: true`, two storage-disabled interactions, combined token
usage, and 177,657,500 accounted nano-USD.

The Codex plugin is installed/enabled and byte-identical to its validated
source at `0.1.0+codex.20260823192716`; no package change or reinstall was
needed. The exact generated Instructions are on the desktop clipboard and the
single exact GPT editor URL was opened. The environment cannot observe or
control the signed-in editor, so editor save/schema refresh and the fresh
Custom GPT product replay remain pending. Do not open repeated editor windows.

After the evidence follow-up merges, begin Phase A of
`docs/superpowers/plans/2026-08-23-execution-control-productionization-roadmap.md`
from fresh `main`; do not mix controller work into this evidence branch.

PR #66 merged as `c1dc216bd8a203fe3a49ac8c876f5d1d00320c80` and its exact
healthy production image is
`sha256:567c2a3d1ebf9dfec1463645268370302b106dcb6fde8ec85db2811942b4e241`.
The protected key remains installed in the root-owned mode-0600 runtime and
must not be requested or pasted again.

The next paid de-identified replay reached grounded Google Search and model
output but failed strict packet validation. The cause was provider transport
shape, not missing search capability: a shallow nested candidate-object schema
left the inner form unconstrained. Bounded provider probes reproduced that
drift and then passed a complete fixed-column row schema.

Branch `agent/gemini-scout-compact-packet-20260823` uses that compact form only
between AskRigor and Gemini, reconstructs the canonical packet server-side, and
keeps the existing strict parser authoritative. If the first packet fails,
exactly one no-search correction receives only bounded public candidate output,
exact executed public queries, and safe validation issues. It cannot create a
second search batch; usage is combined; failure after correction is terminal.
Focused adapter/Action/OpenAPI tests pass 26/26. The complete gate passes 1,138
tests with six declared skips, typechecking, and build; all four site pages,
28/28 deployment tests, and the zero-vulnerability production dependency audit
also pass. Privacy/setup/release documents disclose that same-provider
correction. Merge, exact deployment, one paid acceptance replay, plugin
synchronization, and Custom GPT installation/acceptance remain pending. After those gates, Phase A begins from
fresh `main` in a separate branch.

The required pre-release lesson checkpoint at
`2026-08-23T21:13:53.413Z` was available: 1 open candidate, 1 needing review,
0 accepted but not incorporated, 3 incorporated or closed, and 0 deletion
eligible. No unreviewed lesson expanded this repair.

The protected Gemini key is now installed in the root-owned mode-0600 runtime
environment. Recreating only `research-mcp` preserved the exact deployed image
and hardening. The first paid de-identified replay failed closed with
`gemini_youtube_scout_request_failed`, no Google Search receipts or candidate
frontier, no raw provider body, and a conservative $1 ledger charge.

Sanitized diagnostics established that the key and fixed model are
valid and that the Interactions endpoint, generation settings, and shallow JSON
schema work. Gemini rejects the complete nested candidate validation schema,
consistent with its documented schema-complexity boundary. A one-query Google
Search probe confirmed the live search/result/text step shape and that a
stateless response omits its interaction ID. Branch
`agent/gemini-scout-schema-repair-20260823` replaces only the provider-facing
schema with the empirically accepted shallow shape and derives a content-safe
SHA-256 receipt identifier when the provider supplies no ID. The exact public
output contract and strict server-side packet parser remain authoritative and
unchanged. Focused adapter/Action tests pass 19/19; `npm run verify` passes
1,137 tests with six declared skips, typechecking, and build. Merge, exact
deployment, a fresh paid replay, and Custom GPT UI acceptance remain pending.

PR #64 adds a public read-only
`scout_gemini_youtube_candidates` Action. It sends only a deterministically
screened, de-identified population-level target plus the public checked-in
scout instructions to fixed `gemini-3.6-flash` with Google Search and provider
interaction storage disabled. The adapter reconciles the actual 8–18 executed
queries, validates strict packet structure, and runs the existing independent
YouTube identity validator. Consumer Spark and manual packet transfer are not
part of the ordinary path; the legacy validator remains backward compatible.

The candidate preserves 21 MCP tools and produces a 26-operation Action schema
(25 non-consequential research operations plus the isolated lesson write).
Generated Instructions are 7,985 characters (8,015 UTF-8 bytes), SHA-256
`e0942d2f5a9ddb2e965357af896eab8990ae4058ad911aed558fd44872d96944`;
Action OpenAPI SHA-256 is
`68294b46a9ec1ac9e1c39297b276545566cdf7ab54ca597e8ed2c5e50ae2ff89`;
synchronization-ledger SHA-256 is
`1771854cdb04e1bb3f3471254ea36eb06c035d229dc232f0f011610c15f0a5fd`;
and installation-bundle digest is
`25231b91b296aa5866d1c46f9db8e0b4558ce919e02a135ad4447f651633fcce`.

The route uses the existing aggregate $50 monthly AI ledger through one shared
process-wide mutex owner and reserves at most $1 per Gemini call. Missing usage
or provider failure is conservatively charged to the reservation. The ledger
stores no request or candidate content. A validated result that would exceed
the 60,000-byte Action ceiling becomes a small explicit blocked receipt. The
public privacy and setup candidates disclose Google processing, no AskRigor
candidate persistence, separate paid API billing, and the protected server-key
boundary.

The owner authorized paid Gemini API activation and Google processing of the
screened scout request on 2026-08-23. Exact merge
`bcb494c11277aac41f736e8a050758d238536cbb` is deployed as healthy image ID
`sha256:bec3fa4f4f19ca76e123a546b818f572f05df49d68281feb67558880eea32da3`
with 26 Actions and 21 MCP tools. Direct acceptance passed exact protocol
integrity and the truthful zero-cost missing-provider boundary. The current
privacy site matches source SHA-256
`c234035bd1ebf91a809896d2074bcb1b3d40123065d9ff0de70ea8a8ad8a4092`.
The personal plugin is synchronized and reinstalled as
`0.1.0+codex.20260823192716`, package SHA-256
`7846db90fe54b1a1f896b29f6d90150dc3a468f01758db1fc57c424ad6a5d12e`.

The protected key is installed; successful provider quality, Custom GPT
installation, and fresh product acceptance remain pending. After this
integration is completed, begin Phase A of
`docs/superpowers/plans/2026-08-23-execution-control-productionization-roadmap.md`
from fresh `main`; do not mix Phase A into this branch.

The required pre-deployment lesson checkpoint at
`2026-08-23T19:03:04.712Z` was available: 1 open candidate, 1 needing review,
0 accepted but not incorporated, 3 incorporated or closed, and 0 deletion
eligible. No unreviewed lesson expanded this task.

The schema-repair pre-release checkpoint at
`2026-08-23T20:28:28.283Z` returned the same exact counts: 1 open candidate,
1 needing review, 0 accepted but not incorporated, 3 incorporated or closed,
and 0 deletion eligible.

The complete source gate passed: `npm run test:run` and `npm run verify` each
reported 1,135 passed tests, six declared skips, 79 passing files, and one
skipped file; verification also passed typechecking and the production build.
Public-site validation passed all four pages, deployment validation passed
28/28, and `npm audit --omit=dev` found zero vulnerabilities.

## 2026-08-23 deployed Unpaywall acquisition and method-audit release

The merged runtime goes beyond Unpaywall metadata discovery. It automatically
tries Europe PMC and then Unpaywall for a decision-important DOI; safely fetches
direct open PDF candidates; rejects private-network destinations, oversized
or mixed DNS answers, pins TLS to a vetted public address, rejects oversized
documents, non-PDF responses, and identity mismatches; preserves manuscript
version and content SHA-256; and exposes bounded, contiguous document segments.
An individual-study or review/guideline audit cannot validate until that exact
document chain is exhausted. Inaccessible or unverified copies remain possibly
useful leads whose unseen contents are not evidence.

The four operations are available through both MCP and the public read-only
Action schema. The generated Instructions are 7,957 characters (7,987 UTF-8
bytes), SHA-256
`667623ebfd7ca9cf4417d8b58ec756c9a7e0967492f2ac95e84fba66826f86d1`;
the Action OpenAPI SHA-256 is
`99e5f45fb0b27e7dc4943f0896d5a6de66c910819ad1a2a9bfd8df53212749e3`;
and the synchronization ledger SHA-256 is
`2c896b263ad47a37637f823bc6f3807b9f05a1fb8724ff5af3bcb7576afad1bc`.
The complete deterministic gate passed 1,121 tests with six declared skips,
typechecking, and the production build. Public-site and deployment validation
passed, the production dependency audit found zero vulnerabilities, and a
bounded provider-diverse live Unpaywall smoke completed secure PDF acquisition,
extraction, and exact DOI verification from independent open hosts. The smoke
accepts the first complete verified copy among Frontiers, Scientific Reports,
and an institutional repository instead of depending on one brittle URL. The
former single Nature smoke fixture is now correctly classified as a possibly
useful lead after its open locations failed retrieval or identity verification.

PR #58 merged the release; PR #59 merged the public identifier-boundary repair.
Exact merge `e7409dfc0567c07e5fba3f2641b735028d132e1f` is deployed as image ID
`sha256:1968fa4cfeb4ad2b6c47b3b85e685d94d020f529b565b0023ab73596572b3409`
in healthy container `3f333fadee14`. Active Compose SHA-256 is
`90d5bae8970975fa49eb14c0571e772b454f70e2a8ffbf5195c6448ecaff1f0b`;
the pre-PR-58 rollback image/config remain verified. Direct public acceptance
passed 25 Actions, 21 MCP tools, exact protocol integrity, lesson isolation at
`401`, malformed full-text input at `422`, and an open study with its method-
audit synthesis lock correctly closed. The compact live OpenAPI SHA-256 is
`87711a1bcac4939137bd4166803c85f153a6a345036a400dc078b542c8f0041a`.
The personal plugin is current at `0.1.0+codex.20260823023619`. Custom GPT
editor installation and fresh product acceptance remain pending.

## 2026-08-23 executable research-orchestrator and study-audit plan

The owner approved replacing prompt-only research compliance with a
server-owned, resumable workflow. The durable implementation contract is
`docs/superpowers/plans/2026-08-23-executable-research-orchestrator-and-study-audit.md`
on branch `agent/executable-research-orchestrator-20260823`, based on
`origin/main` commit `93814af9b8a2c77bf5dedb254a38394dc6f5e3a0`.

The plan records the observed architectural failures: the current Spark Action
only validates a manually supplied packet; no installed public research Action
acquires and deeply audits full studies; the treatment assessor checks
caller-assembled state and can be skipped; and current product acceptance can
pass a constructed JSON fixture without replaying the real Custom GPT.

The owner's scientific correction is authoritative: randomization, peer review,
and journal prestige are not reliability certificates; exact study methods,
program identity, comparator quality, outcome integrity, harms, reproducibility,
and applicability require audit. Freely and lawfully accessible full texts
should be audited. Inaccessible studies remain clearly labeled, possibly useful
research leads requiring further investigation; their unseen contents are not
evidence, but their inaccessibility does not freeze unrelated executable work or
prevent a bounded synthesis from inspected sources.

The isolated feasibility implementation is recorded in commits `6d9a142` and
`3aed717` plus current Phase 3 work on the same task branch. Europe PMC full-text XML acquisition
preserves exact bytes, identity, completeness, and SHA-256; a bounded live
repository fetch passed. Unpaywall DOI resolution now discovers additional
lawful open publisher/repository locations while preserving them as unfetched
versioned leads; a bounded live provider lookup passed. The official Gemini
Interactions adapter requests Google-grounded structured output, validates the
strict candidate packet, and retains no raw failed provider response. It is not
activated because this environment has no approved Gemini API key/model
configuration and paid-provider activation still requires owner judgment.

A non-production session prototype now binds exact protocol hashes in
server-owned ephemeral state, performs one bounded automated-scout step through
injected provider dependencies, rejects caller-authored completion claims, and
refuses finalization while candidate screening, source acquisition, full-text
audit, bidirectional research, and landscape finalization remain. It is
deliberately absent from the production Action inventory until broader
orchestration, privacy, provider, regression, and real-product acceptance gates
pass. No protocol, deployment, plugin, Spark, or Custom GPT installation has
yet changed for this plan. The next safe action is Phase 2 session integration
and method-audit receipts while the live Gemini quality benchmark remains an
explicit provider-configuration boundary. Session-start lesson status was
available: 1 open candidate, 1 needing review, 0 accepted but not incorporated,
3 incorporated or closed, and 0 deletion eligible.

## 2026-08-22 Custom GPT editor-schema compatibility repair candidate

PR #55 merged the executable acceptance repair as
`61dc53e20aa3f66ede5fb576b53756960f57aa96`; that exact merge is deployed and
healthy. The first signed-in editor import then exposed a separate product
boundary: the new Spark-validator response used draft-7 tuple syntax inside an
OpenAPI 3.1 document, and the Custom GPT editor rejected the array-valued
`items` field before listing any operations.

The merged repair aligns that route with the existing 2020-12 Action schemas and
adds a whole-document regression that rejects every array-valued `items` field.
The Instructions remain 7,783 characters (7,815 UTF-8 bytes), SHA-256
`1de222a6ab29fe97bff4385be29348912142510f21519f8e10e530c6197ded08`;
the regenerated Action OpenAPI SHA-256 is
`884aa2758fbec92e384a1bd5534e3d85f86e6ab60ff1629587f9082b98b3f2fb`;
the synchronization ledger SHA-256 is
`ffecff639022b7b0cbdd338cb5adc8d76aa334714abeb3604e2381c16b4c9d73`;
and its installation-bundle digest is
`ac40a100a8fd0cabd8a4f01b5b091547e330a44353cb0fddb2d90c304e565c02`.
The Spark skill and Instructions bytes are unchanged. PR #56 merged as
`abcfb6728601f83f7589bbc195ad2b9683f710ad` and is deployed as image ID
`sha256:a643cd1d5040a269e3f5b48516f98889eb44fe615f41f6e630cd470001642f08`
in healthy container `ba29902d5b6e`. The compact live OpenAPI SHA-256 is
`3130bf9480ac85138a7ae585c0ae684c4d17ed1526204180e9131035e2d5ee0a`;
it exposes 21 operations and the corrected four-member `prefixItems` form with
no array-valued `items`. Compose SHA-256 is
`9bdb02a546ddddde7a39bc4ef448a191f51550b39f02ca492354f1c9923b718d`.
Immediate rollback is `askrigor-research:rollback-abcfb672-predeploy` plus
`/opt/askrigor/compose.yaml.rollback-abcfb672`, SHA-256
`cb95791899db20792281f3c7d9fb922c911af8e88e2ee68ea665037b2b78d103`.
The signed-in editor re-import, exact operation-list inspection, and fresh
product-interface acceptance remain required before the installation is current.


Updated: 2026-08-23

## Goal

Make AskRigor's Codex/GitHub workflow reproducible, reviewable, secure, and resumable without allowing workflow metadata, release receipts, or remembered lessons to supersede the complete canonical protocols.

## Authority / baseline

- Repository: `u-dont-existDOTcom/AskRigor`
- Current verified and deployed source baseline is PR #54 merge
  `6d8ae92943fb2ae875b055221d85b146713e2aed`.
- Canonical branch: `main`. PR #40 added the transcript-
  verified evidence frontier, the exact unspecified-hip-pain research record,
  and a capability-safe MCP-plugin fallback. PR #41 reconciled that baseline
  with the accepted Gemini compact catalog and disabled-by-default bounded
  handshake diagnostics while preserving the 17-tool MCP surface and the
  19-operation Custom GPT Action document. Its deployment/direct-acceptance
  evidence merged through PR #42 as
  `a30631ac1240289ea0a864f00f1c0e6b42ab933a`; its deterministic,
  workflow-policy, and CodeQL checks passed both before and after merge.
- Production now runs exact image
  `askrigor-research:6d8ae92943fb2ae875b055221d85b146713e2aed`, image ID
  `sha256:a0e98726a32b81d8e0de4c0171f06c2460f2fe2303bc03d0942c70306d98f17a`,
  in healthy container `b3adc7a5735f`. The privacy site remains active at
  `/opt/askrigor/site/releases/386497415a18/site`. Runtime/OpenAPI/privacy are
  deployed and directly accepted. After displaying the complete preceding
  7,962-character Instructions (SHA-256
  `4fff01a07aa817941c5b8cd4c3b0ea2e79621901288140d6cf1056bf402312e5`) in
  chat, the owner reported that exact artifact was already installed in the
  signed-in Custom GPT editor. The current 21-operation schema is deployed and
  directly accepted. The owner then installed the 7,946-character generic
  candidate-quality Instructions, but public-directory review rejected their
  content as potentially providing tailored medical or health advice. A new
  7,892-character public educational-scope packet is verified locally but not
  yet installed. Runtime, Action-schema, editor, and fresh GPT-UI acceptance
  remain separate product boundaries; editor state is owner-reported, not
  independently inspectable from this environment.
- Recovery branch `recovery/custom-gpt-bridge-pre-main-7be7923` preserves the
  pre-integration bridge candidate.
- Verified packet-repair boundary:
  `0d8ef69fa7fd73c34c571a07723b5a6b5bad5fec`
- Exact packet-repair head merged by PR #12:
  `9c2c78e86391457c4b1bcd81a862456661db216e`
- Pre-integration recovery branch: `recovery/askrigor-compliance-pre-main-9d9dc78`
- Protocol authority: current explicit owner correction, then the exact complete bytes of `protocols/HRP_Full.xml` and `protocols/Universal_Instructions.xml`
- Current canonical source candidate HRP: `20.5.23` / 2026-08-24 /
  `bf2adc1c4daea8241c47b2a111d4a19e6bf7427a6401ecf1b3ba75a58e046299`.
  The deployed baseline remains HRP `20.5.20` / 2026-08-22 /
  `803060fb07fb0ed9198c066db9c3dbbc7579395833485b35d59730cfcc5b5f23`
  until this candidate passes review and deployment. Universal candidate is
  `20.5.15` / 2026-08-24 /
  `69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172`.
  Production reconstructed and verified the deployed baseline bytes.
- Runtime: Node `24.18.0`; bootstrap `npm ci`; complete deterministic gate `npm run verify`
- Universal policy: `u-dont-existDOTcom/universal-dev-architecture/patterns/codex-github-operating-system.md`
- Universal integration: `20.5.13` added the source-wide whole-argument reconstruction gate; canonical source `20.5.14` adds the research-before-reinvention gate.

## Completed 2026-08-22 generic candidate-quality release

- PR #54 merged the reviewed repair as
  `6d8ae92943fb2ae875b055221d85b146713e2aed` after deterministic verification,
  workflow-policy, and CodeQL passed. The isolated release archive contained
  401 tracked members, 1,117,416 bytes, and SHA-256
  `fd36810c147598a50dbfde4cb29a812822527fabbe9a9171296eb6a5409d4b01`.
- The repair is condition-independent. Every material umbrella class must be
  searched for specific implementations using the relevant population or
  stage, outcome, horizon, benefit, failure, and progression vocabulary. A
  generic exercise, PT, diet, injection, surgery, conservative-care, or
  alternative-treatment video cannot close the class.
- Gemini Spark is restored as an optional high-recall candidate finder. Packet
  v2 preserves its program, population/stage, and outcome/horizon annotations
  as explicitly provisional. AskRigor independently validates public video
  identity, screens every potentially material nonduplicate lead, and never
  treats the Spark summary as transcript verification or treatment evidence.
- The deployed release adds the public read-only Action-only
  `validate_gemini_youtube_candidate_handoff`; the Custom GPT surface is now 20
  research reads plus the isolated lesson write while MCP remains exactly 17
  read-only tools. The treatment-landscape controller blocks incomplete
  specific-program discovery and valid unscreened external candidates.
- Current generated Instructions are 7,946 characters (7,974 UTF-8 bytes),
  SHA-256
  `019277ee0b3943c85bf70f521b1a28069f5e7fed9a9c1d9223527b5cd469a532`.
  Current Action OpenAPI SHA-256 is
  `280a26ddbcd512357f12733f896cd32b166102d45524492642618a403c0f5540`;
  synchronization-ledger SHA-256 is
  `0d184838299ca1a25cfd9498ab756622261670587d71795e4fb5cbcfd2a998c8`.
  The live compact schema has SHA-256
  `a61a8ba9e1d4675a29e09a5010ab33b1119c388b7cf166669400cac554bbe535`
  and the exact 21 operations. Production retained 17 MCP tools. HRP 20.5.20
  and Universal 20.5.14 reconstructed and verified true.
- The public Spark validator accepted a bounded three-video packet with all
  identities validated, no rejected or unresolved IDs, and frontier SHA-256
  `c560f06afac0f56e64722a249cab208249c1543ebc0bb3b473aeb71d384402fe`.
  This validates the route and public identities, not the scout summaries or
  treatment claims.
- Production activation recreated only `research-mcp`. Immediate rollback is
  `askrigor-research:rollback-6d8ae92-predeploy`, image ID
  `sha256:d4892bb61d4c05cfdc59943a1b4b5ab2e648798646cd93c3bcd46f6b31c351df`,
  plus `/opt/askrigor/compose.yaml.rollback-6d8ae92`, SHA-256
  `7ea1680c3ac2bccd82f352d2b2776a6f63fd6a18ad095d861d543c0b803faba4`.
  Current Compose SHA-256 is
  `ca773eaa40593f0e510c8cba454051d80bebb2f080ef8a681c9488bbe7493a47`.
  Caddy was not recreated.
- The personal plugin was synchronized and reinstalled as
  `0.1.0+codex.20260822072920`. Source and installed package receipts match at
  `d196d783895e3ed093e33f6779b91ae9bb4bdafb3550de327c5f91a9643876c6`;
  the installed skill SHA-256 is
  `d5c5731b4142b5c93ea21283a0855cc118f7bed15ee53decd19eaedd5199c834`.
  A new Codex thread is required to load it. Custom GPT and Spark installation
  remain separate owner-paste boundaries; fresh product acceptance remains
  pending.
- Session-start lesson status was available: 1 open candidate, 1 needing
  review, 0 accepted but not incorporated, 3 incorporated or closed, and 0
  deletion eligible. The open candidate is unrelated and did not expand this
  repair.

## Active 2026-08-22 public educational-scope repair

- The owner installed exact Instructions SHA-256
  `019277ee0b3943c85bf70f521b1a28069f5e7fed9a9c1d9223527b5cd469a532`
  and reported a public-directory rejection with reason `May provide tailored
  medical/health advice`.
- The repaired Custom GPT projection places its educational-only boundary
  before protocol routing. It cannot assess personal symptoms, records,
  imaging, diagnosis, risk, suitability, prognosis, regimen, or dose; choose or
  rank care for a person; or say whether someone should start, stop, change, or
  delay care. A personal prompt is converted only to general population
  evidence and clinician-review questions.
- The public projection no longer contains the personal-decision invitations
  `good idea for me`, `do you agree`, or `now versus wait or delay`. The generic
  internal treatment-space protocol remains unchanged.
- The new packet is 7,892 characters (7,920 UTF-8 bytes), SHA-256
  `2299daae039e8c46df8a09b1e99e423e9361ff233648190dd3065d2f9b9528ba`;
  synchronization-ledger SHA-256 is
  `437b09f94eda9de6b6e0f8701e2db865b30a8ef86596d821ba067ad7e4783b62`.
  Editor installation and fresh public review remain pending.
- Full verification passed 1,064 tests with five declared skips and the build;
  public-site validation covered four pages and deployment tests passed 28/28.
  Runtime/OpenAPI are unchanged, so no server redeploy is required. Repository,
  plugin source, and installed plugin skill remain byte-identical at
  `d5c5731b4142b5c93ea21283a0855cc118f7bed15ee53decd19eaedd5199c834`.

## Completed 2026-08-21 production rollout and direct acceptance

- PR #41 passed deterministic, workflow-policy, and CodeQL checks before merge;
  the exact post-merge `main` workflows also passed. The production source was
  built from a secret-free exact Git archive with SHA-256
  `61db400d75de3627fcaa77370eeed44a6a1c26033f6b292d04bf483401502fe0`,
  377 tracked members, and 1,010,125 bytes.
- The transactional activation recreated only the research service. The final
  runtime remains `node`, read-only, capability-free, and
  `no-new-privileges:true`; loopback and public health returned `200`, and the
  application log remained one startup-only line after acceptance. Immediate
  rollback is retained as `askrigor-research:rollback-3864974-predeploy` plus
  the pre-deploy Compose SHA-256
  `5f3d6fb76174f0edb2dac290db9c64e153ae95cf8d6d5c2d30d9ca928a28f3af`.
- Direct acceptance passed standard MCP and Gemini MCP with the same exact 17
  handlers; the 19 Action operations; complete HRP `20.5.18` and Universal
  `20.5.14` reconstruction; strict malformed, schema, oversized-body, CORS,
  and unauthenticated-lesson boundaries; bounded PubMed, Europe PMC,
  ClinicalTrials.gov, DOI, YouTube metadata, and transcript checks; and an
  isolated rate-limit burst with 60 declared `406`, 20 declared `429`, and
  health bypass `200`.

## Completed 2026-08-21 treatment-landscape selection repair

- AskRigor PR #49 merged as
  `458190ab1be0849fba3f5193d59321a9c7f0d8df` and adds the canonical
  HRP 20.5.19 treatment-space inventory, exact program fingerprints,
  breadth-before-depth video selection, bidirectional reopening, per-video
  treatment records, and separate selection, per-video-depth, and overall
  pre-synthesis locks.
- `assess_treatment_landscape_coverage` is a deterministic public read-only
  Action-only controller. It does not alter the frozen 17-tool MCP surface.
  The candidate Custom GPT schema contains 19 reads plus the isolated lesson
  write. The generated Instructions remain under the 8,000-character limit.
- Exact regressions block narrow two-video and redundant ten-video audits,
  renamed IDs for identical programs, unitemized aggregate screen counts,
  unstable source identity, retryable boundaries presented as terminal, and
  invalid records entering aggregate counters. They also block skipped/lone or
  mixed transcript continuation chains and caller corpus-size/scope labels that
  contradict valid ledger structure. Candidate counts come from
  reciprocal discovery records; program diversity comes from normalized field
  signatures; selected-source state comes from deterministic projections of
  the actual transcript/comment receipt shapes. Omission impact distinguishes
  true decision blockers from justified nondecision warnings. A scoped
  65,536-byte input cap applies only to the strictly validated controller; a
  representative 15-video output is tested against the 60,000-byte response
  cap.
- After the reopened adversarial repair, the final instruction-contract suite
  passed 47/47, transcript/OpenAPI/controller suite passed 45/45, and the wider
  repaired-surface suite passed 83/83; the
  complete gate passed typecheck, build, 64 test files with one declared
  live-provider skip, and 1,024 tests with five declared skips. Public-site
  validation covered four pages and the deployment-boundary suite passed 28/28.
- `docs/treatment-landscape-workflow.md` is the living map;
  `docs/audits/2026-08-21-treatment-landscape-selection-lock.md` records the
  validated failure and immutable source receipt. The generalized lesson was
  promoted in Universal PR #30 and closed in PR #31. Exact cross-repository
  receipts are in
  `docs/audits/2026-08-22-treatment-landscape-lesson-closeout.md`.
- The generated source candidate is 7,991 characters, SHA-256
  `9e5e7dab751def42a26ffdf971c666f58ecfc9016b1f0cf27e8846a132f146a9`;
  its synchronization ledger is
  `8c89782596b982d2c2f2a0b37f48f66691a9bc6123693d6987c29b5646152900`;
  and its 20-operation Action OpenAPI is
  `35a9a2d51a4a3629795ea0224473e6273caf88febbbc0fefbe0095b1e73cc0ce`.
- Verification, PR review, merge, deployment, editor installation, and fresh
  product-interface acceptance are separate states. None is inferred here.
- The required final pre-PR lesson checkpoint at `2026-08-21T21:55:59.133Z` was
  available: 1 open candidate, 1 needing review, 0 accepted but not
  incorporated, 3 incorporated or closed, and 0 deletion eligible. The
  unreviewed candidate did not expand this task.
- The required closeout checkpoint at `2026-08-21T23:55:34.292Z` remained
  available with the same counts. The cross-repository lesson loop is complete;
  the unreviewed candidate did not expand the closeout.
- The 2026-08-22 closeout regression passed 2/2. The complete host-boundary
  gate passed typecheck, build, 65 test files with one declared skip, and 1,026
  tests with five declared skips.
- The privacy release is effective `2026-08-21` and discloses the bounded
  diagnostics while preserving disabled-by-default production behavior. All
  four public pages returned `200`; HTTP privacy redirected once to HTTPS.
- The production-accepted pre-repair editor Instructions had SHA-256
  `4b0d3382ee1f214a54c87e8c493d34b42e02467a66ee031f06fd33a2215b90bc`;
  it remains the owner-reported installed artifact. The 7,991-character source
  candidate and 20-operation OpenAPI above supersede it only in source.
  Knowledge must remain empty. No available tool exposes the owner's signed-in
  Custom GPT editor, so deployment, installation, and a fresh current product
  UI run remain explicitly unverified.
- The pre-deployment lesson checkpoint at `2026-08-21T06:28:49.742Z` was
  available with 1 open candidate, 1 needs review, 0 accepted not incorporated,
  2 incorporated or closed, and 0 deletion eligible. The pre-evidence checkpoint
  at `2026-08-21T07:05:04.177Z` and post-merge evidence-closeout checkpoint at
  `2026-08-21T07:19:25.956Z` returned the same counts. No lesson expanded the
  rollout or evidence closeout.

## Completed 2026-08-21 unspecified-hip-pain research run

- The accepted compact Gemini candidate packet has now been carried through a
  complete, diagnosis-contingent HRP research run for the de-identified prompt
  `how can i fix my bad hip`. The synthesis and machine-readable source ledger
  are `docs/audits/2026-08-21-unspecified-hip-pain-full-hrp.md` and
  `docs/audits/2026-08-21-unspecified-hip-pain-source-ledger.json`; the durable
  execution plan is adjacent under `docs/superpowers/plans/`.
- Formal work covered current triage, imaging, OA-care, arthroplasty-timing,
  exercise, condition-specific gluteal loading, injection, orthobiologic,
  supplement, device, and replacement evidence plus four unresolved trial
  registry records. Decision-critical open full text was inspected for the
  AAOS guideline, LEAP, and HIT; abstract-only material is labelled and is not
  the sole basis for a treatment ranking. Two wider evidence-frontier passes
  added no decision-changing option or contradiction, and eight decisive DOI
  records received a traceable Crossref retraction-metadata check.
- Forum Signal used six terminal YouTube discussion pools: 343/343 generic
  nonsurgical records, a 545-record replacement pool with the declared
  deterministic 500-record analysis boundary, 32/32 steroid-flare records,
  31/31 diagnosis-specific gluteal-tendinopathy records, 390/390 persistent-
  pain-after-replacement records, and 166/166 PRP records. All synthesis locks
  passed; no raw comments or commenter identities were persisted. Publicly
  indexed Reddit and Patient.info material supplied an independent-community
  directional check. Community visibility, attribution, and formal concordance
  remain separate, and no community incidence or causal rate is claimed.
- Creator-content claims remain withheld because the installed YouTube
  Conversation skill permits only Chrome transcript-panel retrieval and no
  Chrome-control capability was exposed. Titles, comments, and Gemini summaries
  were not substituted for transcripts. This terminal boundary does not block
  the completed diagnosis-first synthesis because no creator claim carries a
  verdict.
- This research run changes no protocol, product runtime, public MCP/Action
  inventory, privacy boundary, production service, release, or deployment.
- The 2026-08-21T05:17:25.891Z lesson checkpoint was available with 1 open
  candidate, 1 needs review, 0 accepted not incorporated, 2 incorporated or
  closed, and 0 deletion eligible. No lesson expanded this research run. The
  complete host-boundary deterministic gate passed typecheck, 59 test files
  with one declared skip, 979 tests with five declared skips, and build. A
  preceding sandbox-only run failed solely because the sandbox denied loopback
  and IPC binds with `EPERM`.

## Completed 2026-08-21 partial-answer and intervention-conflation repair

- A fresh owner-provided Custom GPT result exposed a new escape: it declared
  important modules incomplete, then presented a long conventional synthesis
  while still-executable YouTube creator-content and evidence-frontier work was
  omitted. The private answer is not persisted; the sanitized structural audit
  is `docs/audits/2026-08-21-custom-gpt-partial-answer-escape.md`.
- The same result treated exercise and physical therapy largely as umbrella
  classes. The repair requires materially distinct program hypotheses,
  program-specific evidence and comparison, and a `program unspecified`
  internal state when material components are missing. Such evidence cannot
  support a class-wide benefit, failure, comparison, or ranking.
- Ordinary answers must now be concise, name programs plainly, omit protocol or
  compliance preambles, translate internal status codes into normal language,
  and keep raw enums/receipt keys in an explicitly requested technical audit.
  Machine completion blocks are now separated from user-facing output in the
  Forum module.
- The regenerated Instructions are 7,962 characters with SHA-256
  `4fff01a07aa817941c5b8cd4c3b0ea2e79621901288140d6cf1056bf402312e5`.
  Its synchronization-ledger SHA-256 is
  `a1e6e4390fb640a95ab01e51be9b3c70774368fa3208d65cc0723e1df4427ecc`.
  The Action OpenAPI remains unchanged. The final post-review host gate passed
  typecheck, build, 60 test files with one declared live-file skip, and 989 tests
  with five declared credential-gated skips. Public-site validation covered four
  pages and site-deployment tests passed 28/28. Independent review prompted
  restoration of comparator scope, directional YouTube discovery, and current
  recovery truth; final re-review found no blocker or Important issue. PR #44
  passed protected review and merged the repair as
  `b8e110404130d1d1e85d56112b837c499106086e`. The exact post-merge
  deterministic verification (run `32464548386`), workflow policy (run
  `32464548449`), and CodeQL (run `32464548011`) all passed. The merged tree
  was identical to the reviewed source tree. No runtime or site deployment was
  required because this repair changes only the generated editor instructions,
  research routing, tests, and evidence. A read-only public check at
  `2026-08-21T08:47:26Z` returned `200` for both the research health endpoint
  and privacy page. At `2026-08-21T15:20:33Z`, after reviewing the complete
  then-current 7,962-character Instructions (SHA-256
  `4fff01a07aa817941c5b8cd4c3b0ea2e79621901288140d6cf1056bf402312e5`), the
  owner reported that exact artifact was already installed. The newer
  7,978-character citation-display candidate is not installed. Fresh UI
  acceptance remains pending.
- The pre-release lesson checkpoint at `2026-08-21T08:40:20.176Z` was
  available with 1 open candidate, 1 needs review, 0 accepted not incorporated,
  2 incorporated or closed, and 0 deletion eligible. No queued lesson expands
  or blocks this repair. The pre-closeout checkpoint at
  `2026-08-21T08:48:17.337Z` returned the same counts.

## Completed 2026-08-21 compact citation-display repair

- ARL-0007 was an open `missing_sources` candidate. The owner accepted a
  thresholded implementation after an internal display benchmark showed that
  link count was not the reader burden: compact direct links added 4–6% visible
  words across 8-, 16-, and 24-claim synthetic answers, while explanatory
  citation sentences added 86–89%.
- The Project router and Forum Signal output contract now require nearby links
  for decision-important, quantitative, comparative, safety-related, causal,
  contested, time-sensitive, or surprising claims. Direct support hyperlinks
  the shortest meaningful phrase. Synthesis receives a linked `(inferred)`
  marker and every material source basis. Grouping is allowed only when mapping
  stays obvious.
- Stable connective reasoning, user-supplied facts, and ordinary transitions
  do not receive decorative citations unless they become decision-important.
  If important matched support is unavailable, the claim is labeled unverified
  or omitted; an adjacent source cannot be presented as entailing it.
- Sanitized durable evidence is in
  `docs/audits/2026-08-21-compact-claim-citation-display.md`,
  `docs/custom-gpt-citation-display-regression-v0.1.0.json`, and the two
  `tests/custom-gpt-citation-*` regressions.
- The generated citation-display Instructions at that checkpoint were 7,978 characters with SHA-256
  `207249668ba176b0372422d61d9fe4f2096428db27a3b9b57e3d75ba525e4488`.
  Their synchronization-ledger SHA-256 is
  `a85ea88ba9ab908431deb5fc5da25824b8390e48f8975798dde31b7d3febb928`.
  The Action OpenAPI was unchanged. The owner-reported installation applied to
  the prior 7,962-character artifact; this checkpoint did not establish editor
  installation or fresh GPT-UI acceptance.
- Focused compatibility acceptance passed 7 files and 52 tests. The complete
  host suite passed 62 files with one declared live-file skip and 996 tests with
  five declared credential-gated skips under a 30-second per-test allowance;
  typecheck and build passed. The exact default-timeout gate reached 991 passes
  before five unrelated 5-second timeouts during severe four-core host
  contention; the four affected files then passed 44/44 serially. PR #47's
  protected deterministic verification run `32507689060`, workflow-policy run
  `32507689167`, and CodeQL run `32507685987` supplied clean-host proof.
- The lesson checkpoint at `2026-08-21T16:27:57.562Z` was available with 2
  open candidates, 2 needing review, 0 accepted but not incorporated, 2
  incorporated or closed, and 0 deletion eligible. ARL-0007 is the relevant
  candidate; ARL-0009's underlying behavior was previously merged but its
  private queue disposition remains open.
- The required pre-release checkpoint at `2026-08-21T17:07:52.873Z` returned
  the same counts.
- Independent integration review first found ambiguous legacy installation
  wording. After all owner receipts were scoped to the preceding 7,962-character
  artifact, final re-review reported merge-ready with no blocker or Important
  issue. Existing safety, research-completion, program-scope, plain-language,
  transport, and lesson-consent controls remained intact.
- PR #47 merged exact reviewed head
  `51e420c69b9e811d857977b95a310a93f4975637` as
  `7b6dac66a67bbfb43bcabbbbf37c5dd60a0dc7a3` at
  `2026-08-21T17:22:42Z`. Exact post-merge deterministic verification run
  `32507846373`, workflow-policy run `32507846508`, and CodeQL run `32507846256`
  passed.
- ARL-0007 was labeled `accepted` and `incorporated` and closed against that
  merged evidence. The required post-closeout checkpoint at
  `2026-08-21T17:25:55.556Z` was available with 1 open candidate, 1 needing
  review, 0 accepted but not incorporated, 3 incorporated or closed, and 0
  deletion eligible. ARL-0009 remains outside this completed change.

## Active 2026-08-18 treatment-decision regressions

- In a fresh public-GPT run for a treatment-alternatives question, the GPT
  loaded and verified Universal and HRP but did not run PubMed, Europe PMC,
  ClinicalTrials.gov, or the mandatory Forum Signal YouTube survey/audit. It
  nevertheless labeled the answer HRP-complete. The later audit correctly
  identified the omitted formal retrieval, omitted community module, and
  ineffective applicability/completion ledger. The later YouTube work does not
  retroactively validate the first answer.
- This is an observed product-interface failure, not merely one of the three
  opaque remote-MCP receipts. Do not accept those opaque limitations or proceed
  to v0.1 submission until this regression is repaired and retested.
- The GPT then attempted to report the validated failure, but the lesson Action
  returned the non-retryable privacy rejection. Do not retry or resubmit that
  failed candidate. The repair must keep the fail-closed privacy boundary while
  ensuring a fully generalized `protocol_execution` lesson—with no medical
  topic, exact prompt, quotations, URLs, turn references, or execution
  transcript—passes the deterministic contract and receives explicit
  privacy-model guidance.
- Existing source instructions already state that Forum Signal is required
  when firsthand outcomes, harms, tolerability, discontinuation, or patient
  decision-making could plausibly matter. The current generated Custom GPT
  artifact lacks a permanent explicit treatment-alternatives regression, and
  the observed model ignored the general trigger. The narrow repair is to make
  treatment alternatives, avoiding replacement, and avoiding surgery explicit
  fail-closed examples; require a passing Forum Signal receipt before any
  HRP-complete label; and preserve the existing public non-tailored health
  boundary.
- A second fresh public-GPT treatment-decision run did execute YouTube
  community work, but it stayed anchored to the clinician-proposed
  celecoxib-to-surgery pathway. It audited the named treatments without first
  discovering and comparing realistic alternatives. Forum Signal execution
  therefore did not satisfy HRP's independent broad heterodox option-space
  requirement.
- The expanded repair separates Forum Signal applicability from treatment
  option-space breadth. Personal/practical decisions require Forum Signal even
  when alternatives are unstated. Endorsement, choice, and start/defer/sequence
  decisions also
  require an option-space ledger covering proposed care, diagnosis
  alternatives, nonaction/natural history, conventional nonsurgical care,
  lifestyle/rehabilitation/mechanical approaches, relevant heterodox or
  adjunct approaches, and procedural/surgical care. Plausible classes must be
  searched and exclusions justified before a verdict.
- PR #36 merged and deployed that repair. The owner installed exact
  7,753-character Instructions
  `efd1567e185d2c9c3c209812a26dde630de802ba7a0b878ee9640af7886c14ec`
  with empty Knowledge.
- A third broad treatment-pathway product run then executed Forum Signal and
  option-space work, retrieving 1,179 YouTube records and returning 418 for
  analysis, but exposed a discovery/weighting failure. It treated four largely
  conventional/provider-ranked pools as adequate without a candidate-selection
  ledger, collapsed distinct exercise/PT programs, did not separate
  preoperative conservative care from postoperative rehabilitation, did not
  constrain decisive THA trials to their exact comparators, and gave little
  structured steelman treatment to hydration/collagen evidence after exact
  matched studies were not located.
- The owner then exercised the first discovery/weighting candidate
  (`8cbc6a3a5741f46e08cb184dfb32277d85a4897aa86e993865bfdc219f1b41d6`)
  through another fresh product run. It audited generic conservative care
  (`partial` / `completed_with_access_boundary`, 272/272/71), general NSAID
  experience (`api_visible_complete`, 197/197/110), and postoperative
  replacement mistakes (`api_visible_complete`, 989/989/103), where each tuple
  is provider-reported/retrieved/returned-for-analysis. It omitted separate
  gelatin/collagen and hydration hypotheses, did not locate program-matched
  preoperative PT videos, collapsed distinct PT/exercise programs, and still
  labeled the result HRP-complete. This owner-provided UI receipt disproves the
  sufficiency of the first follow-up; tool execution and passing per-video locks
  did not establish option-space coverage.
- The first test-first follow-up merged as PR #37. RED was
  observed because the Project router, Forum module, plugin skill, and generated
  Custom GPT packet lacked the new executable controls. The candidate adds a
  candidate-selection ledger, exact intervention/comparator decomposition,
  preoperative/postoperative separation, comparator-bounded inference, and
  steelman-without-inflation rules, plus regenerated Instructions/sync artifacts
  and a new seven-case discovery/weighting matrix. No canonical
  protocol, OpenAPI operation, MCP tool, production deployment, or private
  lesson changed in that follow-up. The owner installed and product-tested its
  exact generated Instructions; that test produced the failure immediately
  above. The rejected lesson was not retried. The
  dirty original checkout and its unrelated credential-looking files remain
  untouched.
- A topic-specific second follow-up was tested locally and then superseded
  before publication because baking the observed hip answers into production
  would contaminate future tests and fail to generalize. The active candidate
  instead uses universal evidence-frontier search, exact claim fingerprints,
  creator-transcript verification, independent comment audits, and a no-padding
  timestamped watchlist. The failed hip answer remains historical evidence, not
  a shipped checklist.
- Owner-reported OpenAI state: individual identity is verified. Business/
  organization verification is blocked after an apparent signup timeout; the
  owner believes the retry delay may be three months, but the exact duration is
  not independently verified. Official OpenAI documentation permits submission
  under either a verified individual identity or a verified business identity,
  and requires the listing identity, website, support, privacy, and terms to
  match. Publishing under the individual identity now exposes/uses the
  individual's publisher identity; waiting preserves the AskRigor business-name
  alignment but delays submission. This remains an owner identity/privacy choice.

## Historical Custom GPT research bridge acceptance — through 2026-08-18

This section preserves the then-current bridge acceptance chronology. Every
production identity in this section is superseded by the 2026-08-21 baseline
and completed rollout at the top of this file.

- PRs #19 through #23 are merged. The continuation release merge is
  `905ac22ab42479c15ff0d6385a51de864271f862`, exact PR #23 head
  `11f3a68a73bc68bc23f1854b6bd8d4c06f9b843f`. The exact formerly failing
  YouTube video now completes its direct two-call Action chain with a
  deterministic terminal sample and `synthesis_lock:pass`; the repaired
  two-call Custom GPT UI retest passed on 2026-08-17. PR #27 then merged its
  sanitized receipt and the then-current Universal ancestry as production revision
  `5585a9ca34ce01403044b1085b85d4f2de9783f4`.
- The owner approved the compatibility bridge and clear reversible changes.
  PR #15 merged accepted head `be641bf568c401992ff4aa9fe885552d6cfb2dca`
  as `dd73d7dccb6bc3f96b964aafa6a2f74f96ab16c4`; its deterministic,
  workflow-policy, and CodeQL checks passed before merge and again on the merge
  commit. The 17-tool MCP v0.1 inventory remains frozen.
- Design/implementation provenance remains `5c149c7`, `eaaf671`, `2a2a988`,
  `1ea0c0b`, `b6575d1`, `1387c2d`, `b441382`, `ee52876`, `fbd9c28`, and
  `d14f530`. Independent review's two Important findings were fixed before
  merge: enabled research Actions now require the server-only continuation
  secret at startup, and all operations declare the router-owned 500 response.
- At that checkpoint, production ran exact application revision
  `d1af238325ee1e0584574e47bbcbe7764d17cf7e` as image
  `sha256:8575134332df001ddbbb5b40a041a468cff76b3388b4f6deb267b1c3363998dd`
  in healthy container
  `9976fc89f8bb4065e6c46f7fa6cacb49e1a0eb4e526c11ca2ac346bf788fcf51`.
  Rollback is `askrigor-research:rollback-d1af238` plus
  `/opt/askrigor/compose.yaml.rollback-d1af238`, restoring image
  `sha256:95b86a1135701149c17125d1a5994e41063f868eefd903a38e28b4c09e0f6953`.
  That checkpoint's Compose SHA-256 was
  `f9ebc08643d25d3a54590dd885fbbe795f5aa4c0cea1f28a51c21bb7455dc4c4`;
  rollback Compose SHA-256 is
  `cf2fa82cbe4ba6e6b9ce515e2f260d07dacf09f1df6ac2feb66cfc485f9c69cf`.
  Only the research service was recreated for the privacy-model repair.
- `ASKRIGOR_RESEARCH_ACTIONS_ENABLED=true` was active. Research Actions shared
  MCP's transient provider flow, per-client token bucket, and 16-request
  concurrency pool. Responses remain limited to **60,000 serialized UTF-8
  bytes** and exact protocol chunks to **48,000 UTF-8 bytes**.
- The historical generated packet remains reproducible: then-deployed committed OpenAPI SHA-256
  `0e166153faf37b3c7b4963fde2ad0b9c02cc5c7a4acd9620446c308c291c8e94`,
  then-current public-boundary Instructions
  `0d87dc53f1b717a9e2d8e3d360f462fa4748800159f588095def5b2203e8f4b8`,
  and sync ledger
  `621d0795872719903ed7ed3bd4b7aab85f875c8923b17b26d1f373d15af19081`.
  The consent-shell candidate installed for the latest UI run was
  `b4fd87ccff39e787eefb706257e49f0956b24e40cfb4c4e2fb24035b80b5c6af`.
  The failed-safe UI run used the prior Instructions digest
  `ef4c9845b3e50d3978f718fe10fff64ef53e55a3a4c045e8b1eb389b15bb9aad`.
  The sole editor instruction source is `docs/custom-gpt-instructions.md`;
  Knowledge must remain empty.
- The transactional site release at that checkpoint was
  `/opt/askrigor/site/releases/56b3dff6d7c3/site`. All four pages returned
  200, and live privacy bytes match SHA-256
  `d73d9557852a17975b345ae20bfe24edc70267a3f595959b2bfb5d7198c26453`.
- The bridge release's direct production acceptance passed complete Universal
  2/2 and HRP 11/11 byte coverage, PubMed, ClinicalTrials.gov, Crossref,
  YouTube survey/audit,
  malformed/oversized requests, rate limiting/recovery, exact 18-operation
  Action security, health, and the 17-tool MCP inventory. Detailed sanitized
  receipts are in `docs/custom-gpt-action-live-acceptance.md`. The 2026-08-17
  release reverified health, schema, protocols, inventory, the 16-record
  one-call audit, and the exact 149-record two-call terminal-refetch chain. The
  later Universal-only rollout freshly passed health, exact OpenAPI, current
  Universal `20.5.13` manifest/integrity/3-chunk full load, unchanged HRP
  `20.5.18`, lesson `401`, privacy hash, and the exact 17-tool inventory without
  repeating provider calls or lesson writes.
- `AskRigor-lessons` is private again. The exact selected-repository GitHub App
  path created synthetic `ARL-0006`; the duplicate returned the same ID with
  occurrence count 2 while preserving the issue body byte-for-byte. The issue
  was labeled rejected and closed as not planned. Final queue status has 0
  open, 0 needs review, 0 accepted-not-incorporated, 2 incorporated-or-closed,
  and 0 deletion eligible.
- GitHub Free cannot protect a private personal repository: the hosted API
  returned HTTP 403 with the exact Pro/public requirement. This is a declared
  `AskRigor-lessons` governance exception, not a claim of protection.
- The first Custom GPT schema import exposed three editor-compatibility defects:
  missing object-valued `components.schemas`, plus 357- and 493-character
  descriptions over OpenAI's 300-character operation limit. The deployed repair
  emits `schemas: {}`, gives both legacy YouTube Action routes
  exact 201-character descriptions, and rejects any future exported description
  over 300. Focused red/green coverage passed 16/16; complete verification
  passed 49 files and 881 tests with one file and five tests skipped as declared,
  typecheck/build passed, site validation covered four pages, deployment-policy
  tests passed 28/28, and the portable audit returned no findings. PR #17 merged
  the exact repair head `b4d3db5d2b3f05debc4dd2c37cfa0d12290f67af` as
  `6639086a33b44f029c9f8405f69bd06b725e78d0`; protected and post-merge
  deterministic, workflow-policy, and CodeQL checks all passed.
- The exact merge is deployed. Fresh public OpenAPI validation found 18
  operations, object-valued `components.schemas`, no description over 300
  characters, and both affected descriptions at exactly 201 characters. Health,
  unauthenticated lesson isolation, current protocol identities, and the frozen
  17-tool MCP inventory passed without provider calls or lesson writes.
- Custom GPT product testing is now partial rather than wholly pending.
  Universal loaded completely in 2/2 chunks and HRP in 11/11; PubMed,
  ClinicalTrials.gov, and conservative Crossref metadata cases passed through
  the product interface. A real survey-first YouTube case then exposed the
  remaining defect: ChatGPT altered the multi-kilobyte stateless continuation
  token twice. The server correctly rejected both attempts and kept
  `synthesis_lock:block`; 66 records had been retrieved before the terminal
  error, zero were returned for analysis, and replies were unreconciled. That
  is retained as the pre-repair product failure, not the current result.
- The owner approved an Action-only repair after the privacy tradeoff was
  disclosed. Design commit `b5a760a` and implementation commit `7701a68` keep
  the exact frozen MCP operation/inventory unchanged while the Custom GPT
  adapter maps a 37-character handle to the existing signed minimized token in
  process memory for at most one hour, 2,048 entries, and 16 MiB. Expiry,
  restart, or capacity eviction fails closed and requires restart from the video
  identifier. This is now deployed direct behavior; only the fresh product UI
  relay remained unverified at that checkpoint. The 2026-08-17 UI retest passed:
  call one retained 66 records and returned the 37-character handle; call two
  reached 149 cumulative records, returned 111 for analysis, ended
  `completed_with_access_boundary`, and set `synthesis_lock:pass` with no error
  or further continuation.
- The first unused build candidate failed its disposable non-root smoke test
  because the staging workflow made archived source files unreadable to the
  runtime user. It never received traffic. Re-extracting the verified archive
  while preserving internal file modes produced the accepted image. This is a
  provisional transferable deployment lesson pending universal disposition;
  the OpenAI 300-character constraint remains project-specific evidence.
- Pre-UI-retest lesson status was `available` at
  `2026-08-17T23:45:43.207Z`: 0 open, 0 needs review, 0 accepted not
  incorporated, 2 incorporated or closed, and 0 deletion eligible.
- Lesson closeout: the AskRigor product failure, repaired UI pass, and exact
  limits are preserved in `docs/custom-gpt-action-live-acceptance.md`. The
  model-mediated relay finding is **transferable with bounded scope**:
  multi-kilobyte opaque,
  high-entropy continuation state can be mutated when an AI controller must
  reproduce it as a tool argument. The bounded short-handle adapter is not a
  universal default—it trades stateless restart resilience for short-lived
  server memory and needs truthful privacy disclosure. Promote only after the
  evidence-preserving universal review; exact merge, deployment, direct
  acceptance, and product-interface continuation now pass. Direct MCP clients
  remain the counterexample that should stay stateless.
- Universal `20.5.13` Custom GPT UI loading passed with exact 3-chunk,
  98,154-byte coverage and matching chunk/whole digests. The following
  synthetic lesson-consent shell failed safe: the GPT displayed raw candidate
  fields, falsely treated the shell wording as unavailable, and made no lesson
  Action call. The generated Instructions now contain the complete canonical
  shell and explicit authority routing. The later retest used
  `docs/custom-gpt-instructions.md`, empty Knowledge, the live OpenAPI URL,
  Bearer authentication, and a new chat. At that checkpoint,
  `gpt.askrigor.com` could not be repointed until the consent/duplicate cases
  passed and the actual direct `/g/...` URL was verified; the 2026-08-18 direct
  URL and routing acceptance below closes that gate.
- The hardened shell subsequently displayed correctly and rejected lowercase
  `yes`; exact `Yes` reached ChatGPT's consequential confirmation. Two calls
  then failed safe as `action_auth_required` because the existing editor Action
  had not yet been configured with the Bearer key. Production health remained
  `ok`; a no-write authenticated probe reached the expected `415
  action_json_content_type_required` boundary, proving the current server key
  path; and the lesson queue remained 0 open, 0 needs review, 0 accepted not
  incorporated, 2 incorporated or closed, and 0 deletion eligible.
- After the owner applied the existing key to that Action, the builder blocked
  public listing with `May provide tailored medical/health advice`. **Only me**
  is not the product goal. The generated public Custom GPT now preserves all
  general and subgroup evidence while prohibiting only individualized diagnosis
  and treatment direction. This public Custom GPT boundary does not alter the
  plugin, MCP server, canonical protocols, or production tools.
- PR #31 merged that boundary as
  `ed45bf42dfaea9f57bbf9268fabdbcd4a64b34c5` after all pull-request and
  post-merge checks passed. The owner then reported successful public
  publication. A new published-GPT chat passed the consent shell, exact `Yes`,
  ChatGPT confirmation, and Action authentication, then returned non-retryable
  `privacy_rejected` for the fully generalized source-audit lesson. No private
  candidate was created; the queue remained 0 open, 0 needs review, 0 accepted
  not incorporated, 2 incorporated or closed, and 0 deletion eligible.
- The displayed lesson passes the deterministic privacy screen. The previously
  deployed model `gpt-5-nano-2025-08-07` is now deprecated in official OpenAI
  documentation and has a recorded prior one-off rejection of the existing safe
  fixture. PR #32 pins `gpt-5.4-nano-2026-03-17`, updates exact
  token accounting and reasoning syntax, and adds explicit privacy-only
  guidance. Its non-stored synthetic compatibility probe passed 8/8 safe cases
  and 3/3 identifier cases with zero identifier leakage. Exact merged code is
  now deployed; its GitHub-disconnected, non-stored safe-candidate probe returned
  `generalized` without touching the production lesson ledger or GitHub.
- On 2026-08-18, a new published-GPT chat displayed the complete consent shell
  and exact `Yes` plus ChatGPT confirmation submitted `ARL-0007`. An independent
  identical recheck displayed the shell again and returned the same candidate
  with occurrence count 2. The read-only aggregate at
  `2026-08-18T00:32:43.437Z` confirmed 1 open candidate, 1 needs review, 0
  accepted not incorporated, 2 incorporated or closed, and 0 deletion eligible.
- The published GPT direct URL is
  `https://chatgpt.com/g/g-6a64103633d8819187f57c7b2986e505-askrigor-com-heterodox-research-protocol`.
  The public page returned HTTP `200` and identified **AskRigor.com Heterodox
  Research Protocol**. At `2026-08-18T01:34:40Z`, both HTTP and HTTPS for
  `gpt.askrigor.com` returned one temporary `302` redirect to that exact URL and
  ended at HTTP `200`. The prior `/share/...` destination is the rollback
  target. DNS remains Porkbun forwarding; production VPS/Caddy/application
  state was unchanged and public health remained `200`.
- The required lesson checkpoint at `2026-08-18T01:37:36.024Z` reported 1 open
  candidate, 1 needs review, 0 accepted not incorporated, 2 incorporated or
  closed, and 0 deletion eligible.

## Completed

- Recovery inspected the complete instruction chain, profile/state/README/indexes, scripts/lock/runtime, workflows, ownership/dependency/security posture, recent commits, PR #7, and hardening issue #6.
- The dirty original `main` checkout and its unrelated untracked files remain untouched; all work is isolated here.
- During the initial 2026-08-15 recovery, then-current `main` was semantically
  merged without losing the Action implementation, live-acceptance evidence,
  privacy/release records, or compliance controls. Project-installation
  conflicts preserved separate MCP/Action surfaces, governance-file exclusion,
  and complete-protocol authority.
- The repository profile declares only exact commands run on this candidate and distinguishes hermetic CI from the separately authorized bounded provider smoke.
- `npm ci` passed on Node `24.18.0`: 156 packages installed, 0 audited vulnerabilities.
- At that 2026-08-15 recovery checkpoint, deterministic verification passed 42
  files with one credential-gated live file skipped; 843 tests passed with five
  skipped; typecheck and build passed. The current PR #23 release verification
  is recorded separately below.
- Site checks passed: four pages validated and 28/28 deployment tests passed. Protocol SHA-256 values match the authoritative XML bytes.
- The opt-in live provider smoke passed separately: two public-provider tests passed and three credential-gated providers skipped truthfully.
- `npm run lessons:status` returned available at `2026-08-15T22:33:40.515Z`: 0 open candidates, 0 needs review, 0 accepted-not-incorporated, 1 incorporated-or-closed, and 0 deletion eligible.
- At that same recovery checkpoint, the universal portable audit passed with 0
  errors and four truthful hosted-control warnings after token-shaped privacy
  fixtures were runtime-fragmented without changing their tested values.
- Release-truth TDD now rejects stale pre-deployment claims. README, privacy map, review checklist, and release evidence consistently record the deployed Action, live August 13 notice, exact 17-tool inventory, rollback, and still-blocked public submission gates.
- Production Action acceptance is preserved from exact code revision `1c32ab047e20db9c833ac5a18b9e0eda1bc3c11a`; it remains a separate consequential route and not an MCP tool. PR #8 merged the code as `f8e7ca1e10c096e050207828eeb9eb7957d7ef6f`.
- Universal PR #4 exact head `1d1e6d03a92bbcec65bdc02ea6490af6e640eda8` contains the promoted AskRigor controls and passed run `31848203559`, job `94918801742`.
- The owner selected a scoped `AGPL-3.0-or-later` grant for original software.
  `LICENSE.md` keeps complete protocols, health-research policy, evidence,
  editorial content, recorded fixtures, and archived/third-party tools outside
  that grant; the exact official license bytes are integrity-tested.
- Hosted governance is directly verified. Active ruleset `20882388` requires
  pull requests plus strict `Deterministic verification` and `workflow-policy`,
  blocks deletion/force pushes, and retains the sole owner as the only bypass
  without requiring fake independent approval.
- Actions are limited to the three exact SHA-pinned checkout/setup-node
  revisions used by current workflows; default workflow tokens are read-only.
  Secret scanning, push protection, vulnerability alerts, Dependabot security
  updates, private vulnerability reporting, and CodeQL are enabled.
- CodeQL setup run `31862487322` succeeded. Two alerts were dismissed with
  durable false-positive/test-only reasons. The real prototype-pollution alert
  has a red/green regression and a null-prototype path-map fix on this branch.
- Public-review automation now binds every run to the exact Git commit and
  committed case-file bytes, separates direct MCP and raw Responses evidence,
  enforces serial request/case/full-run limits, and writes only checksum-covered
  sanitized artifacts. A Git-capable runner image is pinned by Node digest and
  Debian Git version after the first end-to-end attempt exposed the missing Git
  executable before network evaluation.
- At the 2026-08-15 automated-review rollout, the live YouTube comment-ID
  response-shape regression had a failing-then-green fixture test. That rollout's
  production research image
  `sha256:e4838746679323050adb636f132ee3c4f72eb8d6c7765906357718531c54578b`
  was healthy at acceptance and is now superseded by the PR #23 image recorded
  above. Caddy was not recreated, the Action state/auth boundary was unchanged,
  and all 17 public MCP tools remained read-only.
- Final protected run `20260815T110708.728Z-baa07445` used clean commit
  `8ed8c0f7aaab9609dfb067780c05838f98903bab`: all 9 direct cases passed,
  6 model cases passed, and 3 model cases remained honestly blocked by opaque
  remote-MCP receipts. The report/summary manifest and evidence safety scan
  passed. Exact bounded evidence is in `docs/release-evidence-v0.1.0.md`.
- PR #9 merged into `main` as `e63a0f73ec28a4b91673eed768d8e72f41986418`.
  Post-merge deterministic verification, workflow policy, and both CodeQL
  analyses passed on that exact merge commit.
- Fresh post-deployment ChatGPT interface acceptance on 2026-08-15 visibly
  passed exact isolated integrity and load calls and returned a successful
  ordered manifest/verify/load receipt with the current HRP identity. It did not
  reproduce the earlier routine-status narration and showed no write
  confirmation. The copied combined transcript collapsed or mislabeled its tool
  card; that presentation limitation remains declared.
- Lesson closeout for this acceptance is project-specific / no-new-lesson; the
  three-layer proof distinction was already promoted and tested universally.
- PR #10 merged the interface evidence into `main` as
  `287bac798f9e61568b56194385e43a21b899a4f8`. Post-merge deterministic
  verification, workflow policy, and both CodeQL analyses passed on that exact
  merge commit.
- PR #11 merged the bounded interface-state closeout into `main` as
  `57340f4ee2d9165fc7d680fe01cae9c8ca0f251a`.
- OpenAI's current primary submission documentation was rechecked on
  2026-08-16. The owner approved Approach A and confirmed the durable design at
  `docs/superpowers/specs/2026-08-16-public-submission-packet-repair-design.md`.
- The public plugin package no longer references environment-specific
  `.app.json`, uses the 28-character `Auditable research retrieval` short
  description, and includes self-contained square SVG logo/composer assets.
  The current local `plugin-creator` validator passes on the clean package.
- `docs/public-submission-packet-v0.1.0.json` now separates portal-only fields
  from package metadata, selects exactly `positive-1` through `positive-5` and
  `negative-1` through `negative-3`, and keeps every hosted gate explicit.
  The extended 6+3 case file and all historical receipts remain unchanged;
  `positive-6` remains extended regression evidence.
- TDD observed seven expected failures before the package/packet/assets
  existed. The final focused package/packet gate passes 12/12. The existing
  public-review safety suite passes 61/61 after its deliberately credential-
  shaped runtime fixture was assembled from safe source fragments so the
  portable repository audit does not mistake the test source for a credential.
- For the 2026-08-16 PR #12 packet-repair checkpoint, bootstrap passed on Node
  `24.18.0`: `npm ci` added 156 packages, audited
  161, and found zero vulnerabilities. `npm run lessons:status` returned
  available at `2026-08-16T00:49:00.120Z`: 0 open, 0 needs review, 0 accepted
  not incorporated, 1 incorporated-or-closed, and 0 deletion eligible.
- That PR #12 packet-repair verification passed 43 files, with one live-provider
  file skipped; 848 tests passed, five credential-gated tests skipped;
  typecheck and build passed. Site validation covered four pages, deployment
  tests passed 28/28, and the universal portable audit at that checkpoint had no
  findings. No live provider call, production deployment, portal submission,
  credential access, or protocol/application behavior change occurred in that
  packet-repair task.
- Lesson closeout for this repair is project-specific / no-new-lesson. The
  distinction between repository-visible and hosted proof and the runtime-
  fragmented credential-fixture pattern were already promoted and tested in
  the universal repository.
- PR #12 merged the exact packet-repair head into `main` as
  `0d8ef69fa7fd73c34c571a07723b5a6b5bad5fec`. Post-merge deterministic
  verification run `31918684165`, workflow-policy run `31918685565`, and both
  CodeQL analyses in run `31918683952` passed on that exact merge commit.
- PRs #19 through #22 merged the short Action handle, pagination-overlap
  reconciliation, and fail-closed terminal sample handling. The PR #22
  candidate was rolled back after direct acceptance exposed YouTube's live
  comment-ID filter ceiling: 50 IDs returned `200`, while 51 returned `400
  invalidFilters`.
- PR #23 added the failure-sensitive 50-ID regression and merged as
  `905ac22ab42479c15ff0d6385a51de864271f862`. Focused tests passed 22/22;
  independent affected-suite verification passed 49/49 with no findings; the
  full host-boundary gate passed 914 tests with five credential-gated skips,
  typecheck, and build. PR and post-merge deterministic, workflow-policy, and
  CodeQL checks passed.
- Production is healthy on exact image
  `sha256:b7273c24f568bbd8d9c9f5a4758a89e08b9142af4d23a18d79a62e6df0b3b067`.
  The known 16-record audit remains one-call complete. The exact formerly
  failing video reached 149 records across two Action calls, returned a
  deterministic 111-record sample, ended `completed_with_access_boundary`,
  reported no error or continuation, and set `synthesis_lock:pass`. Caddy and
  the site release were unchanged; exact rollback image and Compose remain
  ready.

## Transcript/evidence-frontier implementation checkpoint

- The completed repair plan is
  `docs/superpowers/plans/2026-08-18-youtube-transcript-evidence-frontier-repair.md`.
  The generated local Instructions are 7,797 characters, SHA-256
  `4b0d3382ee1f214a54c87e8c493d34b42e02467a66ee031f06fd33a2215b90bc`;
  generated OpenAPI SHA-256 is
  `9a7e19fc4b9b3b8e7e330865925628da7deea54529800dfcf630626ee03efc31`.
  Synchronization-ledger SHA-256 is
  `1ca16c082fcfed4f1c90e919aa541827fe1ca8c37e7b1de5c4968cba96ad2f3e`.
  At that implementation checkpoint, production had 17 research reads plus the
  lesson write while the source candidate had 18 reads plus the write because
  `get_youtube_transcript` is Action-only. Current production now has the 18-read
  Action surface; the exact checksum-locked standard and Gemini MCP profiles
  each remain 17 tools. The Forum Signal matrix has 15
  required and 9 not-required cases; the option-space matrix has 9 broad-review
  and 6 narrow-review controls; the discovery/weighting matrix has eight cases,
  plus an unrelated held-out evidence-frontier fixture. The focused
  router/skill/matrix/packet/transcript/registry suite passed 53/53 at that
  implementation checkpoint. The then-complete
  Node `24.18.0` gate passed typecheck, 58 test files with one declared
  credential-gated file skipped, 964 tests with five declared skips, and build.
  Public-site validation covered four pages and the deployment suite passed
  28/28. The current top-level section supersedes these historical counts.
  The current top-level deployment receipt supersedes the then-pending direct
  access boundary. Static tests and direct receipts still do not establish GPT
  UI behavior.
- The transcript adapter uses exact `youtube-transcript-plus@2.0.1` behind
  AskRigor's host allowlist, timeout, response-size, pagination, provenance, and
  access-state boundaries. It retrieves public caption tracks through an
  unofficial YouTube interface. Current direct production acceptance observed a
  complete captioned control and truthful unavailable states; caption accuracy
  and corpus visibility remain bounded and unverified. Transcript text is not
  retained between requests.
- Owner-authorized isolated Gemini/YouTube evaluation is recorded in
  `docs/audits/2026-08-18-gemini-youtube-discovery-evaluation.md`. With generic,
  de-identified prompts, Gemini 3.6 produced materially more specific and
  diverse search directions than the static query families across the failed
  hip case and two unrelated cases. Ungrounded Gemini URL generation failed
  independent validation for all 14 generated identifiers and is prohibited by
  the recommended design. Direct summaries of five real public URLs were rich
  but took 22.7-33.9 seconds and 82,152-171,688 prompt tokens per video; initial
  transcript acquisition was `api_visible_complete` and took 2.8-12.2 seconds.
  Later transcript retries returned `rate_limited`, and an independent subtitle
  request returned HTTP 429, so the matched transcript-plus-model timing test
  and the apparent creator-transcript hydration substring remain unresolved
  rather than negative evidence. A separate bounded `top`-sorted community
  sample returned 2,000 of an estimated 5,374 comments as `partial` and did
  locate hydration/electrolyte and gelatin discussion. This confirms that the
  missed signals were present in the independent comment lane, not that the
  creator made those claims in the video. No API key, raw transcript, comment
  corpus, or unrestricted provider response was retained in the repository,
  and no production or protocol behavior changed.
- A 2026-08-19 official YouTube Data API follow-up validated a temporary local
  key without retaining it. Exact metadata for three videos was
  `api_visible_complete` in 344 milliseconds. The discovery-video comment
  traversal exhausted 11 top-level pages in 5.358 seconds and returned 1,055
  threads, 921 embedded replies, and 1,976 unique records, but 35 reply-count
  mismatches require overall `partial`. Aggregate matches included nine
  hydration/electrolyte records (two uploader records), nine gelatin records,
  and 119 collagen records. This supports the official API for
  search/metadata/comments; it cannot download arbitrary public captions,
  which Google limits to OAuth users with edit permission.
- Google documents direct Gemini video input as audio plus one visual frame per
  second at roughly 300 tokens per video-second by default, explaining the
  measured 22.7-33.9 seconds and 82,152-171,688 input tokens. Consumer Gemini's
  approximately one-second YouTube summary uses an undocumented Connected App
  retrieval contract and may be transcript/metadata or cache based. There is no
  supported consumer-Gemini API. A personal laptop browser bridge remains a
  possible but brittle and policy-sensitive experiment; a VPS is higher risk,
  Gemini Spark MCP runs in the reverse direction, and the supported NotebookLM
  Enterprise API is disproportionate for this use case.
- The supported Gemini Spark direction passed account-side connection on
  2026-08-19 through `https://mcp.askrigor.com/mcp/gemini`. The standard endpoint
  reached initialization and `tools/list`, but Gemini rejected its 68,038-byte
  richer catalog. The accepted compatibility profile preserves the same ordered
  17 read-only tools and handlers while emitting a 12,239-byte catalog without
  output or execution declarations. This establishes transport and catalog
  compatibility only.
- Owner correction rejected the initial `run-askrigor-research` skill because
  it assigned complex Universal/HRP orchestration and completion judgment to
  Gemini. The replacement
  `integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md`
  restricts Gemini to
  intelligent YouTube discovery, fast creator summaries, selective visual
  observations, and exact-link validation through `get_youtube_video`. It
  returns a structured handoff to a separate capable AskRigor agent and cannot
  claim HRP, Forum Signal, evidence, or recommendation completion. The
  connection and skill upload are one-time; consumer Gemini's reverse-direction
  custom-app architecture still requires one compact handoff per research task.
  `docs/gemini-spark-setup.md` records the corrected installation, scope,
  removal, and synthetic scout acceptance flow. The replacement passed its
  skill validator, focused contract 4/4, and complete deterministic gate: 58
  test files passed with one credential-gated skip; 967 tests passed with five
  skips; typecheck and build passed. An independent capability-denied forward
  test failed closed; real consumer-Gemini scout acceptance remains pending
  owner upload.
- The first owner-run consumer-Gemini scout then demonstrated useful discovery
  and detailed regimen extraction, including the previously missed clinician
  self-management direction, but failed the output contract. It returned
  `available` rather than a literal AskRigor status, left every timestamp blank,
  blurred creator summaries with uninspected visual support, and did not
  distinguish exact long-term outcome matches from adjacent or promotional
  material. No substantive claim was promoted to evidence. The next skill
  revision adds a literal-status allowlist, empty-timestamp rejection,
  attribution/source checks, outcome-match and incentive classes, and a final
  self-audit; real replacement-skill acceptance remains pending.
- The second owner-run scout corrected the literal statuses to
  `api_visible_complete`, produced the requested query ledger and creator
  incentives, and surfaced a hydration regimen. It still generated blank
  timecode placeholders and selected six adjacent tutorials with zero exact
  outcome matches, despite the first run proving firsthand candidates were
  discoverable. The next revision replaces bare timecodes with rendering-safe
  clickable Markdown deep links paired with
  descriptive segment cues, and runs at least three exact-outcome discovery
  directions before adjacent mechanism or tutorial searches. The owner
  confirmed that Gemini returned the missing timestamps when directly asked to
  fix them; the failure was therefore a skill-format gap, not proof that Gemini
  could not locate timecodes. Clean consumer-Gemini acceptance remains pending.
- The next displayed consumer-Gemini output passed the rendering-safe timestamp
  and literal-status checks but repeated six adjacent tutorials after only one
  broad avoidance query and retained zero non-clinician firsthand patient
  accounts. Owner/Gemini diagnosis correctly identified clinic SEO dominance
  and technical-diversity selection pressure; the existing exact-outcome rule
  was soft and lacked a patient-creator quota. The next revision adds
  patient-specific queries with negative practitioner/institution terms,
  separate patient/clinician-self/practitioner-case evidence classes, and a
  `min(3, ceil(dossier size / 2))` patient target. A real corpus shortfall must
  remain explicit; the skill cannot pad or misclassify accounts to meet it.
  Clean consumer-Gemini acceptance remains pending.
- Owner review then narrowed the desired firsthand signal: a patient speaking on
  a personal channel does not qualify when the video mainly reviews a clinic,
  provider, procedure, program, or product. The scout now reserves its quota for
  `independent_patient_self_learning` accounts that expose personal hypotheses,
  experiments, routines, failures, adaptations, and takeaways. It classifies
  `independent_provider_treatment_review`, `clinic_patient_testimonial`, and
  `independence_unclear` separately; none counts toward the quota. Clean
  consumer-Gemini acceptance remains pending.
- Owner review then replaced the premature one-pass summary slate with a staged
  browse graph. Gemini now defaults to `seed_discovery`: diverse
  model-provenance query probes, exact/umbrella/anatomy/intervention search
  rings, fuzzy title recall, metadata triage, and two or three distinct
  comment-audit seeds without inferred comment findings. AskRigor performs the
  protocol-governed comment audit and may return a `youtube_rediscovery_packet`;
  Gemini's optional `targeted_rediscovery` mode then finds and summarizes narrow
  intervention videos. Broad leads must be back-searched against the exact
  target, and one creator ecosystem remains one discussion pool. Clean staged
  consumer-Gemini acceptance remains pending.
- Owner review then corrected the seed-stage ordering because titles and
  descriptions can hide the actual intervention. Gemini now must run a
  lightweight `remedy_extraction_scan` on 6–12 plausible videos and search each
  promising intervention name before AskRigor spends substantially more work on
  comment-corpus acquisition. Detailed regimen and dossier work remains deferred
  to targeted rediscovery. Clean staged consumer-Gemini acceptance remains
  pending.
- The next owner-run test found the held-out `GROWING MY HIP BACK` video and
  useful remedy families, establishing a major discovery-recall improvement.
  It nevertheless emitted the obsolete eight-record full dossier, old creator
  classes, and `Videos worth watching` instead of the staged seed packet. That
  fingerprint indicates an old or cached skill copy. The diagnostic skill is
  now distinctly named `scout-youtube-for-askrigor-staged` and requires
  `Scout contract: staged-remedy-scan-v2` as the first response line plus the
  active mode on line two. Clean acceptance requires those markers and only
  two or three comment-audit seeds in `seed_discovery`.
- A fresh-chat staged run then passed the browse-graph structure: heterogeneous
  probes, eight remedy scans, three metadata-validated seeds, explicit audit
  questions, and no final watchlist. It nevertheless populated the post-audit
  `youtube_rediscovery_packet` from creator content, including inferred
  community outcomes and counter-signals, labeled clinician self-management as
  the independent-patient role, and reported no access boundary despite every
  comment count being unavailable. Contract v2 now leaves only an unpopulated
  AskRigor return schema, forbids predictions about unseen comments, adds an
  honestly labeled clinician fallback, and preserves missing counts as access
  boundaries.
- Contract v2 passed the skill validator at 499 lines, focused Gemini tests 6/6,
  typecheck, and build. The standard parallel host suite passed 964 tests and
  timed out in five unrelated tests; those four files then passed 44/44 under
  isolated serial execution. A complete host serial suite passed all 969
  runnable tests with five declared skips, confirming the parallel result was
  load-sensitive rather than a v2 regression.
- The next owner-run v2 output preserved the post-comment boundary but again
  selected three overlapping movement/PT ecosystems, predicted unseen comment
  contents, repeated a seed role, displayed only six of ten claimed scans, used
  a metadata status as a query-search result, and omitted radical layperson
  phrasing that had previously found the held-out natural-recovery video.
  Contract v3 makes terse prompts sufficient, runs default overlooked and
  conventional-feedback lanes, adds general rebuilt/regrew/restored/healed
  wording, preserves search-vs-metadata states, requires a complete scan ledger,
  limits dominant mechanical/PT seeds, reserves heterodox and conventional
  pools when located, and offers evidence-neutral rabbit-hole depth plus simple
  `dig into` choices.
- Contract v3 validates at 496 lines. Its focused contract suite passed 7/7,
  typecheck and build passed, and the complete serial host suite passed all 970
  runnable tests with five declared skips. The standard parallel verifier also
  reached 969 passes but one existing live-suite security scan exceeded its
  five-second timeout; that test passed 11/11 in isolation and in the complete
  serial suite with the established 15-second timeout.
- The next owner-run v3 report was useful but Gemini appended rich YouTube
  result surfaces that slowed rendering. Contract v4 requires ordinary Markdown
  text links only and forbids response-owned embeds, players, cards, carousels,
  previews, thumbnails, bare YouTube URLs, unnecessary duplicate link lists,
  and raw search-result appendices. Provider-owned search/tool traces outside the response
  remain a Gemini interface boundary rather than controllable report content.
- Contract v4 validates at 489 lines. Its focused contract suite passed 7/7,
  typecheck and build passed, and the complete serial host suite passed all 970
  runnable tests with five declared skips.
- Audit of the same v3 artifact found additional contract drift: speculative
  unseen-comment descriptions, omitted radical-outcome rows, specific diagnoses
  mislabeled exact despite an unspecified baseline, one mismatched rabbit-hole
  shortcut, untraceable direction counts, result-title query backfilling, and a
  harm-only conventional seed. Contract v5 freezes prospective probes, requires
  displayed radical rows, preserves adjacent diagnostic scope, uses balanced
  conventional seeds and nonpredictive audit rationales, and ties every rabbit-
  hole count and shortcut to displayed candidate rows and matching semantics.
- Contract v5 validates at 483 lines. Its focused contract suite passed 7/7,
  typecheck and build passed, and the complete serial host suite passed all 970
  runnable tests with five declared skips.
- The next owner-run v5 artifact fixed most earlier gates but still emitted a
  malformed candidate table, selected two supplement-family seeds under
  different roles, used unsupported rabbit-hole terms and counts, treated
  formal-evidence questions as access gaps, asked comments to confirm structural
  harm, and displayed a rich YouTube panel for nearly every broad query. Contract
  v6 batches 14–22 logical probes into 4–6 text-first site searches, defers native
  YouTube understanding to 8–12 shortlisted videos, uses complete numbered
  candidate records, requires unique seed roles and intervention families,
  enforces neutral audit questions, and maps every rabbit-hole term and count to
  source rows while separating retrieval gaps from research questions.
- Contract v6 validates at 482 lines. Its focused contract suite passed 7/7,
  typecheck and build passed, and the complete serial host suite passed all 970
  runnable tests with five declared skips.
- Gemini's file-upload security scan rejected the first v6 artifact without a
  diagnostic. The file was valid UTF-8 Markdown with no executable payload; its
  only clear byte-shape regression from the uploadable v5 artifact was a new
  1,066-character line, crossing a common 1 KiB scanner heuristic boundary.
  The compatibility revision wraps that schema instruction without changing the
  contract and adds a regression test requiring every source line to remain at
  or below 800 characters. The external scanner cause remains an evidence-based
  inference until an owner upload succeeds.
- The compatibility revision validates at 499 lines with a 595-character
  maximum line. The skill validator and focused contract suite passed 8/8;
  typecheck and build passed. The complete host-boundary serial suite passed 969
  tests with two fixed-five-second timeout failures; both timeout-prone files
  then passed 15/15 in isolation, covering all 971 runnable tests, with five
  declared skips.
- The owner reported the same security-scan rejection on the wrapped artifact,
  disproving line length as the operative cause. Contract v7 instead bisects the
  v6-only semantic delta against uploadable v5: it removes explicit tool-routing
  phrases such as instructions not to invoke or attach native YouTube entities
  and removes the literal site-search operator. It preserves four to six broad
  discovery batches, delayed content inspection, the 12-video ceiling, text-only
  report output, intervention-family diversity, neutral audit questions, and
  row-level rabbit-hole traceability. External upload remains the decisive test.
- Contract v7 validates at 499 lines and 35,551 bytes with a 595-character
  maximum line. The skill validator and focused contract suite passed 8/8;
  typecheck and build passed. The preceding compatibility revision covered all
  971 runnable tests, with its two load-sensitive fixed-timeout tests passing in
  isolation, and v7 changes no runtime source.
- The first successful v7 owner run confirmed upload compatibility and reduced
  raw search-panel clutter, but its output still violated the contract: named
  diagnoses and replacement queries were labeled exact despite an unspecified
  baseline; batched probes cited nonmatching rows; all candidate titles were
  unlinked; cyclic exercise was relabeled behavioral to manufacture seed-family
  diversity; an exercise-only seed filled the heterodox role; rationales
  predicted unseen comment content; an audit question requested a proportion;
  and several rabbit-hole terms mapped to rows that did not contain them.
- Contract v8 requires one-remedy heterodox probes, explicit probe-to-row match
  reasons, adjacent scope for every named pathology or procedure under an
  unspecified baseline, morphologically varied `grow/growing/grew ... back`
  discovery, linked candidate titles, scan records capped at 110 words, immutable
  modality-based families, honest role gaps, row-labeled non-prevalence comment
  questions, and verbatim row-derived rabbit-hole terms. It also requires blank
  lines so the contract marker, mode, headings, and fields render separately.
- Contract v8 validates at 499 lines and 37,811 bytes with a 607-character
  maximum line. The skill validator and focused contract suite passed 8/8;
  typecheck and build passed. This revision changes no runtime source; the
  immediately preceding full validation covered all 971 runnable tests with five
  declared skips after the two load-sensitive files passed in isolation.
- The owner's v8 forward run successfully rediscovered the held-out independent
  `GROWING MY HIP BACK` video and preserved diagnostic uncertainty, but four
  comment-audit questions cited unselected candidates, prevalence language
  leaked into rabbit-hole questions, several directions mixed unrelated
  intervention families, and an osteoarthritis account inherited exact target
  distance from its broad discovery query. Contract v9 makes comment questions
  executable from selected seeds only, exposes six distinct probe-family labels,
  derives scope from candidate content, records reach metadata without treating
  it as evidence, and separates current-seed rabbit holes from future seed
  candidates with coherent row relevance and retrieval-only gaps.
- Contract v9 validates at 499 lines and 40,324 bytes with a 760-character
  maximum line and SHA-256
  `afd0e18d8b6fb7c91806a82e7a8d873d86cebeaefe843272d55801737144fcbb`.
  The skill validator and focused contract suite passed 8/8; typecheck and build
  passed. This revision changes no runtime source, so the immediately preceding
  complete-suite coverage remains applicable.
- The owner's external Gemini upload rejected v9 at the security-scan step.
  Because uploadable v8 was 37,811 bytes while v9 crossed 40 KB at 40,324
  bytes, contract v10 tests the file-size boundary by removing duplicated prose
  while preserving the v9 seed-executability, family, scope, reach, and rabbit-
  hole invariants. External upload remains the decisive compatibility test.
- Contract v10 validates at 458 lines and 37,052 bytes with a 760-character
  maximum line and SHA-256
  `7a2faeed65d93777dc5c80458d8fb8be0e8a9c78ba03206e012b111e57fd8e3b`.
  The skill validator and focused contract suite passed 8/8; typecheck and build
  passed. This revision changes no runtime source.
- The successful v10 owner run confirmed the compact artifact uploads, but
  exposed semantic failures: batched queries omitted linked probe anchors,
  radical variants were bundled into one row, probe-family labels leaked into
  intervention families, a postoperative diary displaced an available
  independent nonsurgical outcome, audit questions invented uncited diet and
  injection examples, prevalence wording returned in rabbit questions, mixed-
  family rabbit holes persisted, and displayed `title_link` fields lacked
  actual Markdown destinations. Contract v11 makes each of these auditable with
  closed family values, batch-anchor coverage, seed-derived terms, banned
  prevalence phrasings, same-family rabbit rows, and literal link syntax.
- Contract v11 validates at 459 lines and 36,896 bytes with a 726-character
  maximum line and SHA-256
  `b84f679df5c4bfc017a53a82c6fdc4d240171447d0364207ba3ef68cb2310586`.
  It remains smaller than the uploadable v10 artifact. The skill validator and
  focused contract suite passed 8/8; typecheck and build passed. This revision
  changes no runtime source.
- The owner's v11 forward run uploaded successfully and improved family-safe
  rabbit holes, seed/question alignment, and independent seed classification,
  but exposed new structural gaps. Its 16 probes were collapsed into five
  mixed-family batches whose executed queries omitted several linked concepts;
  no literal grow/rebuild/regrow radical probe ran, so the held-out independent
  outcome disappeared. It also displayed 9 candidates after claiming 10, used
  `adjacent` as a semantic scope, omitted literal Markdown title destinations,
  introduced question details absent from seed rows, and selected a harm-led
  surgical video without an explicit recognized-benefit field.
- Contract v12 uses closed probe and semantic-scope enums, separate target
  distance, 6–10 one-family batches of at most three probes, per-probe required
  anchors, distinct radical roots including `grow/growing/grew ... back`, exact
  scan/display counts, contiguous candidate IDs, per-candidate video IDs,
  evidence-mapped question terms, and explicit conventional benefit/limitation
  fields. It validates at 387 lines and 36,287 bytes with a 780-character
  maximum line and SHA-256
  `fcee4476b45bce7d566260f31746244a939f0795e8bac3867a6b4fa9c2c18491`.
  The skill validator and focused contract suite passed 8/8; typecheck and build
  passed. This revision changes no runtime source and remains below the
  uploadable v10 and v11 artifacts.
- The owner's v12 forward run populated 10 single-family batches and all 10
  displayed candidate rows, selected an independent nonsurgical outcome, and
  preserved conventional benefit plus limitation. It nevertheless treated
  rapid relief, temporary traction, and a cartilage-mechanism tutorial as direct
  radical outcomes; counted only five overlooked intervention families once
  outcome lanes were excluded; supplied only two distinct negative conventional
  probes; leaked uncited terms and prevalence/efficacy wording into audit
  questions; and emitted one malformed duplicated rabbit-hole key. The held-out
  independent `GROWING MY HIP BACK` result was not rediscovered.
- Contract v13 separates search access from direct claim alignment, requires
  exact creator-claim evidence for a direct radical match, counts only eight
  eligible overlooked intervention families, requires two conventional-benefit
  and three separate conventional-negative rows, and exact-maps every named
  question term while banning prevalence and efficacy formulations. It also
  requires a duplicate/malformed-key self-check and states that Gemini is an
  optional parallel discovery lane: AskRigor may continue formal, grey,
  clinical, and other-community work while the manual Spark handoff is pending.
  The setup guide now documents this parallel-but-manual operating model.
- Contract v13 validates at 357 lines and 36,422 bytes with a 759-character
  maximum line and SHA-256
  `e9c6ee9f5a3ce336f55c0b0edd2c3c4184f597624bd56b599a53e31ae7e41352`.
  The skill validator and focused contract suite passed 8/8; typecheck and build
  passed. `git diff --check` passed. This revision changes no runtime source and
  remains smaller than the uploadable v11 artifact; external Gemini upload and
  a fresh forward run remain the decisive compatibility and behavior tests.
- The required lesson checkpoint at `2026-08-20T17:37:51.600Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded skill-contract repair.
- The owner's v13 forward run uploaded successfully, rediscovered the held-out
  independent `GROWING MY HIP BACK` account, counted seven eligible remedy
  families, distinguished the second radical tutorial as adjacent, populated
  balanced conventional and mechanical seeds, and emitted neither embeds nor a
  raw result dump. It also included the parallel handoff note. However, several
  batch queries omitted anchors belonging to linked probes, so claimed
  conventional-negative and other coverage was not fully executed. Two
  `single_intervention` probes bundled distinct treatments, only two explicit
  firsthand rows ran, candidate rows used `canonical_intervention_family`, and
  audit questions invented unmapped stomach, soreness, skin-irritation, and
  messiness details. Topical and device directions also reused the all-signals
  shortcut. The copied rendered output did not preserve link destinations, so
  literal Markdown-link compliance remains unverified rather than failed.
- Contract v14 requires nonempty anchors and per-probe `batch_anchor_evidence`
  for every probe, counts families and conventional/firsthand directions only
  after passing coverage, requires three separately anchored firsthand rows,
  prevents distinct treatments from masquerading as one intervention, and
  standardizes the candidate field as `intervention_family`. Question evidence
  maps must now precede questions, with only a small neutral unmapped vocabulary;
  plausible adverse details require exact source mappings. Rabbit-hole
  shortcuts now map to topical, device, regenerative, behavioral, mechanical,
  nutrition, or conventional families, while `all high-yield` is map-level only.
- Contract v14 validates at 354 lines and 36,467 bytes with a 660-character
  maximum line and SHA-256
  `50781cb39e00af21fe08b7223e4fba4c836c34d4063ddefa91947b93531d1549`.
  The skill validator and focused contract suite passed 8/8; typecheck, build,
  and `git diff --check` passed. This revision changes no runtime source and is
  only 45 bytes larger than uploadable v13 while remaining below v11.
- The required lesson checkpoint at `2026-08-20T18:01:02.751Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded forward-test repair.
- The owner reports that Gemini rejected the v14 upload at its security scan.
  The 45-byte increase over uploadable v13 is a possible boundary signal, but
  size alone is not a demonstrated cause because larger v10 and v11 artifacts
  uploaded successfully. Treat the receipt as content- or scanner-sensitive
  until an external upload establishes otherwise.
- Contract v15 preserves the v14 anchor, provenance, family, and question-map
  controls while compacting the final audit, removing newly introduced concrete
  medical examples, and replacing non-ASCII shortcut arrows. A regression test
  now caps the upload artifact at 35,600 bytes as well as 800 characters per
  line. The artifact validates at 350 lines and 35,419 bytes with a
  660-character maximum line and SHA-256
  `cd5c832be43358a57633064be4c50e0999bd22336ab9c79801d472f759383275`.
  The skill validator and focused contract suite passed 8/8; typecheck and build
  passed. The sandboxed complete gate recorded 67 listener-related failures
  (`EPERM` on localhost or a local pipe), then the required host-boundary test
  rerun passed 971 tests with 5 skipped. This revision changes no runtime
  source. External Gemini upload is still the decisive scanner test.
- The required lesson checkpoint at `2026-08-20T18:15:06.138Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded scanner-compatibility repair.
- The owner reports that the smaller v15 artifact also failed Gemini's security
  scan. This falsifies the working byte-ceiling explanation; the rejection is
  content-sensitive, nondeterministic, or an external scanner change.
- The current upload artifact is therefore a diagnostic control restored
  byte-for-byte to the owner's last known accepted v13 file: 357 lines, 36,422
  bytes, maximum line length 759, SHA-256
  `e9c6ee9f5a3ce336f55c0b0edd2c3c4184f597624bd56b599a53e31ae7e41352`.
  Tests pin that exact hash. The v14/v15 improvements remain recoverable in Git
  history but are intentionally absent from the upload control. If this exact
  artifact now fails, the scanner behavior changed outside the tested content
  delta and further prompt edits should stop pending platform-side diagnosis.
  The skill validator and focused contract suite passed 8/8; typecheck and build
  passed. A complete host-boundary rerun passed 971 tests with 5 skipped.
- The required lesson checkpoint at `2026-08-20T18:23:58.250Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  diagnostic rollback.
- The owner then clarified that exact v13 still uploads successfully. This
  rules out a platform-wide rejection and makes the post-v13 content delta the
  controlled variable. The rollback commit remains historical evidence, but
  v15 is restored as the canonical development skill at SHA-256
  `cd5c832be43358a57633064be4c50e0999bd22336ab9c79801d472f759383275`.
- Upload-only probe 01 starts from exact v13 and adds only execution/anchor
  controls. It is a local ignored artifact at
  `.artifacts/gemini-upload-bisect/01-execution-anchor/SKILL.md`, 36,505 bytes,
  SHA-256
  `99d1e3d26bde76a01eb47a90e7ced09ced68cbf48225f79dda7d57ea942174bd`.
  A pass moves the bisect to schema/question changes; a failure splits this
  execution group. The durable procedure is recorded in
  `docs/audits/2026-08-20-gemini-skill-upload-security-bisect.md`. Both skill
  artifacts passed the skill validator; the canonical focused suite passed
  8/8, and typecheck and build passed. The complete host suite passed 970 tests
  before one unrelated 5-second evidence-test timeout; that file then passed
  all 11 tests standalone. Five tests remained skipped.
- The required lesson checkpoint at `2026-08-20T18:53:43.444Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded upload bisect.
- The owner reports upload probe 01 failed Gemini's security scan, localizing
  the rejection to its six execution/anchor substitutions. Probe 02 now tests
  only the three counting/granularity substitutions from exact v13. Its local
  ignored path is
  `.artifacts/gemini-upload-bisect/02-counting-granularity/SKILL.md`; it is
  36,429 bytes with SHA-256
  `a97bf7073bdb391901db4109990fa230f17eaf9dcb4d79aa96c08856b15e1298`
  and passed the skill validator. A failure splits these three substitutions; a
  pass moves to the excluded anchor-evidence half.
- The required lesson checkpoint at `2026-08-20T18:59:43.800Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded second bisect step.
- The owner reports upload probe 02 also failed, localizing the scanner trigger
  to its three counting/granularity substitutions. Probe 03 changes only the
  overlooked-family counting and `single_intervention` paragraph from exact
  v13. Its ignored path is
  `.artifacts/gemini-upload-bisect/03-family-granularity/SKILL.md`; it is 36,437
  bytes with SHA-256
  `8807a426f843ff8b2729891486bff0559c29ed4576dfa9f90f6b47d3886539b2`
  and passed the skill validator. A failure splits that paragraph; a pass moves
  to the conventional/firsthand count pair.
- The required lesson checkpoint at `2026-08-20T19:03:12.702Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded third bisect step.
- The owner reports upload probe 03 failed, isolating the scanner trigger to its
  one family-count/granularity paragraph. Probe 04 is exact v13 plus one inserted
  clause requiring passing batch coverage before counting an overlooked family.
  Its ignored path is
  `.artifacts/gemini-upload-bisect/04-family-count-coverage/SKILL.md`; it is
  36,487 bytes with SHA-256
  `81a79526e554c3fa4c40845bcc97f8309f48e4b50858380e992efddb093d2c34`
  and passed the skill validator. A failure identifies that clause as
  sufficient; a pass identifies the excluded granularity rewrite.
- The required lesson checkpoint at `2026-08-20T19:09:31.968Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded fourth bisect step.
- The owner reports Probe 04 failed despite differing from accepted v13 by only
  one benign coverage clause. Because every changed artifact has failed, Probe
  05 is a mutation control: exact v13 plus one trailing LF byte and no semantic
  change. Its ignored path is
  `.artifacts/gemini-upload-bisect/05-blank-line-control/SKILL.md`; it is 36,423
  bytes with SHA-256
  `36af81951bcede7ac83955d7995e9c7ef417ea18f9fd127be1b8b782097f89f2`
  and passed the skill validator. A failure stops content bisecting and points
  to exact-artifact caching/allowlisting or unstable scanner behavior; a pass
  confirms the Probe 04 clause is sufficient.
- The required lesson checkpoint at `2026-08-20T19:20:55.628Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  mutation-control step.
- Owner correction superseding the preceding probe receipts: the intended Probe
  01 file at
  `.artifacts/gemini-upload-bisect/01-execution-anchor/SKILL.md` passed Gemini's
  security scan. The reported Probe 01 through Probe 04 failures came from
  uploading a different file and are invalid; Probes 02 through 05 remain
  untested. Resume from Probe 01's pass by testing the excluded schema/question
  half. The canonical skill was never moved, but diagnostic files were created
  under `.artifacts/`; before asking the owner to use any moved, renamed, or
  alternate file, explicitly announce the path change and identify the old and
  new paths.
- Upload-only Probe 06 is the complementary schema/question half after Probe
  01's confirmed pass. It starts from exact v13, retains the v13 contract
  marker, and adds only the post-v13 `intervention_family` schema wording,
  evidence-first question construction, compact candidate-ledger wording,
  exact-family rabbit-hole shortcuts, and compact final self-check. It is a
  local ignored alternate at
  `.artifacts/gemini-upload-bisect/06-schema-question-selfcheck/SKILL.md`, 349
  lines and 35,336 bytes, SHA-256
  `da09e2276c9dcdff93b042db1d90a02938558286215c9ae637a61cd5593a539a`.
  It passed the skill validator. The canonical v15 skill remains unmoved and
  unchanged at SHA-256
  `cd5c832be43358a57633064be4c50e0999bd22336ab9c79801d472f759383275`.
  A pass means both split halves are individually accepted and the next test is
  their combination with the v13 marker; a failure splits Probe 06's group.
- The owner reports Probe 06 failed Gemini's security scan. Probe 07 splits that
  group and starts from exact v13 with only three hunks: the exact
  `intervention_family` field contract, evidence-first question construction,
  and matching candidate-ledger wording. It excludes Probe 06's shortcut and
  compact final-self-check changes and all Probe 01 execution-body changes. Its
  announced local ignored alternate is
  `.artifacts/gemini-upload-bisect/07-schema-question/SKILL.md`, 358 lines and
  36,209 bytes, SHA-256
  `939d47bb5467a0ffb523a47b66e75cafd81eba12db79de1b7dca102b7af6b257`.
  It passed the skill validator. A failure splits schema from questions; a pass
  tests the excluded shortcut/self-check half. The canonical v15 skill remains
  unmoved and unchanged.
- The owner reports Probe 07 also failed. Probe 08 isolates the exact
  intervention-family schema from the evidence-first question rewrite: it
  starts from exact v13 and changes only the core candidate/seed field clause
  and its matching candidate-ledger output clause. The question rules are exact
  v13. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/08-intervention-family-schema/SKILL.md`, 357
  lines and 36,239 bytes, SHA-256
  `1493e548dab9659b6386110b21a6ba61bcc637bccdd977b537977c0086c16b1b`.
  It passed the skill validator. A failure splits the two schema hunks; a pass
  isolates the excluded question rewrite. The canonical v15 skill remains
  unmoved and unchanged.
- The owner reports Probe 08 passed. The exact `intervention_family` schema
  clauses are therefore accepted by themselves. Probe 09 starts from exact v13
  and includes only the one evidence-first question-construction hunk, with
  both schema clauses restored to v13. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/09-evidence-first-questions/SKILL.md`, 358
  lines and 36,392 bytes, SHA-256
  `0feaa036326bd24e1300ffe433d2bd17a706847e208eb0a3065ca29c89d0a3b8`.
  It passed the skill validator. A failure splits the question hunk; a pass
  establishes an interaction between individually accepted schema and question
  changes. The canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 09 failed. Probe 10 starts from exact v13 and replaces
  only the concrete question-term mapping line; the evidence-first ordering and
  compact banned-scan sentences are absent. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/10-concrete-question-mapping/SKILL.md`, 357
  lines and 36,161 bytes, SHA-256
  `013c5029ab0de3a5f862ae947c9ee27169e6381b3065633b7b76a68d2d42af77`.
  It passed the skill validator. A failure localizes the next semantic split to
  this one line; a pass tests the excluded evidence-first/banned-scan wording.
  The canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 10 failed. Probe 11 isolates the distinct no-invent
  clause as exact accepted v13 plus the single sentence `Never invent a
  plausible concrete detail absent from the map.` Its announced ignored
  alternate is
  `.artifacts/gemini-upload-bisect/11-no-invent-detail-guard/SKILL.md`, 358
  lines and 36,484 bytes, SHA-256
  `616b9776e564cdf13679b58f77bfe650e8f4e00385677fcb537e5982a06bb953`.
  It passed the skill validator. A failure requires scanner-compatible positive
  wording for this guard; a pass tests the remaining concrete-term coverage
  clauses. The canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 11 passed. The standalone no-invent guard is accepted
  by itself. Probe 12 starts from exact v13 and replaces only the remaining
  concrete-term coverage, mapped-example, and construction-audit line, with the
  no-invent sentence absent. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/12-concrete-coverage-construction/SKILL.md`,
  357 lines and 36,099 bytes, SHA-256
  `3120466fd7c1485dd7fd121097896355e4b46e661f53bc03f9250a60bb6a67b9`.
  It passed the skill validator. A failure splits coverage from
  example/construction clauses; a pass establishes an interaction within Probe
  10's individually accepted parts. The canonical v15 skill remains unmoved
  and unchanged.
- The owner reports Probe 12 failed. Probe 13 isolates the concrete-term
  coverage sentence as exact accepted v13 plus that one sentence; the
  mapped-example and construction-audit changes are absent. Its announced
  ignored alternate is
  `.artifacts/gemini-upload-bisect/13-concrete-term-coverage/SKILL.md`, 358
  lines and 36,548 bytes, SHA-256
  `f4dfeceaa0ad6d1e821931ecac51ce57cd52997d5e140710d1ea02a6ee283a31`.
  It passed the skill validator. A failure splits the coverage vocabulary from
  the exact-mapping command; a pass tests the excluded example/construction
  clauses. The canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 13 failed. Probe 14 preserves its command form while
  removing the medical/intervention vocabulary list: it is exact accepted v13
  plus `Every other concrete example must map exactly.` Its announced ignored
  alternate is
  `.artifacts/gemini-upload-bisect/14-exact-mapping-command/SKILL.md`, 358 lines
  and 36,469 bytes, SHA-256
  `590cd9344246dce4a9688d35c4eb9c8b12a72674491576a13225dd8dbc8c4a95`.
  It passed the skill validator. A failure requires positive source-alignment
  wording; a pass isolates the expanded vocabulary list or its interaction.
  The canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 14 failed even after its medical/intervention
  vocabulary list was removed. The terse `Every other ... must map exactly`
  command form is therefore the useful boundary. Probe 15 is exact accepted
  v13 plus the positive replacement `Use a cited source field for each concrete
  question detail.` Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/15-positive-source-alignment/SKILL.md`, 358
  lines and 36,482 bytes, SHA-256
  `cc4d45fbed10b34688ebdc173832607c84de9e66143471c57732e1320b400495`.
  It passed the skill validator. A pass makes this the production replacement;
  a failure means retain v13's existing evidence rule without a redundant new
  sentence. The canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 15 passed. Its positive source-alignment sentence is
  the scanner-compatible production replacement for the rejected terse mapping
  command. Probe 16 starts from exact accepted v13 and contains only the
  remaining evidence-first ordering and compact banned-scan clauses, retaining
  v13's original evidence-mapping line. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/16-evidence-order-banned-scan/SKILL.md`, 358
  lines and 36,653 bytes, SHA-256
  `f725a9e983b6e8fcefbef69d31292a4f5203d88ccc97f9f60ce78861392eeb8d`.
  It passed the skill validator. A failure splits ordering from banned-scan; a
  pass combines these clauses with the positive replacement and accepted schema
  group. The canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 16 failed. Probe 17 isolates its evidence-first
  ordering hunk while removing the added compact banned-scan sentence; v13's
  original evidence-mapping and banned-scan rule remains. Its announced ignored
  alternate is
  `.artifacts/gemini-upload-bisect/17-evidence-first-only/SKILL.md`, 357 lines
  and 36,304 bytes, SHA-256
  `7cb55b117cf85d3b48a3a57b1eed77a235ea5ff86f27d09611b9403d988be42f`.
  It passed the skill validator. A failure splits map-first ordering from the
  exact-keys command; a pass tests the compact banned-scan sentence alone. The
  canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 17 failed. Probe 18 preserves evidence-map-first
  ordering using positive wording while removing the `using only those exact
  keys` command, neutral-vocabulary list, and compact banned-scan sentence. It
  is exact accepted v13 plus `Build question_term_evidence or
  research_question_term_evidence before drafting each question.` Its announced
  ignored alternate is
  `.artifacts/gemini-upload-bisect/18-evidence-map-first-positive/SKILL.md`, 358
  lines and 36,521 bytes, SHA-256
  `7b7723af384289268224955c90f664dfa1082d2bf42ff6df94311e9943019648`.
  It passed the skill validator. A pass makes this the production ordering
  replacement; a failure retains v13 without an additional ordering sentence.
  The canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 18 passed. Its positive evidence-map-first sentence
  is the scanner-compatible production replacement for Probe 17's rejected
  exact-keys construction. Probe 19 is exact accepted v13 plus only the compact
  banned-phrase scan sentence from Probe 16; the deliberate duplication
  isolates scanner compatibility. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/19-compact-banned-scan/SKILL.md`, 358 lines
  and 36,771 bytes, SHA-256
  `45504fb8dee50f4620c6f16b793a12cdeb24988b7a2d8ea5459f08b7c4e89191`.
  It passed the skill validator. A failure retains v13's existing wording; a
  pass permits the compact form before assembling the repaired question and
  schema groups. The canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 19 passed. Its compact banned-phrase scan is
  scanner-compatible but redundant with v13's existing ban and is omitted from
  the concise production candidate. Probe 20 combines only accepted,
  production-worthy changes: Probe 08's exact `intervention_family` schema and
  candidate-output wording, Probe 18's positive evidence-map-first ordering,
  and Probe 15's positive source-alignment sentence. Its announced ignored
  alternate is
  `.artifacts/gemini-upload-bisect/20-repaired-schema-question-group/SKILL.md`,
  359 lines and 36,398 bytes, SHA-256
  `77a74883c7855a138df3e7a173ae90566c2b156dc7af0d775173c21b3112aa80`.
  It passed the skill validator. A failure bisects schema from the repaired
  two-sentence question group; a pass retains the group and proceeds to the
  remaining exact-family shortcut and final-self-check changes. The canonical
  v15 skill remains unmoved and unchanged.
- The owner reports Probe 20 failed despite each included component passing
  independently. Probe 21 removes the accepted schema changes and tests only
  the two positive question safeguards together: evidence-map-first ordering
  from Probe 18 and source alignment from Probe 15. Its announced ignored
  alternate is
  `.artifacts/gemini-upload-bisect/21-repaired-question-pair/SKILL.md`, 359
  lines and 36,581 bytes, SHA-256
  `299da8d50802b20ff84586619f65c844ea98a9664b2f5b74d768245ae7706a42`.
  It passed the skill validator. A failure identifies interaction between the
  two individually accepted question sentences; a pass identifies interaction
  between the question group and the accepted schema group. The canonical v15
  skill remains unmoved and unchanged.
- The owner reports Probe 21 passed, confirming the two positive question
  safeguards are compatible together and localizing Probe 20's failure to an
  interaction with the accepted schema group. Probe 22 combines Probe 08's
  accepted schema group with only Probe 18's evidence-ordering sentence. Its
  announced ignored alternate is
  `.artifacts/gemini-upload-bisect/22-schema-plus-ordering/SKILL.md`, 358 lines
  and 36,338 bytes, SHA-256
  `d06ca3a93f8dfbd4493c1718c9d8079e877e267a03d3e34f762b387a2b8492b7`.
  It passed the skill validator. A failure identifies schema-plus-ordering as
  the interaction; a pass moves the interaction boundary to schema plus source
  alignment. The canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 22 failed, proving the accepted schema group
  interacts with the accepted evidence-ordering sentence. Probe 23 splits the
  schema group: it retains only Probe 08's primary candidate/seed
  `intervention_family` contract with Probe 18's ordering sentence and restores
  the candidate-output clause to v13. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/23-primary-schema-plus-ordering/SKILL.md`,
  358 lines and 36,455 bytes, SHA-256
  `a8825d17b1911df8300518041c1fd8369d33aadf0da1ef0ee82e7fca7f77e1a4`.
  It passed the skill validator. A failure identifies the primary schema
  paragraph as the interaction; a pass identifies the candidate-output clause.
  The canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 23 failed, identifying the primary schema paragraph
  as incompatible with the evidence-ordering sentence when combined. That
  rewrite is excluded from the production candidate in favor of v13's existing
  functional family rule. Probe 24 restores the primary paragraph to v13 and
  combines only Probe 08's exact candidate-output field clause with Probe 18's
  ordering sentence. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/24-output-schema-plus-ordering/SKILL.md`,
  358 lines and 36,404 bytes, SHA-256
  `7a79ee9938d70f2079997c2e3840fbecb7dcaa1cc9f4caba06a026d5a92a25e6`.
  It passed the skill validator. A failure means both schema rewrites interact
  with ordering; a pass preserves the exact output-field correction while
  omitting the incompatible primary rewrite. The canonical v15 skill remains
  unmoved and unchanged.
- The owner reports Probe 24 passed. Retain the exact candidate-output field
  correction with evidence ordering and omit the incompatible primary schema
  rewrite. Probe 25 adds Probe 15's accepted source-alignment sentence to this
  reduced production group. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/25-reduced-production-question-group/SKILL.md`,
  359 lines and 36,464 bytes, SHA-256
  `00ab20508923d073caf49717205a6bf7a2362d200c3a90b372c33a9a7fd1b480`.
  It passed the skill validator. A failure drops the redundant new source-
  alignment sentence and relies on v13's mapping rule; a pass retains the
  reduced group before testing shortcuts and self-check changes. The canonical
  v15 skill remains unmoved and unchanged.
- The owner reports Probe 25 failed. The positive source-alignment sentence is
  therefore omitted from the cumulative production candidate, which relies on
  v13's existing exact evidence-mapping rule. Probe 24 remains the safe base.
  Probe 26 adds only the exact-family shortcut rewrite from v15, including
  dedicated topical, device, regenerative, and behavioral options and moving
  `dig into all high-yield signals` outside individual directions. Its announced
  ignored alternate is
  `.artifacts/gemini-upload-bisect/26-exact-family-shortcuts/SKILL.md`, 353 lines
  and 36,546 bytes, SHA-256
  `398995c5362d63177f6c68d793a7343836d08914336a9e3d23d50c8df110639f`.
  It passed the skill validator. A failure retests the shortcut from exact v13;
  a pass retains it before the final-self-check probe. The canonical v15 skill
  remains unmoved and unchanged.
- The owner reports Probe 26 passed. Retain the exact-family shortcut rewrite
  on the safe cumulative base. Probe 27 replaces only the thirteen-item v13
  final self-check with the compact nine-item v15 form while preserving the v13
  contract marker to isolate content. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/27-compact-final-self-check/SKILL.md`, 349
  lines and 35,531 bytes, SHA-256
  `30bcce770938c569b60a7227efd017fb658425a5486a77fe8ee7180fda3cfb48`.
  It passed the skill validator. A failure splits final-self-check items; a pass
  retains them before combining the accepted execution/anchor body from Probe
  01. The canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 27 failed. Probe 28 splits the compact final self-
  check by using compact items 1–5 while retaining v13's substantive lower-half
  checks for evidence mapping, remedy scans, rabbit holes, radical claims, and
  rediscovery. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/28-compact-self-check-top-half/SKILL.md`, 350
  lines and 35,783 bytes, SHA-256
  `a3da1ee279517b4a208c5bac90b755fa1a07d316db0ff6401833909ba0394ecb`.
  It passed the skill validator. A failure splits compact items 1–5; a pass
  localizes the rejected wording to compact items 6–9. The canonical v15 skill
  remains unmoved and unchanged.
- The owner reports Probe 28 failed. Probe 29 narrows the compact self-check to
  items 1–3 only: mode/packet framing, metadata and attribution, and text-only
  link hygiene. All coverage, scope/family, evidence, remedy-scan, rabbit-hole,
  radical-claim, and rediscovery checks remain v13. Its announced ignored
  alternate is
  `.artifacts/gemini-upload-bisect/29-compact-self-check-items-1-3/SKILL.md`,
  351 lines and 36,203 bytes, SHA-256
  `cb1d3006654248c57c1666537aecc7aa4e847a18e5baec30ff6382b124e60b7b`.
  It passed the skill validator. A failure splits items 1–3; a pass localizes
  the rejected top-half wording to compact items 4–5. The canonical v15 skill
  remains unmoved and unchanged.
- The owner reports Probe 29 passed. Compact self-check items 1–3 are safe on
  the cumulative base. Probe 30 adds only compact item 4, covering
  `batch_anchor_evidence`, three firsthand rows, passing-only coverage, and the
  one-treatment-per-batch rule; scope/family and later checks remain v13. Its
  announced ignored alternate is
  `.artifacts/gemini-upload-bisect/30-compact-self-check-item-4/SKILL.md`, 351
  lines and 36,162 bytes, SHA-256
  `17151ab0f727d3f5ded0221e70265f508a4c3c6684b6c383963f64be70c567a7`.
  It passed the skill validator. A failure localizes the wording to item 4; a
  pass localizes the top-half failure to compact item 5. The canonical v15
  skill remains unmoved and unchanged.
- The owner reports Probe 30 passed. Compact self-check item 4 is safe, so
  compact item 5 is the top-half failure and is omitted in favor of v13's
  detailed scope/family checks. Probe 31 retains this hybrid top half and tests
  compact lower items 6–9 for evidence, remedy/rabbit-hole, radical-claim, and
  rediscovery checks. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/31-compact-self-check-lower-half/SKILL.md`,
  350 lines and 35,910 bytes, SHA-256
  `434c87ebdfe76e12e57ce13b21d05dea189d8b5aa05720e0322e0b1e9ada8056`.
  It passed the skill validator. A failure splits the lower half beginning with
  compact item 6; a pass retains the hybrid self-check before combining Probe
  01's accepted execution/anchor body. The canonical v15 skill remains unmoved
  and unchanged.
- The owner reports Probe 31 passed. The scanner-compatible hybrid self-check
  is compact items 1–4 and 6–9 plus v13's detailed scope/family checks; compact
  item 5 remains excluded. Probe 32 applies the already accepted Probe 01
  execution/anchor body to this cumulative candidate: passing-only counts,
  single-remedy granularity, nonempty per-probe anchors, batch anchor evidence,
  and three separately anchored firsthand rows plus matching output fields. Its
  announced ignored alternate is
  `.artifacts/gemini-upload-bisect/32-cumulative-execution-anchor/SKILL.md`, 351
  lines and 35,993 bytes, SHA-256
  `e2925b60ab394740bcf0d536e7270497d6eb89d2356aad8cdb903ff6457c9ca4`.
  It passed the skill validator. A failure splits the execution group; a pass
  establishes the cumulative production candidate before a separate contract-
  marker test. The canonical v15 skill remains unmoved and unchanged.
- The required lesson checkpoint at `2026-08-20T19:36:27.067Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded complementary upload probe.
- The owner reports Probe 32 failed. This localizes the new rejection to an
  interaction between Probe 01's accepted execution/anchor body and the
  accepted cumulative Probe 31 base. Probe 33 splits that group by applying
  only passing-coverage counting and one-remedy `single_intervention`
  granularity to Probe 31; all anchor, firsthand-quota, and matching output-
  ledger changes remain v13. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/33-counting-granularity/SKILL.md`, 351 lines
  and 35,919 bytes, SHA-256
  `1ac680edc39e5c12c3e1e2914b558a95cf5283d4261b1630b89e1d2c9e83810c`.
  It passed the skill validator. A failure splits counting from granularity; a
  pass tests the anchor/firsthand half separately on accepted Probe 31. The
  canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 33 passed. Passing-coverage counting and one-remedy
  granularity are therefore compatible with accepted Probe 31. Probe 34 starts
  from Probe 31 and adds only the complementary universal anchor, batch anchor
  evidence, three-row firsthand quota, and matching output-ledger clauses; it
  excludes Probe 33's counting/granularity changes. Its announced ignored
  alternate is `.artifacts/gemini-upload-bisect/34-anchor-firsthand/SKILL.md`,
  350 lines and 35,984 bytes, SHA-256
  `f2985645907eef06914c84a690bb28ee7cb1b8b66dcd9d6933821a5ea61c55c9`.
  It passed the skill validator. A failure splits anchors from firsthand/output;
  a pass confirms both execution halves independently before recombination.
  The canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 34 failed. Probe 35 now isolates its universal anchor
  half against accepted Probe 31: nonempty per-probe anchors, per-batch literal
  anchor evidence, and shared query coverage. The radical sentence drops its
  redundant narrower anchor clause, while the firsthand quota and output-ledger
  changes remain v13. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/35-anchor-contract/SKILL.md`, 350 lines and
  35,982 bytes, SHA-256
  `0f6529b987c32cb161dfb272c86695d0c1c46c96f00b87f3faea5e89a016bfb2`.
  It passed the skill validator. A failure splits the universal paragraph from
  radical cleanup; a pass moves to firsthand/output. The canonical v15 skill
  remains unmoved and unchanged.
- The owner reports Probe 35 failed. Probe 36 removes its radical-sentence
  cleanup and changes only Probe 31's batch/coverage paragraph to require
  nonempty anchors for every probe, batch anchor evidence, and literal coverage
  in frozen and executed queries. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/36-universal-anchor-paragraph/SKILL.md`, 350
  lines and 36,135 bytes, SHA-256
  `29aefd07ef4887b80f051ff27075b31e0ecb91b2b49b02ae06810378fac8d0fe`.
  It passed the skill validator. A failure requires splitting or positively
  rewriting this paragraph; a pass excludes the radical cleanup. The canonical
  v15 skill remains unmoved and unchanged.
- The owner reports Probe 36 failed. Probe 37 replaces only Probe 31's batch
  paragraph with a minimal positive requirement: every probe records one to
  three literal anchors found in both frozen and batch queries plus coverage.
  It excludes batch evidence, sentinel-value prohibitions, and correction
  commands. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/37-positive-per-probe-anchors/SKILL.md`, 350
  lines and 35,906 bytes, SHA-256
  `b6ac1ac26bc6769d940f0a64b8e4049478ec0dc374e377f63f7c9d3a2386a027`.
  It passed the skill validator. A failure retains v13 anchor scope; a pass
  adopts this positive replacement. The canonical v15 skill remains unmoved
  and unchanged.
- The owner reports Probe 37 passed. Its positive every-probe anchor sentence
  is the scanner-compatible replacement for Probe 36's rejected paragraph.
  Probe 38 now starts from accepted Probe 31 and changes only the exact-outcome
  paragraph to emit `independent_firsthand_probe_count`, require three
  separately anchored firsthand rows, and count passing coverage. The output-
  ledger rewrite is absent. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/38-firsthand-quota/SKILL.md`, 350 lines and
  35,908 bytes, SHA-256
  `bcfb67df9eb12937f04139e5e4ddf8a8163c53926cfb3abe8e13ce8f783c7d3c`.
  It passed the skill validator. A failure rewrites or omits the counter clause;
  a pass moves to the output-ledger clause. The canonical v15 skill remains
  unmoved and unchanged.
- The owner reports Probe 38 passed. Its three-row firsthand quota is therefore
  compatible with accepted Probe 31. Probe 39 starts from Probe 31 and changes
  only seed-packet output item 1 to add the firsthand count, nonempty anchors,
  batch anchor evidence, and compact query/search-ledger wording. All matching
  execution-body changes are absent. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/39-output-ledger/SKILL.md`, 350 lines and
  35,914 bytes, SHA-256
  `03388ff4880218bac054504fc87094edafe3bc166a42deed188d546399b9933c`.
  It passed the skill validator. A failure splits fields from compact wording;
  a pass permits cumulative assembly from accepted positive replacements. The
  canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 39 passed through the Gemini conversation-upload
  path after a transient scanner disagreement: Gemini first reported a failed
  virus check, then rechecked itself, reported the file was fine, and replaced
  the prior skill. No owner-directed local file revision was reported between
  those outcomes. Installed bytes were not exported for readback, so preserve
  both outcomes and treat this as an accepted replacement receipt for the
  intended Probe 39 hash, not proof of byte-identical installation. Future
  automatic rewrites must be exported and diffed before they count as the
  tested artifact.
- Probe 40 now assembles the independently accepted positive clauses on Probe
  31: Probe 33's passing-coverage counts and one-remedy granularity, Probe 37's
  positive per-probe anchors, Probe 38's firsthand quota, and Probe 39's output
  ledger. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/40-cumulative-positive-contract/SKILL.md`,
  351 lines and 35,917 bytes, maximum line length 726, SHA-256
  `60bb2ac4d273a406d39fabb923cc4cf38c6561cc4a4a5d55758260c22d9d1687`.
  It passed the local skill validator and focused Gemini contract suite 8/8.
  The complete host-boundary deterministic gate passed typecheck, 58 test files
  with one declared skip, 971 tests with five declared skips, and build. Probe
  40 retains the v13 marker so a pass can isolate the v15 marker next; the
  canonical v15 skill remains unmoved and unchanged.
- The owner reports Probe 40 passed, with no additional scanner discrepancy or
  content rewrite reported. Probe 41 changes only Probe 40's two equal-length
  contract-marker occurrences from `staged-remedy-scan-v13` to
  `staged-remedy-scan-v15`. Its announced ignored alternate is
  `.artifacts/gemini-upload-bisect/41-v15-contract-marker/SKILL.md`, 351 lines
  and 35,917 bytes, maximum line length 726, SHA-256
  `da64098a21da7bdcb12558958c5ad7699faa85ff4bb1c8613ec629761783202c`.
  It passed the local skill validator, and its direct diff against Probe 40
  contains only the two marker substitutions. The canonical v15 skill remains
  unmoved and unchanged.
- The owner corrected the workflow goal: repeated manual owner uploads are
  suspended. This Codex session has no authenticated Gemini/Spark connector or
  browser-control capability, and its available plugin-management surface has
  no searchable Gemini integration, so it cannot perform the Spark conversation
  upload directly. The fallback is one self-contained conversation packet at
  `.artifacts/gemini-upload-diagnostic/ASK-SPARK-ABOUT-V15.md`, 395 lines and
  38,165 bytes, SHA-256
  `0133bed433406811f06c1ceecf6c29ba23700fc02ce2a39f17f0cfabcfecc713`.
  Its mechanically extracted skill bytes are identical to Probe 41 and retain
  SHA-256
  `da64098a21da7bdcb12558958c5ad7699faa85ff4bb1c8613ec629761783202c`.
  The packet asks Spark to recheck an initial rejection, install unchanged when
  safe and supported, or return an exact trigger, minimal diff, and full
  corrected skill without silently rewriting or executing it.
- On 2026-08-21, the owner reported a clean Spark pass for the one-shot packet's
  complete embedded v15 skill, with no scanner failure or rewrite reported.
  This establishes conversation-path upload compatibility for exact SHA-256
  `da64098a21da7bdcb12558958c5ad7699faa85ff4bb1c8613ec629761783202c`;
  installed-byte readback and behavioral execution remain separate evidence
  boundaries. The exact accepted bytes are now canonical at
  `integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md`.
  The focused contract pins that hash and the accepted positive formulations,
  and the setup guide prefers conversation diagnosis/recheck with reviewable
  diffs rather than iterative owner-operated upload probes.
- The canonical promotion was test-first: the aligned focused contract failed
  against the old scanner-incompatible canonical wording, then passed 8/8
  after exact-byte promotion. The skill validator passed and the complete
  host-boundary deterministic gate passed typecheck, 58 test files with one
  declared skip, 971 tests with five declared skips, and build. No protocol,
  runtime, production, privacy, or public-GPT behavior changed.
- The owner's first clean-uploaded v15 forward run used the correct marker and
  returned 10 real candidate identifiers, but failed behavioral acceptance.
  Unsupported direct joins included Cissus for collagen/boron and an unrelated
  personal outcome for avoided surgery; a supplement-led personal account was
  classified as mechanical, manufacturing nominal seed-family diversity; and
  the packet discarded API-visible comment counts. Independent AskRigor calls
  returned `api_visible_complete` for all 10 identifiers and comment counts 54,
  4,156, and 100 for the three selected seeds. A separate exact-query search
  returned the held-out `XpZHKGGCK-o`; this establishes a cross-provider recall
  discrepancy, not Gemini's internal search receipt. Rendered-copy link targets
  remain unverified rather than failed.
- Contract v16 repairs only those demonstrated boundaries: probe access status
  copies the linked batch; every direct join requires exact candidate-field
  evidence; dominant family follows the remedy claimed to enable resumed
  activity; seed statistics stay on one `get_youtube_video` receipt; and
  applicable promotion flags plus the exact active heading are explicit. The
  locally validated candidate is 35,987 bytes with a 666-character maximum line
  and SHA-256
  `8ca33e86269841adfd237e8e4c92bbdef56cc157f274eadc744538fbf85a3a0b`.
  The skill validator and focused contract passed 8/8; the complete gate passed
  typecheck, 58 test files with one declared skip, 971 tests with five declared
  skips, and build. At that checkpoint upload, installed-byte readback, and
  forward behavior remained pending; the next v16-marked run supplied the
  behavioral result below without exact byte readback.
- The owner's v16 forward run found the held-out `XpZHKGGCK-o` account and all
  10 reported IDs independently validated as real `api_visible_complete`
  videos, but the evidence ledger still failed. It counted 6 families while
  listing 7 and executing only 5 eligible families, marked missing batch
  anchors covered, left direct matched-row lists blank, cited exact phrases not
  present in their candidate fields, missed obvious promotion, misclassified
  creator/family evidence, omitted question source rows, and used unsupported
  rabbit-hole mappings and access gaps. At 2026-08-21T02:46Z, literal seed
  receipts contained comment counts 5,375, 166, and 31; Spark again reported all
  three as unavailable.
- This is the stopping-point failure for the large natural-language contract.
  Do not create or request another incremental upload probe. Treat current
  Spark output only as an untrusted high-recall set of candidate IDs and
  provisional vocabulary; AskRigor must independently validate identity,
  metadata, selection, and comment work. A compact candidate-only handoff with
  AskRigor-side validation is the recommended separate redesign, not an
  accepted current skill. The focused contract remained green 8/8 and the
  complete deterministic gate passed typecheck, 58 test files with one declared
  skip, 971 tests with five declared skips, and build.
- The separate candidate-only redesign is now implemented locally. The exact
  `youtube-candidate-handoff-v1` skill is 6,577 bytes with SHA-256
  `1ecd387b95af48050590f8f5d8a6ea900b7cfb79b18a9dd8562057929560b02b`.
  It emits only one raw strict JSON packet with bounded executed queries, unique
  candidate IDs, provisional creator annotations, suggested seeds, gaps, and
  fixed disclosures. `@askrigor/sources` now parses that packet at a 32 KiB
  ceiling, validates every identity through the existing YouTube adapter, and
  returns exact rejection and mechanical seed-eligibility receipts. The local
  CLI is `npm run validate:gemini-handoff -- <response-file|->`. This adds no
  public MCP/Action tool and does not validate creator claims or semantic
  materiality. Skill validation passed; focused tests passed 16/16; the host-
  boundary complete gate passed typecheck, 59 test files with one declared
  skip, 979 tests with five declared skips, and build. No local YouTube key was
  available for a new CLI live call, but the first owner-supplied candidate-only
  packet has now passed its strict schema and independent AskRigor metadata
  validation. All 7 candidates were public and `api_visible_complete` with
  exact ID, canonical URL, title, and channel matches. Its 3 suggested seeds
  used distinct provider channels and had provider-reported comment counts 343,
  545, and 32, yielding `accepted` mechanical validation. Spark returned raw
  JSON rather than the redundant outer marker/fence, so raw strict JSON is now
  canonical and exact old framing remains backward compatible. No rerun is
  needed. This did not inspect comments or validate provisional semantic labels,
  creator claims, efficacy, safety, causality, or medical conclusions.
- The required lesson checkpoint at `2026-08-21T04:01:24.073Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  acceptance repair.
- The accepted packet's three suggested discussions have now been audited to
  terminal states and recorded in
  `docs/audits/2026-08-21-gemini-candidate-comment-audit.md` plus its adjacent
  `youtube_rediscovery_packet`. `Hz3Gd51hBn0` returned all 343 records and
  `stZdnA9zeQE` all 32, both `api_visible_complete`; `LnlhK4MBaPw` retrieved
  545 unique records and returned the protocol-defined deterministic 500-record
  sample with `completed_with_access_boundary` because moving pagination and
  one repeated reply prevent a stable complete-snapshot claim. All three
  synthesis locks passed. The packet contains six non-identifying comment-signal
  leads covering glute-focused progression, diagnosis/stage discrimination,
  replacement trajectories, corticosteroid flare, sequential conservative
  care, and multicomponent-regimen confounding. Creator content remains withheld
  because no Chrome transcript capability was exposed; this handoff is not
  Forum Signal or HRP completion.
- The required lesson checkpoint at `2026-08-21T04:23:04.458Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded the
  bounded comment audit.
- The required lesson closeout at `2026-08-21T03:26:23.139Z` was available with
  1 open candidate, 1 needs review, 0 accepted not incorporated, 2 incorporated
  or closed, and 0 deletion eligible. No lesson expanded the compact redesign.
- The required lesson checkpoint at `2026-08-21T02:44:42.860Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  stopping decision.
- The required lesson checkpoint at `2026-08-21T02:02:21.406Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  evidence-join repair.
- The required lesson checkpoint at `2026-08-21T00:24:16.944Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  exact-byte promotion.
- The required lesson checkpoint at `2026-08-20T23:46:20.159Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded marker probe.
- The required lesson checkpoint at `2026-08-20T23:17:34.096Z` was available
  with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2
  incorporated or closed, and 0 deletion eligible. No lesson expanded this
  bounded upload probe.
- For an earlier diagnostic revision, local validation passed the skill
  validator at 499 lines, the focused Gemini
  contract suite 6/6, typecheck, and build. The sandboxed complete test run
  passed 899 tests but recorded 70 failures dominated by prohibited localhost
  listeners plus secondary timeouts. Two attempts to rerun `npm run verify`
  through the required host boundary expired in the automatic approval review
  before execution, so the complete deterministic gate remains unverified for
  this diagnostic revision rather than failed on product behavior.
- The required lesson checkpoint at `2026-08-20T08:55:45.993Z` remained
  available with 1 open candidate, 1 needs review, 0 accepted not incorporated,
  2 incorporated or closed, and 0 deletion eligible. The failed current
  candidate was not resubmitted.

- PR #29 merged the hardened consent-shell packet as
  `25849647969a4bf333659feaa30f0b418cc24d57`. Its protected PR checks and exact
  post-merge deterministic, workflow-policy, and both CodeQL analyses passed.
  This was an instruction/documentation artifact change; no server deployment
  was required or performed.
- The 2026-08-17 consent-shell repair was test-first: the generated-packet
  regression failed against the incomplete shell, then the focused Custom GPT,
  release-packet, and conversation-contract suite passed 26/26. The complete
  Node `24.18.0` gate passed 51 files with one credential-gated file skipped,
  917 tests with five declared skips, typecheck, and build. The initial sandbox
  run failed only on prohibited local loopback/IPC listeners; the exact host-
  boundary rerun passed.
- At the 2026-08-17 privacy-model checkpoint, production passed the rollout:
  public health was `ok`;
  Universal remained exact `20.5.13`; live OpenAPI remained SHA-256
  `402e369f25a2b27da114c5f018be1c64cc5f8a2ef81983f2588b30c6875438e2`
  with 17 non-consequential reads and one consequential write; and the VPS
  ran healthy container
  `9976fc89f8bb4065e6c46f7fa6cacb49e1a0eb4e526c11ca2ac346bf788fcf51`
  on image `sha256:8575134332df001ddbbb5b40a041a468cff76b3388b4f6deb267b1c3363998dd`.
  The exact state mount, read-only root filesystem, dropped capabilities,
  no-new-privileges, Caddy identity, and image-only Compose delta passed.
- PR #32 merge `d1af238325ee1e0584574e47bbcbe7764d17cf7e` was the then-current
  deployed release. Production was healthy on the
  exact merged image, with the rollback image/config and active site release
  recorded above. Server-side direct acceptance, including the exact repaired
  two-call YouTube chain, is complete. The first privacy rollout transaction
  restored the prior healthy release after detecting a short-versus-full Caddy
  ID comparison mismatch; the corrected full-ID transaction then passed.
- The privacy repair was test-first. Its focused suite passed 63/63, the broader
  affected suite passed 144/144, and the complete Node `24.18.0` gate passed 51
  test files with one credential-gated file skipped, 919 tests with five
  declared skips, typecheck, and build. Protected PR and exact post-merge
  deterministic, workflow-policy, and CodeQL checks passed.
- Repository-controlled packet repair and bridge implementation are merged and
  verified. V0.1.0 remains
  **PUBLIC SUBMISSION BLOCKED** for
  portal identity/domain verification, Scan Tools, a real demo-recording URL,
  the explicit release decision on three opaque remote-MCP model receipts,
  final portal response/privacy review, and submission.
  The direct production contract is 9/9 green and the ChatGPT interface check is
  complete with the declared card-presentation limitation.
- The earlier 2026-08-16 `Verifying identity` report is superseded by the
  owner's 2026-08-18 report that individual identity is verified. Business/
  organization verification remains unavailable after a signup timeout. The
  packet keeps the publisher path `in_progress` because the publisher identity
  has not been selected and no independent portal receipt is recorded.
- The separate Custom GPT compatibility surface is deployed and owner-reported
  as publicly published.
  The corrected schema imported successfully, and protocol/formal-source UI
  cases, the repaired two-call YouTube handle UI chain, and canonical Universal
  `20.5.13` UI loading passed. The hardened consent shell, Action
  authentication, public-content review, privacy-model repair, and exact
  deployment probe now pass. The fresh-chat lesson and separately consented
  duplicate also pass with `ARL-0007` occurrence count 2. The direct `/g/...`
  page and reversible `gpt.askrigor.com` route also pass.

## Remaining

- After the transcript-provider rate limit resets, one matched
  transcript-plus-Gemini versus direct-video comparison may characterize the
  fallback. The default is transcript-first: direct video used
  82,152-171,688 input tokens per video, cannot see comments, and should be
  limited to a small identified segment when a material claim genuinely
  depends on visuals. Do not integrate Gemini before an owner decision on the
  Google privacy/data-flow boundary. If approved later, use Gemini for query
  planning, real-candidate selection, and bounded text summary; never accept an
  ungrounded generated YouTube identifier.
- In the signed-in Custom GPT editor, import the current 21-operation Action
  schema, install the exact generated Instructions with empty Knowledge, retain
  the existing API Key → Bearer authentication, save without publishing, and
  pass fresh Custom GPT acceptance for transcript availability, treatment-space
  breadth blocking, transcript/comment separation, access gaps, **Videos
  actually audited**, and the no-padding timestamped watchlist. Direct
  acceptance for the prior 19-operation production surface must not be relabeled
  as this UI proof.
- The owner reports individual identity verified and business/organization
  verification currently unavailable after a signup timeout. Choose the
  publisher-identity path, then complete the portal HTTPS domain challenge; do
  not infer the business retry interval.
- Run Scan Tools against `https://mcp.askrigor.com/mcp`, compare all 17 tools
  with the committed inventory, and review the portal's response/privacy output.
- Record and host the bounded demo from
  `docs/public-submission-demo-recording.md`; publish only its verified HTTPS
  URL and non-secret receipt.
- Resolve or expressly accept the three opaque remote-MCP receipts at the
  release-decision boundary; direct proof must not be relabeled as model proof.

## Blockers / unresolved

- The source follow-up and combined reconciliation are merged as PRs #40 and
  #41. The exact runtime, privacy notice, Action endpoint, direct providers, and
  transcript boundary are deployed and directly accepted. Creator-content
  verification remains a public-submission blocker only at the signed-in editor
  and fresh current GPT UI boundary. Static instruction assertions and direct
  server receipts do not prove model obedience. The rejected lesson is
  non-retryable.

- The importer fix is merged, green, deployed, and passed the product importer.
  Protocol and formal-source UI cases passed. The short-handle and terminal
  refetch repairs are deployed and accepted through both direct and fresh
  product-interface tests. Universal `20.5.13` also passed the fresh product
  interface. The hardened consent shell, authentication, public publication,
  privacy-model repair, exact deployment, direct non-stored probe, fresh-chat
  lesson, separately consented duplicate, direct `/g/...` page, and reversible
  `gpt.askrigor.com` route now pass.
- `AskRigor-lessons` is private on GitHub Free, so private `main` branch
  protection is plan-limited and explicitly unverified/unavailable until Pro.
- OpenAI's remote-MCP Responses receipts are opaque for conditional successful
  output and the two tested error boundaries. The runner preserves these as
  `model_output` blocks. Direct proof does not establish model-layer semantics.
- V0.1.0 public submission remains blocked by the publisher-identity/domain
  path, Scan Tools, a real demo recording, final portal review, and the explicit
  opaque-receipt release decision.

## Evidence / artifacts

- Repository profile: `.github/codex-repository.json`
- Compliance plan: `docs/superpowers/plans/2026-08-14-codex-github-compliance.md`
- Compliance report: `docs/audits/2026-08-14-codex-github-compliance.md`
- Release/production receipt: `docs/release-evidence-v0.1.0.md`
- Privacy/reviewer truth: `docs/privacy-data-map.md` and `docs/public-review-checklist.md`
- Portal handoff: `docs/public-submission-packet-v0.1.0.json`
- Demo recording script: `docs/public-submission-demo-recording.md`
- Repair design and plan:
  `docs/superpowers/specs/2026-08-16-public-submission-packet-repair-design.md`
  and
  `docs/superpowers/plans/2026-08-16-public-submission-packet-repair-implementation.md`
- Forum Signal regression repair plan:
  `docs/superpowers/plans/2026-08-18-custom-gpt-forum-signal-regression-repair.md`
- Heterodox discovery/weighting repair plan:
  `docs/superpowers/plans/2026-08-18-heterodox-discovery-weighting-regression-repair.md`
- Universal transcript/evidence-frontier repair plan:
  `docs/superpowers/plans/2026-08-18-youtube-transcript-evidence-frontier-repair.md`
- Gemini YouTube discovery evaluation:
  `docs/audits/2026-08-18-gemini-youtube-discovery-evaluation.md`
- Public-review runner/cases: `docs/public-review-automation.md` and
  `docs/public-review-cases-v0.1.0.json`
- Ignored local sanitized evidence:
  `.artifacts/public-review-eval/20260815T110708.728Z-baa07445/`
- Hosted follow-up: issue #6
- Universal promotion: `u-dont-existDOTcom/universal-dev-architecture/audits/2026-08-14-askrigor-transferable-controls.md`

## Next safe action

Run the fresh product-interface cases in
`docs/custom-gpt-action-live-acceptance.md` and record only observed UI results.
After source merge and explicit deployment authority, deploy and directly
validate the exact 21-operation Action schema; then install the exact current
7,946-character Instructions with SHA-256
`019277ee0b3943c85bf70f521b1a28069f5e7fed9a9c1d9223527b5cd469a532` and empty
Knowledge, retaining the current Action authentication and privacy
configuration. Do not infer UI behavior from installation alone.
Do not repeat completed runtime deployment/direct acceptance, retry the rejected
lesson, publish the GPT, or treat direct checks as UI proof.

## Recovery rule

After interruption, inspect actual Git/GitHub and production state, this
checkpoint, complete protocol files, current release evidence, merged PRs #9
through #49, Universal lesson PRs #30 and #31, AskRigor hardening issue #6,
private synthetic lessons `ARL-0006`,
`ARL-0007`, and `ARL-0009`, and newer owner instructions. Resume from the latest verified
boundary without
touching the dirty original checkout or repeating direct production acceptance
unless production identity has changed. The recorded production-source baseline is
PR #41 merge `386497415a187354c6396e69a902d5bece9a9c96`; production is the healthy
exact image with that tag and image ID
`sha256:84fb1527d37f4003dc0f3670818c3d7f5987a1a1c53861fca236da1f8975db1e`.
Deployment and recovery evidence is merged through PR #43; the instruction-only
partial-answer repair and owner installation receipt are merged through PR
#46. The owner reports Instructions SHA-256
`4fff01a07aa817941c5b8cd4c3b0ea2e79621901288140d6cf1056bf402312e5` are
installed in the signed-in editor. The current generic candidate-quality
Instructions are
`019277ee0b3943c85bf70f521b1a28069f5e7fed9a9c1d9223527b5cd469a532`, not yet
deployed or installed. Its remaining boundaries are runtime/Action deployment,
exact installation, and fresh GPT-UI acceptance.
