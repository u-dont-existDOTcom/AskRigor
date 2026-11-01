# Changes that wait for the next tool-list change

The tool list is fixed (owner answer 189a, 27 October 2026): only adding or removing a tool changes it, and that
release's record says the apps need one refresh. A fix that needs the published list itself waits here until then,
with what it would change and what holds meanwhile. Fixes that fit the later shapes, the runtime enums, results or the
protocol are made at once instead.

| Waiting change | Why it needs the list | Meanwhile | Found |
|---|---|---|---|
| One spelling for a video known only from its title and description: `finalize_research` `named_target.described_from` says `video_description_only` where `unwatched_videos[].content_from` says `description_only`. | Both are published enums, and the app's copy of the schema refuses the other field's word before the call reaches AskRigor. | The step asking the two to agree names the matching pair; the app's refusal names the allowed values, and the next call passes. | 30 Oct rerun on #384's build, `l22-kelp-iodine` |
| `acquire_open_full_text` for a paper with only a PMID or PMCID. | The published schema requires `doi` with a DOI pattern, so the app refuses the call. | Since #384 a claim resting on such a paper is a stated limit, not a stop. | `o355-saffron-fluvoxamine`, 27, 28 and 29 to 30 Oct, and the 30 Oct rerun |
| `finalize_research`'s published words for `caveats`: "Sentences the answer must contain, each as its own sentence and as written", and "the caveat sentences for the answer" in its description. Under a check that has not passed, the result still fills `caveats` with limits it asks the answer to state in its own words. | Both are published text, and the plugin skill says to copy `caveats`. | Since the build after #389 a passing check's `caveats` hold only sentences the answer shows as written, so the words are true there; a check that hasn't passed still says two things. | The regression run on #389's build, 1 November 2026 |
