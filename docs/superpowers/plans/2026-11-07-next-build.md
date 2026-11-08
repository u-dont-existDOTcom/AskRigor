# The next build after #429 (7 Nov 2026)

Branch `claude/next-build-20261107`, from `main` at `2dff293b`. Each part is built under owner rule 148a; the release
needs the owner's explicit yes, as always. No tool definition changes: `tests/fixtures/frozen-tool-lists` stays byte for
byte (owner answer 189a).

## A. Payload text for apps that read only text (lesson #59): built

AskRigor put each result's payload only in `structuredContent`, with a one-line summary in `content`. A Claude agent
harness hands the model only `content` text, so there it could not read the protocol, the index, PubMed records or
full-text pages, and `load_protocol`'s summary claimed "exact canonical bytes" it did not carry.

- **One mechanism** (`apps/research-mcp/src/tool-result.ts`): `registerTools` wraps every operation's MCP handler with
  `forTextClients`, so every tool on `/mcp`, `/mcp/claude` and `/mcp/gemini` is covered; the Custom GPT Action adapter
  calls `operation.execute` itself and returns structured output alone.
- **Without ChatGPT's signals:** the tool's text blocks first, then the payload as text: the structured content's
  JSON (error results too), or for a `load_protocol` page its other fields' JSON and then the page's exact canonical
  bytes, raw, so a text-only app hashes them against `scope_sha256`. The page's summary says so.
