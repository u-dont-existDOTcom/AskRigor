# Gemini Spark YouTube scout for AskRigor

This is an owner-operated evaluation of Gemini Spark as a private YouTube scout
for AskRigor. Gemini performs rapid public-video discovery and creator-content
summarization. It does not execute HRP, replace the AskRigor research agent, or
change the public Custom GPT.

## Prerequisites

Google currently requires Gemini Spark access, age 18+, a personal Google
Account, Keep Activity enabled, and presence in the United States for custom
apps. Spark itself requires a Google AI Pro or Ultra subscription and is
available in more regions than custom apps; Spark access therefore does not
prove custom-app access. Account eligibility is an external Google gate and
must not be inferred from Gemini API billing.

These requirements were rechecked against Google's current help pages on
2026-08-19. If **Custom apps for Spark** is absent, first check:

1. the active mode is Spark rather than a normal Gemini chat;
2. the account is personal rather than work or school;
3. the account has Google AI Pro or Ultra;
4. Keep Activity is enabled; and
5. the user is in the United States.

Changing Gemini API billing does not change consumer Gemini or Spark
eligibility.

## One-time connection

1. Open <https://gemini.google.com> and switch to Spark.
2. Open **Settings & help → Connected Apps**. If needed, open **Personal
   Intelligence → Connected Apps** first.
3. Under **Custom apps for Spark**, add:

   `https://mcp.askrigor.com/mcp/gemini`

4. Click **Next** and approve the connection. The endpoint is public and needs
   no credential or Advanced-features secret.
5. Confirm that the AskRigor custom app appears in Connected Apps.

The Gemini-specific endpoint exposes the same ordered 17 expected tools and
read-only handlers as the standard AskRigor MCP endpoint, but emits the smaller
Google-compatible catalog schema. The owner confirmed successful account-side
connection on 2026-08-19. The earlier standard endpoint reached `tools/list`
but Gemini rejected its richer catalog; that failure was not an authentication
or network failure.

## One-time skill installation

1. In Spark, open **Skills → Upload**.
2. Upload
   `integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md`.
3. Review it, create the skill, and leave automatic use enabled if desired.

The diagnostic skill is named `scout-youtube-for-askrigor-staged`. Delete or
disable any older `scout-youtube-for-askrigor` copy before uploading it. It
deliberately contains no Universal or HRP orchestration.

## Normal scout task

Give Gemini the de-identified research question and ask it to find surprising,
firsthand, exact-variant, failure, harm, or implementation videos. To force the
skill, choose `/scout-youtube-for-askrigor-staged`. Its response must begin with
`Scout contract: staged-remedy-scan-v14`, followed by the active mode on the
second line. If the marker is absent, stop: Gemini did not execute the current
skill. Let Gemini complete broad result discovery before it inspects video
content. Detailed content inspection is limited to the shortlisted 8–12 scan
candidates. Select the AskRigor custom app when Gemini needs to validate exact
video identities with `get_youtube_video`.

Without a rediscovery packet, Gemini uses `seed_discovery`. Even a terse prompt
such as `how can I fix my bad hip` automatically expands into overlooked,
self-directed approaches plus positive and negative real-world feedback on
conventional care, while preserving that no diagnosis was supplied. Gemini
generates 14–22 diverse query probes, including separately executed radical-
outcome variants, then groups them into 6–12 single-family discovery batches of
at most three probes. Each probe records literal required anchors and cannot
claim coverage unless both its frozen query and the batch query contain them;
each batch maps linked probe IDs back to those literal anchors. Gemini counts
only executed, anchor-covered remedy, firsthand, and conventional directions,
keeps one remedy in every `single_intervention` probe, separates direct radical
claims from adjacent tutorials, and recomputes the displayed scan count. It
then runs a required
`remedy_extraction_scan` on 8–12 plausible videos. It extracts only intervention
names, creator-claimed mechanisms and outcomes, creator relationship, novel
search vocabulary, and discussion-hub value. Gemini then searches each
promising intervention individually before returning an **AskRigor comment-
audit seed packet** with two or three distinct seed videos and an unpopulated
return contract. Copy that packet into AskRigor. Gemini has not audited the
comments and must not pre-populate the later `youtube_rediscovery_packet`.
Question evidence maps are built before the questions, which may then use only
mapped phrases plus neutral benefit, timing, tolerability, flare, worsening,
adherence, and discontinuation vocabulary. A conventional feedback seed must
state both benefit and limitation.
Content inspection begins only for those shortlisted scan candidates, reducing
unnecessary video processing during broad discovery.
It also returns an evidence-neutral rabbit-hole map showing observed retrieval
depth and shortcuts such as `dig into nutrition signal` or `dig into side-effect
signal`; these estimate further scouting potential, not treatment evidence.
The report uses text-only Markdown links and forbids embedded players, video
cards, carousels, rich previews, thumbnails, bare URLs, and duplicated raw
search-result panels. Gemini may still show provider-owned YouTube search/tool
activity outside the response; the skill cannot suppress that interface trace.

