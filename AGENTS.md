# AskRigor agent map

## Authority

1. Current explicit owner correction and task requirements
2. Complete canonical `protocols/HRP_Full.xml` and `protocols/Universal_Instructions.xml` bytes
3. `packages/protocol/src/index.ts` and protocol tests for byte-derived version, date, and SHA-256 manifests
4. `project/PROJECT_INSTRUCTIONS.md` for research routing and completion gates
5. `project/FORUM_SIGNAL_MODULE.md` when that module is required
6. Current source-access contracts, adapters, public MCP behavior, and tests
7. `docs/INDEX.md` for validation, privacy, public-review, and release evidence
8. `project/CODEX-CURRENT-STATE.md` for recovery only
9. Relevant current patterns from `u-dont-existDOTcom/universal-dev-architecture`

Never reconstruct a missing current protocol from chat memory. A manifest, hash,
router, module, status file, release record, generated excerpt, or lesson summary
cannot replace, truncate, or amend either complete canonical XML file.

## Pre-reasoning epistemic routing

For complex tasks, apply the canonical Universal heuristic-attractor check
before substantive reasoning. A familiar rule is not applicable merely because
it is generally sound or prominent. Test its intended problem, current phase,
evidence of applicability, useful work it would suppress, and any more-specific
instruction or first-principles objective. A correct heuristic applied to the
wrong phase is an error. If a user-corrected failure recurs, diagnose the
higher-level attractor rather than add another local exception.

Before using preregistration, freezing, untouched-holdout, leakage, retuning,
multiple-testing, anti-overfitting, post-hoc, or confirmation restrictions,
classify relevant data/work by use. `DEVELOPMENT / DISCOVERY` may influence the
model but cannot independently confirm generalization; optimize it aggressively
and treat internal cross-validation as search/model selection. `VALIDATION /
CONFIRMATION` may test a frozen model but may not influence it. Freeze before
VALIDATION, not before DISCOVERY. Complete canonical Universal and HRP wording
controls over this worker-facing summary.

## Chat-to-Work authority gate

ChatGPT Project Manager/Extra High/Pro owns reasoning, proposals, methodology,
prioritization, scientific interpretation, spending design, consequential
tradeoffs, supervisory verdicts, and selection of the next strategy.

Codex and Work are execution-only. They may perform bounded repository,
browser, terminal, deployment, acquisition, test, and artifact operations that
the reasoning chat cannot execute directly. They may not originate, recommend,
expand, or attribute a proposal, methodology, priority, spending plan, or
consequential decision.

Before a controlled action, run:

```bash
npx tsx scripts/validate-chat-work-authority-policy.mts
```

For a new action candidate, pass its machine-readable request with `--request`.
A reasoning-reserved action without an exact source message identity and body
SHA-256 fails closed. A Codex summary, local subagent, chat title, opened tab,
or assertion that a named chat already decided something is not a reasoning
receipt.

The active AskRigor policy is `governance/chat-work-authority-policy.json`.
While its zero-spend owner decision is current:

- paid model API inference is forbidden;
- the maximum model API spend is USD 0;
- Codex/Work may not author a paid smoke proposal or pilot ceiling;
- an older or hypothetical paid manifest cannot revive the path;
- ChatGPT consumer Extra High/Pro is the default reasoning/evaluation surface;
- any later nonzero-spend proposal must originate in a source-bound reasoning
  chat and still requires a newer explicit owner decision before execution.

Preventing the API call while allowing Codex to invent and advocate the paid
path is a gate failure.

## Internal supervisor routing

Routing exact factual state among the AskRigor Project Manager chat, specialist
supervisor chats, and Codex/Work is standing owner-authorized internal
control-plane transport.

Codex/Work must route automatically, preserve exact bytes and digests, and
capture the destination message identity and response provenance. It must not
ask Joel to paste or relay the packet, and must never ask Joel to say `send it`
for routine internal supervisor routing.

Generic browser confirmation guidance for third-party representational
communication does not override this more-specific internal route. The
exception does not cover external publication, submission, purchases, account
changes, messages to third parties, or other genuinely external actions.

If the configured internal chat is inaccessible, attempt the authorized route,
record the exact transport blocker, and continue all other eligible work before
returning. Do not convert the owner into the courier.

