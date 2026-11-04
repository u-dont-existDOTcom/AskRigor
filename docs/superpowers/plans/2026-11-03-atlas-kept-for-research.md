# Findings kept for AskRigor's research, not shown (owner answers 229a and 231a)

3 November 2026. Branch `claude/atlas-kept-for-research-20261103`, from main, so it can go out with the next
release instead of waiting for the people's-reports build (#409), which stacks on the four finding-page drafts the
owner's 232b keeps back.

## The owner's words

- 231a, typed in the next-build session on 3 Nov: "231a the atlas can have answers that askrigor can draw from btw
  that was also the point, to not -redo research that was already done, but the public facing display should not just
  be all the stored research, we want to give humans only what's high value they can't easily find elsewhere."
- 229a, earlier the same day, took 74 unchecked cards off the Atlas, and 231 proposed withdrawing 41 checked findings
  that failed the quick-answer test.

## The problem

AskRigor's research lookup (`apps/research-mcp/src/atlas/lookup-tool.ts`) reads what the pages show. An unpublished
card is out of it, and a withdrawal would take an accepted finding out for good. So the 74 were lost to AskRigor's own
research, and 231a as first written would have lost the 41 too.

## The state

- A publication can be kept for AskRigor's research only, with the owner's private reason (migration 0024: two
  columns on `atlas_publications`, `keep_atlas_publications` and `inspect_atlas_kept_publications` for the review
  role). Existing functions keep their shapes, since every migration runs on each start.
- Kept, it stays in the research lookup and keeps its page at its own address (the lookup's results need a page
  address). No list, topic, home page or search shows it; its page says why and is kept out of search engines.
- An unpublished card (unpublished by the owner, never accepted) comes back unreviewed and kept. A held, rejected,
  forgotten, set-aside or replaced publication can't be kept, so it stays out of the lookup as before.
- The review's runtime actions (owner answer 189a): `keep_for_research` (a P number, an F number for every
  publication naming it, or up to 100 in `later_inputs.items`, with `reason`), `show_on_pages`, and `list_kept`.

## After release

With the owner's words already given (229a for the 74, 231a for the 41), the review moves them:
`keep_for_research` with reason "owner answer 229a" for the 74 unpublished cards, and "owner answer 231a" for F-1001
to F-1021, F-1023 to F-1030, F-1032 to F-1034, F-1036, F-1037, F-1039, F-1042 to F-1045, F-1047 and F-1048.

## When it merges into the Atlas drafts

The drafts add the full-text search index, the findings map, the sitemap and the Health pages; each must leave kept
publications out too (they read through `listPublications`, which leaves them out unless asked), and the stack's
own migrations 0024 and 0025 become 0025 and 0026.
