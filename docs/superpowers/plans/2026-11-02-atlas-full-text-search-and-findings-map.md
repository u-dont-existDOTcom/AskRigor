# Atlas: full-text search and a findings map

The owner, 2 November 2026: "atlas findings search seems to only search titles btw can we have a full text search as
well? and can we have something that shows the most interesting findings on a map idk make it visually intuitive so
people can get some value out of it". Built on `claude/atlas-fulltext-map-20261102`, released later with the owner's
own words; no database change.

## What search does today

`/atlas/search` (183b) reads every shown publication in the pages' snapshot and keeps a finding when each typed word
equals a whole word of five fields: the question, the wording, whom it applies to, the subject and the topic. The
wording is the title a list shows, the question shows only on topic maps, and the other three are short, so a word that
appears only further down a finding's page (why it isn't the usual answer, what would change it, its numbers, the
searches that found nothing, its sources) finds nothing. Whole words also fail languages written without spaces: a
Chinese or Thai sentence is one "word" unless punctuation splits it.

`search_research_frontiers` searches the Atlas "exactly as its pages do" (its frozen description), through the same
`loadAtlasFindings`.

## Search design

**What it searches: the text a finding's page shows.** The wording (the title), the question, whom it applies to, the
subject, the topic, why it isn't the usual answer, what would change it, each figure's outcome, follow-up, option and
comparator, each search that found nothing, the source identifiers as the page writes them (DOI, PMID, PMCID,
ClinicalTrials.gov), and the P and F numbers. Never: words the pages add as labels (kind, direction, certainty), votes and
comments, card or version fields the pages don't show (the usual answer, who else, what it changes, tags), or anything of
a held, rejected or withdrawn publication. The Atlas keeps no quotes or source titles (a source is its identifiers), so
there are none to search; adding them would publish more than the pages show.

**How a word matches.** Words split as today (spaces and punctuation), and both sides fold as today (compatibility
forms, full case folding, accents). A word matches where it occurs in the text, also inside a longer word, so
`vitamin` (an example) also finds `vitamins`, and words in scripts written without spaces are found. One exception keeps
short words precise: a single digit, or a single letter of an alphabet with capitals, matches only where it stands on its
own, not joined to letters of the same kind or to digits (the `D` of `vitamin D3` stands on its own; the `d` of
`deficiency` does not). Exact Unicode categories decide this; there is no word list, stemming or language guess.

**Order.** Findings whose wording holds every word come first: those where each word stands as a whole word before the
rest. Then findings whose text holds every word, whole words first. Within each of these four groups, a finding that
holds the query as typed comes first (a number such as `P-1003`, a DOI or a phrase: `P-1003` is two words, `p` and
`1003`, which another finding's F number can also hold), then the newest. Each result says where its words were found.

**Paging.** Every match is found before the page is cut, so results page by number (`page=2`, 20 a page) with the
total shown; the query handling is unchanged (not stored, logged or cached, `private, no-store`, `no-referrer`).

**Database.** None: the search keeps reading the same snapshot through the same parameterized reads, with no new SQL,
index, migration or grant. PostgreSQL text search was considered and left out: its stemming dictionaries are
per-language, its `simple` parser splits on spaces, a trigram index needs an extension and a migration, and matching in
SQL would repeat the shown-finding rules (published fields for unreviewed findings, the latest accepted version
otherwise) where a mistake would match text the pages hide. The Atlas holds about a hundred findings; revisit at about
ten thousand publications, with a measurement.

**The MCP tool follows the pages.** `search_research_frontiers` returns the first `limit` findings in the same order,
with `has_more` when more match, and its result's limitation says how matching works. Its input and description are
unchanged (frozen tool list, 189a). An AI's lookup may now return findings whose other text holds the words; each still
needs its `atlas_reuse` declaration, `not_relevant` included. The release's regression run sees this.

## Map design

**Purpose.** A first view of the whole Atlas: which topics it covers, how much each holds, which findings are checked,
and where to start reading. Every circle opens its finding.

**Page.** `/atlas/map`, "Findings map" in the header navigation, linked from the home and topics pages. Rendered on the
server like every Atlas page: inline SVG and HTML, no script, no inline style, the same stylesheet and policy, cached for
60 seconds like the topics page and dropped on every change.

**What it shows.** Every shown finding except leads and findings a newer one replaced (as the home lanes), once per F
number, grouped by topic (the canonical label first), findings with no topic last. Topics with more findings on the map
come first, then by label. A topic shows at most 60 circles; the rest are a link away, on its page.

**The rule, said on the page.** Each finding gets points for what the Atlas holds about it:

- 2 if supervisors checked it;
- 2 if AskRigor rated it high certainty, 1 if moderate;
- 1 if its page shows counted results for each group;
- 1 if its page links to two or more sources;
- 1 if it was published, or checked, in the last 30 days.

More points, a bigger circle (its area grows with the points). Within a topic, findings with more points come first, at
the centre of its cluster, then the newest. The live Atlas (111 findings in 11 topics on 2 November, none checked yet,
most with one source, certainty mostly moderate or low) varies on certainty, numbers and sources today; checks and dates
add more as it grows.

**Check status stays visible.** Colour and shape: a solid disc for "Checked by supervisors", a ring for "Contested", a
light disc with a dashed outline for "Not checked by supervisors yet". The legend uses the pages' exact words, and every
circle's name and every list entry carries its status.

**Not a ranking of treatments.** Nothing in the rule depends on what a finding says: whether a treatment helps, harms
or does nothing. No colour means benefit or harm, the lists are unordered lists, and the page says that the map is not a
ranking or a recommendation and not medical advice. Votes and comments are left out: they would make size a measure of
agreement, which reads as endorsement, they can be gamed, and they are off unless participation is on.

**Access.** Each topic is a section with its heading, a one-line count by status and its cluster (an SVG group named by
the heading); each circle is a link whose name gives its P number, wording, status and points, with a visible focus
ring. A link before the clusters skips to "The map as a list": per topic, every finding on the map in the same order,
with its status and its points. Shape as well as colour shows status. Topic cards flow into one column at phone width
(375px) and the clusters scale with it; light and dark use the existing tokens.

**Layout.** A deterministic sunflower spiral per topic: circles in the topic's order, the first in the middle and each
next one on its own ray (turning by the golden angle), as close to the middle as it fits beside those already placed.
The island behind a cluster is a circle around it.

**As built** (rendered locally from invented data, every topic marked "(invented)"):
[light, desktop](2026-11-02-atlas-findings-map-light-desktop.jpg) and
[dark, 375px](2026-11-02-atlas-findings-map-dark-phone.jpg). The first sentence under the title carries the warning
("a finding the Atlas holds more about, not a treatment that works better"), the key follows, then the map; the full
rule sits under the map, so a phone reaches the clusters without scrolling past it.

## Tests

- Matcher: fields, partial words, the single-character rule, scripts with and without spaces, folding, order, hidden
  text never matched.
- Pages: search order, "found in", the count, paging, the escaped hostile query, headers; the map's model (grouping,
  exclusions, points, order, the cap), its render (rule, legend, status words, links equal to the list's, no script or
  style, the layout within its box without overlaps) and its route (CSP, HEAD, cache, rate limit).
- The lookup tool's ranked results and limitation.
- `npm run verify`, and a local render at 375px and desktop width, light and dark, for the pull request.

## Documents

`docs/privacy-data-map.md` (Atlas navigation and search) and `infra/living-evidence-production/README.md` (the
release's page checks) describe the new matching and the map page. No new data is read, kept or shown.
