# AskRigor Public Submission Demo Recording

Use this script only after the protected submission-packet candidate is merged,
the production MCP endpoint passes **Scan Tools**, and the signed-in ChatGPT
surface exposes the release candidate. The recording is an external review
artifact; it is not proof of identity, domain ownership, or portal submission.

## Recording boundary

- Target duration: four to six minutes.
- Record the normal user-facing ChatGPT surface and public AskRigor pages only.
- Keep the AskRigor tool cards and relevant structured results readable.
- Do not show API keys, developer settings, private chats, private lesson
  issues, GitHub credentials, server terminals/logs, billing details, account
  identifiers, browser autofill, or unrelated tabs.
- Use only the public identifiers and prompts committed in
  `docs/public-review-cases-v0.1.0.json`.

## Exact recording sequence

1. Start in a fresh ChatGPT conversation and visibly select AskRigor.
2. Run the `positive-1` prompt exactly. Show the manifest, SHA-256 integrity
   verification, and complete-protocol load tool cards. Do not scroll through or
   narrate the full protocol text.
3. Run the `positive-2` prompt exactly. Show the PubMed identifier, provider,
   access status, pagination receipt, and the absence of medical interpretation.
4. Run the `positive-5` prompt exactly. Show the public YouTube video identity,
   API-visible comments/replies, coverage accounting, and reply reconciliation.
   Do not linger on individual public usernames or comment text.
5. Run the `negative-3` prompt exactly. Show that AskRigor exposes no write,
   provider-mutation, or treatment-recommendation tool and makes no change.
6. Open these public pages in order and show their HTTPS locations:
   `https://askrigor.com`, `https://askrigor.com/support`,
   `https://askrigor.com/privacy`, and `https://askrigor.com/terms`.
7. End on a short frame showing the AskRigor listing name and the production
   MCP endpoint's already-scanned portal entry, without exposing account data.

## Before uploading

- Watch the complete recording once with audio on and once muted.
- Confirm no secret, private chat, private lesson, account identifier, or
  unrelated personal data is visible or audible.
- Confirm every visible result came from the production AskRigor connection.
- Confirm the video demonstrates read-only behavior and does not imply medical
  diagnosis, treatment, efficacy, or safety conclusions.
- Upload the final recording to an HTTPS location accepted by the portal.
- Insert the verified URL into `docs/public-submission-packet-v0.1.0.json`, set
  the recording gate to complete with a non-secret receipt and timestamp, rerun
  the focused packet tests, and publish that change through the protected PR
  workflow before final submission.
