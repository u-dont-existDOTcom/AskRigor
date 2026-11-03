# The Atlas and YouTube videos: what can be public without YouTube's approval (2 Nov 2026)

The owner, 2 Nov 2026, about 23:12 UTC: "where is my youtube map in the atlas?" The maps are not there, by owner answer
208b (31 Oct): "send the email to youtube and meanwhile you can save everything privately ... later if they approve then
we can make it public. meanwhile we can see if there is anything we can make public that wouldn't require approval".
The list of what might be public without approval is in `2026-10-31-video-comment-maps.md` ("Public without
approval"); none of it may be drawn from comments. This record says what was built, what the rules and the stored data
don't support, and the owner question that decides the rest.

## Built: how comment maps work (item 1)

- `/atlas/comment-maps` (`apps/research-mcp/src/atlas/comment-maps-page.ts`): fixed text. What a map shows (who tried
  the video's method, how it went, how long it lasted, harms, what else commenters credit), how it is made (comments
  read only through YouTube's API; a sample chosen by a hash of each comment's ID, without regard to what it says;
  promotion and jokes left out first; a model reads each comment; code counts, each person once), what it can't show
  (a success rate, comments no one can see, whether it lasts, who it suits, a channel's quality, proof), how videos are
  compared, and where a map can be seen today: in a person's own research answer, which AskRigor doesn't publish.
- It says the maps aren't in the Atlas: until YouTube answers, the maps made so far are kept privately for AskRigor's
  owner, and AskRigor will delete them if YouTube asks.
- It reads nothing (from the database or YouTube) and shows no map, count, video, channel or link to YouTube; the page
  guard passes it unchanged. Its only numbers are the method's own (the question's date, the 95% range, the 20 people
  needed to rank a video).
- The Atlas home has a short "Comment maps" section linking to it. The home keeps its existing guard: no "YouTube",
  model, chat or account on pages built from findings, so the home section says the maps are "kept privately for now"
  and the page itself names YouTube.
- YouTube's Branding Guidelines say not to "incorporate YouTube trademarks into your own names for products, services,
  features, or companies", so the feature is "comment maps", never "YouTube comment maps", on public pages.
- Tests: `tests/atlas-comment-maps-page.test.ts`. Privacy: `docs/privacy-data-map.md` (Atlas pages); the privacy page is
  unchanged, since nothing new is collected, kept or shown.
- Preview (local server, invented data, 2 Nov): `2026-11-02-atlas-comment-maps-page.jpg`, light at 820 px. Checked in a
  browser as well: dark mode, a 375 px phone width with no sideways scrolling, and the home page's section.

## The rules read (2 Nov 2026)

- **YouTube API Services Developer Policies** (page last updated 2026-11-01; licensed CC BY 4.0), III.E.4.d: "API
  Clients may temporarily store limited amounts of Non-Authorized Data for as long as is necessary for the purposes of
  the API Client but not longer than 30 calendar days." After that, delete or refresh. III.E.4.h: an API client must not
  "access or use API Data to create new or derived data or metrics", and data not from YouTube shown beside API Data
  needs "a clear and prominent disclosure". Data Aggregation: "Do not aggregate API Data except that you may only
  aggregate API Data relating to YouTube channels that are under the same content owner". III.F.2.a: a page that
  displays YouTube content, "channels" included, must show YouTube Brand Features as the Branding Guidelines say.
- **The quota grant of 23 Oct:** "This quota has only been granted for the use case mentioned in your application",
  and a changed use case needs a new quota request.
- **What AskRigor told YouTube:** on 25 Oct, that it stores no YouTube API Data beyond III.E.4's temporary storage, and
  that its use is unchanged: data "shown as a research report in the user's own chat"; on 31 Oct, that the counts of a
  comment map "would appear only in users' research answers, never on public pages". So a yes to the 31 Oct email would
  still not cover maps in the Atlas: that would take another question to YouTube.
- **AskRigor's own rules:** stored cards keep no YouTube video IDs or links (owner answer 170, `STORED_WITHOUT` in
  `findings/contracts.ts`); a finding with a video among its sources, or drawn from comments, is held apart from its
  card and never published (owner answers 170, 173 and 175); and the Atlas's page guard refuses to serve any page that
  holds a YouTube link (decision 171, `atlas/page-guard.ts`).

## Not built: what a video claims, checked against studies, with a link (item 2)

