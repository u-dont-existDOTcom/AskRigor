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
page.

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
   worked out from the links rather than declared.
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
