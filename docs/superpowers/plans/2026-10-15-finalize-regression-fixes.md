# Final-check fixes from the 15 October owner regressions

Date: 2026-10-15. Status: **BUILT, for the owner's review.** The owner page's "Coming up" item set the default:
causes 1, 2, 4 and 5 of the release record's product acceptance, built as one change. None changes HRP's or
Universal's text. Merging and releasing need the owner's approval by name, as always.

Source: `docs/audits/2026-10-15-claim-declarations-production-release.md`, "Product acceptance". The final check
passed in 2 of 19 cases; the server's replies name five causes.

## What changes

1. **No research source, no findings card.** The card's findings each cite a study verified or read as a lead in
   this call, or a video audited here. An answer that rests on none of them (a handoff prompt, a correction, a
   question about figures the user gave) had nothing a card could hold, while the connector's schema requires one
   finding with one source, so lessons #24, #25, #28 and #29 and questions 79 and 82 could never pass. The check now
   asks for the card only when the call has something a card can cite: a study audited or read as a lead, or a video
   audited. The field's description says so. The server instructions still say to send a card: they are at their
   2,048-character limit, and the check no longer asks for one when nothing is citable.
2. **Fewer calls to load the protocols.** The index told the AI to load each core section, and the runs did, one call
   each: up to 31 calls before any research. `load_protocol` now takes `section: "core"`, which returns every core
   section in one result (Universal's are 22,007 bytes and HRP's 28,978, each under one 40,000-byte page), and a list
   of names separated by commas, which returns those sections, rules or cases together. Each part is its exact
   canonical bytes, in the order asked, a blank line between two; a part inside another part is served once. The
   result keeps the existing fields, so a client whose tool list predates the change can still read it: the
   ChatGPT app keeps its list until the owner refreshes it, and the result schema rejects unknown fields. The
   regression list now gives each case about 60 calls.
3. **Not changed:** sources AskRigor cannot acquire (a paper without a DOI, a conference abstract, a copy read only
   in part) remain known limits.
4. **A PubMed link counts for a DOI key source** once a PubMed record receipt in the same call matched that record
   to the DOI. Without the receipt, the check still asks for the link the tools returned.
5. **Caveats say what happened.**
   - The unread-study caveat follows the reason each lead receipt signed: not openly available (paywall, or no copy
     found), only the abstract readable, only part readable, a public copy found but not fetched, or no copy verified
     as the same paper. Before, every reason read "not openly available", which #326 and #332 judged inaccurate for a
     copy read in part.
   - Community searches gain `access_boundary: "retrieval_failed"` for a search or page fetch that failed, with the
     caveat "Pages from X could not be retrieved, so reports there are not included." Before, the only choice was
     `blocked`, whose caveat says the site blocked access. Each boundary value is now described.

## Checks

- `tests/research-finalization-gate.test.ts`: no card asked when nothing is citable; each lead state's caveat; the
  retrieval-failed caveat.
- `tests/finalize-recommendations-and-lesson-checks.test.ts`: a PubMed link with and without the matching receipt.
- `tests/mcp-tools.test.ts`: core sections in one call for both protocols, against the canonical bytes and the index;
  a list with a duplicate and a check inside its section; a list across two pages; the request errors.
- `docs/tool-inventory-v0.1.0.json` regenerated; `npm run verify`.

## After merge

Release with the next deploy, refresh the Codex plugin's catalog check, and rerun the 19 regression cases with about
60 calls each, reporting loaded, executed and finalized per case.
