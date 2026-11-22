# Saving public YouTube captions with yt-dlp (local operator runbook)

**Status:** Two-video procedure verified on 2026-11-17; full-playlist reliability unverified. **Scope:** Authorized local research/diagnosis only. This is not an AskRigor public Action, cloud tool, deployed instruction, source of medical evidence, or change to transcript retention. See [the incident and acceptance checks](https://github.com/u-dont-existDOTcom/AskRigor/issues/484).

AskRigor's source path remains `get_youtube_video` followed by `get_youtube_transcript` when that declared Action is available. The transcript Action's coverage receipts and privacy constraints stay authoritative. A local `yt-dlp` transcript is separate source material, not a fabricated Action receipt.

## The observed failure

On 2026-11-17, a 15-video French playlist returned one downloaded English `.vtt` file followed by `HTTP Error 429: Too Many Requests` for the remaining videos. The terminal still said `Finished downloading playlist` despite 14 missing subtitle files. The output template used a relative `transcripts/` path, so looking in a different working directory gave the false impression that no file was created.

The active executable was `~/.local/bin/yt-dlp`, installed by pipx. Version 2026.07.04 was upgraded through `pipx upgrade yt-dlp` to 2026.10.26; `yt-dlp --version` confirmed the active binary.

With the upgraded binary, original-French subtitle selection and a short delay, *episode 1* successfully produced nonempty `.fr-orig.vtt` subtitles (436,202 bytes) and the previously blocked *episode 2* produced a nonempty `.fr-orig.vtt` file (491,676 bytes). These observations do **not** prove that upgrading alone resolved the rate limit, that pacing will prevent future 429s, or that all 15 playlist videos can be captured.

## Capture procedure

1. **Find and update the actual installation if stale**, and verify the executable:

   ```bash
   command -v yt-dlp
   yt-dlp --version
   pipx list
   pipx upgrade yt-dlp  # only if the active installation is managed by pipx
   yt-dlp --version
   ```

   Do not blindly update an unrelated apt/pip/pipx copy. Updating is a troubleshooting step, not a demonstrated 429 cure.

2. **Inspect a representative video** before assuming a caption language:

   ```bash
   yt-dlp --list-subs 'https://www.youtube.com/watch?v=3VFmSyfSeqA'
   ```

   This French playlist exposes original auto-caption language `fr-orig`. `en` can be translated caption text rather than the original spoken language. Manual captions on other videos may have different codes; choose an actually offered track and prefer original language for quotation and meaning-sensitive analysis.

3. **Save to a known absolute directory**. The command below is a proposed full-playlist extension of the *verified single-video* flags; it has **not been tested for full 15-video completion**:

   ```bash
   mkdir -p "$HOME/transcripts"
   yt-dlp --yes-playlist \
     --skip-download \
     --write-auto-subs --write-subs \
     --sub-langs 'fr-orig' --sub-format vtt \
     --sleep-subtitles 5 \
     --ignore-errors \
     -P "$HOME/transcripts" \
     -o '%(playlist_index)03d - %(title)s [%(id)s].%(ext)s' \
     'https://www.youtube.com/playlist?list=PLdAja2GPkWAsMKlFRlvXGGgzE3IWpuyoM' \
     2>&1 | tee "$HOME/transcripts/yt-dlp.log"
   ```

   `--skip-download` avoids saving the video media. `--write-auto-subs` and `--write-subs` allow automatic and creator-provided tracks matching the requested language. `--sleep-subtitles 5` spaces out subtitle requests but **does not guarantee** that YouTube will allow them. `--ignore-errors` lets remaining items be attempted but makes an end-of-playlist line especially uninformative about completeness.

4. **Verify actual artifacts, not the success banner**:

   ```bash
   find "$HOME/transcripts" -maxdepth 1 -type f -name '*.fr-orig.vtt' -size +0c -print | sort
   find "$HOME/transcripts" -maxdepth 1 -type f -name '*.fr-orig.vtt' -size +0c | wc -l
   grep -Ei 'HTTP Error 429|Unable to download|ERROR:' "$HOME/transcripts/yt-dlp.log" || true
   ```

   Compare expected playlist IDs/count with unique actual files and inspect caption text/track language. Empty files, duplicates, missing captions, unavailable videos, individual errors, and interrupted runs must be reported separately. The observed playlist had 15 listed items; two single-video captures do not validate the full set. A successful exit code under `--ignore-errors` does not establish complete coverage.

5. **When rate-limited:** Do not run rapid repeated downloads or claim that a retry worked without checking files. Preserve the failure state and log, back off, and retry at a later time. Avoid recommending proxy/identity rotation as a default solution. If no caption track is available, report `no usable transcript`, not `speaker said X`.

## AskRigor integration boundary

- Verified transcript content may support creator-specific statements only with video identity, caption language, timestamps, and the exact capture/access status. Automatic subtitles may be inaccurate and are not equivalent to a human-checked transcript.
- The product-side `get_youtube_transcript` Action supplies its own bounded transcript pages and coverage receipts. A local `yt-dlp` capture is **not** a substitute for those receipts, and a product caller without local terminal access cannot invoke it silently.
- Do not commit collected transcript text or copy it into an AskRigor server library merely because this runbook saves it on an authorized local computer. Follow the project's existing source-access and data-lifecycle policy.
- Make a content claim only if the relevant segment was genuinely retrieved and checked; if access failed, separate creator-content uncertainty from separately available video metadata and comments.
