# The owner's mobile notice

Date: 2026-10-15. Status: **BUILT, for the owner's review.** Merging and releasing need the owner's approval by name.

## The request

The owner, 15 October, 20:39 UTC: "here is a new warning we need to add into mobile askrigor responses: 'Mobile
responses may be shorter and less intelligent than desktop web/app, even with the same model and thinking level
selected.'" The owner reported that many users say so and showed one comparison: the same question in ChatGPT on
desktop web and on a phone. The desktop answer proposed the missing paired experiment; the phone answer did not.

## What changes

1. **Universal 20.5.43:** `output_style` (a core section, loaded by every AskRigor run) asks each substantive response
   to start with the notice, as its own sentence and in the response's language, when the context or the person shows
   that it will be read in a mobile app or a phone's browser, and to leave it out when nothing shows a phone. The
   notice is the owner's sentence, word for word.
2. **Server:** ChatGPT may send an optional, best-effort `openai/userAgent` hint with a tool call (OpenAI's Apps SDK
   reference). When the hint on a `finalize_research` call names an iPhone, iPad, iPod, Android device or mobile
   browser, the notice leads that call's caveats, which the answer must carry like any caveat. The status, the limits
   and the signed receipt do not change. The hint is read for the call only; `docs/privacy-data-map.md` records it.

## Limits

- A phone shows only where the model's context says so (some apps tell the model which app it runs in) or where
  ChatGPT sends the hint, which OpenAI calls best-effort and which a developer forum reported missing for a time.
  Elsewhere the notice is left out rather than guessed.
- The Claude connector receives no such hint; there the notice depends on the model's context.
- The older Custom GPT does not load Universal and is not covered: its instructions would have to be re-pasted in the
  GPT editor.

## Checks

- `tests/mobile-notice-protocol-2026-10-15.test.ts`: the paragraph word for word and in place, the revision entry, the
  version and date, and the byte-exact reversal to Universal 20.5.42.
- `tests/research-finalization-gate.test.ts`: the notice leads the caveats and leaves the result unchanged; an answer
  without it is sent back; one with it passes.
- `tests/finalize-next-steps-contract.test.ts`: through the MCP endpoint, an iPhone user agent in the call's `_meta`
  adds the notice; a desktop user agent or no hint does not.
- `npm run verify`.
