# Gemini Spark YouTube scout for AskRigor

This is an owner-operated evaluation of Gemini Spark as a private YouTube scout
for AskRigor. Gemini performs rapid public-video discovery and creator-content
summarization. It does not execute HRP, replace the AskRigor research agent, or
change the public Custom GPT.

## Prerequisites

Google currently requires Gemini Spark access, age 18+, a personal Google
Account, Keep Activity enabled, and presence in the United States for custom
apps. Spark itself requires a Google AI Pro or Ultra subscription and is
available in more regions than custom apps; Spark access therefore does not
prove custom-app access. Account eligibility is an external Google gate and
must not be inferred from Gemini API billing.

These requirements were rechecked against Google's current help pages on
2026-08-19. If **Custom apps for Spark** is absent, first check:

1. the active mode is Spark rather than a normal Gemini chat;
2. the account is personal rather than work or school;
3. the account has Google AI Pro or Ultra;
4. Keep Activity is enabled; and
5. the user is in the United States.

Changing Gemini API billing does not change consumer Gemini or Spark
eligibility.

## One-time connection

1. Open <https://gemini.google.com> and switch to Spark.
2. Open **Settings & help → Connected Apps**. If needed, open **Personal
   Intelligence → Connected Apps** first.
3. Under **Custom apps for Spark**, add:

   `https://mcp.askrigor.com/mcp/gemini`

4. Click **Next** and approve the connection. The endpoint is public and needs
   no credential or Advanced-features secret.
5. Confirm that the AskRigor custom app appears in Connected Apps.

The Gemini-specific endpoint exposes the same ordered 17 expected tools and
read-only handlers as the standard AskRigor MCP endpoint, but emits the smaller
Google-compatible catalog schema. The owner confirmed successful account-side
connection on 2026-08-19. The earlier standard endpoint reached `tools/list`
but Gemini rejected its richer catalog; that failure was not an authentication
or network failure.

## One-time skill installation

1. In Spark, open **Skills → Upload**.
2. Upload
   `integrations/gemini-spark/askrigor-youtube-scout/SKILL.md`.
3. Review it, create the skill, and leave automatic use enabled if desired.

The skill is named `scout-youtube-for-askrigor`. It deliberately contains no
Universal or HRP orchestration.

## Normal scout task

Give Gemini the de-identified research question and ask it to find surprising,
firsthand, exact-variant, failure, harm, or implementation videos. To force the
skill, choose `/scout-youtube-for-askrigor`. Select Gemini's YouTube app if it
does not activate automatically. Select the AskRigor custom app when Gemini
needs to validate exact video identities with `get_youtube_video`.

Gemini should return an **AskRigor handoff** plus **Videos worth watching**. The
handoff identifies exact videos and links, summarizes creator content, recovers
concrete intervention details and descriptive segment cues, and marks any claim
needing targeted transcript or visual verification. Routine creator summaries
do not require expensive full-video ingestion.

The app connection and skill upload are one-time setup. With the current
read-only MCP architecture, there is one handoff per research task: copy the
compact **AskRigor handoff** into the capable AskRigor research interface. The
Gemini-to-AskRigor connection runs in the opposite direction and cannot place
Gemini's generated summary into a ChatGPT or Codex conversation automatically.
Automating that transfer would require a separately reviewed authenticated
mailbox or server-side research supervisor.

## Acceptance test

Use a de-identified synthetic video-discovery prompt. Confirm in the task trace
and response that Gemini:

1. searches several human discovery phrasings such as `how I cured/fixed my X`
   and follows exact variants suggested by promising results;
2. chooses a small nonredundant set for surprising or hard-to-find information,
   not merely popularity;
3. summarizes creator content without uploading or watching the whole video by
   default;
4. validates every selected identifier and canonical link through
   `get_youtube_video`;
5. returns concrete intervention details, useful segment cues, verification
   priorities, search gaps, and the most relevant watch links;
6. makes no protocol-manifest, protocol-load, formal-source, community-survey,
   or community-audit call; and
7. makes no `HRP-complete`, evidence-completeness, efficacy, safety, causality,
   treatment, or individualized recommendation claim.

Also reject the report when it substitutes `available` for AskRigor's literal
metadata status, emits any timestamp or empty timecode placeholder instead of a
segment cue, describes an uninspected visual as support, or treats adjacent
short-term relief or a promotional case as an exact long-term outcome match.

Do not treat the connection test as end-to-end HRP acceptance. Record a failed
item as failed or incomplete rather than inferring it passed from fluent prose.

The first real owner-run scout on 2026-08-19 showed useful discovery and detailed
regimen extraction but failed this acceptance: it emitted the non-contract
status `available`, left all promised timestamps blank, mixed creator summaries
with uninspected visual support, and did not separate exact outcome matches from
adjacent or promotional cases. The skill was tightened from that real output;
the replacement rerun corrected literal statuses, attribution, search ledger,
and incentive/match labels. It still emitted empty timecode placeholders and
selected six adjacent tutorials with zero exact outcome matches even though the
earlier run had located firsthand cases. The current skill therefore removes
timecodes from the scout contract, uses descriptive segment cues, and requires
an exact-outcome discovery lane before adjacent tutorials. Clean acceptance
remains pending another replacement-skill rerun.

## Evidence boundary

Gemini's creator summary is trusted for fast scouting and hypothesis discovery,
but it remains creator-content reporting rather than formal efficacy or safety
evidence. AskRigor validates exact video identity; later protocol-governed work
decides which claims warrant transcript, visual, comment-corpus, or formal-
evidence verification.

The public MCP intentionally remains frozen at 17 read-only tools and does not
include the Action-only transcript operation. This scout therefore labels its
source as `creator_summary` or `visual_observation` and asks for deeper checking
only when a claim is both material and unusually decision-useful.

## Removal

Remove the AskRigor custom app from Gemini Connected Apps and disable or delete
`scout-youtube-for-askrigor`. Removing the app unlinks the MCP server from the
Google Account; no AskRigor server credential needs rotation.
