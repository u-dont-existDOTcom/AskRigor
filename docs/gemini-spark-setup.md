# Gemini Spark setup for AskRigor

This is an owner-operated evaluation of Gemini Spark as a private AskRigor
front end. It does not replace the public Custom GPT or change production MCP
behavior.

## Prerequisites

Google currently requires Gemini Spark access, age 18+, a personal Google
Account, Keep Activity enabled, and presence in the United States for custom
apps. Spark itself requires a Google AI Pro or Ultra subscription and is
available in more regions than custom apps; Spark access therefore does not
prove custom-app access. Account eligibility is an external Google gate and
must not be inferred from Gemini API billing.

These requirements were rechecked against Google's current help pages on
2026-08-19. If **Custom apps for Spark** is absent, do not infer that the MCP
endpoint failed. First check the following account-side gates:

1. the active mode is Spark rather than a normal Gemini chat;
2. the account is personal rather than work or school;
3. the account has Google AI Pro or Ultra;
4. Keep Activity is enabled; and
5. the user is in the United States.

When any gate is unmet, the supported custom-app connection cannot be completed
from that account. Changing Gemini API billing does not change consumer Gemini
or Spark eligibility.

## One-time connection

1. Open <https://gemini.google.com> and switch to Spark. Do not continue if the
   account does not meet every prerequisite above.
2. Open **Settings & help → Connected Apps**. If needed, open **Personal
   Intelligence → Connected Apps** first.
3. Under **Custom apps for Spark**, add:

   `https://mcp.askrigor.com/mcp`

4. Click **Next** and approve the connection. The endpoint is public and needs
   no credential or Advanced-features secret.
5. Confirm the custom app appears as `askrigor-research`.

The live 2026-08-19 compatibility probe completed MCP initialization in 1.205
seconds and `tools/list` in 1.037 seconds. It returned all 17 expected tools as
`api_visible_complete`; every tool declared `readOnlyHint: true`, and none
declared `destructiveHint: true`. The consequential lesson-submission Action is
not part of this MCP inventory.

## One-time skill installation

1. In Spark, open **Skills → Upload**.
2. Upload
   `integrations/gemini-spark/askrigor-research/SKILL.md`.
3. Review it, create the skill, and leave automatic use enabled.

The skill is named `run-askrigor-research`. It requires exact runtime loading of
Universal and HRP; neither protocol is copied into the skill.

## Normal requests

Normally, ask the research question in a Spark task. Gemini can automatically
select the enabled skill and connected app. To force deterministic selection,
choose `/run-askrigor-research` and `@askrigor-research` in the prompt. This is
selection, not manual transcript or summary transfer.

Read-only research tools should not require per-call approval. Google may still
surface account, privacy, or safety confirmations. AskRigor cannot suppress
Google-owned confirmations.

## Acceptance test

Use a de-identified synthetic research prompt. Confirm in the task trace that
Gemini:

1. calls Universal manifest → integrity verification → every ordered load chunk;
2. applies the loaded activation boundary and repeats the sequence for HRP when
   triggered;
3. validates real YouTube identifiers through `get_youtube_video`;
4. keeps Gemini's creator summary separate from MCP comment retrieval;
5. continues every required video audit until `continuation_recommended: false`;
6. preserves access statuses and blocks `HRP-complete` when creator transcript
   verification is material but unavailable; and
7. links only the most decision-useful videos with their access boundaries.

Record a failed item as failed or incomplete; do not infer it passed from a good
answer.

## Current limitation

The public MCP intentionally remains frozen at 17 read-only tools and does not
include the Action-only `get_youtube_transcript` operation. Consumer Gemini may
summarize public YouTube content quickly, but that result has no AskRigor
transcript receipt. The Spark skill therefore requires a disclosed access
boundary and forbids `HRP-complete` when a material creator claim lacks exact
transcript verification.

## Removal

Remove or disconnect `askrigor-research` from Gemini Connected Apps and disable
or delete `run-askrigor-research`. Removing the custom app unlinks the MCP server
from the Google Account; no AskRigor server credential needs rotation.