When AskRigor's protocol-governed comment analysis produces a
`youtube_rediscovery_packet`, paste that packet into Gemini and invoke the skill
again. Gemini then uses `targeted_rediscovery`, searches the specific community-
derived interventions and vocabulary, and returns a selective **AskRigor
handoff** plus **Videos worth watching**. Only these narrow final candidates
receive detailed summaries and timestamp extraction.

The app connection and skill upload are one-time setup. With the current
read-only MCP architecture, there is a manual transfer at each stage: Gemini
seed packet to AskRigor, optional AskRigor rediscovery packet back to Gemini,
and the final Gemini dossier back to AskRigor. The Gemini-to-AskRigor connection
runs in the opposite direction and cannot place Gemini's generated output into
a ChatGPT or Codex conversation automatically. AskRigor may instead perform its
own wider YouTube searches after comment analysis when avoiding the optional
Gemini round trip is more useful. Fully automating bidirectional transfer would
require a separately reviewed authenticated mailbox or server-side research
supervisor.

Run Spark as a parallel high-recall lane, not a blocking phase. Start AskRigor
on the same de-identified question at the same time so it can load its protocol,
map the evidence frontier, and research formal, grey, clinical, and accessible
non-YouTube communities. When Spark finishes, transfer its packet into that
active evidence map, deduplicate candidates, and continue AskRigor's transcript,
comment, and bidirectional searches. The user remains the cross-app scheduler
until a separately reviewed supervisor exists.

## Acceptance test

Use a de-identified synthetic video-discovery prompt. In `seed_discovery`,
confirm in the task trace and response that Gemini:

1. generates 14–22 materially different
   `model_generated_query_probe` hypotheses without presenting them as found
   remedies;
2. searches the exact condition, umbrella condition, anatomy or symptom, and
   intervention-first rings, then back-searches promising broad leads against
   the exact target;
3. uses fuzzy title recall and does not quote the entire query;
4. runs `remedy_extraction_scan` on 8–12 plausible videos before selecting
   comment seeds, without producing full dossiers or watching whole videos;
5. validates two or three distinct seed videos through `get_youtube_video` and
   preserves literal status plus provider-reported view, like, and comment
   counts as reach metadata rather than evidence;
6. returns an **AskRigor comment-audit seed packet** rather than invented
   comment findings or a premature final watch verdict; and
7. expands terse prompts across overlooked/self-directed and conventional
   benefit, failure, side-effect, adherence, and discontinuation lanes; and
8. returns a retrieval-depth rabbit-hole map with family-specific `dig into`
   choices while keeping retrieval potential separate from evidence strength;
   and
9. returns text-only Markdown video links without embeds, cards, carousels,
   previews, bare URLs, or a duplicated raw-results appendix; and
10. records prospective queries before results, displays two to four radical
    outcome probes, and never backfills result titles as query text;
11. preserves unspecified diagnoses by treating named pathologies as adjacent;
12. uses nonpredictive `audit_selection_rationale` text marked `comments
    uninspected`, requires balanced conventional benefit/failure seeds, and
    traces every rabbit-hole count to displayed candidate row IDs with a
    semantically matched shortcut; and
13. batches broad discovery into 6–12 text searches, opens no more than 12
    shortlisted videos, uses numbered candidate records rather than tables,
    selects unique intervention families, maps every rabbit-hole term to source
    rows, separates retrieval gaps from AskRigor research questions, and uses
    neutral noncausal comment-audit questions. Also confirm successful probes
    cite genuinely matching rows, every candidate title is linked, exercise is
    not relabeled behavioral to manufacture diversity, heterodox seeds are not
    exercise-only, audit questions cite rows and request no proportions, and
    rabbit-hole terms are copied from their cited candidate fields. Confirm the
    probe ledger exposes at least six distinct overlooked-family labels, audit
    questions cite selected seed rows only, provider reach counts remain
    metadata-only, and each coherent rabbit hole says whether it is executable
    from a current seed or requires future seed promotion. Also confirm batch
    queries contain every linked probe anchor and expose per-probe anchor
    evidence, candidate fields use exactly `intervention_family`, question
    evidence maps precede questions, unmapped plausible details are absent,
    rabbit questions avoid prevalence wording, and title links contain actual
    canonical Markdown destinations. Confirm three separately covered
    firsthand probes and family-specific shortcuts; and
14. makes no protocol-manifest, protocol-load, formal-source, community-survey,
   community-audit, `HRP-complete`, efficacy, safety, causality, treatment, or
   individualized recommendation claim.

Then supply a synthetic `youtube_rediscovery_packet`. In
`targeted_rediscovery`, confirm that Gemini preserves lead provenance, searches
literal, fuzzy, exact-condition, firsthand, failure, and harm variants, and
summarizes only the selected narrow videos with concrete details, clickable
timestamps, verification priorities, and **Videos worth watching** links.

