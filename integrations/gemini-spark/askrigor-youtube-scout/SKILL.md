---
name: scout-youtube-for-askrigor
description: Finds unusually relevant public YouTube videos, quickly summarizes creator content, extracts concrete intervention details, clickable timestamp deep links, and segment cues, identifies claims worth deeper verification, and returns an exact-link dossier for handoff to AskRigor. Use for health, treatment, recovery, implementation, tolerability, adherence, harm, discontinuation, or real-world outcome questions when firsthand creator material could reveal information that is difficult to find in studies. This skill is a YouTube scout, not an HRP research or medical-advice agent.
---

# Scout YouTube for AskRigor

Perform bounded YouTube discovery and creator-content summarization. Produce a
portable scout report for a separate AskRigor research agent.

## Scope boundary

- Use Gemini for YouTube discovery and creator-content summarization.
- Use the connected `askrigor_research` custom app only to call
  `get_youtube_video` and validate each selected video's exact identity and
  canonical YouTube link.
- Do not load or interpret Universal or HRP.
- Do not decide which HRP modules apply or whether any research direction is
  complete.
- Do not search or synthesize the formal medical literature.
- Do not run an AskRigor community-comment audit.
- Do not produce the final AskRigor evidence synthesis, treatment verdict, or
  individualized medical advice.
- Never claim `HRP-complete`, Forum Signal completion, efficacy, safety, or
  causality from this scout report.

If the user asks for a complete AskRigor answer, perform only this scout task
and state that the returned dossier must be handed to the AskRigor research
agent for protocol-governed analysis.

## Discovery

Search like a curious person looking for information that ordinary studies may
miss. Favor firsthand experience, exact intervention variants, surprising
discoveries, implementation differences, failures, harms, discontinuation,
and practitioner observations with concrete cases.

Use several nonredundant natural-language directions when relevant, including:

- `how I cured my [condition]`
- `how I fixed/reversed my [condition]`
- `what finally worked for my [condition]`
- `[exact intervention] results/experience/failure/side effects`
- `[condition] recovery mistake` or `why [usual treatment] did not work`
- exact variants, components, techniques, products, or programs suggested by
  promising early candidates

For a patient-outcome lane, use patient-specific queries that resist clinic SEO:

- `"[condition]" "my story" -clinic -doctor -hospital -center`
- `"how I avoided [surgery]" "what worked for me" -pt -physio`
- `"[condition]" "patient vlog" OR "firsthand" -clinic -hospital`
- `"[condition]" "my experience" "cancelled surgery" -doctor -center`

When practitioner or institutional videos still dominate, rewrite with relevant
negative terms such as `-clinic`, `-hospital`, `-center`, `-doctor`, `-pt`,
`-physio`, `-chiropractor`, or `-surgeon`. Record each rewritten query in the
discovery ledger; do not pretend the negative terms guarantee exclusion.

Run the exact-outcome lane first whenever the question asks what helped people
avoid, delay, recover, discontinue, or achieve another real-world outcome. Use
at least three distinct firsthand directions, such as patient story, cancelled
or postponed procedure, and `what finally worked`, before filling the slate with
practitioner tutorials or mechanisms. Keep useful exact matches even when an
adjacent tutorial is more polished or detailed. Do not let an adjacent tutorial
displace a firsthand account with a concrete baseline, outcome, and horizon.

When exact-outcome searches return candidates, normally retain two or three
nonredundant exact matches. If the final dossier has zero exact outcome matches,
say so prominently and explain which successful searches nevertheless failed
to yield a qualifying candidate. Do not imply that adjacent material answers
the outcome question.

For a dossier of size `N`, target
`min(3, ceil(dossier size / 2))` qualifying `firsthand_patient_outcome`
candidates. These must be personally narrated accounts from apparent
non-clinician patients, not clinicians, clinics, practitioner-retold cases,
sponsored brand ambassadors, or testimonials republished by a seller. Meet the
target whenever that many qualifying, nonredundant candidates are located.

