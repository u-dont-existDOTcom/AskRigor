# Check this video: live acceptance, 2026-10-03

Feature: `extract_youtube_video_claims` (AskRigor#248), branch
`claude/check-this-video-20261003` at commit `16682bb2`, before release.

## How it ran

- **Where:** the owner's laptop, calling the tool's own code
  (`extractYoutubeVideoClaims`) with the real YouTube and Gemini clients.
  Production was not touched.
- **Keys:** the owner's unbilled Gemini key, under the zero-spend policy
  (`ASKRIGOR_GEMINI_BILLING=none`), and the YouTube Data API key. Each was
  loaded only into the process environment.
- **YouTube quota:** about 330 units: three searches to find the videos
  (100 each), one `videos.list` per candidate and one per reading.
- **Daily ledger:** a scratch ledger counted 1,573 seconds (3 readings and 1
  follow-up, each charged its whole video). It was filed under Pacific day
  2026-10-02, correct for 02:00 UTC on 2026-10-03.
- **Request shape:** the request, with agentic processing and a JSON schema
  carrying enums, worked on the first call. The tool needed no change.

## Results

| Video | Kind | Length | Reading | Claims | Notes |
|---|---|---|---|---|---|
| `0aj0UTxmmv4` (Dr. Eric Berg DC) | first-person ("I took omega-3 for 30 days") | 5:53 | 60 s, 3 calls | 26 | No sponsorship in the video itself; the description sells the creator's supplement line (see below) |
| `lQIp3hHajas` (Talking With Docs) | clinicians (orthopedic surgeons) | 7:17 | 63 s, 3 calls | 28 | Claims labeled mostly `expert_opinion` |
| `UsuGvTIjZNM` (Myprotein) | brand selling its product | 7:10 | 58 s, 3 calls | 20 | Products promoted at 03:45 found as a sponsorship |
| `0aj0UTxmmv4` at 01:29 | follow-up, fixed form | 5:53 | 19 s, 1 call | — | Wording matched the first reading's quote at 01:29 |

Every reading completed and its stored interaction was deleted. No time fell
outside a video, and no report failed the schema.

## Checking times and quotes

The captions could not be read from this laptop. `yt-dlp`, with and without
the embedded player client, and AskRigor's own transcript reader all met
YouTube's "confirm you're not a bot" wall. In the built-in browser, the watch
page put the player and transcript panel behind a sign-in. The check did not
sign in or use browser cookies.

Instead, Gemini's times were compared with each video's chapter markers, which
are independent of Gemini:

- **Clinician video:** all 12 chapters, from activity changes to final tips,
  appear in Gemini's claims 1 to 8 seconds after each chapter starts.
- **Brand video:** "what are the health benefits" starts at 4:12, and Gemini's
  first benefit claim is at 04:12. The muscle and dosage chapters (5:26, 6:32)
  match claims 10 seconds in.
- **First-person video:**
  - Each chapter's topic appears in Gemini's claims within 3 seconds of its
    start: insulin at 3:02, reproduction at 3:48, choosing a fish oil at 4:13.
  - The food chapter at 5:25 matches a claim 7 seconds earlier.
  - The creator's description restates several of the video's claims (brain
    DHA share, retina, skin, bone and joint). Gemini's quotes say the same
    things with nearly the same lists.

**Not verified:** exact quote wording word for word, which needs captions or a
person watching. The tool labels every quote as Gemini's transcription and
links its moment, so the person can check it.

## Change made from this check

The first-person video sells the creator's supplements in its description
only, and Gemini reads only the video. The result's source note now says to
read the description with `get_youtube_video` for affiliate links and products
the creator sells; the skill already said so.

## Still open before release

- **The owner approves the privacy-notice wording.** The public notice says
  Gemini receives only the scout's screened target.
- **Product-interface acceptance after deployment:** a pasted video in Claude,
  with each material claim checked, commenters reported and each claim linked
  to its time (#248 acceptance).
