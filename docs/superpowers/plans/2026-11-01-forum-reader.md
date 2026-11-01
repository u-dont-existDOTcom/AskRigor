# AskRigor reads forum threads itself

Owner answer 211a, 1 November 2026. A plan for a later build, not built yet: the Reddit source is an open owner question,
and the tool list should change once.

## Why

The forum-depth note of #389 did not deepen forum reading. Over the regression run on #389's build
(`docs/audits/2026-11-01-owner-regressions-389-judgment.md`), the 77 runs that declared forum searches read a median of 2
threads (3 on #387's build, before the note); 10 read five or more in more than one community (11 before). The note came back
in 70 runs, and 12 read more threads after it. AskRigor can't steer what it doesn't see: the AI reads forums through its own
web search, and the only signal comes at the final check, when the answer is already written.

Access is a large part of it. Of the threads read, 61% were Reddit's (138 of 228). Pages that wouldn't open ended 37 community
searches on Reddit and 15 elsewhere, and 8 more elsewhere ended on a site refusing access.

## What a reader gives

- **Access** on surfaces whose own web tools can't open forum pages.
- **Steering at the moment of reading:** the result can say what's left to read, as the YouTube tools' results do.
- **Counts that are facts:** threads AskRigor read carry a receipt, so the final check and the answer's counts rest on them
  instead of a declaration, and the limit "Reports from this community come from my own web search" goes for those threads.

## Test of a plain request (1 November 2026, from the laptop, not the production host)

The run's 70 distinct non-Reddit forum threads on 31 sites, one request each with AskRigor's user agent, respecting robots.txt:

| Outcome | Threads |
|---|---:|
| Readable (status 200, no challenge, over 1,500 characters of text) | 43 |
| Off-limits by robots.txt | 5 |
| Blocked or challenged | 13 |
| Under 1,500 characters: mostly pages that need a browser to show their posts | 7 |
| Other failures | 2 |

The reader stops at every one of the middle three. It solves no challenge and uses no unlocking service.

## Design

- **A new tool, `read_forum_thread`,** flat input: `url`. It adds to the list, so that release says the apps need one refresh.
- It checks robots.txt under RFC 9309, then fetches through `fetchDiscoveredDocument` (public addresses only, byte and time
  limits) with AskRigor's user agent.
- It returns the page's visible text with block boundaries, its title, `next_page` when the page links a next one, and
  `access_state`: `read`, `robots_disallowed`, `blocked`, `needs_a_browser`, `not_found` or `unavailable`. One page per call.
- Text is untrusted data and is returned, not stored. Only the URL goes to the forum: no question, account or health detail.
  The privacy data map gets its row in the same change.
- A `read` page earns a `forum_thread_read` receipt, signing the thread's comparable URL. `community_searches[].threads_read`
  declares what it did already, so no declaration is added (owner answer 195a), and a receipt only removes a limit.
- The result's text says what to do next: read each relevant thread to its end, then say how many were found and read and why
  reading stopped (HRP `SearchSaturationAndStopping`).

## Reddit

Reddit's own API is out (question 33, 4 October; the owner again on 1 November: approval is hard, and the API lags by six
months), and nothing goes to Reddit. Reddit threads stay with each AI's own search unless owner question 213 gives another
source. The tool's fields don't depend on which source it is.

## Order

1. Owner question 213.
2. Build on a branch of its own, with the changes in `docs/tool-list-changes-waiting.md`, so the apps refresh once.
3. Regression: the forum cases, counted by `tools/forum-depth.py`, against the median of 2.
