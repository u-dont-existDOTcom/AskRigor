# Can an AI service read Reddit for the web app? Venice test (2026-10-04)

Owner question 33, answered 2026-10-04: "ok you can check venice i guess... and
openrouter if venice doesn't work". Cap: USD 1 per service. The standing $0
model-API policy is otherwise unchanged.

## Method

- **Service:** Venice API (OpenAI-compatible), model `openai-gpt-6-luna`, the
  cheapest current GPT model listed with web search.
- **Key:** read from the owner's key file into the process environment only.
- **Ground truth:** Reddit's public oEmbed endpoint, called as AskRigor's
  production thread check calls it: full thread URL, AskRigor's user agent,
  JSON.

1. **Reading a thread:** Venice's page scraper (`enable_web_scraping`, search
   off) on two threads from the 2026-10-01 Bright Data test, `1gqm9d2` and
   `1irk9yd`. The model was asked for the title, subreddit, comment count and
   three verbatim quotes, or `CANNOT_READ`.
2. **Finding threads:** Venice web search (`enable_web_search: on`, citations
   on) for Reddit threads about recovering from frozen shoulder without
   surgery. Each cited thread was checked against oEmbed.

## Results

- **Reading: fails.** Both threads came back `CANNOT_READ`; the model said
  Reddit blocked automated access.
- **Finding: works.** All 10 search citations were reddit.com threads in
  r/frozenshoulder. The 5 that were checked all exist, with titles matching
  Reddit's exactly. The short "quotes" come from search snippets. They could
  not be checked against the threads, so they count as snippet-only evidence
  (HRP SnippetAndPartialAccessTier), not as comments read.
- **Cost:** 0.0344 DIEM (4.54784131 → 4.51341048), about USD 0.03 of Venice's
  daily credits. A first search call used its whole 2,500-token budget on
  reasoning; with `reasoning_effort: low` it answered in 374 tokens.

## Conclusion

Through Venice, a GPT model can find Reddit threads and name them correctly,
but cannot read them. That is discovery, not the community reading AskRigor
needs. The GPT model alone does not bring ChatGPT's Reddit reach: that comes
from OpenAI's own search. Bright Data read about 57% to 69% of the displayed
comments on these same threads on 2026-10-01.

Next, per the owner's answer: OpenRouter, which can route an OpenAI model to
OpenAI's native web search. It waits for the owner's OpenRouter key file.
