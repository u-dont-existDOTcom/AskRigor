# Building the public Atlas (plan, 22 October 2026)

Status: plan for the owner. Each phase goes out only with the owner's yes for its release. Owner answer 160b (22 October, read at 16:14 UTC): the next release waits for phases 1 and 2. Phase 1 is built (`4e90274d`, notice v3 and migration 0016); phase 2 is built (parts A to D, `3074e16b` to `e9ff3b24`, migration 0017). Phase 3 is built on the branch after them (design `2026-10-22-atlas-phase-3-design.md`, migration 0018), for the release after the one that carries phases 1 and 2; its defaults are listed for the owner in that design's section 10.

The design is `docs/public-atlas/2026-10-22-atlas-organization-draft.md`, with the owner's answers to question 159 in
its section 6: 1b, 2a, 3b, 4a, 5a, 6a, and 7 as agreed at about 15:35 UTC. Owner answer 156a (built, not yet
released) decides what reaches the inbox: the AI declares on each findings card whom its findings would help, and
personal-only findings are never saved or offered.

## Fixed points

- **Acceptance:** nothing is public until the owner accepts it (156a), finding by finding.
- **No model calls:** code builds the pages from accepted records and the owner's edits. The pages are static, with no
  cookies.
- **Judgment:** the AI and the owner judge meaning; code checks exact things (identifiers, dates, counts, rates, NNT
  and NNH, links). Checks on user content work in any language.
- **No person on any page:** no account, no ARF number, no chat, no answer quote.
- **Tools:** the connector stays at 33 tools. Owner actions go into an existing tool.
- **Community content:** it stays out of the Atlas database until the YouTube compliance review ends and the owner
  approves a field-by-field rule (4a).

## Phase 1: wording and consent (small; first)

- **New notice version:** `free-contributor-v3-…` says, in plain words:
  - accepted findings may be published, written without the person (1b);
  - asking to delete a card removes everything that ties it to the person, with no reason required;
  - a published finding stays while it is valid, is corrected or taken down when someone shows it is wrong, and is
    rewritten or removed if it could identify someone (7).
- **Same rules elsewhere:** the privacy page, the terms and the paid save offer say the same.
- **Re-acceptance:** current free accounts accept the new version once, through `manage_research_access`. Today that
  is the owner alone.
- **Older cards:** they count (1b), since only the owner has agreed to any notice so far.
- **The owner approves the exact sentences:** they go on the owner page with the release question. This is the only
  phase that changes what users agree to.

## Phase 2: accepting findings (data, no public pages yet)

- **Owner actions:** `accept_finding`, `edit_finding`, `reject_finding` and `withdraw_finding`, added to an existing
  owner-only tool such as `review_research_contribution`. Each takes a card's ARF id and a finding number. Each is
  checked exactly first:
  - at least one verified basis (139c); without one a finding can only be a lead (3b);
  - group sizes behind any numbers;
  - each source's public record and retraction status.
- **Storage:** an accepted finding is written into the Atlas database as a claim version with its studies, through the
  same path as accepted research maps. Versions are never overwritten. A correction is a new version with a dated
  note (5a).
- **Links by meaning:** the AI declares links (same as, narrows, contradicts, replaces) and the owner accepts them.
  An accepted "contradicts" makes both findings contested; "replaces" makes the older one superseded (138b, applied
  to findings).
- **Deletion (7):** a card deletion removes the account link and the card record. A finding that rests only on that
  card stays while valid. A takedown request with a reason is reviewed as a correction.
- **Migration:** one, for the finding records, their change records and the public finding numbers, which are never
  ARF numbers. Plus privacy data map rows.

## Phase 3: card fields the pages need

- **Per finding:** kind (effect, harm, overlooked option, correction, nothing found, tested against sold), subject and
  its type, direction, and the numbers block. The numbers block holds each group's count and size, and the
  follow-up; code works out rates, NNT and NNH. Also a search scope for "nothing found", and one community sentence,
  kept apart and switched off (4a).
- **Per card:** the topic.
- **Who fills them:** the research AI, while the papers are open. The final check verifies the exact parts and the
  owner confirms at acceptance.
- **Built** (design `2026-10-22-atlas-phase-3-design.md`): the fields and the final check (part A), their storage
  and migration 0018 (part B), acceptance with the card's fields by default (part C), and the documents (part D). The
  community sentence is designed and switched off: no schema accepts it.

## Phase 4: the pages

- **Build and deploy:** a generator builds the pages from accepted records and deploys them with the site, through the
  existing site tests and deploy checks.
- **Page types:** home, condition or goal, finding, intervention or product, question, and history. Each has the
  sections in the draft's section 2.
- **Home lanes:**
  - "Most important now" holds the owner's picks, up to 5, each with its reason (2a).
  - "Most unexpected" is computed: checked findings, moderate or high certainty, a verified basis, not contested.
  - "Recently changed" and "Contested" come from the change records.
- **Leads:** a "Not yet checked" list on condition, product and question pages, never in lanes or search, each after
  acceptance (3b).
- **Warnings (6a):**
  - a key study found retracted or corrected, or 12 months without a check, shows a warning at once and takes the
    finding out of the lanes;
  - the owner confirms or clears it;
  - a warning can only lower confidence.
- **Search:** an index built with the pages.

## Phase 5: upkeep

- **Retraction checks:** a scheduled job runs the existing retraction check on the studies behind accepted findings,
  with no model call, and raises the 6a warnings.
- **Re-checks:** a re-check of a finding is new research, done in a chat on the owner's plan or under a new spending
  decision. It is not automatic.
- **Community section:** it is switched on only after the compliance review and the owner's field-by-field rule (4a).

## Order and checks

- **Order:** phases 1 and 2 go in one release; phase 3 next; phase 4 after the first accepted findings exist.
- **Gates:** every phase runs the full deterministic gate. Phase 4 also runs the site tests and the site-deploy
  checks. Each release keeps `/mcp` and `/mcp/claude` working, and has its record and its owner regressions.