- **The stored data can't support it.** No stored card says which video a finding checks: the save path replaces a
  YouTube link in a card's text with "(YouTube video)" and holds apart any finding that lists a video among its sources,
  as if it were drawn from comments. A read-only look at the private library on 2 Nov found no card that names the video
  whose claims its findings check. Gemini's claims report is shown in the answer and not stored.
- **What works today, with no change:** a research answer can check a video's claims against studies and save findings
  that name the video in words (its title and channel as the person gave them), with studies as their sources. Those
  are ordinary findings, published like any other, without a link.
- **What a link would take:** an owner decision to keep a video's link with its finding when the link did not come
  through YouTube's API (pasted by the person, or found by Gemini's search), and to let the page guard allow it; a way
  for a finding to declare the video as where a claim was made rather than as comment evidence (a new input in the card's
  later shape, owner answer 189a); the privacy page and data map; and Gemini's reading of each video, which costs the
  owner's prepaid Gemini credit for every video read. A link that came through YouTube's search is API Data, so it could
  stay on a public page at most 30 days without a refresh.

## Research output, not code: study summaries for the mapped videos' methods (item 3)

These are ordinary findings, saved through the card pipeline. For each method a mapped video teaches:

- one AskRigor research run under HRP on the method itself ("does X help Y?"), on the owner's ChatGPT or Claude plan
  (no model API spend), with Atlas publishing on, so its findings appear unreviewed and kept out of search engines until
  the owner accepts them in a review batch;
- studies as the sources, never the video's comments, or the findings are held apart and never published;
- a check of the Atlas first, since a few of these methods already have findings;
- roughly 5 to 25 minutes of agent time a run, judging by the research runs of 2 Nov, and the owner's review afterwards.

## Not built: the channel registry's names, links and notes (item 4)

The rules leave it unclear, so it went to the owner (question 227) instead:

- The registry's channel IDs came through YouTube's API (each channel "confirmed through YouTube's API"), and its names
  were checked against the API's channel records. Showing them on a public page past 30 days needs a refresh through the
  API, and a public list kept that way is a use beyond the one YouTube granted (the person's own answer).
- A public list of many channels built from API Data may count as aggregation, which the policy forbids except within
  one content owner.
- A list with links needs the page guard changed (decision 171), and a page that displays channels needs YouTube's
  Brand Features.
- Its notes are unchecked judgments about named people and businesses (the registry: "None is checked yet"), and its
  "outcomes" label is drawn from comments, so it stays off public pages.
- **Already public:** `docs/youtube-channel-registry.md` in this repository holds those channel IDs. The first were
  added on 30 Oct, so they reach 30 days on 29 Nov 2026: refreshed through the API by then (1 unit each), or taken out.

## The owner question, and the answer

Question 227 on the owner page: keep the channel list and video links off the Atlas until YouTube answers (and take
the registry's API channel IDs out of the public file before 29 Nov), build both from non-YouTube sources only, or ask
YouTube about public pages first.

The owner's answer, 2 Nov about 23:42 UTC: "227 i thought you were building this for me privately and then when yt
ap[proves we can publish". So the maps are built as Atlas pages now, shown only to the owner, and published when YouTube
agrees; the channel list and video claims follow the same rule.

## Built privately for the owner (owner answer 227)

- `apps/research-mcp/src/atlas/comment-map-pages.ts`: the maps file's shape (`askrigor.comment-maps.v1`: per video its
  ID, AskRigor's own label and problem, the channel's name, the sample, the counts, harm kinds and leads; never comment
  text, commenters' names or keys, or comment IDs; every count must add up, or the file is refused); 95% Wilson ranges
  worked out from the counts, never from a range already rounded; ranking only within one problem, only with at least 20
  people who said they tried the method, by the low end of the range of those who said it helped; and the page: marked
  private and kept out of search engines, problems with two or more videos ranked, the rest in one table, then every
  map, with what else commenters credit ranked by how many said each helped and the methods one person credits folded
  away. A video is linked only in the owner's view (decision 171 bars YouTube links on the Atlas).
- `scripts/render-private-comment-maps.mts`: renders a maps file kept outside this repository into one page kept outside
  it (stylesheet written in, file readable by its owner only), and refuses either path inside the repository, links
  followed. Tests: `tests/atlas-comment-map-pages.test.ts`, invented videos only.
- Not served: no route, no store, no data. askrigor.com is unchanged, and the owner's maps and their page stay in the
  owner's private repository.
- **To publish, when YouTube agrees** (and answers the follow-up about public pages, since the 31 Oct email covers
  answers only): the maps in AskRigor's private store, an Atlas route to the same renderer, the owner's decision on video
  links, the privacy page and data map, and a release with the owner's yes.
