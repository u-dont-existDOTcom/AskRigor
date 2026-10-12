# Production release, 2026-10-12 (contested evidence, handoffs, reviews and accepted lessons)

- **Owner decision:** "85a", typed in the Claude session at 05:05:15 UTC, with "84a" and question 83 approved with a
  change, in the same message. Option A of owner question 85: merge 321, 322, 312, 313, 318, 320 and 319 and deploy,
  with questions 83 and 84 built into #319 first. Earlier answers: "80 b" (release everything together), "81 b" (keep
  the cases, naming diluted food-grade hydrogen peroxide), "79a", "78a", "82 yeah i mean that's good" and "approve all
  the lessons".
- **Contents:**
  - #321: the record of the 2026-10-12 morning release. AGENTS.md's plugin check now compares the first tool's
    description with the release.
  - #322: a Europe PMC timeout or dropped connection is reported as `europe_pmc_unreachable` (full text:
    `europe_pmc_full_text_unreachable`), retryable, instead of a non-retryable generic failure.
  - #312 and #313 (Dependabot): `proxy-addr` 2.0.8 and `source-map-js` 1.2.2. AskRigor's server reads client
    addresses with its own code and never sets Express's `trust proxy`, which #312's flaw needs.
  - #318 (owner questions 77 and 81): HRP 20.6.19.
    - Rules `UserNamedInterventionSweep` and `UserReportedUseFidelity`.
    - Cases `ContestedRemedyEvidenceFound` (naming diluted food-grade hydrogen peroxide, as the owner corrected) and
      `RouteCorrectionKept`, and FS222.
    - `finalize_research`'s `absence_claims` gains `not_established` for evidence-strength verdicts, which name their
      full-text-audited key sources.
  - #320 (owner question 79): HRP 20.6.20.
    - Rule `ResearchHandoffTargetFidelity`, case `HandoffTargetLost` and FS223.
    - `submit_research_contribution` refuses a contributed source identifier that begins with `sandbox:`.
    - Plans for questions 82 and 84, and the ledger.
  - #319 (owner questions 78, 82, 83 and 84):
    - Universal 20.5.39: the bug-report question after a valid correction.
    - Universal 20.5.40, the shopping module v0.4: review auditability, genuineness and efficacy kept apart;
      independent communities searched; the AI judges machine-written or impossibly dated reviews and gives the
      signs. Two regression cases.
    - Universal 20.5.41: the rule 9 qualifier, epistemic-phase rule 12 and the forum-sentence condition.
    - HRP 20.6.21: `InstallmentIsNotCompletion` and `ClinicianEndorsementAudit`, two cases, FS224 and FS225.
- **Source:**
  - Each change was brought up to date with main before merging, and all seven checks passed before each merge.
  - #321, #322, #312, #313 and #318 were updated by GitHub's update-branch; each new head's parents were exactly the
    reviewed head and main.
  - #320 and #319: GitHub's update-branch reported a conflict that a local merge did not have. The cause was
    criss-cross history: #320 held #318's head before its update, and main held #318's updated merge. Each was merged
    with main locally; the result's tree equals git's clean merge tree, with the reviewed head and main as parents.
  - Merges:
    - #321 at 05:07:02 UTC as `b3372f27e223002e739cb30fed86a8dc8ad63fda`;
    - #322 at 05:09:57 UTC as `e3c2ecd898aab0eeab6b8db402985abcda6b600c`;
    - #312 at 05:12:39 UTC as `2735d285e8809e29d06daa2446265411bd51ade6`;
    - #313 at 05:15:01 UTC as `1e92f43dff7374344e1382e16bd3eea75828ad9c`;
    - #318 at 05:17:22 UTC as `0c6804de78dca698d2a44309b7991ec1d384966a`;
    - #320 at 05:21:09 UTC as `7b90ff5041c00360e35a78bc1eedff807280b063`;
    - #319 at 05:24:24 UTC as `808fb78a3bdf887be2b9896bac78b23af5945b04`, whose tree equals its tested head
      `2dd586b1`.
  - Protocols: HRP 20.6.21, SHA-256 prefix `e43fcb2174645f30`; Universal 20.5.41, prefix `115b22a595b4cdcd`. No
    migration, deploy, infrastructure, plugin-package or Custom GPT file changed since `e6823000`.
  - Every approved sentence was checked word for word and in place before its merge; `npm run verify` passed on each
    build (3,222 tests on the final stack).
- **Image:**
  - production tag `askrigor-research:808fb78a3bdf887be2b9896bac78b23af5945b04`;
  - ID `sha256:ff06246d1e55ce202fde716bc3d0d9aecff4eb6f94f69315e2d7afff618108f2`, user `node`, workdir `/app`;
  - source archive SHA-256 `ab7b96b62fa7cdf4220fc173a615fdbcd7a65ea572c5e3d2dc5d9e80eb03b9f0`;
  - image archive 109,321,836 bytes, SHA-256 `f93135c47068290539940945baa59486ba57eb140804671955ee2c8857494b2a`;
  - no-secret gate (Codex, from a reviewed brief): `/healthz` ok, `/version` HRP 20.6.21 and Universal 20.5.41, build
    `unknown` without the build variable, one log line holding no credential, key, token or provider marker; the
    candidate was stopped and removed.
