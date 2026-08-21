# Gemini candidate comment-audit receipt

## Scope and status

The accepted `gemini_youtube_candidate_handoff` for `how can i fix my bad hip`
was carried into a bounded AskRigor comment audit. The output is the adjacent
[`youtube_rediscovery_packet`](2026-08-21-youtube-rediscovery-packet.json).
This pass produces discovery leads only. It is not a medical answer, evidence
verdict, or completed Forum Signal module.

The research target remains `diagnosis_not_specified`. No pathology, structural
state, or surgical indication was inferred from “bad hip.”

## Protocol and module ledger

- Repository HRP `20.5.18`, revision 2026-08-16, SHA-256
  `4d27c5cd50b9cb097e247101128a89759b2da9c5ca1d758cfec812724b210ae5`:
  loaded and independently verified.
- Repository Universal `20.5.14`, revision 2026-08-18, SHA-256
  `8f929aa70bc71d8528da3527a22704b0cf85ffec08e9b7b13a186ead71505221`:
  local canonical bytes verified. The deployed AskRigor loader still returned
  Universal `20.5.13` / `3bef54307403df2cbd459377bc308747db47310aefe68cac3b7b2b75c87f92c4`,
  so remote verification against the repository digest correctly failed.
- `HRP`: `REQUIRED` for any eventual substantive treatment answer.
- `DIRECT_HUMAN`: `REQUIRED`; intervention outcomes and tolerability are central.
- `EXTENDED_GREY`: `REQUIRED`; the handoff contains practitioner, supplement,
  rehabilitation, injection, and regenerative hypotheses.
- `FORUM_SIGNAL`: `REQUIRED`; the question concerns a practical treatment choice,
  real-world outcomes, harms, adherence, and possible surgery avoidance.
- `BIDIRECTIONAL_ITERATION`: `REQUIRED`; community leads create formal-search
  hypotheses and later formal findings must return as community discriminators.
- `FINAL_COMPLETION_AUDIT`: `REQUIRED` before any full synthesis.

Only the selected YouTube discussion-audit portion was executed here. All other
required modules remain open, so no full-HRP opening or treatment verdict is
permitted.

## Candidate-selection ledger

| Video | Claim fingerprint under audit | Unique decision value | Independence and nonredundancy | Selection |
|---|---|---|---|---|
| `Hz3Gd51hBn0` | Glute-focused strengthening, gait/loading changes, and repeated self-management intended to reduce hip pain or avoid replacement | Exposes pacing, cointerventions, responder/nonresponder stage differences, and surgery-delay decisions | Rehabilitation clinic discussion pool; distinct from surgery and injection pools | Selected |
| `LnlhK4MBaPw` | Total hip replacement indications, recovery, activity return, and long-term limitations | Adds firsthand surgical benefit, difficult recovery, complication, revision, and activity-modification trajectories | Clinician-with-prosthesis discussion pool; distinct intervention and channel | Selected |
| `stZdnA9zeQE` | Post-corticosteroid pain flare and short-term response | Adds adverse-effect timing and transient-benefit vocabulary | Orthopedic education discussion pool; distinct intervention and channel, but mostly non-hip anatomy | Selected with adjacent-anatomy limitation |

Provider rank and comment volume were used only to assess corpus availability,
not credibility.

## Acquisition receipts

| Video | Provider count | Top-level | Replies | Unique records | Analysis set | Completion | Lock |
|---|---:|---:|---:|---:|---:|---|---|
| `Hz3Gd51hBn0` | 343 | 194 | 149 | 343 | all 343 | `api_visible_complete` | `pass` |
| `LnlhK4MBaPw` | 545 | 277 | 268 | 545 | deterministic 500 | `completed_with_access_boundary` | `pass` |
| `stZdnA9zeQE` | 32 | 17 | 15 | 32 | all 32 | `api_visible_complete` | `pass` |

The mechanical pool required five continuation segments and the replacement
pool required six. The replacement pool reconciled stable-identifier overlap,
but moving provider pagination and one repeated reply prevent a stable
complete-snapshot claim. Its returned set is the protocol-defined
`deterministic_hash_chronological` sample for a corpus larger than 500.

No raw comments, author names, channel identities, or unrestricted provider
payloads were persisted. The packet stores only normalized, non-identifying
lead descriptions and exact acquisition receipts.

## Bounded episode findings

The mechanical discussion contained directly hip-aligned reports of improvement
over one or two weeks, slower gains over several months, persistent mobility
limits despite improvement, and buttock soreness during exercise. Stronger
avoidance accounts often included diet or supplements, so they cannot identify
an active component. Other commenters described failed physical therapy or
exercise in severe dysplasia, advanced bone-on-bone disease, or profound
functional loss, and some described replacement as relieving pain after delay.

The replacement discussion contained many postoperative benefit narratives,
including early assisted walking and later return to ordinary activity or
sport. It also contained material counter-trajectories: early severe pain,
dislocation or subluxation, persistent limp, leg-length difference, nerve
symptoms, metallosis, revision, and continuing activity restrictions. These are
self-selected reports from heterogeneous indications and cannot estimate
success or complication rates.

The injection discussion contained only one explicitly hip-joint episode. That
account described marked initial relief followed within 24 hours by new knee
symptoms. Adjacent-joint episodes described outcomes ranging from about two days
of aching before improvement to severe or prolonged pain, limited movement, and
temporary glucose elevation. The formulation, technique, diagnosis, and causal
relationship were generally unavailable.

Unique person × treatment-episode counts remain bounded unknown in this
rediscovery artifact: questions, secondhand accounts, mixed trajectories,
cointerventions, creator-team replies, and heterogeneous diagnoses were excluded
from narrative claims but were not converted into a definitive manual incidence
table. The packet therefore uses “some,” “several,” and “many” only as corpus
descriptions, never population frequencies.

## Creator-content boundary

The YouTube Conversation catalog pointed to an absent `0.2.9` instruction path;
the installed `0.2.12` instructions were read. That skill requires retrieval
through the user's Chrome transcript panel, but this execution environment
exposed no Chrome control. No third-party transcript fallback was used. Titles,
descriptions, Gemini summaries, and comments were not treated as proof of what
the creators said. Consequently:

- no `named_video_or_creator` lead is emitted;
- no “Videos worth watching” list is produced; and
- creator-content completion remains `completed_with_access_boundary` for a
  later full Forum Signal pass.

## Stopping state

The requested three-pool comment audit is terminal and the rediscovery packet is
ready for targeted scouting. Wider community acquisition, ordinary web forums,
formal literature, grey literature, clinical trials, community-to-formal
searches, formal-to-community discriminators, diagnosis-specific option-space
analysis, and final completion audit remain unexecuted. Therefore
`further_expansion_likely_to_improve_answer: yes` for a substantive answer, and
this pass stops only at the narrower handoff boundary.

## Repository verification

- The packet parsed as JSON with `status: leads_available`, six leads, and nine
  explicit access boundaries.
- `npm run verify` passed typecheck, 59 test files with one credential-gated
  skip, 979 tests with five declared skips, and build.
- The lesson checkpoint at `2026-08-21T04:23:04.458Z` was available: 1 open
  candidate, 1 needs review, 0 accepted not incorporated, 2 incorporated or
  closed, and 0 deletion eligible.
