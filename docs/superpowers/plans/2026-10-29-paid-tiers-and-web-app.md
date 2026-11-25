# Paid tiers, payments and the web app: plan for the owner's decisions (29 Oct 2026)

Status: questions 198 to 200 are decided (30 Oct, below); questions 201 to 203 are open. Nothing here spends money.

## Decisions, 30 Oct 2026

- **198a, with Claude against Codex.** The model check is built first, offline, on the owner's laptop
  (`scripts/model-check/`), and judged at zero spend: developed on the 27 to 28 Oct run's judged answers, frozen, then
  judged on the 29 to 30 Oct run's answers. The same check runs through Claude Code (`claude -p`, Claude plan) and
  Codex (`codex exec`, ChatGPT plan). Each check is one stateless call holding the question, the answer and the
  research record; multi-turn runs resume sessions where state is needed (`codex exec resume`, `claude -p --resume`).
  First trial (Sonnet 5.5, high effort, one answer): 57 seconds, 85,100 input and 6,687 output tokens, seven findings.
- **The web app waits** (the owner: "a dead idea for now"). The plugin stays the product. It comes back if a lean
  loop makes an answer much cheaper (fewer, batched calls; the protocol once; trimmed results; a cheaper model;
  measured at zero spend first), or on people's own plans: OpenAI's "Sign in with ChatGPT" (since 29 Sep 2026) lets a
  Plus or Pro plan pay for an app's Responses API calls; open-source and local apps can use it now, and a hosted or
  paid app applies through an interest form (question 202). Its terms page could not be read on 30 Oct (HTTP 403);
  read it before building. Anthropic's Agent SDK docs say third-party products may not offer claude.ai login or rate
  limits without Anthropic's approval.
- **199: Stripe, US.** The owner's Stripe login has an AskRigor organization with a new US account named AskRigor
  (onboarding not done) and a sandbox, "AskRigor sandbox" (US, USD, test mode, no products yet), whose test keys are
  on the laptop. Build and test against the sandbox only; the live account's onboarding is the owner's step when
  payments ship. Taxes: Managed Payments (Stripe as merchant of record, 3.5% on top) or Stripe Tax, put to the owner
  then. The owner's login also holds a live account for another business, never used for AskRigor.
- **200a, the owner's wording.** Nothing is kept by default. At the end of an answer: "Send this de-identified
  question & answer to AskRigor for improvements? If yes, optionally specify what should be improved." On a yes the
  AI shows the de-identified text, with what to improve, and sends it once the person confirms that text.
- **New idea (question 203): an AskRigor news service.** Health headlines checked against their studies, one item
  serving every subscriber, so the cost is shared. Pilot at zero spend: a weekly draft digest for the owner from public
  feeds, then a page, email and Stripe subscriptions.

## The owner's request

The owner wrote, read at 17:15 UTC on 29 Oct 2026:

- the zero-spend rule doesn't apply to paid users, who pay for their own use;
- set up Stripe on the web app, brainstorm the pricing, and work out how the pricing page explains everything;
- tier 1 might be just the API check, which is more complete than the code check; there are tiers for the plugin and
  for the web app;
- in dev mode the API check could run through the CLI on the dev accounts;
- the web app could be trialled with the CLI and with the Venice API key. Users choose the model, among the latest
  Claude and GPT models, defaulting to the cheapest high-reasoning frontier model, GPT 6.1 sol at xhigh;
- the owner assumes the API gives better answers than the CLI;
- a second pass on the web app would make the finished answer coherent, since answers written step by step often
  don't add up to one picture;
- users could choose to send their de-identified questions and answers to improve the system;
- Bright Data could run YouTube searches if Gemini isn't good enough, since YouTube limits searches so much.

## The spending rule

- **The owner's words:** "my zero spend rule does not apply to paid users, they would pay for usage obviously."
- **Reading:** the rule (`governance/chat-work-authority-policy.json`: no paid model inference, USD 0) covers
  AskRigor's own money. Model use that a user's payment buys is outside it, once payments exist.
- **Still the owner's:** spending before there is revenue, such as a trial of the web loop through an API or one
  regression run on it. It comes as its own question, with an estimate and a cap, once the web loop exists.
- **The policy file:** it changes with the first paid build. It gets a field for inference that a user's payment buys,
  while AskRigor-funded spend stays at USD 0 unless the owner sets a cap. Until payments exist nothing differs, so
  Codex workers still see paid inference as forbidden, which is correct.

