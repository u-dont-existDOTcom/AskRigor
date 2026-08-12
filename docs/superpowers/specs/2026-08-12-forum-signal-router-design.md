# Forum-Signal Router and YouTube Audit Design

## Goal

Make AskRigor reliably activate community research without paid model inference by moving module selection into compact ChatGPT Project instructions and collapsing YouTube discovery plus complete comment/reply acquisition into one MCP tool.

## Boundary

ChatGPT remains the reasoning and synthesis engine. The AskRigor server will not call the OpenAI API, run a local language model, persist research sessions, or claim that it can prevent ChatGPT from answering without a tool call. The server can mechanically enforce the YouTube acquisition contract after ChatGPT calls the compound tool.

The full HRP remains the governing synthesis protocol. It no longer decides whether Forum Signal is required. A compact router fixes the applicable-module ledger before substantive research, and strong formal evidence cannot remove a required module.

## Project package

The repository will contain a copy-ready ChatGPT Project package:

- `project/PROJECT_INSTRUCTIONS.md` is the short dispatcher. It uses a sensitive trigger: if firsthand experience, implementation differences, treatment tolerability, real-world outcomes, adherence, harms, discontinuation, or patient decision-making could plausibly affect the answer, Forum Signal is required. Uncertainty resolves to required. Once required, a strong RCT or other formal result cannot deselect it.
- `project/FORUM_SIGNAL_MODULE.md` defines acquisition, directional analysis, bidirectional transfer, access-boundary handling, and the receipt passed into HRP synthesis.
- `project/README.md` explains the one-time ChatGPT Project setup and makes clear that repository files do not update a ChatGPT Project automatically.

The router runs before the complete HRP is loaded. It records required modules, then the normal protocol integrity/load flow runs. A full-HRP opening is permitted only after required module receipts pass. If a missing module remains executable in the current turn, the instructions require continuing rather than emitting a partial answer.

## Compound YouTube tool

Add a read-only MCP tool named `audit_youtube_community`. Its input is:

```ts
interface YoutubeCommunityAuditInput {
  research_question: string;
  searches: Array<{
    direction:
      | "general"
      | "benefit"
      | "no_effect"
      | "harm"
      | "discontinuation"
      | "formal_discriminator";
    query: string;
  }>;
  max_videos?: 1 | 2 | 3;             // default 2
  sample_comments_per_video?: number; // 20..500, default 250
}
```

The handler performs the following deterministic sequence:

1. Execute every distinct YouTube video search supplied by the Forum Signal module.
2. Merge results in round-robin query order, deduplicate video IDs, and select no more than `max_videos`. The receipt states that selection is bounded and provider-ranked, not an exhaustive YouTube search or a model judgment of materiality.
3. Retrieve metadata for every selected video.
4. Retrieve each selected video's unfiltered top-level comments with replies enabled. The compound tool never calls query-bounded `search_youtube_comments`.
5. Let the existing comment adapter paginate top-level comments and independent reply pages until it reports `api_visible_complete` or a truthful access/budget failure.
6. Return all comments when the corpus fits the requested sample size. For a larger complete corpus, return a deterministic, evenly spaced chronological sample, the complete corpus count, and a SHA-256 digest of the normalized complete corpus. Sampling affects what ChatGPT analyzes, not the acquisition receipt; no prevalence claim may be made from the sample alone.

## Receipt and completion states

The output includes search receipts, selected-video provenance, per-video metadata and comment access states, comment manifests, samples, corpus digests, and this audit receipt:

```ts
interface YoutubeCommunityAuditReceipt {
  completion_state:
    | "api_visible_complete"
    | "complete_no_candidates"
    | "completed_with_access_boundary"
    | "incomplete";
  synthesis_lock: "pass" | "block";
  searches_requested: number;
  searches_completed: number;
  selected_video_ids: string[];
  unfiltered_retrieval_attempted_for_all: boolean;
  replies_requested_for_all: boolean;
  pagination_exhausted_for_complete_videos: boolean;
  replies_reconciled_for_complete_videos: boolean;
  query_bounded_comments_used_as_corpus: false;
  blockers: string[];
}
```

`complete` and `api_visible_complete` are acceptable source-terminal statuses. For bounded video discovery, a successfully returned provider-ranked search page is a completed requested search even when YouTube advertises more ranked results; the next cursor is preserved and the tool never claims exhaustive platform search. For a selected video's comment corpus, `partial`, an unconsumed cursor, non-exhausted pagination, incomplete reply reconciliation, provider/configuration errors, or an invalid response blocks a full completion receipt.

A terminal provider limitation such as disabled comments is recorded as `completed_with_access_boundary`; it permits bounded synthesis only when the Forum Signal module explicitly reports the missing layer and its confidence effect. `complete_no_candidates` permits synthesis but forbids characterizing an unseen community signal. `synthesis_lock` is `pass` for those two bounded terminal states and `api_visible_complete`; it is `block` only for `incomplete`.

The top-level audit `access_status` remains one of the canonical AskRigor access statuses. It is `api_visible_complete` only when every requested search succeeds and every selected corpus completes; it is `complete` for an exhausted zero-candidate audit, and otherwise preserves a truthful non-complete status.

## Forum Signal analysis

The Project module uses ordinary ChatGPT web research for independent forums and uses `audit_youtube_community` for YouTube. It classifies the returned firsthand reports into benefit, no effect, harm, and discontinuation, deduplicates person-by-treatment episodes, states whether the analyzed YouTube material is a complete small corpus or a deterministic sample, and avoids prevalence claims unsupported by the sample.

It records both directions of transfer:

- community to formal: hypotheses discovered in lived reports and the formal searches used to test them, or an explicit `no_material_transferable_hypotheses` result;
- formal to community: discriminators derived from formal evidence and the community searches or extraction used to inspect them, or an explicit `no_material_discriminators` result.

Its output is evidence for HRP synthesis, not a final treatment verdict.

## Regression and verification

The permanent routing regression uses the exact prompt:

```text
@AskRigor best way to fix an old hip that barely works and hurts
```

The Project contract must classify Forum Signal as required, forbid an excellent RCT from deselecting it, require the compound YouTube audit, require both transfer directions, and prohibit the full-HRP label before the completion receipt passes.

Fixture-backed MCP tests will prove that the compound tool:

- performs video search, metadata validation, unfiltered comment acquisition, top-level pagination, and independent reply pagination in one call;
- never sends YouTube `searchTerms` during corpus acquisition;
- deduplicates a video found by multiple directional searches;
- returns an `api_visible_complete` receipt only after exhausted pagination and empty reply mismatches;
- blocks synthesis on partial retrieval and truthfully distinguishes zero candidates and access boundaries;
- returns a deterministic bounded sample and full-corpus digest without persisting the corpus.

The existing typecheck, build, deterministic fixture suite, plugin validator, and public-site validator remain release gates.

## Deployment

This change is additive and does not require n8n or an OpenAI API key. It does require rebuilding and redeploying the AskRigor MCP container so ChatGPT can discover the new tool, then replacing the ChatGPT Project instructions and uploading the Forum Signal module file. A refreshed developer-mode connection and a new chat thread are required for the new tool metadata and Project instructions to take effect.