- **ChatGPT** (which shows the model both, OpenAI's Apps SDK reference): the tool's text unchanged, except that a protocol
  page's summary says the bytes are in `structuredContent`. Signals, read per call in memory only: a `_meta` key starting
  `openai/` (documented: `openai/locale`, `openai/userAgent`, `openai/userLocation`, `openai/subject`, `openai/session`,
  `openai/organization`), or an HTTP User-Agent starting `openai-mcp/` (reported by developers, undocumented). The server
  is stateless, so initialize's `clientInfo.name` is never seen beside a call. Anything else gets the copy.
- **Sizes:** what each kind of app takes in stays within the budgets (ChatGPT the result as before; a text-only app the
  text, which now holds the payload once; Claude Code, which hands the model the structured content's JSON and drops text
  blocks unless an Anthropic-side flag says otherwise, as before). An unidentified app that shows both takes in about
  twice the bytes. The two size tests now measure each view.
- **Tests:** `tests/text-only-clients.test.ts` (text-only reads of the Universal core, the HRP core and the index, and a
  PubMed record; ChatGPT's `_meta` and User-Agent; structured content byte for byte; a sweep over every tool on every
  surface); `tests/helpers/text-payload.ts` lets older tests compare the text the tool built.
- **Docs:** the privacy data map ("Payload text" and "Which app made a call"), `docs/claude-connector.md` ("What the model
  sees"), `docs/design-decisions.md`, and the UDA item's two synthetic cases in `docs/owner-regressions.md`.
- **Still uncertain:** whether claude.ai's chat hands the model text, structured content or both; the first release
  checks a protocol page and an audit there. The sizes were measured on 8 Nov (below, finding 1).

## B. The notice asked again only when it collects or publishes more (the owner, 6 Nov): built

The owner: "can we make it so that i don't have to keep accepting the askrigor notice every time you update? that's
annoying". The plan the owner was told: the owner's own logins accept a new version automatically, by the owner's
standing instruction, recorded as such; everyone else is asked again only when a version collects or publishes more.

- **Materiality, declared with each version:** `RESEARCH_USE_NOTICE_CHANGES`
  (`packages/evidence-repository/src/research-use-notice-changes.ts`), every version with `material` and what changed;
  all five so far are material. `researchUseNoticeCovered` (exact, on versions): a yes covers the current notice when
  every version after it is not material. The access check, the findings library's thread links and the Atlas's
  publish-on-save check read it; nothing is written for a carried-forward yes.
- **The owner's login:** the subject `ASKRIGOR_OAUTH_ALLOWED_SUBJECT` names (the owner's review already admits only it;
  the Atlas's owner page reads it the same way). `server.ts` passes it to the access service as `ownerSubjects`. Dev
  accounts are a test role and are never treated as the owner's. Only an active free account behind a material version
  is accepted for; nothing is enrolled, reactivated or switched.
- **The record:** migration `0031_research_notice_acceptance` (`notice_accepted_by`, `notice_accepted_at` = `activated_at`,
  a trigger that clears the pair when a write moves `activated_at` without it, a check on the two values, a one-time
  `PERSON` backfill), the access role's column grant, and `access.acceptance` in `inspect` (runtime only) with a
  sentence in its text; the Atlas account page words it exactly.
- **Tests:** `tests/research-use-notice-materiality.test.ts` (the list, coverage on synthetic histories, the owner's
  instruction and other people's accounts, through `/mcp` and `/mcp/claude`), `tests/research-use-notice-carry-forward.test.ts`
  (a stand-in wording-only version 5, end to end), and the Docker PostgreSQL acceptance
  (`npm run contributor-access:postgres-acceptance`, check `notice_acceptance_recorded_by_person_or_owner_standing_instruction_cleared_when_stale`);
  the v4 and v5 rollback acceptances still pass with 0031 in place.
- **Release:** migrate, re-run `provision-research-access-role`, then the image (`infra/living-evidence-production/README.md`).

## C. The fact-check repairs from issue #431: built

A ChatGPT run fact-checked a video with 22 extracted claims, answered a few, left a refused study audit unrepaired,
cited with markers no reader could follow and never called `finalize_research`; asked to report it, it proposed both a
bug report and a lesson.

- **C1, repairable audit errors** (`apps/research-mcp/src/actions/audit-source.ts`): the study, review and
  publication-notice audits check the identifier, the content SHA-256 and (but for a notice) completeness each on its
  own; `AuditSourceMismatchError` names each failed check with the value sent and the acquisition's own, and says the
  audit stays open until resubmitted. `invokeOpenFullTextMcp` returns it as the tool's text (an error result, since a
  structured one would not fit the published output schema); the Custom GPT Action is unchanged.
  `tests/audit-source-repair.test.ts`: a DOI sent for a PMCID-acquired document names the PMCID; resubmitted, it passes.
- **C2, claim coverage, a note** (`claim-coverage.ts`): each extracted claim has a runtime `id` (`<video>#<n>`, fixed by
  the receipt's video and n); the extraction's text asks the answer to account for every claim and says it is
  unchecked until `finalize_research` runs; `later_inputs.claim_coverage` takes each id's status, and an exact check
  against the receipts notes any claim with no status or `not_addressed`, saying the answer must call itself partial.
- **C3, the app's citation markers, a note** (`citation-markers.ts`): exact ChatGPT marker tokens in `answer_draft`.
- **C4, one report per incident:** in `submit_lesson_candidate`'s saved results, and beside the stopped check's and the
  correction's report instructions. Not in the protocol XML or the skill, which need the owner's approval: the rule would
  also belong in Universal `corrections_and_calibration` (its correction-report paragraph) and its correction-report
  self-check, and in the skill's reporting lines.
- **C5:** `docs/owner-regressions.md`, "A many-claim video fact-check, and one report per incident (issue #431)".
- **Docs:** `docs/final-check.md` (two notes, no blocking rule), the privacy data map's request-local rows,
  `docs/design-decisions.md`.

## The independent review of 7 Nov, and its fixes (8 Nov)

The review of `2dff293b..cbd90d46` found five problems and three it could not confirm. The owner, 8 Nov: "Yes, fix
them".

1. **Results about doubled for apps other than ChatGPT, past the 50,000 characters recorded for Claude clients.**
   Measured: Claude Code 2.1.312 counts only the part it shows the model (the HRP core page's structured content,
   41,119 characters, in an 82,745-character result that stayed inline), and claude.ai and Claude Desktop take about
   150,000 characters in all. `tests/helpers/text-payload.ts` names both limits; `tests/text-only-clients.test.ts` holds
   each part of every protocol page under 50,000 and the whole under 150,000, and `tests/mcp-tools.test.ts` does the same
   for the protocol loops and a full video audit. The Atlas lookup's cap went from 52,000 to 46,000 bytes
   (`ATLAS_LOOKUP_MAX_BYTES`), so its structured part and its text copy each stay under 50,000.
2. **The owner's automatic acceptance could undo a revoke or a switch to paid made at the same moment.** It now saves
   only onto the row as it was read (`saveAccountIfUnchanged`: status, mode, notice version and update time, the time to
   the millisecond), reads the row again when it changed, and stops after a second change, leaving the row as stored.
   `tests/research-use-notice-standing-race.test.ts` (four cases) and the PostgreSQL acceptance's
   `standing_acceptance_saved_only_onto_the_row_as_read`.
3. **An acceptance whose way wasn't recorded was worded as the person's own yes.** The Atlas account page and
   `inspect`'s text now say how it was accepted wasn't recorded.
4. **Read-only tools write the owner's acceptance.** Kept, with the reason in the code: it is recorded on the first call
   that relies on it, since an acceptance relied on and not recorded would be worse.
5. **The citation-marker note said to call `finalize_research` again, which a stopped check forbids.** The clause is gone;
   a passing check's own text already asks for a new check of a changed draft.

Of the three it could not confirm: 0031's check let a row with `PERSON` and no time through, and now requires the time
(edited in place, since 0031 never ran in production); detection by User-Agent may also catch OpenAI's Responses API,
which then gets the text alone (a limit in `docs/claude-connector.md`); the claim-coverage note applies to any run that
extracted claims, not only fact-checks, which is the design. The review's test gaps stay: nothing tests `ownerSubjects`'
wiring in `server.ts` and `pages-http.ts` (the review read it as correct), and the carry-forward test reads `dist/`, so it
needs `tsc -b` first, as `npm run verify` does.