## What a research answer costs: measured

The owner's regression runs use `gpt-6.1-sol` at `xhigh`, the model the owner named, through Codex. Codex's own
session records for 26 to 28 Oct (`~/.codex/sessions`) name that model and effort. Codex's event logs record each run's token use (`turn.completed`). Over the 95 runs with a
record in each of the 26 and 27 Oct runs, per answer:

| | Median | 90th percentile | Largest |
| --- | ---: | ---: | ---: |
| Input tokens | 6.0 to 6.5 million | 9.9 to 10.3 million | 20.7 million |
| of which cached (re-read) | 5.8 to 6.3 million | 9.6 to 10.0 million | 20.0 million |
| of which new | 258,000 to 262,000 | 335,000 to 340,000 | 872,000 |
| Output tokens | 28,500 to 29,800 | 40,000 to 43,000 | 89,000 |
| of which reasoning | 8,500 to 8,900 | 14,600 to 15,500 | 27,200 |
| AskRigor tool calls | 57 | 64 to 67 | 93 |

What drives it:

- **Re-reading:** 96% of the input is cached re-reading. Each of the 57 tool calls sends the whole conversation again,
  so the price of cached input decides most of the cost.
- **Protocol pages:** HRP pages fetched with `load_protocol` (about 12 per answer, 25,800 characters each) are 43% of
  everything the model read from AskRigor's tools. A web loop puts HRP's core in the system prompt once, cached.
- **The final check's input:** its median is 26,400 characters, of which the answer draft is 7,100.

### Cost per answer by model