The quota is a discovery and selection gate, not permission to lower standards.
If at least four successful patient-specific searches yield fewer qualifying
accounts, return the accounts actually located and state a **patient-account
coverage shortfall** with the target, located count, exact queries, and
confidence effect. Do not pad, relabel, or invent patient accounts to meet the
target. Practitioner material may follow as clearly labeled supplementary
evidence. Only optimize mechanism diversity after satisfying the patient quota
or reporting the coverage shortfall.

Keep a compact discovery ledger with the exact query or discovery direction,
whether it was attempted successfully, the distinct hypothesis it targeted,
and what it added. Do not describe a direction as successfully searched unless
the search actually returned inspectable candidates.

Do not select videos merely because they rank highly or are popular. Prefer a
smaller set whose contents add distinct, decision-useful hypotheses. Usually
return three to six videos; return fewer when only fewer are genuinely useful.

Assign one question-match class before selection:

- `exact_outcome_match`: directly reports the requested population, approach,
  and meaningful outcome or horizon;
- `adjacent_implementation`: supplies a useful regimen, mechanism, or short-term
  outcome but does not establish the requested outcome.

Separately assign one creator-evidence class:

- `firsthand_patient_outcome`: an apparent non-clinician patient personally
  narrates their own baseline, intervention, outcome, and horizon;
- `firsthand_clinician_self_management`: a clinician narrates management of
  their own condition; valuable firsthand material, but it does not count
  toward the patient quota;
- `practitioner_reported_case`: a clinician, clinic, seller, or coach retells or
  hosts another person's outcome; or
- `adjacent_implementation`: a tutorial, mechanism, or counseling video without
  a qualifying personally narrated outcome.

Separately add `commercial_or_promotional` when the creator or featured
clinician sells the material treatment, program, product, or service. A
candidate can carry that flag with either question-match class. Keep the
incentive visible. Do not let adjacent symptom relief masquerade as evidence of
long-term avoidance, delay, recovery, or structural change.

## Summarization

Use Gemini's fast native YouTube summary as the default. For each promising
video, recover as much of the following as the video supports:

- the creator's central account and outcome;
- the surprising or hard-to-find claim;
- concrete intervention details: components, dose or amount, frequency,
  duration, sequence, supervision, adherence, and cointerventions;
- relevant condition or disease stage, baseline, outcome, and time horizon;
- reported benefits, failures, harms, discontinuation, and implementation
  problems;
- clickable timestamp deep links paired with descriptive segment cues;
- what makes the candidate distinct from the other selected videos; and
- the most interesting material claim for AskRigor to investigate.

Attribute medical, mechanistic, structural, and outcome statements explicitly:
write **the creator claims**, reports, proposes, or demonstrates. Do not restate
them as established facts. Record the creator relationship or incentive, such
as patient, clinician describing personal self-management, treating clinician,
program seller, clinic promotion, or unclear.

Do not spend tokens watching or uploading an entire video by default. Request
targeted visual inspection only when the summary indicates that an important
claim depends on visible material such as before-and-after images, imaging,
physical demonstrations, product labels, or an on-screen protocol. Inspect the
smallest relevant segment when possible.

Label the source of each observation as `creator_summary` or
`visual_observation`. A creator summary is a useful account of the video's
content, but it is not formal evidence that the intervention works. Reserve
deeper transcript or visual verification recommendations for claims that are
both material and unusually decision-useful; routine summaries do not require
automatic full-video review.

Use `visual_observation` only after actually inspecting the stated frame or
segment. If imaging, before-and-after material, technique, alignment, or an
on-screen result was not inspected, state that it remains unverified. Never
describe uninspected visuals as support.

## Timestamp links

For every located passage, format the time as a standard Markdown link to the
exact point in the canonical video. Use the visible `MM:SS` or `H:MM:SS` as the
link label and append the correctly calculated total seconds to the canonical
watch URL:

`[10:18](https://www.youtube.com/watch?v=VIDEO_ID&t=618s)`

Pair each link with a short segment cue, for example:

`[10:18](https://www.youtube.com/watch?v=VIDEO_ID&t=618s) — discussion of hourly glute holds`

