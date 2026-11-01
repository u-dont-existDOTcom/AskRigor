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
3. **The scout's lead refusal names each refused lead and what it matched** (as the target's refusal does since #389;
   a lead with a secret or contact detail is named by its position only).
4. **The judgment of the regression run on #389's build** (`docs/audits/2026-11-01-owner-regressions-389-judgment.md`):
   items 2, 3, 5 and 6 come from it.
5. **The plain-answer note stays when a claim isn't backed, and a forum thread can back one** (owner answer 210b): a claim
   that can't be shown as declared reads "This research did not check that.", and only a claim left out holds the note back. A
   forum thread this call declares it read can back a claim about what people report; the note names it as the AI's own reading.
6. **InfoAccess, one request at a time:** the server sends one request at a time to each endpoint, waits out a `busy` answer
   for at most 45 seconds, and keeps `busy` and `invalid_response` apart from other failures. `invalid_response` ends the search
   there, so it no longer holds back a lead or invites another try. Asked one at a time, 31 of the 73 papers that failed in the
   run came back; the list is on the owner's page.
7. **The forum note when nothing was read:** it asks for the reason (few threads, pages wouldn't open, time), and reports the
   user pasted no longer draw it.

## Next

- **Forum threads read by AskRigor itself (owner answer 211a, 1 Nov):** `2026-11-01-forum-reader.md`, after owner question 213.
- **Comment maps** (`2026-10-31-video-comment-maps.md`, owner answer 208b): the private store for maps; reuse in other
  answers, rankings from kept maps and the background audits after YouTube answers the email of 31 Oct. The channel
  registry's channel IDs re-checked through the API every 30 days (first by 29 Nov), and the 31 Oct job's comment-level
  files deleted by 30 Nov.
- **YouTube within its terms (owner answer 206a):** finding videos without YouTube's search, and a fair daily share of
  searches per account (the last two runs ran out of searches within 35 minutes).
- **Design questions from the judgments:** the scout's word lists (its refusals now quote the word), and the state
  carried across turns.
- **Then:** payments against the Stripe sandbox (local and test mode only), and the model check's next draft (198).
