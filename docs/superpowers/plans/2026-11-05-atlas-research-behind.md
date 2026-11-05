# The research behind each Atlas finding, and what people report (owner answer 252a)

5 November 2026. Branch `claude/atlas-research-behind-20261105`, on top of the Atlas drafts (#396 → #397 → #403 → #405
→ #409, with main's #410 taken in), after taking in main's #398, #411 and #412 (the later card shape of owner answer
219b and the source line of owner answer 237a, which this build extends). A draft: nothing is pushed or released.

## The owner's words

Question 252, answered 5 November: "it's not useful to have just a finding, we need all the research that backs the
interesting finding right there for people to inspect, basically the distillation of the most important findings from
the ai research, without whatever extraneous stuff doesn't meet the bar." Then, choosing option a (quotes included):
"252a but include the forum signal we found as well for consilience. forum signal works even if no studies support it,
if we find consilience between reports and especially if there's mechanistic explanation to support it, but mention if
no studies were found on it. if studies contradict that reduces consilience only if they measured in the way the reports
measured the experiment".

The protocol already says the last part, and this build uses its words rather than new ones: HRP
`FormalAbsenceCannotEraseCommunitySignal` (a community signal is not downgraded because formal support wasn't located;
the formal relationship is `corroborated | contradicted | support_not_located | outcome_mismatch`),
`MatchedContradictionAndOutcomeAlignment` (a contradiction needs materially aligned population, intervention,
comparator, outcome and timeframe, otherwise `outcome_mismatch`) and `MechanismIsNotOutcome` (a mechanism supports
plausibility; it is not an outcome). How good the reports are follows `ReportQualityBesideCounts` (HRP 20.6.40, on the
next build's branch): how many gave the details `ContextExtraction` lists, how many measured the change, how many are bare
one-liners.

## The design notes (5 Nov, from the map of the code)

### What a card holds today
- `laterFindingsCardSchema` (`apps/research-mcp/src/findings/card.ts`) = `findingsCardSchema` + `laterFindingSchema`
  (`draws_on_youtube_comments`). Card: question, usual_answer, findings 1-5, public_value, topic, open_leads. Finding:
  claim, certainty, applies_to, answer_quote (≤1,000 from answer_draft), sources (ids 1-10), why_not_usual, tags,
  what_would_change_it, kind, subject, subject_type, direction, numbers (binary_results' counts, no quotes), searches
  (≤10 {database, query, date_range?}).
- Stored as a GitHub issue in the private repository AskRigor-findings (`FindingsSaveService.save`,
  `findings/service.ts`; `cardIssueBody`, `github-findings.ts`; `FindingsRecord` schema `askrigor.findings-card.v1`;
  body ≤60,000 characters).
- Publications: table `atlas_publications` (0021, 0024); `published_json` = `atlasPublishedFindingSchema`
  (`packages/evidence-repository/src/atlas-publications.ts`) through `publishedFindingOf` (`atlas/publication.ts`):
  topic, claim, certainty, applies_to, kind, subject, subject_type, direction, numbers (counts; NNT recomputed), searches,
  source ids, why_not_usual, what_would_change_it, verified_bases, saved_on, askrigor_version; v2 adds question,
  usual_answer, source_details (title, year).
- Accepted findings: `atlas_findings`, `atlas_finding_versions` (0017/0018), `atlas_source_checks` (title, year,
  retraction_status, notices).

### Not stored today (available at finalize only)
- A study audit's domain findings (the receipt signs only status, fig, figv, imp, handle).
- binary_results' quotes; which study a figure came from.
- source_lines' texts and lookups (runtime only, not signed).
- key_sources' read_depth (only counts are signed).
- Retraction checks (check_retraction_status issues no receipt).
- absence_claims, safety_claims, corrections.

### Limits already encoded
- Card screens (`screenFindingsCard`), personal_only never saved, YouTube stripped or held (`withoutYouTubeData`,
  `heldByCardFields`), publication holds for contact details (`contact-check.ts`), `PROHIBITED_PERSISTENT_KEYS`
  (`packages/evidence-repository/src/contracts.ts`), the storage policy (`docs/living-evidence-source-storage-policy.md`:
  raw article bodies prohibited; a short source quotation conditional, needed to audit the exact claim, with a locator;
  no substitute copies). Owner-library papers: the owner's own research only.

## What this build does

### 1. The card's later shape (`findings/card.ts`)

Each finding of `laterFindingSchema` may also give, all optional, in `later_inputs.findings_card` (the published tool
list stays as it is: `tests/fixtures/frozen-tool-lists` do not change):

- `backing` (0 to 3 lines): `{source, sentence, conclusion?, against}`. `source` is one of the finding's sources and a
  key source; `sentence` is the paper's sentence the finding rests on and `conclusion` the paper's own conclusion, each
  copied whole and exactly, at most 300 characters; `against` is the strongest thing against the finding from that
  source, in the AI's words, at most 300 characters.
- `numbers[].source`: which of the finding's sources a figure comes from.
- `forum_signal`: what people report in the forum threads AskRigor's reader read for this research:
  `threads` (1 to 20 links), `people` (`better`, `no_change`, `worse`, `mixed`: people, not comments),
  `report_quality` (`detailed`, `measured`, `bare`: how many people gave the details, measured the change, wrote a bare
  one-liner), `mechanism?` (a way it could work, in the AI's words, at most 300 characters), `studies` (one of
  `corroborated`, `contradicted`, `support_not_located`, `outcome_mismatch`) and, with `outcome_mismatch` only,
  `studies_measured` (what the studies measured instead, at most 300 characters).
- `sources` may be empty in the later shape, for a finding that rests on the forum signal alone.

### 2. The final check (`research-finalization-gate.ts`, `findings/card-fields.ts`)

Exact checks only, each a card problem (the card isn't saved; the answer goes ahead, and the kept-for-review copy keeps
it): a backing line's source is one of the finding's sources and a key source; no two lines of a finding give the same
source and sentence; a figure's source is one of the finding's sources; each thread is a web link, not YouTube, given
once, and read here (a verified `forum_thread_read` receipt of this call signs its comparable link, the provenance the
final check already uses for forum threads); at least one person is counted; each quality count is at most the people
counted, and the detailed and bare one-liners together too; `studies_measured` comes with `outcome_mismatch` and only
then; `corroborated`, `contradicted` and `outcome_mismatch` cite a study among the finding's sources; `support_not_located`
needs a literature search of this call (so "No studies on this were found" rests on searches made here); and a finding
with no source gives a forum signal. Whether reports agree, whether a mechanism is plausible and whether studies measured
what the reports did are the AI's declarations, never a pattern match. `against`, `mechanism` and `studies_measured`
join the card's screened texts; the quotes don't (below).

Once the check passes, the backing lines are looked up with the source lines (`source-lines.ts`'s `lookUpSourceLines`,
the same receipts' handles and PMIDs), within the same 8-second wait. A text from the owner's library is a new kind,
`library_copy`, which, like the AI's `search_copy`, is never published. The finalization receipt then signs, beside each
finding's bases: `bl` (each backing line's quotes as found or not, and the kind of text), `bs` (the sections they were
found in) and `rd` (how each source was read, from this call's receipts: audited in full text, a search copy audited,
read in full, or the declared lower depth; and the audit's printed-figures check). Readers beside
`findingBasesFromReceipt`: `findingBackingFromReceipt`, `findingReadingFromReceipt`.

When a public card has a study finding with no backing, or forum threads were read and no finding gives a forum
signal, one note tells the AI about the fields (the tool list is fixed, so results name new inputs).

### 3. The save (`findings/service.ts`)

A stored finding gains `backing` (only quotes found word for word in a full text AskRigor fetched itself or a PubMed
abstract; a line with neither quote found is left out; a quote that fails `screenFindingsText` is left out, never
rejecting the card), `source_reading`, `numbers[].source` and `forum_signal`. Nothing is added for a receipt that signs
none of them (an older check). The forum signal is stored with the communities its threads belong to and how many were
read, never the links (decision 5 below). `withoutYouTubeData` treats the new texts as every other card text. The issue
body shows the new fields; the review's stored-record schema reads them. `stored_without` names what the stored card
leaves out of the checked one (`backing_quotes_not_kept`, `forum_thread_links`, and `youtube_comment_declarations`,
below), and the review checks the signed digest only of a card stored whole, with what the save adds set aside. A kept
copy of an unsaved card leaves thread links out too. Acceptance takes each figure without its source, since the
canonical Atlas's figures are strict.

### 4. Publication v3 (`atlas-publications.ts`, `atlas/publication.ts`)

`askrigor.atlas-publication.v3` = v2 + `backing`, `source_reading`, `numbers[].source`, `forum_signal` (its
`communities`, worked out from the thread links at the save: `r/<name>` on Reddit, the site's name elsewhere; how many
threads were read; and `threads`, the links, empty until decision 5's question is answered) and
`source_details[].retraction` (the retraction status the title lookup already reads through Crossref's update markers and
PubMed's publication types; a status no provider could read is left out). A publication is v3 only when its stored
finding carries one of the new fields, so nothing changes for older cards, and v1 and v2 rows have none of them. A
v3 finding may have no source when it carries a forum signal. Quotes, their sections and communities are provider text:
one that the hold check flags is left out rather than holding the finding. `against`, `mechanism` and
`studies_measured` are the AI's words and go through the hold check as every other published text. Should links be
published, a Reddit post goes as `https://www.reddit.com/comments/<id>/`, so a link never names a user or carries a
title slug, and another forum's link as read, without a fragment, session or tracking parameter, and never a person's
page. (Replaced by the review's first finding, below: communities and links are rebuilt from the verified read.)

### 5. The pages (`atlas/page-data.ts`, `atlas/pages.ts`)

After "The numbers", **"The research behind it"** (`#research`): one block per source, with its title and year linked,
a retraction or concern notice, how AskRigor read it ("Full text, methods audited by AskRigor", "Abstract only", ...)
and whether its printed figures match its own data, the paper's sentence and conclusion in quotation blocks marked
"Found word for word in the full text AskRigor fetched (Results)", and "The strongest thing against it (AskRigor's
words)". Each figure in "The numbers" says which study it comes from. Beside it, **"What people report"** (`#people`):
the communities and how many threads AskRigor's reader read (the threads as links once decision 5 allows), how many
people reported better, no change, worse or mixed, how good the reports are, the mechanism labelled as one, and the
relationship to studies in plain words:
- `support_not_located`: "No studies on this were found in the searches made for this research.";
- `outcome_mismatch`: what the studies measured instead, and that they don't count against these reports;
- `contradicted`: studies that measured it the way these reports did found otherwise;
- `corroborated`: studies agree with these reports.
Nothing of this shows for a v1 or v2 row. An accepted or edited finding shows it from its publication's published fields,
which an erasure of its F number's wording erases too (`reconcileCardPublications`). Atlas search reads both blocks'
texts as the page shows them (fields `research` and `people`).

### What never appears on a public page
Anything drawn from YouTube comments (owner answers 208b and 227); usernames or any verbatim forum or comment text
(a thread shows by its community, never its title, and for now never its link: decision 5); the person's answer or
question text, plain answer, research target, receipts, account or thread keys, user observations; quotes not found
word for word, from a search or library copy, naming YouTube, longer than 300 characters or more than three a finding;
audit domain prose; prohibited key names.

## Decisions taken while building, against the design notes

1. **Main taken in first.** The design was mapped on main; the Atlas stack had not taken in #398, so `laterFindingSchema`
   and the source line didn't exist on it. Merged `origin/main` (`bf3581aa`) into this branch; three conflicts (the
   unreviewed status line, both sides' publication tests, the regenerated check-report vocabulary); the full suite
   passed before any change here.
2. **No canonical migration.** The design copied backing into `atlasVersionContentSchema` with a new nullable column on
   `atlas_finding_versions`. An accepted or edited publication already keeps its published fields, and they are erased
   with its F number's wording, so its page shows the research behind it from them, with no change to the canonical
   Atlas, its append-only guards or its erasure function. A paid private card's accepted finding keeps v1's fields
   (decided drafts, as in the 2 November plan), so it shows none: copying the research into canonical versions is left
   for a later build. If that build needs a migration, it is `0028` on this branch, renumbered when the stack next takes
   in main (main's last is `0024`; this stack's are `0025` to `0027`).
3. **The forum signal is its own field.** A forum thread isn't a source identifier (cards cite DOIs, PMIDs, PMCIDs and
   NCT ids), so the threads live in `forum_signal`, checked against `forum_thread_read` receipts, and communities are
   worked out from the verified reads rather than declared (the review's first finding, below).
4. **No thread titles.** A thread's title is a forum user's words, so it never shows.
5. **No thread links yet.** The design shows the threads as links. The free contributor notice people accepted
   (version 4) says a findings card holds "what public online communities reported, summarized without their posts,
   names, links or video IDs", and the privacy page says the same ("without posts, commenter names, links or video
   IDs"). So the final check still verifies every thread against its receipt, but the save keeps only the communities
   (not commenter names) and how many threads were read, and neither the library, a kept copy nor the pages hold a
   link. The publication and the pages can carry links (`forum_signal.threads`, tested), so allowing them is a small
   change once the owner approves wording: a notice version 5, which every free account accepts again, and the
   privacy page's sentence.
6. **The review's digest check, and a fix for #398.** The owner's review reads a stored card whole only when it gives
   the digest the final check signed. A card whose findings declared `draws_on_youtube_comments` was stored without the
   declaration and no `stored_without` entry, so the review would have read every such card as tampered; the save now
   names `youtube_comment_declarations`. The new fields follow the same rule.
7. **4a's community sentence stays unbuilt.** The forum signal is AskRigor's counts and words about threads its own
   reader read, not the community-written sentence of the phase 3 design's section 7.

## Owner questions, answered the same day: 253a, 254a, 255a

The owner answered "253a 254a 255a" (5 November), and left the old commit `1e2f1b7d` as it is (256a). Built on this
branch:

- **253a, thread links.** Free contributor notice version 5 (`free-contributor-v5-2026-11-05`), with the second sentence
  as drafted: "... and what public online communities reported, summarized without their posts or names: the
  communities, counts of what people reported, and links to the forum threads AskRigor read, never YouTube comments or
  video IDs." Every free account accepts it again, as for earlier versions (migration `0028_research_use_notice_v5`, the
  v5 hold and restore scripts, `npm run contributor-access:notice-v5-rollback-acceptance`); the privacy page's and the
  terms' matching sentences say the same, and their exclusion of links now names YouTube links. The save keeps each
  thread's link as the Atlas publishes it (a Reddit post by its id; never a person's page, a session or tracking
  parameter, or a link holding contact details) only for a free contributor on version 5 or a paid private user's yes to
  the save; an account still on version 4 gets none. Each link was verified against its `forum_thread_read` receipt at
  the final check. Kept copies of unsaved cards still hold no link. Decision 5 above is replaced.
- **254a, forum reading as a verified basis.** `forum_read` joins the verified bases (139c's other four stay as they
  are): a finding whose forum signal names threads read here, by their verified receipts. It counts in the paid save's
  offer ("2 forum threads read in full"), the beyond-quick-answer label and the free reminder to file the map; the
  Atlas's bases admit it (migration 0029 widens the checks on `atlas_finding_versions` and `held_youtube_findings`); and
  the owner's acceptance makes such a finding a finding, not a lead. A finding resting on its forum signal alone, with no
  study source, is accepted (community state `forum_only`), where 4a refused one resting on YouTube comments.
- **255a, research for paid private cards' accepted findings.** Migration `0029_atlas_research_behind` adds the nullable
  `atlas_finding_versions.research` jsonb column; acceptance copies the research behind a finding into the version
  (`canonicalResearchOf`: what a v3 publication would show, with each figure's source by its place while the figures are
  the card's); a revision keeps it, dropping figures' sources when the figures change; the pages show an accepted
  finding's own research first, its publication's otherwise, with canonical sources' retraction status from
  `atlas_source_checks`; and decision 7's erasure removes it whole, from the version (`erase_atlas_wording()` and
  `atlas_redaction_permits()` redefined) and from the intents' payloads. Decision 2 above is replaced.

Both migrations are numbered after this stack's 0025 to 0027 and must be renumbered when the stack next takes in main
(main's last is 0024).

## The independent review of 5 November, after #416 merged

#416 merged into main (`f9106e51`, not deployed). An independent review found eight problems; the owner's coordinator
decided each, and branch `claude/atlas-review-fixes-20261105` fixes them before anything deploys.

1. **Usernames and titles on public pages; links from the AI's string.** A thread is published only from the verified
   parts of its read, never passed through from the AI's link (`forum-thread-links.ts`, which now also holds
   `comparableUrl` and `forumThreadDigest`). The `PERSON_PATH` word list is gone. A Reddit `forum_thread_read` receipt
   also signs the subreddit the reader returned (`c`, lower case; `u_` alone for a post on a person's profile, so no
   receipt names a user); the final check signs it again for each of the card's Reddit threads (`ft`, `"<finding>.<thread>:<subreddit>"`),
   and the save takes a Reddit thread's community (`r/<subreddit>`) and link (`https://www.reddit.com/comments/<id>/`,
   the post id from the thread's comparable link, which the receipt's digest verified) from those alone. A profile post
   counts, with no community and no link; so does a Reddit read whose receipt signed no subreddit (one from before).
   Another forum's community is its registrable host: the last two labels, or three under a country's second level
   (`example.co.uk`), a structural approximation of the public suffix list that never keeps a person's or a blog's
   subdomain (`janedoe.substack.com` is `substack.com`). Its link is kept only in a structural, id-only form at the root of
   its host, with nothing else in the path or query: phpBB `viewtopic.php?t=<id>`, vBulletin `showthread.php?t=<id>`,
   XenForo `/threads/<id>/` (the id taken from `/threads/<slug>.<id>/`) or Discourse `/t/<id>` (from `/t/<slug>/<id>`; a
   numeric slug is ambiguous and gets none). Any other page publishes no link and is counted only, which includes Earth
   Clinic's pages and a forum installed under a folder (`/forum/viewtopic.php`), for now. **A list of safe link forms per
   site is the owner's to approve later**; until then nothing else is linked. Thread titles, slugs and query values are
   never published. The shared schemas (`ATLAS_THREAD_LINK`, `ATLAS_THREAD_COMMUNITY`) refuse anything else in a stored
   card, a publication and an accepted version; a signal whose threads are all profile posts publishes no community.
2. **Tests** cover a wrong subreddit in the AI's link, `highlight=`, `;jsessionid=` and page parameters, the `u_` profile,
   XenForo, Discourse and Quora slugs, and a blog subdomain.
3. **Accepted forum-only findings got no page.** Decided drafts (`planCardPublication` with decisions, and
   `decidedPublicationDraft`, which the review's reconciliation uses for a paid private card or a card without a
   publication) now go through the same card-context path as every other publication, so they are version 3 when the
   stored finding carries the research behind it, and a forum-only finding gets its page.
4. **Sources the owner drops still showed.** Acceptance copies the research only for the accepted sources (`kept`, from
   `request.sources`), and a revision that keeps some sources drops the others' research (`researchKeeping`). An accepted
   finding's page shows only its canonical sources, from its version or its publication alike, each with its newest
   check's retraction status.
5. **Notice v5 locked out the owner's login and the harness.** `set_findings_save` with `findingsSave: false` works for
   any enrolled account whatever notice it accepted, since switching saving off publishes nothing; `true` still needs the
   current notice. The runbook says the owner accepts v5 right after the deploy, before any research or regression run,
   and that a dev account switches saving off before accepting it.
6. **A section cut split a character.** A section or label signed into a receipt is cut at whole characters
   (`receiptText`: at most the limit in UTF-16 units, never half of a character outside the Basic Multilingual Plane, an
   unpaired surrogate written as U+FFFD): the backing lines' sections, the source lines' sections and a study audit's
   impossible printed values. The lookups' second pass of `finalize_research` is guarded: a receipt that can't be issued
   with what the lookups found is made again without the backing lines' lookups, and otherwise the first pass stands.
7. **Forum-only findings on unchecked counts.** On Reddit, a finding's people may not exceed the sum over its threads of
   each thread's comments read (`n`, over every receipt for the thread, since a continuation signs its own part) plus one,
   its poster. **A forum page has no person bound**: its reader counts characters, not comments, so a signal with a page
   among its threads is not bounded. `support_not_located` now needs `forum_signal.search_query`, the query of a
   literature search passed here, compared with its receipt's query digest as `option_classes` does; the query is checked,
   never stored.
8. **For the release.** The storage policy says what the code keeps: at most three lines a finding, each one source's
   sentence and its conclusion. The runbook names the image-rollback hazard: an earlier image can't parse a version 3
   publication; its pages leave such a row out, but its publication store refuses it, withdrawn or not (a withdrawn row
   keeps its fields), and its review reads a card stored with the research behind it as unreadable, so a rollback after
   either exists needs a tolerant hotfix of the earlier image, with the rows withdrawn first if they must not show
   meanwhile. The review's digest read accepts both digest forms for a card saved
   since #398 whose findings' declarations were left out without a `stored_without` entry: as stored, and with
   `draws_on_youtube_comments: false` on every finding.

## The review of #417 (head `16477f6e`), 5 November

The independent review of #417 found eight more problems; the coordinator decided each, and the fixes are on
`claude/atlas-review-fixes-20261105`, merged into `claude/atlas-owner-page-20261105`.

1. **Backing lines matched by substring (serious).** `source-lines.ts`'s finder looked a quote up with `indexOf`, so
   "decrease significantly after 12 weeks" was found in "Pain scores did not decrease significantly after 12 weeks." and
   would have been published, negation gone, as the paper's own sentence. A quote is now found only where it starts and
   ends at a clause boundary of the text: its start or end; a line break or a block's start where they are the text's
   own; a sentence's end (Unicode `Sentence_Terminal`); a colon or a semicolon in any script (`:` `;` `：` `；` `؛` and
   the like, the full-width ones as NFKC makes them). Between the quote and the boundary may sit only white space,
   quotation marks and brackets, and a citation marker (numbers in brackets, or in superscript, which are bracketed in
   the text and the quote alike so a unit such as kg/m² still matches). A mark joining two Latin letters or digits
   (`12.5`, `1:2`, `e.g`) is no boundary, so a number is never cut short. A PDF's page text marks its blocks `wraps`:
   its line breaks and page starts wrap sentences, so they are no boundary there. Structural and the same in any script;
   no word list. The matcher serves both the source lines of the answer (owner answer 237a) and the backing lines, the
   only places a match decides what a paper says (`quoteShown` decides only what the answer shows). #413's source-line
   build carries its own copy of the finder, which takes this rule when the stacks meet. Its limit: a citation printed
   as a bare number (a superscript the extractor flattened, "weeks 12.") is not passed over, so such a quote is not
   found, the safe direction. The earlier known limit (substring matching, live since #411) is closed.
2. **The rollback note missed the Atlas intents (serious).** The runbook now names them: an accept or revise intent
   carries `content.research`, a forum-only one `verifiedBases: ["forum_read"]`, and the earlier image parses every
   intent strictly where its review lists them and where promotion prepares one. Its read-only check counts v3
   publications, such intents and versions resting on `forum_read`; the tolerant hotfix covers all three kinds of row.
   The PostgreSQL acceptance runs the three queries.
3. **Forum-only counts.** (a) A forum page is now bounded too: its reader counts no posts and signs none, so a page
   holds at most one person for each 20 characters its reader read of it (`FORUM_PAGE_CHARACTERS_PER_PERSON`; the
   reader keeps at most 60,000 characters of a page, so 3,000 people a page), and a signal with a page among its threads
   keeps its Reddit part bound. (b) Each thread counts once: a Reddit read with `more` signs which part it continues
   (`m`), a forum page's read the page it read (`w`); the final check takes the largest first read and each continuation
   or page once, so reading a 10-comment thread three times holds 11 people, not 31.
4. **Links and names.** A forum is named, and its thread linked, only for a thread in one of the four id-only forms at
   the forum's registrable host or `www.` and it; any other page, a subdomain's (`janedoe.forumhost.example`), a
   personal domain's (`www.janedoe.com`, `jane.doe.name`, `janedoe.id.au`) or Earth Clinic's for now, counts under the
   generic "another website", with no name and no link. **A list of named sites is the owner's to approve later.**
5. **Wrong links.** Only Reddit's own prefixes (`www`, `old`, `new`, `m`, `np`, `amp`) are set aside: any other site's
   host is kept as read, so a link never points at another host than the one read. A link keeps the scheme it was read
   with, and one with another port is counted only. A read the reader was sent on from (a bare host to its `www.`)
   signs the link it was given too (`ur`), so a card may cite either.
6. **The digest read.** The stored record's schema takes a finding's `draws_on_youtube_comments`, and the review tries
   the stored form exactly as stored first, then every kept finding declared false, then none declaring. A stored finding
   declared true is treated as drawn from YouTube comments: never published.
7. **`search_query` kept.** The unsaved card's kept copy now leaves it out, as the privacy map says.
8. **Punycode communities.** The pages and the owner's review show a forum's host in its Unicode form
   (`xn--e1afmkfd.xn--p1ai` as `пример.рф`), escaped as every text; its link keeps the host as read.

## The recheck of #417 (head `06b96b14`), 5 November

The independent recheck of the fixes above found the clause matcher a second failure of the same class as substring
matching (a rule about where a quote may start and end, patched with exceptions), and eight smaller problems. The
coordinator decided each; the fixes are on `claude/atlas-review-fixes-20261105`, merged into
`claude/atlas-owner-page-20261105`.

**A. The quote matcher's mechanism.**

1. *HTML laid out as a browser lays it out* (withdrawn for the stored text by the review below, which keeps the old
   layout and has the lookup run its lines on). `extractHtmlText` broke a line at `<b>` and `<strong>`, so "Pain scores
   did <b>not</b> decrease significantly after 12 weeks." became three lines and "decrease significantly after 12
   weeks." a whole line of its own. Inline elements (b, strong, i, em, span, a, sup, sub and the like) now stay inline
   and the source's own line breaks collapse to spaces; only block elements and `<br>` break a line, and `<pre>` keeps
   its own. A superscript of digits is printed in Unicode's superscripts (`<sup>4,5–7</sup>` as `⁴,⁵⁻⁷`, `m<sup>2</sup>`
   as `m²`), so a citation can be left out and a unit still matches. A PDF's wrapped lines stay as they were.
2. *Whole sentences, Unicode's.* A quote is found only when it covers one or more whole, consecutive sentences of one
   paragraph, the sentences of `Intl.Segmenter` with `granularity: "sentence"` (UAX #29) in one fixed locale with no
   tailoring. A paragraph is a block, or a run of blocks that wrap (a PDF's pages, and a plain text's lines, which may
   be wrapped where no paragraph ends); a block's own line breaks read as spaces. At the quote's ends may sit only white
   space, quotation marks and brackets, a list's mark (a bullet, or a dash before a space, never a minus sign) and,
   before the sentence's end, a citation marker: numbers in brackets or parentheses, a superscript run, or authors and a
   year in parentheses in exact, simple forms (`(Smith, 2020)`, `(Smith et al., 2020)`, `(Smith et al. 2020; Lee,
   2021)`, `(Smith & Jones 2019)`; anything else in the parentheses is the sentence's). Unicode's rules end a sentence
   inside "(Smith et al. 2020)", before the year, so what may follow a quote may run on to a later sentence's end a short
   way on (400 characters), within the paragraph; and an opening bracket they leave at a sentence's end ("group.[12]
   Next") opens the next one. No word list: a full stop between digits ("12.5") or before a small letter ("6 wk. but",
   "e.g. zinc", "vs. usual", "i.e. those", "et al. found") ends no sentence.
3. *Colons and semicolons are no boundary*, in any script (`:` `;` `：` `؛`): the quote must include the clause before
   them. A PubMed structured abstract is read section by section: its sections are kept beside the record in memory
   (`pubmedAbstractSections`, a `WeakMap`; the tool's output is unchanged), each a block under its label, as a label
   ("RESULTS:") is no part of a sentence.
4. *A script without sentence marks* (Thai) is one sentence a block: only the whole block is found.
5. Tests cover the HTML inline negation, the abbreviations, the colon (Latin and Chinese), Thai, decimals, a PDF's
   heading without a colon, citations at both ends, whole sentences in CJK, Arabic, Devanagari and Greek, and the
   earlier test that took a line break inside a block as a boundary now finds no part after it.
6. *What it can't see*, said in the code, the final-check document, the privacy map and the storage policy: a whole
   sentence can still be quoted out of its paragraph's context; a heading that runs into its paragraph, as a PDF's do,
   is part of its first sentence, so that sentence alone isn't found (the safe direction); a full stop before a capital
   letter ends a sentence by Unicode's rules, an abbreviation's included ("vs. Group B", "e.g. Zinc"), so a sentence
   after such an abbreviation can be found on its own; and a `<br>` inside a sentence ends its line, as the page breaks
   it. #413's build carries its own copy of the old finder, which takes this mechanism when the stacks meet.

**B. Eight smaller problems.**

1. *`ur` vouched for unread links and counted twice.* A read signs `ur` only when the link it was given and the link it
   read are the same thread (path and parameters) at the same registrable host (`sameThreadAtSite`). The final check
   counts it under that one thread: the read threads are the `u` digests, an `ur` finds its `u`, and a card giving both
   links gives one thread twice, its people held once.
2. *Comparisons broke on www.* `comparableUrl` treats a `www.` host and the bare one as one, everywhere; only the
   published link keeps the host exactly as read. Reddit keeps its own prefixes set aside, and any other part of a
   host is kept.
3. *The rollback note missed re-check intents*, whose `verifiedBases` sit at the payload's top level: the runbook's
   query has `OR payload_json -> 'verifiedBases' ? 'forum_read'`. The PostgreSQL acceptance now counts the accept
   intents, adds a re-check intent resting on `forum_read` and counts exactly one more, and counts the version 3
   publications before and after two are published and withdrawn (two more, withdrawn included).
4. *Forum pages counted by their link's variants.* A page's `w` is the digest of its thread's comparable link and the
   page that link picks (`start`, `page`, `pg`, `offset`, `/page-N`), so another tracking parameter, `http`, a
   trailing slash or `www` reads as the same page; a link to a post picks no page of its own (the safe direction).
5. *An `http://` link came from the AI's string.* A forum page's read signs its id-only link as read (`l`, always
   `https`, as the reader reads only `https`); the final check signs `fl`, the places of the card's forum pages whose
   link, as the card gives it, is that one; the save stores a forum page's link only there. Any other page is named
   and counted, not linked.
6. *The privacy map said a personal domain counts as "another website"*, while `https://janedoe.com/threads/12/` is
   named `janedoe.com` with a link. The map now says what the code does: the rule is on the link's form, so a site at
   the root of a forum-software form is named by its domain, the forum's name, whoever runs it; that is its limit.
7. *Look-alike hosts.* A punycode host shows in Unicode only when all its letters are in one of the scripts UAX #31
   recommends for identifiers, the same one across its labels (by the Script property); otherwise as read. That is
   stricter than one script a label: it also keeps `аррӏе.com` (a Cyrillic label before `.com`) in punycode, at the
   cost of showing a one-script label under a Latin top level (`ελληνικά.gr`) in punycode too.
8. *The digest read* tries the stored form, then each per-finding combination of `false` and no declaration (at most 32
   for five findings). A stored `true` is still never published.

Kept as sound: the 20 characters a person on a forum page; Reddit counted once; the naming rules; ports counted
only; `true` never published; the unsaved copy; the punycode display apart from item 7.

## The review of the recheck's fixes (head `d7f75505`), 5 November

Part B and the fragments, citations and abstract sections of Part A held. A1 didn't: one HTML extraction feeds three
consumers, full-text admission, the paywall labels and the quote lookup, and the browser-like layout made for the lookup
changed the other two. A paywalled landing page (a section menu in `<option>`s, a teaser and
`<p><strong>Subscription required</strong> to read the full article.</p>`) went from abstract-only and paywalled to
`PARTIAL_TEXT_READABLE`, which `open-full-text.ts` takes as a public basis for the owner's library copy under
`public_only`, a policy boundary; a table naming sections in `<td>` cells went from partial to full; and a full text
with run-in bold headings (`<p><b>Methods</b> …`) went from full to partial. So the consumers are decoupled:

- **(a) The stored text keeps its old line layout**, as at `06b96b14`: block tags, and `strong` and `b`, break lines,
  the source's own line breaks stay, and any other tag reads as a space. Kept from the fixes: the CodeQL-safe
  stripping (removal until nothing changes, then a `<` that opens a tag dropped) and a superscript's digits in Unicode's
  superscripts, which changes no line. A tag now needs a tag's start (`<` and a letter, `</` and a letter, `<!` or `<?`),
  so "(p<0.05) and function rose (q>0.1)" keeps its words, in the text and the title.
- **(b) The lookup runs an HTML page's or a plain text's lines on within a section**, as it runs a PDF's pages on, so
  the layout's line breaks are never sentence ends: `<p>Pain scores did <b>not</b> decrease …</p>` and a `<br>` in a
  sentence refuse the fragment. A heading the index takes into the section path starts its section afresh, so
  `<p><strong>Conclusions:</strong> Vitamin D reduced falls …</p>` finds the sentence alone. A JATS paper's blocks stay
  their own paragraphs.
- **(c) A section's label at a line's start** ("Conclusions: Vitamin D …", one line in a PDF or a plain text) starts a
  sentence after its colon, when the label is one `sectionKind` knows (the list admission reads headings by) and the
  label starts a sentence: "We could not confirm the earlier report: vitamin D …" has no label, and a label a line break
  cut out of a sentence ("…the earlier\nresults: …") is none.
- **(d) Abbreviations before a capital.** After Unicode's segmentation, a sentence runs on into the next when its last
  word ends in "." and has a full stop inside it (e.g., i.e., z.B., U.S., т.е.) or is one to three small letters (al.,
  wk., yr., vs., cf., ca.), so "No probiotic tested, e.g. Lactobacillus rhamnosus GG reduced diarrhoea in children."
  refuses the part from "Lactobacillus". Structural, by the word's form, and the safe direction: it can only make a
  quote longer or refuse it. Its cost: a sentence after one that truly ends in a short word ("twice a day.") is found
  only with it.
- **(e) Forum-page links.** A read signs a link to publish (`l`) only when the link it read is already in an id-only
  form, so the published link is the one fetched: a page read at `/t/events/2024` is named and counted, never published
  as `/t/2024`. Reddit is as it was.
- **(f) Limits**, in the code and the documents, each refusing a part: Thai, Lao and Tibetan have no sentence marks
  Unicode's rules end at; a Greek question mark is the semicolon once a text is in NFC (U+037E is U+003B), where they end
  none.

The reviewer's three pages are admission tests, each with the state the old layout gave it; they pass against
`06b96b14`'s extractor and fail against `d7f75505`'s.

## The last structural round on the quote matcher (head `00c84e17`), 5 November

The recheck confirmed admission and the paywall labels back to `06b96b14`'s behaviour (`textBlocks`, `htmlAccessState`
and `full-text-admission.ts` byte-identical), `runsOn` changing nothing stored or signed, and the label rule and `l`.
The matcher has needed fixes three times for the same class, so by AGENTS.md's recurring-class rule this round adds no
exception beyond four items, and the next build changes the mechanism (planned separately):

1. **Sloppy end tags.** `TAG` follows HTML's tokenizer: "<" and a letter is a tag, "</" and anything up to ">" goes (a
   bogus comment, "</ p>", "</ br>"), `<!` and `<?` up to ">" go, and "<" before anything else stays text ("p<0.05",
   "a < b"). `<p>Subscription required</ p>` keeps its paywall label.
2. **The abbreviation join** is narrowed to a word with a full stop inside it (e.g., i.e., z.B., U.S., т.е.). The case
   of one to three small letters refused common clinical sentences after one ending "twice a day.", "only in men.",
   "in all." or "10 mg.", to protect rarer ones like "vs. Group B"; "vs.", "incl.", "approx.", "St.", "Dr." and "et al."
   before a capital letter are known limits.
3. **Citation spacing.** The author-year and bracket citations take white space just inside the brackets and before a
   semicolon, so a citation linked in HTML or a JATS xref ("( Smith et al., 2020 )") is passed over as an unlinked one.
4. **The remaining limits**, said plainly in the code, `docs/final-check.md` and the privacy map's Atlas section: a JATS
   list after a lead-in that ends with a colon ("The drug did not:") is matched item by item; a word in a sentence that
   sits on a line of its own and is a section's name starts a new section; JATS superscript citations read as bare
   digits; an unknown subheading runs into the next sentence, as a table's or a list's item without a full stop does,
   so those sentences are refused; and the abbreviation limits of item 2.

## Merging the stack into main

Checked 5 November against today's `origin/main` (`bf3581aa`, #412): this branch already holds it, so a merge of main
into this branch is "already up to date", with no conflict, and one pull request from this branch to main would carry
#396, #397, #403, #405, #409 and this build together; the stacked draft pull requests would then be closed by hand. The
next build's branch (`claude/next-build-20261105`, `486fc5ce`), if it reaches main first, would conflict on
`atlas/pages-http.ts`, `atlas/pages.ts`, `check-report-vocabulary.ts` (regenerate it), `register-tools.ts`,
`research-finalization-gate.ts` and `source-lines.ts`.

## Tests

`tests/atlas-research-behind.test.ts`: card later shape and limits; the exact checks; the final check's lookups and
signed claims; source lines' library copies; the receipt's claims and what the save keeps of them; thread links and
communities; the save (quotes kept only when found in an eligible text, a quote failing the screen dropped, forum-only
findings saved, no thread link stored, the review reading a whole card against its digest and a hand-edited one as
tampered); publication v3 (projection, figures' sources, retraction, hold checks, the store); the pages (both blocks,
escaped, the plain relationship words, nothing for v2 rows, an accepted finding's from its publication). Also:
`findings-save.test.ts` (the tool looks backing up and signs it), `atlas-review-tool.test.ts` (acceptance takes each
figure alone), `findings-unsaved-card.test.ts` (no thread link in a kept copy), `held-youtube-findings.test.ts` and
`finalize-input-validation.test.ts` (updated), and the frozen tool lists unchanged.

The review's fixes: `atlas-research-behind.test.ts` (threads and communities from the verified read, the signed
subreddits and the person bound at the final check, the search query, an accepted forum-only finding's version 3 page, a
dropped retracted source, 𝛽 at the section limit, both digest forms), `atlas-review-tool.test.ts` (research only for the
accepted sources, at acceptance and at a revision), `research-use-notice-mcp.test.ts` (a dev account on v4 switches
saving off, and on only after accepting v5) and `atlas-publication.test.ts` (a decided draft in its card's context).