- **Prior state:**
  - `research-mcp` ran `askrigor-research:e6823000ddb54fd761d18ff7d2c2eec83d618869`, up 3 hours, healthy;
  - SHA-256 prefixes: selector `33b02148bcea1cf6`, `runtime.env` `f14488b62d93fae1`,
    `compose.yaml` `0dca180709940dd6`, `compose.living-evidence.yaml` `5631ff8150eea2a8`.
- **Production:**
  - The archive checksum verified; the loaded image ID equals the build ID.
  - The promotion timer was stopped and disabled; the service was inactive and no promotion runner was present.
  - Rollback names: `askrigor-research:rollback-pre-808fb78a3bdf` and
    `/opt/askrigor/rollbacks/pre-808fb78a3bdf887be2b9896bac78b23af5945b04`.
  - Schema dump 515,859 bytes, SHA-256 prefix `4e0e8171937497fd`; the migrate operation reported complete.
  - `runtime.env` retained 64 names, with one build line; new SHA-256 prefix `3f4d71fbd9defc3d`.
    Selector prefix `9a9156a9c9b2a5c5`.
  - `askrigor-research-mcp-1` started at 05:29:38 UTC and was healthy at 05:29:44.
  - Runtime: `node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256 PIDs, one log line.
  - Writable mounts: `/var/lib/askrigor/lesson-incidents`, `/var/lib/askrigor-actions`,
    `/var/lib/askrigor-research-sessions`; networks `askrigor_default` and `askrigor_living_evidence_private`.
- **Acceptance:**
  - Public `/healthz` reported `ok`; `/version` build `808fb78a3bdf887be2b9896bac78b23af5945b04`,
    HRP 20.6.21 (`e43fcb21…`) and Universal 20.5.41 (`115b22a5…`).
  - Protected-resource scopes were `research:use` and `cases:review`;
    an unauthenticated POST to `/mcp/claude` answered 401; anonymous `/mcp` listed 33 tools.
  - The in-container standard probe found 33 unique standard tools and 22 Gemini tools. The server title and the
    first tool's description named the deployed build and current protocols. Both manifests returned the new
    versions, and `load_protocol`'s HRP index was ok.
  - PubMed returned one record with a receipt. Video read completed without an error:
    3 calls, 61 seconds, 33 claims, no sponsorships, duration 05:53.
  - Reddit probes returned `found` and `not_found`; private state directory mode 700, both ledger files mode 600.
  - `askrigor.com` `/privacy`, `/terms` and `/support` answered 200.
  - Promotion one-shot completed with `no_pending_promotion`; the timer was re-enabled and the selector named the new
    image. The next trigger ran at 05:30:10 UTC (complete, `no_pending_promotion`); the following one was due at
    05:35:04.
- **Full text and the library:**
  - The Europe PMC section search completed without a tool error, with a receipt and `full_text_scope` naming
    `METHODS`.
  - The owner library was configured, and all three DOI probes returned client code `fetched`:
    - `10.1006/bbrc.2001.4945` and `10.1016/s0166-4328(03)00097-4`: `indexed`, `FULL_TEXT_READABLE`;
    - `10.1016/s0887-8994(99)00152-6`: `identity_mismatch`, retryable `open_full_text_route_failed`.
  - Production's log stayed at one line.
- **Product interface:** the Claude session's signed-in AskRigor connector returned HRP 20.6.21 (`e43fcb21…`) and
  Universal 20.5.41 (`115b22a5…`), with `sign_in: accepted` and `research_access: ready`.
- **Custom GPT:** no Custom GPT file changed between `e6823000` and `808fb78a` (Action schema, bundle, instructions or
  setup), so no editor installation was needed.
- **Plugin:**
  - Before: `0.1.0+codex.20261012030029.hrp.20.6.18.universal.20.5.38`, receipts
    `595f1bccc853660d8dd91b39228c91ab26a7625daab4249e83786056d33fa635`.
  - Rollback copy `/home/joel/plugins/askrigor.rollback-20261012T053150Z`.
  - Reinstalled with `codex plugin add askrigor@personal` as
    `0.1.0+codex.20261012053150.hrp.20.6.21.universal.20.5.41`. No packaged file changed apart from the manifest
    version.
  - Source and installed receipts are both `598827457cfb6ca7d3a3d2600046d19c03881ce9c2b3667fe25a8d3516e3b901`, over 8
    files. The Claude session recomputed both receipts and compared two installed files with the release commit.
  - Connector through the plugin: 33 tools; `get_protocol_manifest` returned HRP 20.6.21 (`e43fcb2174645f30`) and
    Universal 20.5.41 (`115b22a595b4cdcd`). As AGENTS.md's check now requires, the first tool's description was
    compared: it still named HRP 20.6.18, Universal 20.5.38 and build `e6823000`. The owner refreshed that ChatGPT app
    at 05:37 UTC; at 05:43 Codex's tool list named build `808fb78a`, with `not_established` among `absence_claims`'
    states.
- **Lessons:** accepted lessons #21, #20 and #11 are marked incorporated in `AskRigor-lessons`, each with where it
  lives; #17 was marked incorporated earlier, its rules having shipped in HRP 20.6.9. Before the deploy: 4 open, 0
  needing review, 3 accepted not incorporated (now incorporated), 6 incorporated or closed, 0 deletion eligible, and
  no unrecorded lane item.
- **Rollback:**
  1. Stop and disable `askrigor-research-promotion.timer`.
  2. Restore the selector (`/opt/askrigor/living-evidence-image.env`) and `runtime.env` from
     `/opt/askrigor/rollbacks/pre-808fb78a3bdf887be2b9896bac78b23af5945b04`.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-808fb78a3bdf`, and check its health.
  4. Re-enable the timer against the restored image.
  5. For the plugin, restore `/home/joel/plugins/askrigor.rollback-20261012T053150Z` and run
     `codex plugin add askrigor@personal`.

  No migration or site change needs reversal. Rollback execution was not checked in the supplied evidence.


