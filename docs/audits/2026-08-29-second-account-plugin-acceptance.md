# Second-account regular-Chat AskRigor acceptance

Date: 2026-08-29

Surface: the owner's Brave profile `2nd gpt`, ordinary ChatGPT Pro, Chat mode,
with the installed **AskRigor Research** plugin
`plugin_asdk_app_6a92d3ff450481919a162f8a8885f03c`. These are product-interface
observations, not hidden-call or backend-latency inferences.

## Outcome

The second account can discover, attach, and invoke AskRigor. Read-only
protocol and PubMed access passed. The tests also exposed two product-layer
failures:

1. ordinary prompts twice rendered Universal as `1.7` even though the live
   manifest, canonical bytes, date, and SHA-256 identify Universal `20.5.15`;
   and
2. substantive synthesis and the single full-text validator exceeded bounded
   latency windows despite visible completion of their preceding retrieval
   steps.

A stricter instruction to copy the manifest version field verbatim rendered
Universal `20.5.15` correctly. That is a prompt-level mitigation, not proof
that the default presentation defect is repaired.

## Case 1: public-user connectivity and bounded PubMed fetch

Conversation:
`https://chatgpt.com/c/6a9346d8-a094-83ea-9ad7-6ac683f7a4dd`

Terminal time: 2 minutes 57 seconds.

Observed passes:

- the second account found and attached AskRigor Research;
- `get_protocol_manifest`, `verify_protocol_integrity`, `load_protocol`, and
  `fetch_pubmed_record` were visibly reported as used;
- HRP was rendered as `20.5.23`, revised `2026-08-24`, SHA-256
  `bf2adc1c4daea8241c47b2a111d4a19e6bf7427a6401ecf1b3ba75a58e046299`;
- PMID `40223676`, DOI `10.2340/17453674.2025.43332`, and the expected title
  were returned with `api_visible_complete` metadata/abstract access and no
  full-text claim; and
- no research session was started or resumed.

Observed failure: Universal was rendered as version `1.7` while its revision
date and SHA-256 were correctly rendered as `2026-08-24` and
`69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172`.
Repository canonical bytes and a separate live plugin manifest call both return
version `20.5.15` with that exact date and hash. The defect is therefore in the
ChatGPT composition/presentation layer, not the live manifest or canonical
file.

## Case 2: aspirin primary-prevention falsification benchmark

Conversation:
`https://chatgpt.com/c/6a934852-1e3c-83ea-91c4-0e6f97b47856`

Bound: stopped after 15 minutes 3 seconds without a final answer.

The run visibly completed the protocol gate, identified ASPREE, ARRIVE, and
ASCEND, performed retraction/integrity work, acquired formal evidence, compared
trial populations, performed method checks, and reached a net-benefit stage.
Its last rendered substantive observation said ASCEND's small vascular benefit
was nearly offset by major bleeding and disclosed that exact result data came
from PubMed because the result articles' full texts were inaccessible.

The run independently reproduced the incorrect Universal `1.7` label while
rendering HRP `20.5.23`. It never produced the requested evidence table,
trial-specific absolute effects, calibrated verdict, source list, or operation
list. No substantive research-quality pass is claimed from partial activity
summaries. The response was stopped at the declared bound so it would not
interfere with the next timed case.

## Case 3: exact one-study full-text chain

Conversation:
`https://chatgpt.com/c/6a934be2-7924-83ea-a815-a3774968d2bb`

Bound: stopped after 8 minutes 0 seconds from successful submission; the UI
confirmed the stopped state shortly afterward.

Observed passes:

- an explicit verbatim-field instruction rendered Universal `20.5.15` and HRP
  `20.5.23` correctly;
- the one permitted acquisition returned the known Europe PMC JATS body with
  all 37 blocks already exhausted; and
- the run correctly reported zero continuation calls and began the bound
  validation phase.

Observed boundary: no validator completion checkpoint, validator receipt,
audit state/hash, bound handle/hash match, source hash, or 13-domain final audit
was rendered before the eight-minute cutoff. The visible state was unchanged
from the exhausted acquisition for more than four minutes. These unrendered
fields remain unavailable for this product run and are not inferred from prior
direct acceptance of the same DOI.

## Direct production latency isolation

A separate read-only MCP client acquired the same DOI/PMCID and submitted a
fixed timing-only source-bound audit payload. The payload intentionally left
all semantic domains unresolved and cannot support any substantive judgment;
its only purpose was to measure transport, acquisition, schema validation, and
receipt binding without model composition time.

Observed wall-clock timings:

- MCP connection: 1,150 ms;
- identity-verified Europe PMC JATS acquisition: 707 ms; and
- `validate_study_method_audit`: 94 ms.

The acquisition returned all 37 blocks, already exhausted. The validator
returned `source_linked_study_audit_validated`, receipt
`askrigor_study_method_audit`, state `complete_with_unresolved_fields`, and
confirmed full-text exhaustion, audit validation, exact handle equality, exact
source-hash equality, and a present 64-character audit hash.

The probe printed no source text or handle, retained no provider payload, and
its temporary script was deleted after the summarized receipt was captured.
This isolates the product delay to ChatGPT's construction/composition phase,
not the live acquisition or validator execution path.

## Interpretation and next test target

The plugin transport and deterministic retrieval layer are usable from the
second account. The dominant current product risks are model-layer protocol
identity transcription and long model construction/tool-to-synthesis latency.
The server timing is now isolated. The next implementation benchmark should
test whether a compact server-produced audit draft, schema-guided incremental
construction, or progress heartbeat can preserve all 13 domains without
weakening the source-bound validator contract.

Do not normalize either failure by retrying these conversations or by copying
known direct-backend receipts into their product artifacts.
