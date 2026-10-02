# Free users see the paid features they're missing

Date: 2026-10-02. Status: **REQUIREMENT RECORDED; built with the first paid
feature free users can buy.**

## The owner's words

Owner, 2026-10-02, in the Claude Code session that released PR #246:

> I would like Free users to know that they are missing out on paid features
> whenever they are. So for Bright Data for example, for the free user it may
> say "Paid users can also check forum signal in Facebook, TikTok, Instagram."

## The requirement

- When a free contributor's research answer would have gained from a paid-only
  feature, the answer says so, in one line naming what the paid feature adds.
- The line appears only when it is true:
  - the paid feature is live for paid accounts;
  - a free user can actually buy paid access;
  - it would have helped this answer.

  Paid accounts never see it.
- It names only what the paid feature really covers.
- It sits at the end of the answer, with the deeper-research offers. It appears
  once per answer, in the answer's language.

## Design

The server already knows the account's mode (free contributor or paid private)
and the surface (`/mcp` for ChatGPT, `/mcp/claude` for Claude).
`finalize_research` already returns sentences the answer must carry, and checks
translated ones through `caveat_renderings` and `answer_language`.

- **The registry.** A small server-side list of paid features. Each entry has:
  - when it applies (for the Bright Data search: the answer offers deeper
    community research);
  - its note, per surface;
  - whether it is live for paid accounts;
  - whether paid access can be bought.
- **The note.** For a free account, `finalize_research` adds each applicable,
  live and purchasable entry's note to the sentences the answer must carry.
  The existing answer check then holds the answer to it, like the other
  server-written sentences.
- **Tests.** The note:
  - appears only for free accounts, only when its feature applies, and only
    when it is live and purchasable;
  - never appears for paid accounts;
  - passes in a translated answer.

## State today

No paid feature can be bought yet. Paid private access exists but has no price
or checkout (the 2026-09-01 entitlement plan deferred billing). The Bright Data
search isn't built. So no note shows yet, and none should: a note pointing to
something no one can buy would mislead.

## First note: the Bright Data community search

This goes live when paid users can buy the deeper community search (see
`docs/audits/2026-10-01-bright-data-source-evaluation.md`, "Owner decision").

Draft wording, matched to what the 2026-10-01 test reached:

- On ChatGPT: "Paid users can also check forum signal on TikTok, Facebook groups
  and X."
- On Claude, which can't read Reddit itself: "Paid users can also check forum
  signal on TikTok, Facebook groups, X and Reddit."

Instagram is left out because both tests returned no comments. Facebook pages
are left out because search couldn't reach them. A retest before launch can add
either one.

## Later candidates

- **Paid private mode,** once it can be bought. Free answers save their findings
  card automatically; paid users choose answer by answer. The note's wording
  goes to the owner when checkout exists.
- **The transcript backup,** if it stays paid-only (owner decision 16).
