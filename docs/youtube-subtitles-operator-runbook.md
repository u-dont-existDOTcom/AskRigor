# Saving YouTube subtitles locally: operator runbook

AskRigor#484 (17 November 2026). How an operator saves a public video's or playlist's existing captions on their own
computer with yt-dlp, when research needs a speaker's words and AskRigor's tools can't supply them, and how to tell a
complete capture from a partial one. It is a local fallback for the operator, run by hand.

What it is not:

- Not part of AskRigor's service. AskRigor's servers don't run yt-dlp or any other YouTube website reader, and
  YouTube searches stay on YouTube's official API (owner answer 206a, `design-decisions.md`, "Video and YouTube").
  Nothing here adds a tool, a shell route or a scraper to AskRigor.
- Not a way to store transcripts on AskRigor. Captions saved this way stay on the operator's computer. Moving them into
  AskRigor's service, its repository or a findings card needs a separate decision on keeping data, which nobody has
  made.
- Not a way around YouTube's limits. A rate limit (HTTP 429) is a wait, never something to get around.

Inside AskRigor, a claim about what a speaker says still needs a verified transcript or Gemini's reading
(`get_youtube_transcript` for the Custom GPT, `extract_youtube_video_claims` on MCP). A video's title, description or
comments never stand in for what was said. Where neither tool, nor a shell, is available, the answer says so.

## Steps

1. **Check the install.** Find which yt-dlp runs and how it was installed, so it is updated the same way:

   ```bash
   command -v yt-dlp
   yt-dlp --version
   pipx list
   ```

   On the owner's laptop `~/.local/bin/yt-dlp` is a pipx link, so it is updated with `pipx upgrade yt-dlp`, never with
   `yt-dlp -U` or another Python's pip. Run `yt-dlp --version` again after updating.

2. **See which captions the video has.**

   ```bash
   yt-dlp --list-subs "VIDEO_URL"
   ```

   Take the captions in the language spoken over a machine translation when the exact words matter. `-orig` tracks
   (`fr-orig`, say) are the original-language automatic captions; plain language codes may be translations. Choose
   from what this video lists: another video may list other tracks.

3. **Save the captions only, with a slow pace, into an absolute folder, and keep the log.**

   ```bash
   OUT="$HOME/yt-subtitles/$(date -u +%Y%m%dT%H%M%SZ)"   # absolute, new for each run
   mkdir -p "$OUT"
   yt-dlp --skip-download --write-subs --write-auto-subs \
     --sub-langs fr-orig --sub-format vtt \
     --sleep-subtitles 5 \
     -P "$OUT" -o "%(playlist_index)03d - %(title)s.%(ext)s" \
     "PLAYLIST_OR_VIDEO_URL" 2>&1 | tee "$OUT/yt-dlp.log"
   ```

   - `--skip-download` saves no video or audio.
   - `-P` with an absolute folder: a relative path such as `transcripts/` lands under whatever folder the terminal was
     in, and looking in another `transcripts` folder then looks like nothing was saved.
   - `%(playlist_index)03d` keeps the files in the playlist's order and shows which ones are missing.
   - `--sleep-subtitles 5` waits between caption requests. Use the language code from step 2 in `--sub-langs`.

4. **On HTTP 429, stop.** `HTTP Error 429: Too Many Requests` means YouTube is limiting requests. Stop the run, wait
   (hours, not seconds), and run again later for the items that are missing, with the same or a slower pace. Don't loop
   quick retries, switch networks or accounts, or claim the limit was got around. The log keeps each 429.

5. **Count what was saved.** `--ignore-errors` and yt-dlp's last line ("Finished downloading playlist") don't mean
   every video's captions were saved: in the run behind #484, every episode after the first answered 429, and that line
   still printed. Count the non-empty caption files and compare them with the playlist:

   ```bash
   find "$OUT" -name '*.vtt' -size +0c | sort        # saved, non-empty
   find "$OUT" -name '*.vtt' -size 0c                # empty: count as not saved
   yt-dlp --flat-playlist --print "%(playlist_index)03d %(id)s" "PLAYLIST_URL" > "$OUT/expected.txt"
   wc -l < "$OUT/expected.txt"                        # how many the playlist holds
   grep -c "HTTP Error 429" "$OUT/yt-dlp.log"         # requests YouTube refused
   ```

   Each index in `expected.txt` with no non-empty `.vtt` of that number is missing. For each, say why when it is known:
   a 429, no captions in that language (step 2), or a video that is private, removed or not available.

6. **Report it as it is.** Say how many of the playlist's videos have captions saved, which are missing and why, and
   which language track each file is. A partial capture is reported as partial, with its count.

## Test results behind this runbook (17 November 2026)

As #484 reports them, from the operator's runs on the owner's laptop on the 15-video public French-language playlist
it names (not run again for this runbook):

- yt-dlp 2026.07.04 (pipx), with `--write-subs --write-auto-subs --sub-langs "en.*" --skip-download --ignore-errors`:
  episode 1's English captions were saved; every later episode answered `HTTP Error 429: Too Many Requests`; the
  playlist-finished line still printed. A failure that reads as success.
- After `pipx upgrade yt-dlp` (2026.10.26, checked with `yt-dlp --version`), one video at a time, with
  `--skip-download --write-auto-subs --write-subs --sub-format vtt -P <absolute folder>`:
  - episode 1, `--sub-langs fr,fr-orig --sleep-subtitles 3`: the `fr-orig` file, 436,202 bytes;
  - episode 2, which had answered 429 before, `--sub-langs fr-orig --sleep-subtitles 5`: the `fr-orig` file, 491,676
    bytes.

These show that those two captures worked, and nothing more: not that all 15 videos can be saved, and not that the
update alone ended the 429s, since the time, the pace and the language changed too.

## Checks for whoever changes this runbook

- Positive: two non-empty `.fr-orig.vtt` files from two videos, and the count of expected videos written down.
- Negative: a run with 429s in its log is never reported as complete, whatever yt-dlp's last line says.
- Nothing here changes what AskRigor's service keeps, reads or sends; HRP, the Universal Instructions and the tools'
  source contracts stay the authority.
