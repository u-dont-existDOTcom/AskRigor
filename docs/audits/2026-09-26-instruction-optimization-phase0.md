# Instruction optimization: Phase 0 findings

Date: 2026-09-26. Baseline: `main` at `8375d04` (HRP 20.5.29, Universal 20.5.26).
Scope: orientation only. No product, protocol, server, or deployment change was made.
Plan: `docs/superpowers/plans/2026-09-26-instruction-optimization.md`.
Machine-readable inventory: `evaluation/instruction-optimization/inventory/`.

## 1. What the model loads in a typical research run

The AskRigor skill (Claude) and the ChatGPT Project instructions tell the model to
load both protocols for almost every health question, and the MCP `load_protocol`
tool returns each file whole.

| Source | Bytes | When |
|---|---:|---|
| `protocols/HRP_Full.xml` | 592,540 | almost every health run |
| `protocols/Universal_Instructions.xml` | 167,008 | every run |
| `skills/askrigor/SKILL.md` (Claude connector, Codex plugin) | 9,273 | Claude/Codex runs |
| `project/PROJECT_INSTRUCTIONS.md` (ChatGPT Project) | 7,978 | ChatGPT Project runs |
| `project/FORUM_SIGNAL_MODULE.md` | 27,888 | ChatGPT Project, when forum signal applies |
| MCP server instructions | 2,531 | every MCP run |
| 27 tool descriptions + input schemas | 6,093 + 21,403 | every MCP run |
| 27 tool output schemas | 111,887 | sent to clients; model exposure depends on client |
| `docs/custom-gpt-instructions.md` | 5,236 | Custom GPT only |

A typical MCP run therefore carries about 800 KB of instructions, roughly
190–240K tokens, before the first source is read. The two protocols are 95% of it.

**On Claude Code the protocols never arrive.** Claude Code rejects MCP tool
results above its output limit. `load_protocol` returns each file whole (about
604,000 characters of tool-result JSON for HRP and 168,000 for Universal), so
the model receives an error message and none of the protocol text; the result
is saved to a file only a model with file-reading tools could page through.
Checked 2026-09-26 with Claude Code 2.1.283 and Claude Opus 5.5 against a local
server built from `main` (`evaluation/instruction-optimization/runner/`).
Whether claude.ai and ChatGPT connectors truncate, reject, or accept results of
this size has not been checked yet. The chunked `load_protocol` (48,000-byte
pages) exists only on the Custom GPT action route, which production does not
serve.

## 2. What the server enforces today

Full map with file/line/test references: `inventory/server-enforcement-map.md`.

- **Enforced on the MCP route:** the full-text chain (a handle only for complete,
  identity-verified text; validators refuse until the text is fully read; 13/12
  audit domains; source hash and cited blocks must match), YouTube completeness
  receipts (returned, but no later tool requires them), and research access.
- **Not enforced on the MCP route:** anything "before synthesis". The MCP transport
  is stateless (a new server per request, no session), so nothing can check that
  the community survey and per-video audits happened, that decision-critical
  studies were validated, that continuations were exhausted, or that the
  protocols were loaded at all.
- **The only real synthesis gate is not live.** The controlled research session
  (finalization permits, required-module checks, protocol-drift checks) is
  reachable only through the Custom GPT research actions, and the server removes
  those routes whenever OAuth is configured. Production's
  `/actions/openapi.json` lists only the two lesson routes (checked 2026-09-26).
  The Custom GPT instructions still tell it to call `start_research_session`.

## 3. Rule inventory

Nine parallel reviewers classified every leaf rule in 96 protocol sections
(1,411 rows), plus the 149 stress-test cases and 54 revision-history entries.
The recommendations are estimates to guide the work; every change still has to
be made and checked.

