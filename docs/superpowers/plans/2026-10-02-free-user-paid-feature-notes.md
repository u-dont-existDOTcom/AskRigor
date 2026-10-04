# Free users see the paid features they're missing

Date: 2026-10-02. Status: **REQUIREMENT RECORDED; built with the first paid
feature. The Bright Data search runs on Claude only (owner question 23: A).**

## The owner's words

Owner, 2026-10-02, first message:

> I would like Free users to know that they are missing out on paid features
> whenever they are. So for Bright Data for example, for the free user it may
> say "Paid users can also check forum signal in Facebook, TikTok, Instagram."

Owner, 2026-10-02, second message, which sharpens the first:

> also i'd like free users to know what they're missing. so instead of silently
> dropping paid features, they should get a message: "Facebook, tiktok,
> instagram posts can only be inspected with the paid version."
> and whatever other paid features

## The requirement

- AskRigor never drops a paid feature silently for a free user. When a paid
  feature would have been used for this request, a free contributor's answer
  carries a message saying so, in the owner's form: "<what> can only be
  <done> with the paid version."
- Every paid feature gets such a message, not only the Bright Data search.
- The message must be true where it is shown:
  - the paid version can do the thing on that surface, ChatGPT or Claude;
  - it names only what the paid feature really covers.

  Whether paid access can be bought yet does not hold the message back. The
  owner's second message replaces the first record's condition that it did.
- Paid accounts never see it. It sits at the end of the answer, once, in the
  answer's language.

## Design

The server already knows the account's mode (free contributor or paid private)
and the surface (`/mcp` for ChatGPT, `/mcp/claude` for Claude).
`finalize_research` already returns sentences the answer must carry, and checks
translated ones through `caveat_renderings` and `answer_language`.

- **The registry.** A small server-side list of paid features. Each entry has:
  - when it applies (for the Bright Data search: the request would have
    searched those platforms);
  - the surfaces where paid accounts have it;
  - its message.
- **The message.** For a free account, `finalize_research` adds each applicable
  entry's message, on the surfaces where the paid version has the feature. The
  existing answer check then holds the answer to it, like the other
  server-written sentences.
- **Tests.** The message:
  - appears only for free accounts, only when its feature applies, and only on
    surfaces where paid accounts have it;
  - never appears for paid accounts;
  - passes in a translated answer.

## State today

No paid feature is built yet, so no message shows. Paid private access exists,
but its difference is about saving, not a capability an answer drops, and the
free notice already states it.

## First message: the Bright Data community search

This goes live when the paid search does, and only on Claude, where it runs
(owner question 23: A). Free ChatGPT users don't see it, because paid ChatGPT
users won't have the search either.

- The owner's wording: "Facebook, TikTok, Instagram posts can only be inspected
  with the paid version."
- **What the 2026-10-01 test reached:**
  - TikTok posts and comments worked.
  - For Facebook, only public groups worked; search found no page posts.
  - Instagram found one public post on a retry, but its comments came back
    empty.
- **Before launch:** retest Instagram, then use the owner's wording with only
  the platforms the paid search really covers. If Instagram stays empty, the
  message reads "Facebook group and TikTok posts can only be inspected with the
  paid version." X can be added, since X posts worked.

## Second message: Amazon reviews (owner, 2026-10-03)

The owner, while answering owner question 30 (product reviews as community
evidence): "and amazon is really important, butit looks like we might need to
use Bright Data for this module to get good results, make sure free
subscribers know they would need to upgrade for that."

- Amazon shows a few reviews on a product page; the full set needs a login,
  and plain fetching is often blocked. Bright Data's Amazon review data
  reaches the full set, so reading it is part of the paid Bright Data search,
  on Claude only (owner question 23: A).
- **When it applies:** a free Claude account's research maps Amazon as a
  review platform for the product. `finalize_research` already records this
  in `community_searches` as a `review_site` with `review_corpora`.
- **Wording, in the owner's form:** "Full Amazon review sets can only be
  inspected with the paid version."
- **Before launch:** test what Bright Data's Amazon review data returns for a
  real product: how many reviews, which fields, and the credits per product.
  Keep reviewer names and IDs out of answers and records (HRP
  UniqueFirsthandUnit).

## Owner direction, 2026-10-03: ChatGPT users should know what they miss

The owner: "30. chatgpt users should be aware of what they're missing on
chatgpt vs claude (we don't need to name Bright Data if that violates plugin
guidelines). vs the web app once that's funcitonal and i guess web app can
switch between calling claude and chatgpt depending on which one supports
which connector? bc chatgpt has reddit, claude has bright data, etc."

