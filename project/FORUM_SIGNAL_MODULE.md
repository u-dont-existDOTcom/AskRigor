# Forum Signal Module

Run this module only after the Project router marks `FORUM_SIGNAL REQUIRED`. Its job is to acquire and analyze firsthand community evidence, then return a receipt to HRP synthesis. It does not decide the final treatment ranking.

## Inputs

- The user's research question and population, intervention, comparator, outcomes, and time frame when known.
- The current provisional formal-evidence hypothesis.
- Decision-critical discriminators from formal evidence, which may initially be empty.

## Acquisition

1. Map materially relevant independent forums, discussion pools, and YouTube searches. Use ordinary web research for accessible non-YouTube communities. Record the platform, query, date, access result, and whether the material is firsthand.
2. Prepare YouTube video searches labeled `general`, `benefit`, `no_effect`, `harm`, `discontinuation`, or `formal_discriminator`. Use only the labels that fit the question, but cover all four directional outcomes during analysis.
3. Call `audit_youtube_community` with the research question and labeled searches. The compound tool performs bounded video discovery, metadata validation, unfiltered top-level comment retrieval, independent reply pagination, reconciliation, and sampling.
4. Treat the returned receipt literally. A query-bounded comment search is discovery-only and cannot satisfy corpus acquisition. Never infer absent experiences from an inaccessible, partial, or failed layer.
5. When the receipt says `synthesis_lock: block` and its missing work remains executable, repair the query or acquisition and call the compound tool again before proceeding.

## Analysis

Deduplicate reports at the person × treatment episode level. Separate firsthand reports from hearsay, creator claims, and general opinions. Classify relevant episodes as benefit, no effect, harm, or discontinuation and retain important mixed outcomes.

State whether YouTube analysis used every comment from a complete small corpus or a deterministic sample from a completely acquired corpus. A sample can reveal hypotheses and directional examples; it cannot establish platform-wide prevalence. Do not characterize any unseen corpus.

## Bidirectional iteration

For community → formal, turn material community observations into searchable hypotheses and execute the relevant formal searches. If none are material, record `no_material_transferable_hypotheses`.

For formal → community, turn decision-critical formal findings into discriminators and inspect them in the acquired community material or a new labeled audit. If none are material, record `no_material_discriminators`.

Both directions require an explicit terminal value; absence is incomplete.

## Required output

Return this ledger verbatim in structure and replace each value with the supported terminal state:

```text
forum_signal_receipt:
  status: complete | completed_with_access_boundary | incomplete
  youtube_synthesis_lock: pass | block
  benefit: complete | no_material_reports | incomplete
  no_effect: complete | no_material_reports | incomplete
  harm: complete | no_material_reports | incomplete
  discontinuation: complete | no_material_reports | incomplete
  community_to_formal: complete | no_material_transferable_hypotheses | incomplete
  formal_to_community: complete | no_material_discriminators | incomplete
  platforms_and_queries: <explicit list>
  unique_people: <count or bounded unknown>
  unique_treatment_episodes: <count or bounded unknown>
  access_boundaries: <explicit list or none>
  confidence_effect: <explicit text>
```

`status` cannot be `complete` while any required field is incomplete. `completed_with_access_boundary` requires a terminal provider boundary, an explicit description of the missing material, and its confidence effect. This receipt is an input to HRP synthesis, not a treatment verdict.
