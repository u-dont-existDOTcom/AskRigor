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

**How a word matches.** Words split as today (spaces and punctuation). Both sides fold compatibility forms, full case,
and the combining accents U+0300 to U+036F (the accents of Latin, Greek and Cyrillic letters); every other mark stays,
since it tells words apart (a Thai tone mark: ไข้ and ไข่; a Japanese voicing or length mark: コーヒー and コピー). A word
matches where it occurs in the text, also inside a longer word, so `vitamin` (an example) also finds `vitamins`, and
words in scripts written without spaces are found. Two exceptions keep short words and numbers precise:

- a word of one or two characters, each a digit or a letter of an alphabet with capitals (as examples `D`, `MS`, `D3`,
  `12`), matches only where it stands on its own, not joined to letters of the same kind or to digits (the `D` of
  `vitamin D3` stands on its own; `MS` inside `symptoms` and `ed` inside `treated` do not);
- inside a longer word, a digit at the word's edge never continues a number (`50` is not in `500`, nor `12` in a PMID
  `40123456` or a number `P-1012`).

Exact Unicode categories and the word's length decide this; there is no word list, stemming or language guess. A word
of three letters or more, or of a script without capitals (one Chinese character can be a word, as can a single Arabic
or Hebrew letter as a prefix), may still sit inside a longer word.

**Order.** Findings whose wording holds every word come first: those where each word stands as a whole word before the
rest. Then findings whose text holds every word, whole words first. Within each of these four groups, a finding that
holds the query as typed comes first (a number such as `P-1003`, a DOI or a phrase: `P-1003` is two words, `p` and
`1003`, which another finding's F number can also hold), then the newest. Each result says where its words were found.

**Paging.** Every match is found before the page is cut, so results page by number (`page=2`, 20 a page) with the
total shown, up to 100 pages: past 2,000 matches the page says only the first 2,000 are listed and asks for more words.
The query handling is unchanged (not stored, logged or cached, `private, no-store`, `no-referrer`).

**The text searches match against** (the search index): every shown publication with its page's text folded once,
kept in memory for 60 seconds and dropped on every change, like a rendered page, while its estimate stays within 32 MiB
(several thousand findings at today's lengths; a larger Atlas is read afresh for each search). It holds the public text the pages show, never a query.
Folding every publication for each search cost about 15 ms at 111 findings and would cost about a second at 10,000.

**Database.** None: the search keeps reading the same snapshot through the same parameterized reads, with no new SQL,
index, migration or grant. PostgreSQL text search was considered and left out: its stemming dictionaries are
per-language, its `simple` parser splits on spaces, a trigram index needs an extension and a migration, and matching in
SQL would repeat the shown-finding rules (published fields for unreviewed findings, the latest accepted version
otherwise) where a mistake would match text the pages hide. The Atlas holds about a hundred findings; revisit when the
search index outgrows its bound, with a measurement.

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
