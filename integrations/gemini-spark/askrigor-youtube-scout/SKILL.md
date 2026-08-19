---
name: scout-youtube-for-askrigor
description: Finds unusually relevant public YouTube videos, quickly summarizes creator content, extracts concrete intervention details and timestamps, identifies claims worth deeper verification, and returns an exact-link dossier for handoff to AskRigor. Use for health, treatment, recovery, implementation, tolerability, adherence, harm, discontinuation, or real-world outcome questions when firsthand creator material could reveal information that is difficult to find in studies. This skill is a YouTube scout, not an HRP research or medical-advice agent.
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

Do not select videos merely because they rank highly or are popular. Prefer a
smaller set whose contents add distinct, decision-useful hypotheses. Usually
return three to six videos; return fewer when only fewer are genuinely useful.

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
- useful timestamps;
- what makes the candidate distinct from the other selected videos; and
- the most interesting material claim for AskRigor to investigate.

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

## Candidate validation

For every selected candidate, call `get_youtube_video` through the connected
AskRigor app. Keep the returned video identifier, canonical link, title,
channel, and `access_status` literal. Drop a candidate when its identity or link
cannot be validated; do not silently replace a failed validation with a search
snippet.

Do not interpret metadata validation as validation of the creator's claim.

## Output

Return these two sections.

### AskRigor handoff

Begin with the research question and a one-paragraph search summary. Then give
one structured record per selected video containing:

1. title, channel, video identifier, and canonical YouTube link;
2. literal AskRigor metadata `access_status`;
3. concise creator-content summary;
4. **Surprising or hard-to-find claim**;
5. **Concrete intervention details**;
6. relevant timestamps, or `not located`;
7. reported benefit, failure, harm, or implementation signal;
8. source label: `creator_summary` or `visual_observation`;
9. **Visual inspection needed:** `yes` or `no`, with the exact reason;
10. verification priority and the precise claim AskRigor should investigate;
11. why the video is independent and decision-useful; and
12. material uncertainty or missing detail.

End with brief search gaps. Distinguish `not located after successful search`
from a failed, unavailable, or unattempted direction.

### Videos worth watching

Link only the most relevant, nonredundant videos a person would realistically
benefit from watching. For each, provide the canonical YouTube link, one
sentence explaining the distinctive value, and the most relevant timestamp
when available. Do not pad the list.
