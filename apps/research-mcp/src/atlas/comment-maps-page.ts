import { COMMENT_MAPS_PATH, html, page, type AtlasPageReader } from "./pages.js";

/**
 * How AskRigor's comment maps work and what they can't show (the owner, 31 Oct 2026; plan
 * docs/superpowers/plans/2026-10-31-video-comment-maps.md, "Public without approval"). The page is fixed text: it reads
 * nothing, and it shows no map, count or video. The maps themselves are kept privately while AskRigor waits for
 * YouTube's answer (owner answer 208b); the email of 31 Oct told YouTube the counts would appear only in users'
 * research answers, never on public pages. YouTube's branding rules forbid its name in a feature's own name, so the
 * page says "comment maps" and names YouTube only where it describes where the comments come from.
 */
export function renderAtlasCommentMaps(reader?: AtlasPageReader): string {
  const body = html`<p class="breadcrumbs"><a href="/atlas">Atlas</a></p>
<p class="eyebrow">How AskRigor works</p>
<h1>Comment maps</h1>
<p class="lede">Under a health video, people often say what happened when they tried its method. A comment map counts those reports for one video, so you can see how it went for the people who commented without reading thousands of comments.</p>
<div class="notice">
<p><strong>The maps aren’t in the Atlas.</strong> AskRigor reads comments on YouTube videos through YouTube’s API, and on 31 October 2026 it asked YouTube whether it may keep the counts it makes from them. Until YouTube answers, the maps made so far are kept privately for AskRigor’s owner, and none is shown on these pages. AskRigor will delete them if YouTube asks it to.</p>
<p>Nothing on this page comes from YouTube: it describes AskRigor’s own method.</p>
</div>
<section aria-labelledby="map-shows">
<h2 id="map-shows">What a map shows</h2>
<dl class="facts">
<dt>Who tried it</dt>
<dd>How many people said they did the video’s method, and how many comments were read to find them.</dd>
<dt>How it went</dt>
<dd>How many said it helped, changed nothing, made things worse, or did a mix of these. The share who said it helped comes with its 95% range, so a handful of reports shows as uncertain.</dd>
<dt>How long it lasted</dt>
<dd>For the people it helped: right away, for days, weeks, months or years, or not said.</dd>
<dt>Harms</dt>
<dd>The reports of getting worse, sorted into a few kinds with their counts: what to watch for, and when to stop.</dd>
<dt>What else helped</dt>
<dd>Other methods the commenters credit, with how many credit each and how many say it worked better than the video’s method. These are leads for a search of the studies, not verdicts.</dd>
</dl>
</section>
<section aria-labelledby="map-made">
<h2 id="map-made">How a map is made</h2>
<ol>
<li><strong>The comments are read only through YouTube’s API,</strong> the way YouTube lets apps read public comments.</li>
<li><strong>The comments read are chosen without regard to what they say.</strong> When a video has more comments than are read, they are picked by a hash of each comment’s ID, a fixed scramble, so a comment saying the method worked is no more likely to be picked than one saying it didn’t.</li>
<li><strong>Promotion and jokes are left out first:</strong> comments selling or touting a product, a practitioner or a contact, templated testimonials, and jokes. The map says how many were left out.</li>
<li><strong>An AI model reads each comment</strong> and notes whether the person says they tried the method, what happened, how long it lasted, any harm, and anything else they credit. Judging what a comment means takes a model, and it works in any language.</li>
<li><strong>Code does the counting.</strong> Each person counts once, however many comments they wrote; someone who reports both getting better and getting worse counts as mixed.</li>
</ol>
</section>
<section aria-labelledby="map-limits">
<h2 id="map-limits">What a map can’t show</h2>
<ul>
<li><strong>How often the method works.</strong> People who comment aren’t a random group of the people who tried it: those it helped may comment more, or those it failed. That is why a map speaks of “people who commented and said they tried it”, never of a success rate.</li>
<li><strong>Comments no one can see.</strong> Deleted comments, comments held for review, and comments on videos where they are turned off can’t be read.</li>
<li><strong>Whether it lasts.</strong> Most reports are written in the first days after trying the method, and most don’t say how long it lasted. Reports of help that lasted months or years are shown apart.</li>
<li><strong>Who it suits.</strong> A comment rarely says exactly what the person had, or what else they were doing at the time.</li>
<li><strong>A channel’s quality.</strong> A map describes one video. Judging a channel would take maps of at least five of its videos, and the spread across them.</li>
<li><strong>Proof.</strong> What commenters report is a lead. Whether a method works is a question for studies, which AskRigor checks separately, and findings drawn from YouTube comments are never published in the Atlas.</li>
</ul>
</section>
<section aria-labelledby="map-compare">
<h2 id="map-compare">Comparing videos</h2>
<p>When an answer maps several videos about the same problem, it ranks them by the share of people who said the method helped, only against each other and only among videos where at least 20 people said they tried it. Each video keeps its own counts beside its place.</p>
</section>
<section aria-labelledby="map-today">
<h2 id="map-today">Where you can see a map today</h2>
<p>In your own research answer. Ask AskRigor about a health video, or about a method shown in one, and the answer can read that video’s comments through YouTube’s API and give its map, saying how many comments it read and how they were chosen. The map is part of your answer only: AskRigor doesn’t publish it.</p>
</section>
<p class="aside">This page is AskRigor’s own description of its method. YouTube has not reviewed or endorsed it.</p>`;
  return page({
    path: COMMENT_MAPS_PATH,
    title: "Comment maps | AskRigor Atlas",
    description: "How AskRigor counts what people who commented on a health video say happened when they tried its " +
      "method, what a map can’t show, and why the maps aren’t in the Atlas.",
    reader,
    body,
  });
}
