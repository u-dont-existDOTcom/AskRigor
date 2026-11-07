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
- **Still uncertain:** whether claude.ai's chat hands the model text, structured content or both, and whether any app
  measures the whole result against a size limit; the first release checks a protocol page and an audit there.

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
