# Changes that wait for the next tool-list change

The tool list is fixed (owner answer 189a, 27 October 2026): only adding or removing a tool changes it, and that
release's record says the apps need one refresh. A fix that needs the published list itself waits here until then,
with what it would change and what holds meanwhile. Fixes that fit the later shapes, the runtime enums, results or the
protocol are made at once instead.

The forum-reader build included the unified `description_only` spelling, PMID/PMCID-only full-text acquisition, and
`caveats` wording and behavior under every check status.

| Waiting change | Why it needs the list | Meanwhile | Found |
|---|---|---|---|
| `finalize_research` `plain_answer_comparison[].sources`: drop "left out for a first-turn correction backed by the answer's own sentence". A first-turn correction now needs the same backing as a confirmation or qualification. | It is published text. | An unbacked correction reads "This research did not check that." in the note, and the result's step names what backs one. | The regression run on #394's build, `l32-negative-controls`, 3 November 2026 |
| `finalize_research` `key_sources`: say that a forum thread `read_forum_thread` read can be a key source by its link, where `id` now says "DOI, PMID or PMCID". | It is published text. | The sources check accepts such a thread by its verified `forum_thread_read` receipt, and its step names that receipt. | The regression run on #394's build, `r376-forum-500` and `r376-later-phase`, 3 November 2026 |