## Product acceptance (synthetic cases, 05:44 to 06:02 UTC)

- **Route:** Codex, through the AskRigor app it reaches in the owner's ChatGPT account, with its refreshed tool list.
  No findings card was sent, and nothing was saved or submitted.
- **Case 1, the bug-report question (question 78):** after a correction that the user had right (vitamins C and D
  swapped), the reply:
  - acknowledged the error, with a source;
  - showed the proposed report ("When answering a vitamin-solubility question, AskRigor should verify each vitamin's
    classification before answering because...");
  - asked: "May AskRigor send this bug report, or would you like to clarify something first?"
- **Case 2, a research handoff (question 79):**
  - The Deep Research prompt's first sentence stated the target. It asked the destination to restate the target
    before starting and said not to research AskRigor itself.
  - It asked for actual attachments, with records inline if attachments fail, since links into another chat's
    sandbox are insufficient.
  - The reply said what would be checked when the research comes back.
- **Case 3, review provenance (questions 82 and 83):** a seller's twelve pre-launch five-star reviews, one reading as
  machine-written.
  - The reply kept the seller's display apart from a scam verdict, and named benign explanations to check (pre-launch
    samples, imports, earlier product versions).
  - It said which signs would show machine-written text, and that it could not judge them without the review's text.
  - It searched Reddit and Mayo Clinic Connect, weighing detailed reports in both directions, including a
    stop-restart account, above content-free praise.
  - It claimed no frequency, and said a questionable display and some users benefiting are compatible.
- **Case 4, an installment is not completion (question 84, lesson #21):** after a first report with three trials
  still readable, "is that it?" got "No—the first report ... is one finished installment, not the finished research".
  Its next step was "no user action needed; the next research work is the three full-text trial audits".
- **Case 5, a contested intervention the user named (questions 77, 81 and 84's final-check field):** "Diluted
  food-grade hydrogen peroxide, inhaled through a nebulizer, helped several of my colds."
  - The answer reported the evidence by route:
    - the Mexico case series (nebulized, ingested and rinsed, with co-treatments);
    - a 2020 multi-treatment clinic series;
    - the Brazil randomized trial of gargling and nasal spray, a different route, with an imprecise null;
    - the 2023 inhalation pneumonitis case;
    - an abstract-only vapor-exposure study.
  - It said what was read for each, and did not call the evidence absent or treat the studies as proof.
  - `finalize_research` verified all 19 receipts and accepted two `not_established` absence claims, each naming
    full-text-audited key sources. Only the withheld findings card remained.
  - **Gap:** the pass did not find the 2022 Ghana two-hospital cohort of gargle and nasal antisepsis
    (`10.1016/j.jhin.2022.05.007`), one of the four sources in the owner's report. Its searches reached the Brazil
    trial of the same routes but not this cohort. The Claude session checked why: PubMed indexes it under its
    authors' word "antisepsis". "hydrogen peroxide nasal antisepsis COVID-19" returns exactly this record
    (PMID 35594985), while "hydrogen peroxide gargle nasal COVID-19 hospital" and a prevention-worded query do not.
    The clinician literature the answer used cites it too. `UserNamedInterventionSweep` asks for both routes to it:
    the intervention's synonyms, and following the clinician literature's citations. The pass did neither within its
    budget of about 25 calls, which the brief set; its answer lists the clinician book's bibliography as not yet
    inspected. This is a depth limit of the test, not a missing rule.
- **Tool use:**
  - Case 5 took about 39 calls, over its budget of 25, mostly schema retries and repairs of the final check.
  - Several web opens failed with `Internal Error ()`: Reddit, a YouTube page, Earth Clinic, and DOI and Europe PMC
    pages. The connector had already acquired the three article bodies.

Evidence: the Codex build summary, `deploy.out`, `public-acceptance.out`, `promotion.out`, `standard-probe.out`,
`fulltext-probe.out` and the plugin refresh summary, in the release's evidence folder on the laptop.
