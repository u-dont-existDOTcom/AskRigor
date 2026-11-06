# The final check's panel (owner question 100)

> Final-check behavior in this dated plan is superseded by owner answers 193a and 195a.
> See [the current five-check scope](../../final-check.md): other diagnostics are notes, limits may be
> paraphrased, and only blocking failures consume rounds. Historical evidence and owner quotes below are retained.

## Authority and scope

- Owner question 100, approved "100a" on 2026-10-16: after the 16 Oct release, show `finalize_research`'s result in a
  panel AskRigor draws itself under the answer, in clients that support MCP Apps (Claude and ChatGPT), keeping the text
  `check_line` for clients that don't. Built as its own pull request.
- Why (plan `2026-10-16-community-report-identity-and-visible-final-check.md`, recurring-finding check): the final check
  is advisory. The server never sees the answer and keeps no logs, so it cannot notice a skipped check. `check_line`
  makes a skip visible, but the model writes it, so it can be dropped from a checked answer or, in principle, written
  without a check. A panel is drawn by the host from the tool's own result, so it appears only when the check ran and
  shows the server's words, not the model's copy.

## Standard and client support

- MCP Apps, the first official MCP extension (January 2026): a tool declares a `ui://` resource in
  `_meta.ui.resourceUri`; the host reads the resource (MIME type `text/html;profile=mcp-app`), renders it in a sandboxed
  iframe, and passes the tool result to it over the `ui/*` JSON-RPC bridge (postMessage). Claude (web and desktop)
  supports it. OpenAI's ChatGPT documentation ("MCP Apps compatibility in ChatGPT") recommends the same standard keys
  and treats `_meta["openai/outputTemplate"]` as a compatibility alias.
- Reference implementation: `@modelcontextprotocol/ext-apps` (MIT, from the MCP organization), pinned at 1.7.5. Its
  server helpers give the exact keys and MIME type; its `app-with-deps` bundle gives the view's `App` class
  (`ontoolresult`, `connect()`), which performs the handshake each host expects.

## Design

- One UI resource, `ui://askrigor/final-check.html`, registered on the MCP server with the MCP Apps MIME type and
  `_meta.ui.prefersBorder: true`, and no external domains in its CSP.
- `finalize_research` declares it: `_meta.ui.resourceUri`, the legacy `_meta["ui/resourceUri"]`, and the alias
  `_meta["openai/outputTemplate"]`, all the same URI. Hosts without MCP Apps show the text result as today.
- The page is one self-contained HTML document built once per process: inline CSS, the package's `app-with-deps` module
  inlined with its final export statement turned into a local binding for `App`, and a small render script. It loads
  nothing from the network, and its CSP blocks any request.
- It renders only the result's `structuredContent`, with `textContent` (never HTML from the result):
  - the verdict: "Checked by AskRigor's final check" (ready), "... with N limits" (ready_with_limits), or "Not checked
    yet: N step(s) left" (not_ready), with the `check_line` when present;
  - the caveats word for word, and what each lane must report;
  - the studies checked (validated and leads) and the communities searched;
  - the findings card's status.
- A not_ready result draws a panel saying the answer is not checked yet, so an answer given after a not_ready result
  shows that too.

## Tests

- The resource is listed and readable, with the MCP Apps MIME type, the panel HTML and its `_meta.ui`.
- `finalize_research`'s tool `_meta` carries the three keys with the same URI, on the ChatGPT and Claude catalogs;
  the result's `structuredContent` is unchanged.
- The HTML holds no `export` statement and no external resource reference, and its CSP allows no network. The
  inlined package bundle carries a few literal URL strings in its schema identifiers and validation messages; they are
  data, and the CSP blocks any request.
- The render script, run in a DOM against fixture results, shows each status, the caveats and lanes, and treats text
  such as `<script>` as text.
- The tool inventory and the Gemini compact catalog stay within budget.

## Privacy

The panel renders the result the caller already receives; nothing new is collected, stored, logged or sent.

## Execution evidence (2026-10-16)

- Direct authority: the owner's bounded second-run brief; no design changes. The live UDA default-branch `AGENTS.md`,
  lesson index, applicable development/admission/reasoning/test rules and mapped dependency closure were retrieved
  through `gh api`, activated through `project/DEVELOPMENT_INHERITANCE.md`. The local action-policy validator passed
  with zero model API spend. This was engineering execution, not an HRP research run.
- `npm run lessons:status`: available; 14 open candidates, 0 needs review, 0 accepted but not incorporated,
  19 incorporated or closed, 0 deletion eligible; suggested-fix lane available, 0 unrecorded items.
- Kept the existing exact package pins and lockfile changes; no install was run. The missing internal workspace
  build output was generated with `npm run typecheck` before the focused tests could load.
- Registered the resource in `createAskRigorServer`, preserving the tool-only registrar seam used by existing tests.
  Updated existing inventory/security assertions for the additional metadata; security scopes remain checked.
- `npx tsx scripts/generate-tool-inventory.mts --write` regenerated the inventory; its equality test passed.
- Panel tests: 21 passed. Affected panel, inventory, OAuth, findings and analysis-staging tests: 66 passed in 5 files.
- Final `npm run verify`: PASS, including typecheck and build; 243 test files passed, 1 skipped (244 total);
  3,421 tests passed, 6 skipped (3,427 total). An earlier full run was stopped after finding the registrar-fixture and
  metadata-expectation failures; those were repaired before this passing run.
- Gemini compact HTTP catalog regression: 1 passed, 90 unselected tests skipped. Measured catalog: 22 tools,
  24,923 UTF-8 bytes, below 25,000 bytes. Panel HTML: 338,851 UTF-8 bytes.
- Final diff review and `git diff --check`: PASS. Tests cover result preservation, all specified rendering states,
  literal text safety, whole long items, independent 40-item list caps, bridge behavior, inline script syntax,
  restrictive CSP, absence of network resource references, and incompatible-bundle errors.
- Lesson closeout: the revised network-loading criterion is already preserved in this plan and the executable
  regression; no new lesson candidate or unrelated queue work was needed. Test-cost telemetry was recorded locally;
  no unchanged green full-suite rerun was added.
- Stop admission: the requested uncommitted implementation and deterministic checks are complete; no remaining
  in-scope action or blocker. No commit, push, git-config change, deployment or live client installation was performed.

Status: approved "100a" on 2026-10-16; built on this branch.