For an outcome-focused final dossier, also confirm that Gemini runs at least
four patient-specific searches with negative practitioner/institution terms
when needed. The target is `min(3, ceil(dossier size / 2))` qualifying
`independent_patient_self_learning` records. These must center on the apparent
independent patient's own experiments, routines, mistakes, adaptations, and
takeaways. An `independent_provider_treatment_review` or
`clinic_patient_testimonial` may be useful supplemental material, but neither
counts toward the patient quota. If independence is unclear, it also does not
count. If the successful searches locate fewer qualifying accounts, the report
must state a patient-account coverage shortfall instead of padding the quota
with clinicians, treatment reviews, seller-hosted testimonials, sponsored
accounts, or practitioner-retold cases.

Also reject the report when it substitutes `available` for AskRigor's literal
metadata status, emits a bare bracketed or empty timecode instead of a clickable
deep link, describes an uninspected visual as support, or treats adjacent
short-term relief or a promotional case as an exact long-term outcome match.

Every located time must use standard Markdown and total seconds, for example:

`[10:18](https://www.youtube.com/watch?v=VIDEO_ID&t=618s)`

Use `not located` only when Gemini genuinely cannot locate the passage.

Do not treat the connection test as end-to-end HRP acceptance. Record a failed
item as failed or incomplete rather than inferring it passed from fluent prose.

The first real owner-run scout on 2026-08-19 showed useful discovery and detailed
regimen extraction but failed this acceptance: it emitted the non-contract
status `available`, left all promised timestamps blank, mixed creator summaries
with uninspected visual support, and did not separate exact outcome matches from
adjacent or promotional cases. The skill was tightened from that real output;
the replacement rerun corrected literal statuses, attribution, search ledger,
and incentive/match labels. It still emitted empty timecode placeholders and
selected six adjacent tutorials with zero exact outcome matches even though the
earlier run had located firsthand cases. The current skill therefore removes
bare timecodes, requires clickable timestamp deep links paired with descriptive
segment cues, and requires an exact-outcome discovery lane before adjacent
tutorials. The owner confirmed that Gemini supplied the missing timestamps when
asked directly; this showed a formatting-contract gap rather than an inability
to locate timecodes. Clean acceptance remains pending another replacement-skill
rerun.

The next displayed output passed the clickable-timestamp and literal-status
contracts. It still repeated the same six `adjacent_implementation` videos,
performed only one broad avoidance query, and retained no non-clinician
firsthand patient account. The prior skill had a soft exact-outcome preference
but no hard creator quota. The current revision adds patient-specific queries
with negative clinic/practitioner terms, a conditional half-dossier/three-video
patient target, explicit creator-evidence classes, and a fail-closed coverage
shortfall rather than padding.

The owner then clarified that uploader identity alone was still too broad: a
patient's personal-channel review of a clinic is firsthand, but it is not the
self-directed learning signal sought here. The current revision therefore
reserves the quota for `independent_patient_self_learning`, separates
`independent_provider_treatment_review` and `clinic_patient_testimonial`, and
requires the summary to recover the person's hypotheses, trial-and-error,
routine changes, failures, and takeaways. Unclear independence fails closed and
does not count.

The next design review found that even a better final-dossier selector was
prematurely spending effort on broad panoply videos. The current staged revision
uses broad videos as discovery and comment-pool seeds: Gemini generates diverse
search probes and triages titles first, AskRigor mines selected comment corpora
for specific intervention vocabulary, and Gemini can perform an optional narrow
rediscovery pass from the resulting packet. Broader disease and symptom searches
may generate leads, but each promising lead must be back-searched against the
exact anatomy or condition so local mechanical approaches are not erased.

The owner then identified that metadata-first seed selection could still miss
interventions hidden inside generically titled videos. The current revision
makes a lightweight `remedy_extraction_scan` mandatory before comment mining.
It searches each promising scan-derived intervention individually, while still
deferring detailed regimens, exhaustive timestamps, visual review, and full
summaries until targeted rediscovery.

## Evidence boundary

Gemini's title, metadata, and lightweight content triage and targeted creator
summaries are trusted for fast scouting and hypothesis discovery, but they
remain creator-content reporting rather than formal efficacy or safety
evidence. AskRigor validates exact video identity; later protocol-governed work
decides which claims warrant transcript, visual, comment-corpus, or formal-
evidence verification.

The public MCP intentionally remains frozen at 17 read-only tools and does not
include the Action-only transcript operation. This scout therefore labels its
source as `creator_summary` or `visual_observation` and asks for deeper checking
only when a claim is both material and unusually decision-useful.

## Removal

Remove the AskRigor custom app from Gemini Connected Apps and disable or delete
`scout-youtube-for-askrigor-staged`. Removing the app unlinks the MCP server
from the Google Account; no AskRigor server credential needs rotation.