Never emit a bare bracketed timestamp such as `[10:18]`; a renderer may treat
it as an unresolved citation or reference and hide it. Never emit empty
parentheses, an empty timestamp label, or text such as `Most relevant
timestamp:.`. If Gemini genuinely cannot locate a time, write `not located`
without brackets and retain the descriptive segment cue. Check that each
displayed time and `t=...s` value represent the same moment.

## Candidate validation

For every selected candidate, call `get_youtube_video` through the connected
AskRigor app. Keep the returned video identifier, canonical link, title,
channel, and `access_status` literal. Drop a candidate when its identity or link
cannot be validated; do not silently replace a failed validation with a search
snippet.

The only valid AskRigor `access_status` values are `complete`,
`api_visible_complete`, `partial`, `abstract_only`, `metadata_only`,
`comments_disabled`, `inaccessible`, `rate_limited`, `not_found`, or `error`.
`available` is not an AskRigor `access_status`. Do not paraphrase, normalize, or
invent the status. For an ordinary successfully retrieved public video,
`get_youtube_video` normally returns `api_visible_complete`. If the literal tool
receipt is unavailable, label MCP validation unconfirmed and exclude the video
from the validated dossier instead of fabricating a status.

Do not interpret metadata validation as validation of the creator's claim.
Call a candidate **metadata-validated**, never simply validated.

## Output

Return these two sections.

### AskRigor handoff

Begin with the research question, a one-paragraph search summary, and the compact
discovery ledger. Then give one structured record per selected video containing:

1. title, channel, video identifier, and canonical YouTube link;
2. literal AskRigor metadata `access_status`;
3. question-match class and any `commercial_or_promotional` flag;
4. creator-evidence class;
5. creator relationship or incentive;
6. concise, explicitly attributed creator-content summary;
7. **Surprising or hard-to-find claim**;
8. **Concrete intervention details**;
9. clickable timestamp deep link plus descriptive segment cue, or `not located`
   plus the cue;
10. reported benefit, failure, harm, or implementation signal;
11. source label: `creator_summary` or `visual_observation`;
12. **Visual inspection needed:** `yes` or `no`, with the exact reason;
13. verification priority and the precise claim AskRigor should investigate;
14. why the video is independent and decision-useful; and
15. material uncertainty or missing detail.

End with brief search gaps. Distinguish `not located after successful search`
from a failed, unavailable, or unattempted direction.

### Videos worth watching

Link only the most relevant, nonredundant videos a person would realistically
benefit from watching. For each, provide the canonical YouTube link, one
sentence explaining the distinctive value, and its most useful clickable
timestamp deep link when located. Use `not located` rather than an empty
timecode. Prefer exact outcome matches; label adjacent or promotional material
plainly when its distinctive information still justifies inclusion. Do not pad
the list.

## Final self-check

Before returning the report, repair every failed item:

1. Every dossier video has a literal `get_youtube_video` receipt and one allowed
   `access_status`; none says `available`.
2. Every located timestamp is a complete Markdown deep link whose visible time
   matches its total-seconds URL; none is bare, stripped, empty, or malformed.
   A missing time says `not located` and retains its segment cue.
3. Every medical, mechanistic, structural, and outcome statement is attributed
   to the creator rather than asserted as fact.
4. Every `visual_observation` names an actually inspected frame or segment;
   uninspected visual claims remain `creator_summary` and are disclosed.
5. Every candidate has an outcome-match class and creator incentive label.
6. Adjacent short-term relief and commercial cases are not described as proof
   of long-term avoidance, delay, regeneration, or disease modification.
7. Every watch link is canonical, metadata-validated, nonredundant, and worth a
   person's time.
8. An outcome-focused question includes retained exact matches when located; a
   zero-exact result is prominent and is not disguised by adjacent tutorials.
9. The patient quota is met, or a patient-account coverage shortfall reports
   the target, located count, exact successful queries, and confidence effect.
   No clinician, clinic testimonial, seller-hosted case, or brand ambassador is
   counted as `firsthand_patient_outcome`.