| Category | Share of classified bytes |
|---|---:|
| Domain method (clinical/scientific method, AskRigor's research approach) | 38% |
| Process gates (required steps and receipts) | 17% |
| Output shape | 13% |
| Generic reasoning discipline | 11% |
| Protocol mechanics (loading, precedence, versions) | 10% |
| Safety | 4% |
| Generic execution babysitting | 4% |
| Maintainer-only | 3% |

| Recommendation | Share |
|---|---:|
| Merge into one canonical statement (duplicate) | 41% |
| Compress | 25% |
| Move out of the runtime prompt | 14% |
| Keep as is | 8% |
| Enforce in the server instead | 7% |
| Cut (test removal) | 4% |

- Enforcement: 71% of rules have none, 15% have only a test that checks the
  text exists, 14% are partly backed by a server check.
- Estimated runtime protocol text after the recommendations: about 120 KB of the
  759.5 KB (about 16%). The stress tests (92 KB) and both revision histories
  (73 KB) can leave the runtime prompt entirely: 148 of 149 stress cases restate
  existing rules.
- 256 rows would change clinical or scientific method content and need owner
  approval before they change.
- Largest reductions: FinalSelfCheck (41.5 KB, restates module rules),
  ResearchAuditTemplates (35.6 KB), ProtocolExecutionAndComplianceGate (33.6 KB),
  ResearchOrchestrationAndModeSelectionGate (26.2 KB, largely ChatGPT
  mode advice), AnswerShapeController (19.1 KB), CrowdSourcedAndClinicalSignalAudit
  (19.0 KB), Universal point_of_generation_checks (18.0 KB), OutputFormatting (17.4 KB).

## 4. The owner's three hypotheses

1. **Bad basic logic forced "don't be stupid" rules — partly supported.** 31 of
   54 revisions (57%) fixed model lapses (17 execution, 14 reasoning); 18 (33%)
   added missing domain method. 19 of 20 Universal revisions were lapse fixes.
   But generic reasoning and babysitting text is only about 15% of the bytes.
   The larger cost is that each fix was restated in several places: the module,
   the router, a "not optional" rule, a final self-check, an output rule, a
   template, and a stress case.
2. **Too many instructions — strongly supported.** Most of the text is duplicate,
   maintainer-only, or compressible. At least six revisions exist to undo
   over-strict earlier prose, and the inventory found live contradictions
   (section 5).
3. **Missing forced gates — strongly supported.** Nothing on the live MCP route
   can block synthesis. 8 of 9 HRP execution-lapse revisions describe failures a
   stateful finalize gate would have caught (synthesis on partial YouTube
   coverage, skipped modules labelled "full HRP", protocol not loaded, research
   before an approved spec, incomplete batch extraction). The 58 gate candidates
   cluster into: community survey and per-video audit receipts (27), a
   triggered-module ledger and finalize check (17), a validator receipt per
   decision-critical study (11), and treatment-landscape locks (3).

## 5. Problems to fix regardless of pruning

- The skill, the ChatGPT Project instructions and the Forum Signal module name
  three tools the MCP catalog does not have: `get_youtube_transcript`,
  `scout_gemini_youtube_candidates`, `assess_treatment_landscape_coverage`.
  Connector runs cannot satisfy the checks that depend on them.
- Contradictions: the "Analyzed with Heterodox Research Protocol" opener versus
  the reader-facing rule against protocol preambles; whole-answer "Partial HRP"
  labels versus claim-level uncertainty (20.5.22); the no-auto-loop YouTube
  continuation case versus the landscape synthesis lock and the server
  instruction to continue automatically; forums as "lead-level" (Universal)
  versus HRP's independent community layer; a DMSO-specific rule versus
  NoFavoredRemedyPrivilege.
- Universal loads non-health material into every health run (shopping, coding
  CLI, relationship advice, documentary-controversy examples), a rule to replace
  guardrail-sensitive words with euphemisms inside `@` signs (which could obscure
  words such as "overdose" in a health answer), and a first-person statement of
  legitimate purpose that the product asserts on behalf of every user.
- An unverified citation ("IOM Nutrient Prioritization Pyramid") and a stray
  "A" at `protocols/HRP_Full.xml` line 1399.
- Five test files pin the HRP SHA-256 and one test derives Universal's hash
  chain, so any protocol edit must re-pin them. Stored study-audit reuse is bound
  to protocol hashes, so every protocol release invalidates stored reusable
  audits (this is already true of each 20.5.x release).

## 6. Recommended direction

1. **Give the MCP route a research session with a finalize gate**, reusing the
   controlled session's required-module and finalization logic rather than a
   new mechanism. Tools record receipts in a server-side ledger; `finalize`
   returns a permit or the missing work. First gates: community survey plus
   per-video audit receipts when community evidence could matter; a validator
   receipt (or explicit lead status) for each decision-critical study; no open
   continuation or unfinished full-text read. The same ledger measures rule
   compliance for every run.
2. **Serve the protocol by step.** Keep the canonical files complete and
   hash-verified in the repository; have the server serve a small core plus the
   modules the current step needs.
3. **Consolidate the text.** One canonical statement per rule; move stress
   tests, revision history and maintainer rules to tests/docs; remove non-health
   material from health runs; resolve the contradictions; compress generic
   reasoning and babysitting prose, keeping domain method.
4. **Fix the broken tool references** first, because they guarantee failures.

## 7. Evidence limits

The category and keep estimates are model judgments over the protocol text,
checked against the server map and spot-checked by hand (tool references,
compliance opener, euphemism rule, purpose statement, test pins, line 1399).
No research run has been executed yet, so nothing here measures answer quality,
gate compliance, or cost per run.
