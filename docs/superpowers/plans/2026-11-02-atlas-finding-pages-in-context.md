# Atlas finding pages that make sense on their own (plan, 2 November 2026)

Status: being built on `claude/atlas-finding-context-20261102`, stacked on PR #396
(`claude/atlas-fulltext-map-20261102`). A draft, released later with the owner's own words.

## The owner's request

On 2 November (about 17:40 UTC) the owner looked at the Atlas and wrote: "i looked at atlas but didn't understand ...
the cards seem kinda useless?", about `askrigor.com/atlas/findings/P-1020`. P-1020 shows one sentence of a research
answer ("The camping bundles do not isolate an effect of outdoor sleeping itself …"), whom it applies to, why it isn't
the usual answer, what would change it and two bare DOIs. Written as a note inside an answer, it means nothing on its
own page: there is no question, no summary of what the research found, and no study titles.

The session that relayed it asked for, on every finding page and wherever findings are listed (home, all findings,
topics, search, the map):

1. the question the research answered;
2. context: the usual answer, then what this research found, with the card's other findings linked, so a finding is
   never shown as a bare fragment;
3. sources by title and year, not bare DOIs;
4. in lists, the question next to each finding;
5. the label "Not checked by supervisors yet" kept as it is;
6. where an older card has no stored question, a plain note saying so, and the topic instead.

Findings written as fragments in the first place are handled elsewhere (a judge on the next-build branch); this plan
only adds the context the Atlas already holds or can look up.

## What the Atlas holds today

- **An unreviewed publication** (most of the Atlas, P-1020 included) is its card's published fields only
  (`askrigor.atlas-publication.v1`): topic, claim, certainty, whom it applies to, kind, subject, direction, numbers,
  searches, source identifiers, why it isn't the usual answer, what would change it, verified bases, the day saved and
  the AskRigor version. The card itself (question, usual answer) lives in the private findings library on GitHub,
  which the pages never reach. Source titles exist only in the owner's live source checks.
- **An accepted finding** has, in the canonical Atlas: its public question (`questions`), its usual answer (version
  content `usualAnswer`), and each source's newest public-record check with its title and year (`atlas_source_checks`).
- **The card's other findings** are the other publications with the same card digest. The pages never read the digest.

## Design

### Read side (no migration, no grant)

- **Siblings.** A new page read, `listCardSiblings(publicationNumbers)`, joins `atlas_publications` to itself on the
  card digest inside the query and returns only P numbers of the other publications the pages show. The digest never
  leaves the database. A forgotten card's rows have no digest, so they have no siblings.
- **Canonical context.** An accepted finding's page shows its canonical question and usual answer, and each source's
  title and year from its newest check (the reader selects `title` and `published_year` from `atlas_source_checks`).
- **Unreviewed context.** An unreviewed publication shows the question, usual answer and source titles its published
  fields carry (below); one published without them says so and shows its topic.

### Publication side

- **Schema v2.** `askrigor.atlas-publication.v2` adds three fields to v1: `question` (the card's question, at most 300
  characters, "in general terms, with no personal details" as the card defines it), `usual_answer` (at most 400) and
  `source_details` (each source's title and year from its public record, by the source as published). v1 rows stay
  valid; a v1 row never has them, and a v2 row always has the question and usual answer.
- **Consent.** The free contributor notice (version 4, owner answer 171) says a findings card holds "the question in
  general terms", and that "Your findings cards are published in AskRigor's public Atlas as soon as they are saved".
  The 171 build plan's list of published fields (section 4B, the session's design) left the question and usual answer
  out; this adds them for cards published unreviewed (a free card at its save, or the owner's choice of card). A paid
  private card's findings are published only after the owner accepts them, and then show the owner-reviewed canonical
  question, never the card's: decided drafts stay v1.
- **Screening.** The question and usual answer join the texts the publication hold check reads (contact details, a
  card reference, a YouTube link), as every other published text. A source title is provider text: one that fails the
  check is left out rather than holding the finding.
- **Titles.** At publication (the save path and `publish_cards`) each source is looked up with the source checks'
  provider calls (Crossref, PubMed, Europe PMC, ClinicalTrials.gov; free public records, no model API). A source no
  provider answers for keeps its identifier alone; a lookup failure never blocks publishing.
- **Existing publications.** `publish_cards` re-run on a card adds the context to its unreviewed publications that lack
  it: their stored fields plus the card's question, usual answer and titles, checked again, written back under the same
  P numbers through the existing withdraw-and-revive path (the one owner answer 191b's topics use). One that would be
  held keeps its fields as they are. No new database function, migration or grant.

### Pages

- **A finding page** opens with the question (or the note and topic), then the finding, then "In context": the usual
  answer, why this finding isn't it, and "What this research found": every shown finding of the card, this one marked,
  the others linked with their labels. Then the facts, numbers, searches, what would change it, and the sources by
  title and year, each with its identifier links.
- **Lists** (home, all findings, topics, search, the map's list) show the question above each finding, or "Published
  without its question" and the topic.
- **Search** reads the usual answer and the source titles too, as text the page shows.

## Privacy and release

- The privacy data map's "Atlas publications" and "Atlas navigation and search" paragraphs say what is new: the card's
  question and usual answer published with an unreviewed finding, source titles and years from public records, and the
  sibling read (P numbers only, by the digest inside the query).
- Release steps: after the deploy, `publish_cards` over the cards with unreviewed publications adds their context
  (`list_publications` names them); then check P-1020's page.
- Rollback: an older build reads only v1, and its publication store refuses a row it cannot read, so before rolling back
  run, as the migrator, `UPDATE atlas_publications SET published_json = (published_json - 'question' - 'usual_answer' -
  'source_details') || '{"schema":"askrigor.atlas-publication.v1"}'::jsonb WHERE published_json ->> 'schema' =
  'askrigor.atlas-publication.v2';`

## Tests

- Schema: v1 refuses the new fields; v2 needs the question and usual answer; titles name a published source.
- Projection: an unreviewed draft carries the context and titles; a decided one does not; a question with contact
  details holds the finding; a title that fails is left out; a lookup failure publishes without titles.
- `publish_cards`: an older publication gains its context under the same P number; one that would be held is left as
  it is; topics filed under 191b are kept.
- Reads: siblings by digest (memory and the SQL's text), never a digest or card number selected; canonical titles and
  years.
- Pages: the question, the no-question note with the topic, the usual answer, siblings with labels and links, titles
  and years with identifier links, the label unchanged, lists with the question, search over the new texts.
- A local preview with invented data, light and dark, desktop and 375px.

## Two bugs from the review of the live Atlas (2 November, evening)

- **Topic maps:** a node said "Question not recorded" and cut its label mid-word. It now names the finding's question
  (its Q number), or, for a finding published without one, its topic ("Topic: …"). Labels break between words with
  Unicode's word boundaries in any script (`wrapWords`): Chinese and Japanese characters take two columns, closing
  punctuation stays with its word, and only a word longer than a line is cut, with "…" for what is left out.
- **Findings with their words run together** (P-1031, P-1032, P-1060, P-1061, P-1092, P-1093 and smaller cases): the
  stored cards already hold the text that way, and the save path refuses a card whose digest differs from the one the
  final check signed, so the text reached the server like that, from the research AI's tool call. The library, the
  publication, the pages and search keep every kind of space (tests in French, Russian, Chinese and Japanese text).
  Republishing cannot repair those findings: the owner's edit, a corrected save of the research, or unpublishing can.
  Catching such text when a card is checked is a judgment of meaning (Thai and Chinese write without spaces), so it
  belongs to the next build's judge, not a pattern.