The prices are the providers' list prices on 29 Oct 2026, in USD per million tokens, from
[OpenAI's pricing](https://developers.openai.com/api/docs/pricing) and
[Anthropic's pricing](https://platform.claude.com/docs/en/about-claude/pricing). The token counts are `gpt-6.1-sol`'s
measured use, applied to every model.

How each part is billed:

- **New input:** as a cache write. That is 1.25 times the input price at OpenAI (30 minutes) and at Anthropic
  (5 minutes).
- **Re-read input:** at the cached rate.
- **Output:** at the output rate. Reasoning counts as output at both providers.
- **Anthropic's token count:** its newer tokenizer counts about 30% more tokens for the same text, so its token counts
  are raised by 30%.

| Model | Write / cached / output price | Research answer, median | 90th percentile | Model check |
| --- | --- | ---: | ---: | ---: |
| `gpt-6.1-sol` (the owner's default) | 2.50 / 0.10 / 10 | $1.55 | $2.23 | $0.17 to $0.37 |
| `gpt-6.1-terra` (26 Oct) | 1.25 / 0.05 / 5 | $0.77 | $1.12 | $0.08 to $0.18 |
| `gpt-6-astra` (flagship) | 12.50 / 1.00 / 50 | $10.74 | $16.06 | $0.85 to $1.85 |
| `gpt-6-luna` | 0.125 / 0.01 / 0.50 | $0.11 | $0.16 | $0.01 to $0.02 |
| `claude-sonnet-5-5` | 2.50 / 0.10 / 10 | $2.01 | $2.90 | $0.22 to $0.48 |
| `claude-opus-5-5` | 5.00 / 0.20 / 20 | $4.02 | $5.81 | $0.44 to $0.96 |
| `claude-fable-5-1` | 12.50 / 0.25 / 50 | $8.08 | $11.35 | $1.10 to $2.41 |

How far to trust these figures:

- **Other models:** they use different amounts. They may make more or fewer calls, and reason more or less. Treat
  each row as an order of magnitude until the same list has run on that model.
- **Long runs:** OpenAI charges twice the input price, and 1.5 times the output price, for a prompt over 272,000
  tokens. A long run's last calls reach that, so the 90th percentile is low by perhaps a fifth.
- **The web loop:** it should cost less than these figures. HRP pages are 43% of what the model read from the tools,
  and the web loop sends only the modules a question needs, once. It still has to be measured.
- **Reasoning effort:**
  - every model above offers `xhigh` and `max`;
  - `gpt-6.1-terra` and `gpt-6-luna` cost far less, and OpenAI calls `gpt-6.1-sol` the cheapest near-flagship model;
  - which effort and model give the owner's criteria at the lowest price is a regression-list question;
  - Codex on the owner's ChatGPT plan offers `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna` and `gpt-6-astra`, each up to
    `max` (`~/.codex/models_cache.json`), so the GPT side can be measured at zero spend.
- **Batch and Flex:** both run at half price, but they answer within hours, not live, so they suit the regression list,
  not users.

## Tiers (a sketch for question 198)

### In the user's own AI (the plugin and connectors)

| | Free | Checked (tier 1) |
| --- | --- | --- |
| Research tools, the code check (195a's five checks) and the panel | yes | yes |
| Findings cards | published in the Atlas (the free notice) | private; saved only on the user's yes |
| The model check on each final answer | no | yes |
| A coherent rewrite of the checked answer, checked again | no | yes |
| Who pays for the model | the user's own AI plan | AskRigor, from the user's payment |

### On AskRigor's own web app

AskRigor runs the whole research itself, with the model the user chooses. Every answer gets:

- the code check;
- the model check;
- the coherent rewrite;
- the panel;
- private mode.

The user is charged per answer: the model's measured cost plus AskRigor's share. They see an estimate before it starts,
set a cap, and get the credit back when a run fails for AskRigor's reasons.

### What to charge (a sketch)

- **The rule:** the measured model cost of each answer times a fixed factor, two to start with. The factor covers:
  - payment fees, a few percent plus a fixed amount per payment;
  - the source tools' own costs (the Gemini scout);
  - the server;
  - credit returned for failed runs;
  - AskRigor's margin.
- **What the user sees:** the charge after each answer, and an estimate before it starts.
- **How they pay:** credit packs ($10, $25, $50), not a charge per answer, so the fixed part of each payment fee is
  paid once per pack.
- **At a factor of two, on the measured costs:**
  - a checked answer in the user's own AI is about $1. The model check and the rewrite on `gpt-6.1-sol` cost about
    $0.35 to $0.55 together.
  - a web answer on `gpt-6.1-sol` is about $4 at the median and $5 to $6 at the 90th percentile;
  - a web answer on `claude-opus-5-5` is about $10 at the median and $13 to $14 at the 90th percentile;
  - a web answer on `gpt-6-astra` is $20 or more.
- **If `gpt-6.1-terra` meets the owner's criteria:** a default web answer would cost about half.
- **A subscription:** for example, a monthly plan whose price buys somewhat more credit than a pack. It can come after
  the first months of real usage.

## The model check (tier 1)

- **What it is:** a call from AskRigor's server to a frontier model after the code check passes. It gets:
  - the question;
  - the checked answer;
  - the sources' records;
  - the passages the research read (receipts and audits).
- **What it reports:** meaning-level problems, the kind 195a moved out of the code check because code can't judge them:
  - a claim its cited source doesn't support;
  - a number taken out of its context;
  - an important harm or contrary result left out;
  - certainty overstated;
  - two parts of the answer that contradict each other;
  - part of the question left unanswered.
- **Where its findings go:** they are fixes for the user's AI, and limits in the panel. Under 195a only the five code
  checks stop an answer, and the model check doesn't change that.
- **What it can't do:** find a study the research never saw. It can name the search that would.
- **Cost:** what the research read plus the final check's input comes to about 47,000 tokens at the median and
  101,000 at the 90th percentile (27 to 28 Oct runs, about four characters a token). With its instructions it reads
  roughly 60,000 to 110,000 tokens and writes 5,000 to 15,000: about 1% of a research run's input.
- **First measurement, at zero spend:** run it through Codex on the owner's ChatGPT plan over the 96 answers of
  tonight's regression run. Compare its findings with the owner's criteria in the judgment. In the 27 to 28 Oct
  judgment, 51 of 62 unmet criteria were the AI's own research, which the code check can't judge (question 193). This
  measures how many of those a model check catches.
- **Dev mode:**
  - **First:** the check runs on the laptop through the CLI, beside the regression runner.
  - **Later:** the server queues checks for dev accounts and a laptop worker fetches them over an outbound connection,
    so nothing on the server holds the owner's plan login.
  - **Paying users:** always through an API. The plans' terms, read on 29 Oct 2026:
    - **Anthropic:** it doesn't permit routing other people's requests through Free, Pro or Max credentials, and
      products should authenticate with an API key ([Claude Code terms](https://code.claude.com/docs/en/legal-and-compliance)).
      Even the owner's own automated testing on a Max plan is a grey area.
    - **OpenAI:** it documents running Codex on a ChatGPT login for the account holder's own work. Its terms forbid
      making an account available to anyone else, and it says automation should use an API key
      ([Terms of Use](https://openai.com/policies/row-terms-of-use/)).

    So dev mode runs on Codex with the owner's ChatGPT plan, for the owner's own testing only.

## The web app

- **The loop on the server:** HRP's core as the cached system prompt, AskRigor's tools called directly, the code check
  run by the server, and the model sent back with the exact next steps until the check passes or its round limit ends
  the turn. Then the model check, the coherent rewrite, the code check again, and the panel.
- **API or CLI quality:** it is the same model either way; the regressions already run `gpt-6.1-sol` at `xhigh`. The
  gain comes from controlling the loop:
  - the protocol is loaded once;
  - the server, not the chat AI, decides when research is done;
  - the final rewrite;
  - no consumer-app layer: none of the ChatGPT app's hidden refusals, stale tool lists or sign-in switching.

  The measure is the same regression list run through the web loop.
- **Model choice:** the latest Claude and GPT models, defaulting to `gpt-6.1-sol` at `xhigh`, as the owner chose.
  Provider routes, all at list prices:
  - **Direct, through OpenAI's and Anthropic's own APIs:**
    - the full feature set: `gpt-6.1-sol`'s tool calls need OpenAI's Responses API, and Batch and Flex are
      available;
    - two accounts, which the owner opens.
  - **Venice:** it serves all four Claude models and `openai-gpt-61-sol`, `-61-terra`, `-6-astra` and `-6-luna`
    through one OpenAI-compatible endpoint, with tools and `reasoning_effort`.
    - **Billing:** prepaid credits by card or crypto; each staked DIEM gives $1 of credit a day.
    - **Privacy:** Venice withholds the user's identity from the provider, but the provider still sees the prompt, and
      Venice's own page says to assume the provider stores it.
    - **Traps:** its GPT models default to `high` effort; Venice adds its own system prompt unless
      `include_venice_system_prompt` is false; and whether `gpt-6.1-sol`'s tool calls work through its Chat Completions
      endpoint isn't confirmed. That is the first thing to test.
  - **OpenRouter:**
    - list prices plus 5.5% on credit purchases;
    - the same Claude and GPT models, including `gpt-6.1-sol` on Flex.

  Sources: [Venice pricing](https://docs.venice.ai/overview/pricing), [Venice privacy](https://docs.venice.ai/overview/privacy),
  [OpenRouter pricing](https://openrouter.ai/pricing).

## The coherent rewrite (the owner's second pass)

- **Input:** the research's structured findings:
  - claims with their sources;
  - numbers;
  - read depth;
  - harms;
  - limits;
  - the question and the person's aim.
- **Output:** one answer. The bottom line comes first, then the comparison that decides the question, then the limits.
  It adds no new claim, and every claim keeps its source link.
- **Checks:** the code check runs again on the rewrite. If it fails, the earlier checked answer goes out, and the panel
  shows whichever text passed (owner answer 187).
- **In the plugin:** tier 1 returns the rewrite as a suggestion, which the user's AI checks with `finalize_research`
  before showing it.

## Payments

- **What exists:** paid private mode activates on a verified entitlement (`research_private_entitlements`: an HMAC
  account key, a verified source, an optional hashed external reference and a validity window). The public runtime
  can only read it.
- **To build:**
  - a payment webhook that grants and revokes entitlements, through a new least-privilege role;
  - a prepaid credit balance per account;
  - a usage ledger per answer: model, tokens, cost and the price charged;
  - checkout pages.

  Prepaid credit is simpler and fairer than billing afterwards: the balance is the cap, and there are no surprise
  bills or failed charges.
- **Provider:** it depends on the country the business is registered in (question 199). Read on 29 Oct 2026:
  - **[Stripe](https://stripe.com/global):** opens accounts in 44 countries. Senegal isn't one of them, and in Africa
    it works only through Paystack, in five countries.
  - **[Stripe Atlas](https://stripe.com/atlas):** forms a Delaware company with a Stripe account for founders almost
    anywhere, for $500 and then $100 a year. US company filings follow.
  - **[Stripe Managed Payments](https://docs.stripe.com/payments/managed-payments)**, Stripe's merchant of record:
    - generally available since 22 Apr 2026, after an eligibility review, for digital products including AI
      services;
    - for sellers in the EU, the UK, Switzerland, Norway, Liechtenstein, the US, Canada, Australia, Hong Kong, Japan and
      Singapore, with none in Africa;
    - 3.5% on top of the payment fee, which is 2.9% plus 30 cents for a US card.
  - **[Paddle](https://www.paddle.com/pricing)**, a merchant of record: 5% plus 50 cents. Its sellers can be almost
    anywhere, and Senegal isn't on its list of unsupported countries.
  - **[Lemon Squeezy](https://docs.lemonsqueezy.com/help/getting-started/fees):** 5% plus 50 cents, with extras outside
    the US. It is moving its sellers to Stripe Managed Payments.
  - **Why a merchant of record:** it sells in its own name, so it collects and pays the sales taxes of every buyer's
    country (VAT on digital services, US sales tax). That is the main burden of selling software worldwide.
  - **Credit packs at 5% plus 50 cents:** a $25 pack loses about 7%, and a $10 pack about 10%. That is part of why the
    price rule doubles the model cost.
  - **Billing features:** Stripe Billing has meters, prepaid credit grants and thresholds. Prepaid credit kept in
    AskRigor's own ledger needs only one-time checkout payments, which every provider above supports.

## The pricing page (outline)

1. **What you pay for:** the AI model's reading and writing, at the model maker's price, plus AskRigor's share.
2. **Three ways to use AskRigor:**
   - free in your AI app;
   - checked in your AI app;
   - AskRigor on the web.
3. **What every answer gets:** the five checks in plain words, the panel, and the limits written into the answer.
4. **What the model check adds, and what it can't do:** it can't find a study the research never saw, and it isn't a
   doctor.
5. **Why prices vary:** the model, and how much reading the question needs. You see an estimate first and set your own
   cap.
6. **If a run fails:** your credit comes back.
7. **Your data:**
   - free findings cards are public, as the free notice says;
   - paid answers are private;
   - what the model maker does with API data;
   - sharing your question to improve AskRigor is your choice, per answer.
8. **Not medical advice.**

### Draft wording, for the owner's edit

> **Pay for the research, not a subscription.** An AI model reads the studies for you. You pay what that reading
> costs at the model maker's price, plus AskRigor's share, and you see the price before you start.
>
> **Free, in your own AI app.** Connect AskRigor to ChatGPT, Claude or another AI app that takes connectors, and your AI does the research with
> AskRigor's tools. Every answer passes AskRigor's five checks:
>
> - its sources are real and named;
> - each study is described the way it was read;
> - its numbers add up;
> - any safety statement rests on a search for harms;
> - nothing it took back comes back.
>
> What AskRigor learns from free research is published in its public Atlas, written without you.
>
> **Checked, in your own AI app: about $1 an answer.** Everything in Free, plus a second AI reads your answer against
> its sources and flags what code can't judge: a claim its study doesn't support, a number out of context, a harm left
> out, certainty overstated. You get a clearer final answer, checked again, and your findings stay private.
>
> **AskRigor on the web: from about $4 an answer.** AskRigor does the whole research itself, with the model you
> choose, and gives you one clear, checked answer. The price depends on the model and on how much reading your
> question needs. You see an estimate first and set a limit. If a run fails on our side, your credit comes back.
>
> **What no check can do.** AskRigor finds and checks published evidence. It isn't a doctor, and it can't tell you
> about a study nobody has found yet.

## Sharing questions and answers to improve AskRigor (question 200)

What OpenAI and Anthropic do now, read on 29 Oct 2026 from their help and privacy pages:

- **OpenAI** ([how your data is used](https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance),
  [consumer privacy](https://openai.com/consumer-privacy/)):
  - **ChatGPT Free, Plus and Pro:** conversations may be used for training by default. The user can turn that off in
    Data controls, and temporary chats are never used.
  - **Business plans and the API:** not used unless the customer opts in.
  - **Personal information:** OpenAI says it takes steps to reduce it in training data, and removes identifiers where
    possible. It doesn't claim to anonymise.
  - **Retention:** API logs are kept up to 30 days.
- **Anthropic** ([consumer terms change, 28 Aug 2025](https://www.anthropic.com/news/updates-to-our-consumer-terms),
  [model training](https://privacy.claude.com/en/articles/10023555-how-do-you-use-personal-data-in-model-training)):
  - **Claude Free, Pro and Max, Claude Code included:** each user has chosen since then, through a setting in Privacy.
  - **Commercial plans and the API:** never used.
  - **Personal information:**
    - kept "de-identified" for up to five years, which means unlinked from the account;
    - the content itself is only filtered or obscured for sensitive data;
    - no claim to anonymise.
  - **Retention:** 30 days when the user opts out, and 30 days on the API.

So the big providers do learn from consumer chats, by default or by the user's choice, but they unlink and filter;
they don't anonymise. For health questions AskRigor should do more than that, which is why the proposal below is
opt-in per answer, scrubbed, edited by the person, and kept apart from accounts.

- **Proposal:** opt-in, per answer, for everyone. The current free notice promises that AskRigor never saves raw chat
  or prompts, so free accounts keep that promise unless they opt in.
- **What is sent:** the question, the final answer, and the run's tool calls without the sources' full texts. A model
  first removes names, contact details, places and dates, and the user sees the result and can edit it before sending.
- **How it is kept:**
  - stored apart from accounts, with no account key;
  - never public;
  - used only for regression cases and the improvement loop;
  - kept for a fixed period;
  - deleted on request, with a code shown when it is sent.
- **Health data:** health questions are special-category data, so consent must be explicit. Scrubbed free text is
  rarely anonymous, so it stays personal data with every right that goes with it. The privacy page, the privacy data
  map and the notice change with it.

## YouTube searches

- **Measured:** on 27 to 28 Oct, YouTube's daily search limit (200 searches a day under the 23 Oct grant) refused 23
  YouTube calls in 22 of the 96 runs.
- **Bright Data:** no:
  - YouTube's API terms forbid it, read on 29 Oct 2026:
    - the [Developer Policies](https://developers.google.com/youtube/terms/developer-policies) forbid scraping YouTube,
      directly or indirectly, or obtaining scraped YouTube data (III.E.6), and getting API data by any means other
      than the API (III.I.14);
    - the [API Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service) forbid
      exceeding or getting around quota (section 15).

    On a plain reading, buying a scraper's results is obtaining scraped data. The 23 Oct grant is also bound to its use case
    during its six-month probation;
  - Bright Data's YouTube scraper says it handles proxies and CAPTCHAs and bypasses anti-bot measures
    ([its docs](https://docs.brightdata.com/products/scrapers/youtube/introduction)). Getting past bot defences is a
    line not crossed here, even with approval.
- **Instead, at zero spend:**
  - **Find videos without YouTube's search:** the AI's own web search and the Gemini scout find candidates, and
    AskRigor verifies each by ID. That is one `videos.list` unit for up to 50 videos, against a 100-unit search that
    also counts toward the 200 a day.
  - **Reuse identical searches:** reuse a search's results within a day, inside the developer policies' storage limit.
  - **Spread regression runs:** across YouTube's quota day, which resets at midnight Pacific time.
  - **Ask for more:** when the grant is reviewed, ask YouTube for more searches, with these refusals as the usage
    evidence.
- **Whether Gemini is good enough, measured on 27 to 28 Oct:** 15 runs called the Gemini scout.
  - **When it ran:** its 14 complete scouts named 68 candidate videos, and 56 of them (82%) were verified as real
    videos. Only one scout had none verified.
  - **When it didn't:** 6 runs never got a complete scout, because AskRigor refused the AI's request: 7 calls for a
    research target the server didn't accept as de-identified, 4 malformed calls, and 1 failed Gemini request.

  The refusal already says how to restate the target. The cause is the check itself, which uses a word list to decide
  whether a target describes a group of people (`isPopulationLevelResearchTarget` in
  `apps/research-mcp/src/actions/gemini-scout-route.ts`). It refused, for example, a plain question about two forms
  of copper "in humans".
  - **The first fix:** the refusal says which part failed.
  - **The owner's choice:** whether the group-word part is needed at all, beside the exact checks for names, ages,
    contact details and links, is a privacy choice. AGENTS.md says a check that judges meaning isn't repaired by
    adding words to a list.

  Whether the verified videos were relevant isn't measured yet; the next judgment can count it.

## Order of work

1. The model check, offline through Codex on the owner's plan, over tonight's 96 answers: zero spend, no server change.
2. If it catches what the owner's criteria catch, build tier 1 in the plugin, with payments and the pricing page.
3. Build the web loop, measured against the same list through the CLI first. One API run follows only if the owner
   sets a cap for it.
4. Opt-in sharing, with the privacy page, the data map and the notice.

## Owner questions

On the owner questions page:

- 198: what to build first;
- 199: payments, the business's country and the provider;
- 200: sharing questions and answers.

YouTube searches are a "Coming up" item there. They need no decision until a change to the privacy screen.
