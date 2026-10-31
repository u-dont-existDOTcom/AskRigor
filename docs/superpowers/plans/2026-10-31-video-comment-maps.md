# Video comment maps, rankings and leads: a long-range task

The owner, 31 Oct 2026, after the comment ratios of eleven videos: "i want to make this into a long-range task, saving
all our results to the atlas"; spare YouTube units go to it; the comments' other leads ("this helped a bit but what
REALLY helped was ..."); a map of a video's comments, so people see at a glance how helpful it was and the best leads,
without reading them; once mapped, a video is not checked again, only updated with its newest comments; and "a ranking
of youtube vids based on the comments ... that's what people really want". Also: a video's ratio is not its channel's,
which needs many of its videos audited. Then: "i see this as one of the highest value things askrigor can provide",
and a brainstorm of other uses (below).

Built under owner rule 148a where it changes no method; owner question 208 holds what changes how AskRigor uses
YouTube's data.

## What 31 Oct measured

- **The eleven videos** (`docs/youtube-channel-registry.md`): up to 400 comments each, chosen by hash without regard to
  what they say, read by Codex and counted in code. Foster's vertigo video: 145 of 400 sampled people did the
  manoeuvre and said what happened; 109 better (95% interval 68% to 82% of those who tried), 14 worse.
- **What a map costs in YouTube units:** reading all 4,593 of Foster's comments took 32 thread pages and 480 reply
  pages, 512 units. A search costs 100.
- **What AskRigor uses:** the day's allowance is 110,000 units and 200 searches (the 23 Oct grant). The Cloud console's
  quota page shows the exact daily use, but only the owner's login opens it (the laptop browser's Google account has no
  access to the project). The heaviest day on record, 30 Oct's regression run, asked for 254 searches (200 were served,
  the rest refused from 18:20 UTC) and read 14,129 comment records in 7,403 pages: about 20,000 units of searches and
  7,400 of comments. So even that day left about 80,000 units unused; searches are the limit, and comment reading
  barely touches the units.
- **The real limit is reading the comments.** A model has to judge each comment's meaning. Model API spend is zero
  (the authority policy), so the reader is Codex on the owner's ChatGPT plan, as on 31 Oct, or the user's own AI in an
  answer. The Gemini key is on prepaid billing (owner question 38), so it isn't used.

## The map of one video

What one map shows, all counted in code from the model's reading of each comment:

- **Who tried it:** of the sample (its size, the corpus's size, how it was chosen, and the dates it covers), how many
  people said they did the video's method and what happened.
- **How it went for them:** better, no change, worse and mixed, with the 95% interval of the better share, so a small
  sample shows as uncertain.
- **How long it lasted:** for the better reports, immediate, days, weeks, months or years, or not stated. Most are
  immediate or undated; reports that lasted months or years are shown apart.
- **The harms:** the "worse" reports grouped into a few kinds with their counts (Foster: symptoms brought on during the
  manoeuvre; Bob & Brad: arm pain from chin tucks), which is often the most useful part: what to watch for, and when to
  stop.
- **What else helped:** the other methods commenters credit, ranked by how many people said each helped, with how many
  said it helped more than the video's method or after it failed. These are leads, not verdicts.
- **What it can't show:** commenters are not a random group of the people who tried it (happy people may comment more,
  or angry ones), deleted and held comments are invisible, and most reports are of the first days.

The first eleven maps are being made from the 31 Oct samples (`leads-prompt.md` and `map.py` in the job folder
`/home/joel/askrigor-releases/channel-discovery-20261031`), to show the owner before anything is built.

## Rankings

- **Within one problem only:** videos for positional vertigo ranked against each other, never against videos for
  constipation.
- **Enough reports to rank:** at least 20 people who said they tried the method; fewer and the video is listed as
  "too few reports".
- **The order:** by the low end of the better share's 95% interval, so a video with 40 of 50 better ranks above one
  with 4 of 5. Each row shows the number who tried, the worse share and its kinds, and the reports that lasted months
  or years. A second list shows the videos with the most "worse" reports, as a warning.
- **The words:** "people who commented and said they tried it", never "success rate".
- **Channels:** never ranked from one video. A channel's profile needs at least five of its videos mapped, says how
  many, and shows the spread across them.

## Leads

- **Today:** HRP's forum module says to pass the methods comments name to the scout as `rediscovery_leads`
  (`project/FORUM_SIGNAL_MODULE.md`, step 3), and the scout takes them (`gemini-youtube-scout.ts`). In #387's run only
  1 of 44 scout calls passed any, so the loop barely runs, the same failure as the studies loop in AskRigor#390.
- **From the maps:** each map's leads list, merged across a problem's videos, is the list of methods to search in
  studies (the loop, plan item 7 of `2026-10-30-next-build-after-387.md`) and to scout for more videos.

## The Atlas store

- **What is kept:** one map per video, keyed by its video ID: the counts, the lead and harm-kind names in AskRigor's own
  words, how the sample was chosen and its size, the corpus size, and the newest comment date read. Never comment text,
  commenter names or keys, or comment IDs.