## Completion and continuation

The default is completion of the full owner outcome, not the current subtask.
A green test, plan, commit, pull request, merge, artifact, or bounded slice
triggers the next eligible implementation, deployment, acceptance, or routing
step while the parent objective remains open.

Stop only for a genuine owner-only semantic decision, unavailable external
capability after all nonblocked work is complete, or a safety/security/privacy/
irreversible external-action boundary. Any stop must identify the exact unmet
outcome, blocker, actor who can clear it, and next executable action.

## Validation

- Runtime: Node 24.18.0 (`.nvmrc`)
- Install: `npm ci`
- Targeted tests: `npm run test:run`
- Complete deterministic gate: `npm run verify`
- Public-site checks when affected: `npm run test:site` and `npm run test:site-deploy`
- Live/provider smoke only when explicitly required and credentials are available: `npm run test:live`

## Workflow

Use an isolated worktree or task branch and a pull request. For complex work,
maintain a committed plan under `docs/superpowers/plans/`. Keep hermetic CI
separate from live checks. Run the complete applicable gate, inspect results,
review the final diff, update release/privacy documentation when affected, and
complete lesson closeout before reporting completion.

### Release completion and plugin synchronization

For an authorized product change, source merge is an intermediate state. Keep
advancing through exact production deployment, direct acceptance, Custom GPT
editor installation, and fresh product-interface acceptance while those
surfaces are technically accessible and no genuine consequential boundary
intervenes.

At every backend or Custom GPT release, also verify the installed AskRigor
plugin against the release: exact 27-tool MCP catalog, live HRP/Universal
manifests, one read-only connector probe, and an exact installed-package
receipt covering `.codex-plugin/plugin.json`, every file under the
manifest-declared `skills/` tree (including `skills/askrigor/SKILL.md`), and
the packaged asset/inventory set in full. The receipt must fail if a declared
skill file is added, removed, or changed. An unchanged catalog can become current
through the backend deployment without a package reinstall, but it does not
prove that the installed skill bytes are current. If installed-package bytes
cannot be read back, mark package currency unverified and reinstall the exact
reviewed package. Before refresh or reinstall, preserve a non-secret prior
package/registration receipt and an explicit rollback path. Never infer
plugin-package currency from source files, a working connector, or live
manifests alone.

When the accepted-contribution promotion timer is active, every backend release
must also bind `/opt/askrigor/living-evidence-image.env` to the exact deployed
reviewed image, manually run the hardened oneshot service once, and verify the
future timer trigger before declaring release completion. Rollback must stop and
disable the exact timer without deleting proposals, intents, receipts, or
canonical evidence.

### Lesson-queue checkpoints

Run `npm run lessons:status` using the maintainer's local GitHub authentication:

- at the start of every AskRigor development session;
- before designing a change related to the lesson queue or a relevant lesson category;
- before every release or deployment; and
- whenever the user asks for AskRigor project status.

Report the available result concisely: open candidates, needs review, accepted
but not incorporated, incorporated or closed, deletion eligible, and any
requested relevant-category count. An unavailable result is not a zero count:
report that status is unavailable and its allowlisted reason instead of
inventing queue totals.

Unreviewed lessons cannot silently expand the current task's scope or block an
unrelated release. Bring a potentially critical lesson relevant to the current
work to the user's attention and obtain direction before expanding scope.

## Branch roles

- `main`: canonical public source and release baseline
- task branches: proposed implementation, documentation, protocol, or evidence changes

## Safety

Do not commit credentials, private user data, raw private research content, or
unrestricted provider output. Preserve explicit inaccessible, partial, deferred,
and error states. Health/research policy and substantive protocol changes require
owner judgment through the ChatGPT reasoning surface.

## Code review rules

- A required module or receipt cannot be treated as complete without its executable evidence; strong evidence from another layer does not silently deselect it.
- Do not synthesize a full verdict while the project router says required work is incomplete or blocked.
- Preserve the privacy data map and bounded live-validation contract; never broaden collected or exported data accidentally.

Treat chat as disposable working memory. A fresh worker must be able to recover
from this repository without the old transcript.
