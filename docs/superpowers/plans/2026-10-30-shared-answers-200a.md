# Plan: shared questions and answers (owner answer 200a)

The owner's words (30 Oct 2026): "we aren't logging every question/answer but just the ones users send for
improvement, like at the end of the answer it can say, 'Send this de-identified question & answer to AskRigor for
improvements? If yes, optionally specify what should be improved.'"

Built on the next build's branch (`claude/next-build-20261029`, AskRigor#387), for a release the owner approves.

## What the user sees

1. Every research answer whose final check ran ends with the owner's sentence, word for word, after the check line:
   "Send this de-identified question & answer to AskRigor for improvements? If yes, optionally specify what should be
   improved." The final check returns it in a runtime-only field, `share_offer`, only when sharing is configured on the
   server, so an answer never offers what the server cannot keep.
2. On a yes, the AI writes a de-identified copy of the question (with the earlier turns it needs) and of the answer,
   shows it, says how it is kept, and asks the person to confirm it, with what they want improved. Nothing is sent
   before they confirm.
3. On confirmation, the AI calls `manage_research_access` with action `share_answer` and the copy in
   `later_inputs.sharedAnswer`. The result gives a deletion code, shown once, which the AI passes on.
4. Any time later, `manage_research_access` with action `delete_shared_answer` and `later_inputs.shareCode` deletes it.

## How it is kept

- **Apart from the account:** the record holds no account key, account reference, OAuth subject or conversation
  identity. The server reads the account only to require a signed-in research account and to rate-limit sharing in
  memory (20 shares per account per UTC day; nothing stored).
- **Encrypted at rest:** AES-256-GCM envelopes, one file per shared answer, under
  `/var/lib/askrigor-actions/shared-answers` (mode 0700; each file 0600), with a server-made key
  (`ASKRIGOR_SHARED_ANSWERS_KEY_BASE64URL`, 32 random bytes, made in stage B like the Atlas secrets, never printed).
  Without the key, sharing is off: no offer, and both actions answer `sharing_unavailable`.
- **Never public, for improvements only:** no route, page or catalog returns a shared answer. Only the owner's review
  tool (`review_research_contribution`, the `cases:review` login) can list, read and delete them, to turn them into
  regression cases and fixes.
- **For a fixed time:** 90 days, the lesson queue's deletion window. Each file carries its expiry; the server deletes
  expired files at start-up, every hour while it runs, and whenever a share is written, listed or deleted.
- **Deleted with a code:** a random 128-bit code, shown once; the file name is a keyed hash of the code, so the code
  finds its file and nothing else does. Deleting removes the file.

## What the server checks (exact checks only)

- The copy's shape and sizes: `question` 1 to 4,000 characters, `answer` 1 to 30,000, `improve` up to 1,000, and
  `confirmed: true`, the AI's declaration that the person confirmed this exact text.
- The contact screen the contribution check already uses (`contactPatternKind`: e-mail addresses, phone numbers and the
  like), in every text; a match refuses the share and names the field, without echoing the text.
- Whether the copy is de-identified is a judgment of meaning, so it stays with the AI and the person who confirms it.
  The server does not claim to check it, and the result says so.

## The owner's review

`review_research_contribution` gains `list_shared_answers` (newest first: id, shared and expiry times, the build and
protocol versions, the sizes), `read_shared_answer` (one, decrypted) and `delete_shared_answer` (by id). The frozen tool
lists do not change: the actions and inputs are runtime-only (owner answer 189a).

## What changes in the documents

- `docs/privacy-data-map.md`: a new data class, "Shared question and answer".
- `site/privacy`: the opt-in copy, how it is kept, for how long, and how to delete it.
- `site/support`: how to delete a shared answer.
- The free contributor notice says "AskRigor never saves raw chat, prompts, ... private health narratives". A shared copy
  is de-identified and sent only on the person's confirmation, which states how it is kept. Whether the notice also
  gains a sentence (a new version, which every free account accepts before it researches again) is the owner's choice
  at release; the build keeps version 4.
- `docs/owner-regressions.md`: cases for the offer, the confirmation before sending, a copy with personal details
  removed, and deletion by code.

## Not in this build

- Sharing from the Custom GPT's Actions (the plugin and connectors only; owner answer 17 Oct: plugins over the GPT).
- Any model or API call: nothing is sent anywhere but the server's own disk.