OpenAI's Plugin Guidelines, rechecked 2026-10-03 (same page as below), under
"Commerce and monetization":

> Selling digital products or services—including subscriptions, digital
> content, tokens, or credits—is not allowed, whether offered directly or
> indirectly (for example, through freemium upsells).

> Plugins must not display subscription plans, initiate new subscriptions, or
> promote upgrades.

> If a certain plugin feature requires a different plan or entitlement [...]
> the plugin may explain that.

Plugins may link to an informational page about plans, never to checkout.
Under "Respect user intent": "Do not insert unrelated content, attempt to
redirect the interaction [...]". The same section says a plugin "must not
provide a worse version" of a feature that the developer's own website or
application also offers.

So the constraint is not Bright Data's name. It is pointing ChatGPT users to
Claude or to an upgrade. Owner question 32 asked how a ChatGPT answer says
what it could not check.

**Owner decision 32: B (2026-10-03).** The owner: "ok then yes it should be
option B that's obvious since it's permitted, and make sure it's compatible
with Claude terms as well."

- A ChatGPT answer says plainly what it could not check, in a line the server
  adds, for example: "This answer could not check TikTok, Facebook groups or
  full Amazon review sets." It never names Claude, a paid plan or an upgrade.
- It links an informational page on askrigor.com that says what each version
  covers (ChatGPT, Claude, and the web app once it works), with no checkout or
  sign-up link. OpenAI allows linking "to an informational page describing
  available plans"; its rule against comparisons covers a plugin's name,
  description and prompts, not the developer's own site.
- Claude: Anthropic's Software Directory Policy (last updated 2026-04-15) bars
  software that "serves advertisements, sponsored content, paid product
  placements, or exists primarily as an advertising or promotional vehicle".
  It has no rule against saying a feature needs a paid plan or linking the
  developer's own page, so free Claude users get the paid-feature message
  and the same link.
- The page's wording comes to the owner for approval when the first paid
  feature is built; it must describe only what is live.

**The web app's routing idea.** Bright Data runs on AskRigor's server, not
inside Claude. So AskRigor's own web app could give it to whichever AI it
calls; the Claude-only limit comes from OpenAI's plugin rules for the ChatGPT
plugin. Reddit is the provider-bound case: ChatGPT reads it through OpenAI's
own search, and Claude's web tools cannot. Whether OpenAI's API search reaches
Reddit for a web app is untested. The owner asked to test it through Venice
(owner question 33): Venice runs GPT models with its own web search and
scraping, not OpenAI's, so that test shows whether Venice's scraper reads
Reddit, not whether ChatGPT's search does. Bright Data already read about half
of a Reddit thread's comments in the 2026-10-01 test. The web app also pays for model calls,
which the current $0 model-API policy forbids until the owner decides
otherwise. The "worse version" clause needs a check when the web app nears
launch.

## OpenAI's plugin rule (checked 2026-10-02)

OpenAI's Plugin Guidelines
(https://developers.openai.com/apps-sdk/app-submission-guidelines), under
third-party content and integrations, forbid two things:

- scraping external websites, relaying queries or integrating third-party APIs
  without proper authorization and compliance with that party's terms of
  service;
- bypassing a third party's API restrictions, rate limits or access controls.

This bears on two AskRigor sources:

- **The Bright Data search.** Its TikTok, Facebook and Instagram collection is
  scraping that those platforms don't authorize, and its unblocking works
  around their access controls.
- **AskRigor's own YouTube transcripts.** The transcript route uses YouTube's
  unofficial Innertube interface (`packages/sources/src/youtube-transcript.ts`
  says so). Production doesn't serve it today: it was an action for the Custom
  GPT only, and the OAuth production setup leaves those actions off.

Anthropic's Software Directory Policy (last updated 2026-04-15) has no such
clause. It requires respect for intellectual property, data minimization, and
a privacy policy.

So the ChatGPT plugin should use authorized sources only. The "fix transcript
fetching" item should not expose the unofficial interface. Reading public
videos through Google's official Gemini API, as planned for "check this video",
is the authorized route.

## Owner decision 23: A, Claude only (2026-10-02)

The owner answered "23 A":

- The Bright Data social search runs only for Claude connector users
  (`/mcp/claude`) and for the owner.
- The ChatGPT plugin (`/mcp`) uses authorized sources only: no Bright Data and
  no unofficial YouTube transcripts.
- Free Claude users get the paid-feature message for this search. ChatGPT users
  get no offer their plugin can't provide.
- The remaining exposure is that collecting on Claude still lacks the sites'
  permission. Anthropic's directory policy doesn't forbid it, and the owner
  accepted it.
