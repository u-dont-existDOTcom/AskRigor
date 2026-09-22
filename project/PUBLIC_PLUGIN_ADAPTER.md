# AskRigor public consumer adapter

This adapter selects transport and provenance behavior. The complete Universal and HRP protocols, `PROJECT_INSTRUCTIONS.md`, and `FORUM_SIGNAL_MODULE.md` remain authoritative for research semantics. Do not replace, narrow, or infer their activation predicates from this adapter.

## Bootstrap

For an explicit diagnostic request, call only the named diagnostic operation. Do not enroll the user, start research, run ancillary searches, or claim protocol compliance.

Before ordinary research, inspect access with `manage_research_access`. Render the server-returned notice exactly and never infer agreement, entitlement, checkout availability, or completed research. After access is authorized, call `load_research_runtime` with `profile: "standard-v2"`; follow every continuation handle in order until `complete` is true. A delivery checksum proves byte continuity only, not attention, comprehension, scientific correctness, or compliance.

If `load_research_runtime` is unavailable, use the declared legacy protocol calls and installed exact public references when present. State the capability boundary. Never silently summarize missing policy, call an undeclared operation, or present a fallback as AskRigor-executed research.

## Capability selection

Use `project/public-runtime-bindings.json` for the profile and capability class. Invoke only `PUBLIC_DIRECT` operations directly. `CONTROLLER_INTERNAL` operations remain behind `start_research_session`, `continue_research_session`, `get_research_session_status`, and `finalize_research_report`. `HOST_PROVIDED` capabilities are host facts, not AskRigor operations. `UNAVAILABLE` capabilities must be reported as unavailable rather than simulated.

The legacy profile retains the original public operation catalogue. The standard-v2 profile adds lossless runtime loading. The Gemini profile retains its explicit compatibility projection. A tool absent from a public profile may still be controller-internal; absence never proves that the product lacks the capability.

## Full-text chain

For each decision-important full-text chain, call acquire_open_full_text once with exactly one doi and an optional pmcid; bind coverage_receipt.document_handle and coverage_receipt.source_content_sha256; call continue_open_full_text only while exhausted is false, always with the same bound document_handle. Before synthesis, require the returned coverage_receipt.document_handle and coverage_receipt.source_content_sha256 to match the acquisition byte-for-byte; any mismatch blocks synthesis. If the handle expires or is invalidated, discard that chain and reacquire; never combine chains.

## Output and provenance

Preserve source records, access states, limitations, receipts, and exact error categories. A missing provider is not a zero-result search. A missing transcript limits creator-content claims but does not erase separately retrieved comments. Render final completion and bounded-output labels only from server-returned state. Keep retrieval, delivery, scientific interpretation, consumer acceptance, installation, and release as separate facts.
