# A rejected research contribution names every problem (owner question 127)

Date: 2026-10-20. Status: **BUILT on local branch `build-127a-20261020`, for the owner's review.** Nothing is pushed,
merged, released or deployed; release is a later owner decision.

## Authority and scope

- **127a** (owner answer, 2026-10-20), from bug report
  [AskRigor-lessons#43](https://github.com/u-dont-existDOTcom/AskRigor-lessons/issues/43): filing a deidentified source
  analysis, the AI got back only "The research access or contribution request did not match the required contract.",
  with no word on which field was wrong, so it could not repair the record. `submit_research_contribution` answers
  every malformed input that way, and its published input shows the record (`payload`) as free-form.
- The approved fix, the same as question 111 did for `finalize_research`: a rejected contribution comes back with every
  problem at once, each with its field path, what was expected and an example of the right shape, never echoing the
  values sent; and the tool's description gives the record's required shape. No protocol wording changes.

## Diagnosis

- Class: the same as question 111's. Validation happened where the model cannot see the shapes (a free-form published
  `payload`, the strict contribution schemas inside the service) and its result was reduced to one sentence: the
  service threw on the first problem, and the tool mapped every schema failure to one fixed message.
- The checks themselves were right and stay as they are; what changes is what a rejection reports and what the tool
  publishes.

## The change

1. **One check that collects** (`packages/evidence-repository/src/research-contribution-check.ts`). It runs the same
   schemas and the same rules as intake (the proposal envelope, the two contribution schemas, the whole-text and query
   hashes, prohibited keys, the contact/address/credential patterns, sandbox links, YouTube and community links, and
   the source-bound rule for shared analyses) and returns every problem found instead of the first. The rules share
   their predicates with the existing assertions, which still run unchanged before storage.
2. **Each problem** has a path from the call's root (`payload.analysis.sections[0].sectionKey`), a rule
   (`missing`, `wrong_type`, `unknown_keys`, `not_allowed`, `too_long`, `format`, `cross_field`, `hash_mismatch`,
   `prohibited_key`, `contact_pattern`, `sandbox_locator`, `community_source`, `source_bound`, ...), what the contract
   expects there in words, and a JSON example of the right shape taken from a tested example record. Nothing from the
   values sent appears: no text, numbers or identifiers, and no key the contract does not define (a key outside the
   contract, or a free key under `receipts[].details`, is shown as `*`; an unknown key is reported by listing the
   allowed keys). Privacy rules name the rule and the path, never the matched text.
3. **Bounded and deterministic:** privacy problems first, then the contract's, each in path order; at most 25 shown,
   each part capped in length, about 16,000 characters in all, and the count of the rest. When fields are invalid, the
   rules that compare fields with each other run once they are fixed, and the result says so.
4. **Order of refusals:** sign-in, then the account's mode (paid private submits nothing; only an active free
   contributor submits), then the record. A paid-private account is told that it does not contribute, not how to repair
   a record it cannot file.
5. **Published input:** both surfaces use a permissive SDK registration carrying a derived published schema, so every
   call reaches AskRigor's own check. ChatGPT's surface (`/mcp`) gets the relaxed schema (the top level as it is;
   constraints the model cannot see and the `payload` union published as described but untyped); Claude's surface
   (`/mcp/claude`) gets the strict schema's SDK conversion, `payload` as the union of the two record shapes. The relaxed
   walk is shared with `finalize_research`.
6. **Description:** the tool description carries both record shapes as compact JSON templates generated from the same
   tested examples and the contract (`<uuid>`, `<sha256>`, `<date-time>`, `<date>` placeholders and `a|b` for allowed
   values), and says that a rejection lists every problem.

## Privacy

`docs/privacy-data-map.md`: a rejection returns field paths, rule names, the contract's expectations and AskRigor's own
examples; never the values sent. Nothing new is stored or logged.

## Tests

- `tests/research-contribution-problems.test.ts`: one test per rejection class (wrong type, missing required field,
  unknown key, enum value, too long, prohibited key, contact pattern, sandbox locator), each asserting the path, the
  expectation, the example and that the submitted value never appears; the examples parse and pass every rule; every
  contract path has an example; bounded output and deterministic order; paid-private and access refusals come first.
- `tests/research-contribution-mcp.test.ts`: on `/mcp` and `/mcp/claude`, the published schema, a malformed record's
  rejection through the MCP transport, and a valid record filed.
- `docs/tool-inventory-v0.1.0.json` regenerated.
- Existing tests that read the old first-problem errors now read the problems (`tests/research-contributor-access.test.ts`);
  `tests/mcp-input-patterns.test.ts` binds the contribution contract's published patterns and adds date-time samples.

## Sizes

The tool description grows from 540 to 6,473 characters (both record templates). ChatGPT's published input stays about
1,150 characters; Claude's strict one is about 39,000, as `finalize_research`'s strict schema (about 43,000) already is
on that surface.

## Found, not changed

- The contact screen reads string values, not keys. `receipts[].details` takes names of the sender's choice, so an
  email address used as a details name passes intake and is stored (confirmed with a synthetic record; the same before
  this change). Screening those names would refuse records intake accepts today, so it is the owner's decision.
- The same class may remain elsewhere: `manage_research_access` still answers a malformed call with the one fixed
  contract sentence, and tools registered with strict nested schemas (for example `validate_study_method_audit` and
  `assess_treatment_landscape_coverage`) are validated by the SDK and, on ChatGPT, by its connector against parts its
  app hides. Not changed here.

## Lesson closeout

Project-specific: the class was named and fixed for `finalize_research` in question 111; this applies the same fix,
with the relaxed-schema helper now shared, to the contribution intake. No universal lesson is claimed.
