# Forum case-matching and Reddit retrieval: owner research operations guide

**Status:** Operational reference / candidate, 2026-10-26. This is a development-side supplement, not canonical HRP, and it has not been mechanically enforced or deployed as a runtime policy. Canonical `protocols/HRP_Full.xml` and `project/FORUM_SIGNAL_MODULE.md` remain unchanged. For a universal lesson, check source and task applicability before promoting it; distinguish what each ChatGPT session can access from what a standalone AskRigor or Claude client can access.

## Origin and evidence

A study of purported near-zero calorie intake and sustained weight plateaus was diluted with cases describing only a few flat days after clear weight loss, calorie deficits mistaken for calorie intakes, and short postoperative scenarios. Native ChatGPT web search opened Reddit posts and threaded replies that Reddit sometimes refused through direct scraper access. A connected generic scraper recovered certain original posts but not all replies, while one advertised structured endpoint returned an unavailable-tool error. The prior multi-provider access comparison is `docs/audits/2026-10-04-reddit-access-test.md`.

The user requested a portable, reusable fallback and asked that only reports answering the exact research question appear in the primary findings. This guide is a bounded implementation reference for subsequent research and issue-linked regression work (issues #376, #377).

### Exact-target case admission before synthesis

Treat the user's outcome, exposure magnitude, and time horizon as a **joint inclusion condition** for the primary case cohort. The original question—not provider search ranking or the nearest available anecdote—defines what counts. Derive these axes semantically for each task; the numerical example below is a regression target, not a new universal threshold.

1. **Restate exact target as an evidence predicate.** In the under-500-calorie plateau example, its strict-core predicate is: the *same firsthand person* claims actual **total** intake at or below 500 kcal/day (not a 500-kcal deficit, per-meal calories, or selected days); the same period spans **months** rather than a few days; the scale or fat mass was reportedly stable **through that interval**; the report identifies the source and time sequence. Classify intake as self-reported or objectively measured without conflation.
2. **Screen each report BEFORE the model's answer or `finalize_research` declares a relevant no-effect episode.** Explicitly preserve the exact source passage(s), total intake vs deficit, start/end/duration, before-and-after measurements, cointerventions and known data gaps, and whether the case is strict-core, *adjacent*, *uncertain*, *counterexample*, or *excluded*. Where duration or total-intake scope is unknown, it is not strict-core merely because its title mentions both "500 calories" and "stall."
3. **Report only strict-core cases as answers to the strict question.** Useful adjacent cases—short postsurgical plateaus, weekday-only restrictions, 500–700 kcal/day, an initial 7.5-lb loss followed by three flat days, or secondhand screenshots—are not substitutes for a months-long case. Mention an adjacent case only if it resolves a particular mechanism or competing hypothesis the user is considering, clearly as adjacent evidence. Do not pad a requested list or claim broad absence from a thin sample.
4. **Rescue relevant reports, not mismatches.** A short or incomplete exact-exposure report can remain an evidence *lead*, but target mismatch is not repaired by certainty qualifiers, sample counts, user-visible boilerplate, or extra irrelevant platform searches. Revisit the same person's follow-ups before assigning a duration or outcome.
5. **Enforcement boundary.** This is a semantic admission rule; the author/reviewer must judge whether the report actually matches. Structured `community_searches.report_identity` counts and a passing provider receipt alone do *not* prove exact intake/duration/outcome alignment. A mechanical future check may validate source links, fields and literal passage coverage, but cannot replace this semantic judgment with ungrounded regexes.

### Reddit and independent forum retrieval fallback (capability checked)

This is the reusable access order for research with Reddit content. The OpenAI/ChatGPT native web search used successfully in the 2026-10-26 inquiry is **not itself an AskRigor MCP tool**; don't assume that every chat, model, Custom GPT, Claude, or AskRigor web client can call it. Historical route testing is recorded in `docs/audits/2026-10-04-reddit-access-test.md`.

- **First, discover candidate thread URLs and read them through the active session's native web search/open route when available.** Search indexing sometimes returns the original poster and nested replies when opening the exact reddit.com thread; this is the successful "other web retrieval route" observed in ChatGPT. Verify relevant quote, parent/reply relationship, follow-up and actual coverage from the returned text. A source citation or preview alone does not prove the complete comment tree was read. When `open` fails for one thread, do not treat Reddit globally as inaccessible; try another authorized retrieval route for *that URL*.
- **If direct Reddit access returns a login/bot challenge or truncated comments, conditionally use a connected Bright Data structured Reddit-post tool when the runtime actually advertises it** (tool absence is not an empty corpus). If absent or blocked, try a connected generic Bright Data webpage scraper; distinguish original-post-only text, human-verification page, and actually loaded replies. Compare obtained comment counts with visible metadata when possible. No purchased API, private account, or new paid route may be assumed or used without current authorization.
- **Use original-poster and reply coverage honestly.** Preserve for each attempt: requested thread URL, provider/tool, readable vs challenged/partial, number of visible root comments/replies read when discernible, whether it contains the particular relevant firsthand episode, and follow-up verification. A search snippet is discovery only; a scraped original post without comments is `OP_ONLY`; an indexed thread with some nested comments is `PARTIAL` unless complete access is proven. One verified passage supports a *bounded* case-level claim even if complete comment coverage fails; it does not authorize population prevalence.
- **Fallback result must be portable.** Save the successful route and exact capabilities in source evidence, not only an agent's memory. Prefer the native search/open route in ChatGPT when available, but do not claim portability to AskRigor's standalone product until implemented and tested on that surface. Failed alternatives remain candidates for future retry, not proof a forum case does not exist.

## Practical source-quality receipt

For each relevant claimed episode, record a small internal audit in this shape (do not save raw private user history):

- **Source URL + retrieval method actually used:** native ChatGPT web search/open, connected scraper, named public search provider, or other verified route
- **Access:** `FULL_THREAD` when original and available replies were actually examined; `PARTIAL_REPLIES` when some replies are missing; `OP_ONLY` when only the post is visible; `SNIPPET_ONLY`; or `BLOCKED`
- **Match:** `STRICT_CORE` / `ADJACENT` / `UNCERTAIN` / `COUNTEREXAMPLE` / `EXCLUDED`, with one explicit sentence mapping intake, time window and same-window weight outcome
- **Measurement:** exact observed or quoted self-reported intake, whether **total daily** vs deficit/one meal, daily continuity, how weight/body fat was assessed, and any intervening measured losses
- **Follow-up:** original author or commenter follow-up and contradictory evidence; record unknowns as unknowns
- **Synthesis:** case-level qualitative signal only; never a numerator for population prevalence unless sampling design supports that calculation

## Regression examples to replay in a research-answer test

1. Report says total daily intake ~500 kcal for over two months, weight and waist stable throughout; label `STRICT_CORE SELF-REPORT`, **not objectively verified**.
2. Report says 500 kcal **deficit** for several months, eating 1,500/day; label `EXCLUDED`.
3. Person claims 500 kcal/day for seven days, loses 7.5 lb, then stalls three days; label `EXCLUDED` from months-long nonresponse.
4. After bariatric surgery, reports 500/day for three weeks, flat scale while losing multiple inches; label `ADJACENT` for short-term scale/body-composition divergence, not proof of unchanged fat stores.
5. Person describes extreme restriction for years with a subset of days below 400 kcal, but no daily continuity record; label `ADJACENT` or `UNCERTAIN` for exact sub-500-every-day exposure.
6. A screenshot repost quotes an alleged three-month 300-400/day plateau; label `SECONDHAND`, not a unique firsthand case.
7. For a Reddit thread, native `open` fetches threaded comments while a separate direct scrape gets an anti-bot challenge; cite the bounded passage via the route that actually supplied it, without claiming entire Reddit or each surface is accessible.
8. For a partial page returning original-post-only text, **never** assert that nested comments were audited.

## Installation and authority

This is a discoverable operations guide in `docs/`, indexed by `docs/INDEX.md`. Its presence does not change the live protocol hashes, does not install a hard output admission gate, and must not be claimed to apply automatically outside a worker that retrieves it or a subsequently approved adapter release. In the public research module, vendor names must remain absent; use only capability-conditioned and provider-neutral language.
