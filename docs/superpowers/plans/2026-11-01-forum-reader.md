# AskRigor reads forum threads itself

Owner answers 211a and 213b, 1 November 2026. Being built on the branch `claude/forum-reader-20261101`, for a release the owner
says yes to. It changes the tool list once, with the changes that were waiting for that.

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

- **Two new tools,** so that release says the apps need one refresh: `read_forum_thread` (input `url`) and `search_reddit_threads` (input
  `query`), whose results give the numbers an answer needs: how many threads were found, and how many read.
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
months), and nothing goes to Reddit about it. AskRigor reads Reddit through a reader service on the owner's server (owner answer
213b, for all users): over SSH, on a key only production holds, one request at a time. On 1 November it read 33 of a
34-comment thread in 7 seconds, and each search returned up to 7 threads. It passes no bot check: if Reddit starts asking for one, or
the reader stops working, `read_forum_thread` says so, and Reddit stays with each AI's own search. Usernames never reach the
result: `person` is a per-thread key, so the AI counts people once.

## Order

1. Build (`read_forum_thread`, `search_reddit_threads`), with the changes in `docs/tool-list-changes-waiting.md`, so the apps refresh once.
2. The release prepares a key on the host and its known-hosts file, and the reader's side accepts that key (needs the owner).
3. Regression: the forum cases, counted by `tools/forum-depth.py`, against the median of 2.
