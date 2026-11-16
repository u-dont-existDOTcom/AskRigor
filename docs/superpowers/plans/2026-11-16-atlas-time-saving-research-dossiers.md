# Time-saving Atlas research dossiers and the inositol family

Owner decision 2026-11-16: save and link complete source-backed research that materially saves a later reader time versus a high-quality one-turn Medium/High answer, even if some components are familiar.

## Current baseline and completed immediate repair
P-1216, P-1218 through P-1221, P-1227 and P-1228 existed but were deliberately kept off website search and topic pages under the prior novelty-only curation rule. Their deep links worked. AskRigor connector lookup returned them, but public searches for inositol and IP6 found nothing. The owner show_on_pages action returned kept:false for all seven. Fresh GET requests to the actual public website then returned them in search and three original topic pages.

## Implementation already underway
- Curated family identity for inositol, with myo-, D-chiro-, scyllo-, IP6 and D-pinitol separately labelled. Source-linked cards and original topic membership remain intact.
- Public inositol overview aggregating findings from separate Atlas topics, strongest reviewed first, keeping all unreviewed warnings while excluding records deliberately kept out of public search; direct links to evidence and unmet research.
- Umbrella search for inositol includes IP6/phytate matches ranked after literal inositol results. Specific IP6 searches do not expand to all isomers.
- HRP preservation policy updated; reusable synthesis and value above ordinary Medium/High one-turn research are separate from isolated fact novelty, with consent and source checks unchanged.

## Remaining independent product work
A connected family index is NOT itself a complete dossier archive. The project still needs a typed, server-backed, deidentified full research synthesis with outcome and study records, effect magnitudes/denominators, methods, conflicting observations, side effects, unknowns, source-reading depth, consent status, and version history. Run a semantic research-value admission check, preserving eligible full source-linked maps automatically when allowed, and recording an explicit unsaved or blocked reason otherwise. Deduplicate research across chats and versions, preserve prior helpful findings and connect all topic forms. Never publish private health data, raw user chats, unlicensed YouTube comments, or unverified patient narratives as proven causality.

A complete delivery requires real source-to-archive tests with strong-vs-weak research comparisons, account consent, rerun deduplication, source correctness, coherent topic navigation, web/connector consistency, production rollout and user-visible verification. No local unit test is proof of deployment. This feature branch covers the navigation prototype and model-facing policy, not that future generic archival workflow.

## 16 November addendum: source-linked public research synthesis
The feature branch now contains an authored six-form cross-topic research dossier in `apps/research-mcp/src/atlas/inositol-dossier.ts`, rendered on `/atlas/topics/inositol`. It includes multi-study quantified effects, human/animal distinction, limits, harms, negative trials and deidentified public forum reports, with source links and mobile-safe comparison table. The original seven P-number findings, which the owner explicitly restored to public display, remain separate independently reviewable records and link back to the family overview. Other kept-for-research findings stay hidden from public search and the family page. Typecheck, focused rendering and data tests are required for this new layer. This in-repository article is *not* the general typed, versioned and automatically persisted deep-research dossier service. That general feature remains tracked in issue 477.
