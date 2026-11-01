# The build after #389

Branch `claude/next-build-20261031`, from main's merge of #389 (`ce7a664b`, live since 14:43 UTC on 31 Oct, owner
answer 209a). Built under owner rule 148a; a release needs the owner's explicit yes.

## Built

1. **#389's release record** (`docs/audits/2026-10-31-owner-answer-209a-production-release.md`).
2. **A passing check's caveats are only the sentences shown as written** (owner answer 205a): the regression run on
   #389's build found answers pasting every limit after the check, because the frozen schema calls `caveats`
   "Sentences the answer must contain, each as its own sentence and as written", the plugin skill says to copy them,
   and every passing result filled them with all its limits. Now a passing result's `caveats` hold only the mobile
   notice, the save offer, the correction-report question (78) and the community-skip sentence (125); the reference
   line leaves those out, and the paste note does not count them. No change to the tool list, the skill or any status.
   Codex updated the tests (177 assertions moved from `caveats` to `limits`, 17 split) and added
   `tests/finalize-caveats-as-written.test.ts`.

## Next

- **The regression run on #389's build** (started 14:46 UTC, saving off), judged against 193's signals, with the four
  new cases apart: forum threads per answer and why reading stopped, a niche topic that says few posts exist, one
  video's comment map, and the symptom combination of AskRigor#390.
- **Comment maps** (`2026-10-31-video-comment-maps.md`, owner answer 208b): the private store for maps; reuse in other
  answers, rankings from kept maps and the background audits after YouTube answers the email of 31 Oct. The channel
  registry's channel IDs re-checked through the API every 30 days (first by 29 Nov), and the 31 Oct job's comment-level
  files deleted by 30 Nov.
- **YouTube within its terms (owner answer 206a):** finding videos without YouTube's search, and a fair daily share of
  searches per account (the last two runs ran out of searches within 35 minutes).
- **Design questions from the judgments:** the scout's word lists (its refusals now quote the word), and the state
  carried across turns.
- **Then:** payments against the Stripe sandbox (local and test mode only), and the model check's next draft (198).