- **Where:** a private store beside the held YouTube findings (owner answers 173 and 175: kept with no deletion date,
  never published, deleted at once if YouTube asks, by the same delete-all action). Not on the public Atlas pages.
- **Reuse:** when an answer audits a mapped video, the audit's result gives the stored map and its date, and reads only
  comments newer than it (YouTube lists comments newest first, so the read stops at that date). The newer comments are
  a second stratum with their own counts, until enough of them warrant a new map.
- **How maps get there:** the program's maps are filed the way Atlas lanes are, by `submit_research_contribution` under
  a new proposal kind (a runtime enum value, not a tool-list change, owner rule 189a), and accepted with the owner's
  review login. Maps written by a user's AI inside an answer stay in that answer: their quality varies and nothing
  checks them.

## Spending the spare units

- **A daily meter:** the server counts its YouTube units per UTC day (no user data); the same count gives 206a's fair
  daily share of searches per account.
- **The program's share:** at most 50,000 units a day, never a search. It finds videos through the registry channels'
  upload lists (`playlistItems`, 1 unit per 50 videos), video IDs from the scout and web search, and videos people have
  asked about; it stops for the day when the meter passes 80,000 units.
- **Order:** videos people asked about first, then the registry's categories, most-viewed first.

## Owner question 208 (YouTube)

The grant covers the use case in the application: public data read when a user asks, shown in that user's chat. A
map shown in an answer, and kept privately for reuse, is within it and within the owner's 25 Oct ruling. Two parts are
not:

- **Auditing videos nobody asked about**, with spare units: YouTube's grant says a changed use case needs a new quota
  request, and the owner sees the grant as probation.
- **Public maps and rankings**, or any page outside a user's chat.

The question offers to write to YouTube first (the owner approves the exact words), with the background audits
starting when YouTube agrees, and meanwhile maps made only when someone asks.

## Forum depth (the owner, 31 Oct)

"a lot of times it's giving me like a couple reddit posts checked ... and it only checks a couple comments on them
also. if it's because there aren't many posts on the topic it should say that". In #387's regression run:

- 69 of 109 answers had Reddit threads in their search results; 29 opened any thread, and 24 of those opened just one.
- 35 Reddit threads were opened in all. 24 came back whole (258 to 2,286 lines each), and 11 came back as an error
  page.
- Other forums: 15 pages in 12 runs.
- No answer said how many threads it found, opened or read, or why it stopped.

So it isn't slow: one open returns the whole thread. The runs stop after one. HRP already says to keep reading until
more threads are unlikely to change the direction (`SearchSaturationAndStopping`) and to state the threads screened.
The runs ignore that, as they ignore the studies loop (AskRigor#390). A third rule of the same kind would fail the same
way, so the fix goes where AskRigor sees the answer:

- **The final check counts** the distinct forum threads the answer cites, an exact count of their links. When the
  community evidence rests on fewer than five threads, or on one platform, a note asks for more threads until they stop
  changing the picture, and asks the answer to say how many it found and opened and why it stopped: few posts exist,
  pages wouldn't open, or the time ran out. The note doesn't block (owner answer 195a).
- **The community tools' results** (scout, survey and audits) carry the same reminder, with the loop's.
- **HRP, outside the core:** the forum module gets one depth sentence for threads. It says to open each relevant
  thread the searches find, read every comment, try another forum when a page won't open, and say so in the answer.
- **Reddit's own API is no shortcut:** it reportedly needs Reddit's approval, and a contract for commercial use
  (Responsible Builder Policy; third-party reports, not checked against Reddit's pages). The AI's own reading, which
  works for about two in three threads, stays the route.

Regression cases: a question whose forum corpus is large, where an answer resting on one or two threads fails, and a
niche question, where the answer says that few posts exist.

## Other uses (brainstorm)

1. **"Is this video for me?"** Who it helped and who it didn't: the problem's subtype (posterior or horizontal canal
   BPPV), age, after surgery.
2. **Head-to-head:** two methods for one problem compared across their videos (Epley against Foster).
3. **Harm watch:** methods whose maps show a pattern of harm, carried into every answer about them as "stop if".
4. **Time to effect:** how fast people say it worked, which sets expectations and helps people tell "not yet" from "not
   working".
5. **Questions people keep asking:** the unanswered questions in a video's comments, which AskRigor can answer.
6. **Promises against reports:** a video's claims (`extract_youtube_video_claims`) set beside what commenters report
   and what studies show.
7. **Research gaps:** methods with many good reports and no trials become Atlas frontier entries, and candidates for
   people's own trials.
8. **Self-tests:** for a method with good reports, a structured personal trial (baseline, dose, how long, when to stop),
   from what commenters did and what studies say.
9. **Watchlists:** new uploads from registry channels mapped and sent like the daily news check.
10. **Durability over time:** maps refreshed months later catch people who come back with "update: still good" or "it
    came back".
11. **Every language:** comments in other languages are more reports; the reading works in any language.
12. **Creator feedback:** how a creator answers bad reports (replies, pinned corrections) as one of the registry's
    channel criteria.
