import { z } from "zod";

import { ATLAS_CSS, html, page } from "./pages.js";

/**
 * The owner's comment maps as an Atlas page, shown only to the owner until YouTube agrees (owner answer 227, 2 Nov 2026:
 * "i thought you were building this for me privately and then when yt ap[proves we can publish"; owner answer 208b).
 * Nothing here is served: scripts/render-private-comment-maps.mts renders the owner's private maps file to a file outside
 * this repository. A map holds counts, AskRigor's own labels, the video's ID and its channel's name, as the 31 Oct email
 * to YouTube describes: never comment text, commenters' names or keys, or comment IDs. A model judged each comment before;
 * code works out every share and range here from the counts.
 */

const count = z.number().int().min(0).max(10_000_000);
const words = (max: number) => z.string().trim().min(1).max(max);
const outcomesSchema = z.object({ better: count, no_change: count, worse: count, mixed: count }).strict();
type Outcomes = z.output<typeof outcomesSchema>;
const total = (outcomes: Outcomes) => outcomes.better + outcomes.no_change + outcomes.worse + outcomes.mixed;

export const commentMapSchema = z.object({
  video_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/u),
  /** AskRigor's own words for the video and its method, never the video's title from YouTube. */
  label: words(200),
  /** The problem the method is for, in AskRigor's words: videos are ranked only against others for the same problem. */
  problem: words(120),
  channel: words(120),
  mapped_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  corpus: count,
  sampled: count,
  /** Every comment the API showed, or those whose IDs rank lowest by hash (chosen without regard to what they say). */
  sample: z.enum(["all", "lowest_hash"]),
  left_out: z.object({ promotion: count, joke: count }).strict(),
  /** People who said they did the video's method; each counts once, as mixed when they reported more than one outcome. */
  tried: count,
  outcomes: outcomesSchema,
  /** How long the better reports said it had lasted: reports, so a person may count more than once. */
  better_reports_lasted: z.object({ immediate: count, days: count, weeks: count, months: count, years: count,
    not_stated: count }).strict(),
  harm_kinds: z.array(z.object({ kind: words(160), people: count }).strict()).max(40),
  leads: z.array(z.object({
    method: words(160),
    people: count,
    outcomes: outcomesSchema,
    helped_more_than_video: count,
    helped_after_video_failed: count,
  }).strict()).max(60),
}).strict().superRefine((map, context) => {
  const problem = (message: string) => context.addIssue({ code: "custom", message });
  if (total(map.outcomes) !== map.tried) problem("the outcomes must add up to the people who tried it");
  if (map.sampled > map.corpus) problem("more comments read than the video has");
  if (map.tried > map.sampled) problem("more people who tried it than comments read");
  if (map.left_out.promotion + map.left_out.joke > map.sampled) problem("more comments left out than read");
  if (map.sample === "all" && map.sampled !== map.corpus) problem("a sample of all comments reads every one");
  for (const lead of map.leads) {
    if (total(lead.outcomes) !== lead.people) problem(`the outcomes of "${lead.method}" must add up to its people`);
    if (lead.helped_more_than_video > lead.people || lead.helped_after_video_failed > lead.people) {
      problem(`"${lead.method}" has more people helped than people who credit it`);
    }
  }
});
export type CommentMap = z.output<typeof commentMapSchema>;

export const commentMapsFileSchema = z.object({
  schema: z.literal("askrigor.comment-maps.v1"),
  maps: z.array(commentMapSchema).min(1).max(500),
}).strict().superRefine((file, context) => {
  const seen = new Set<string>();
  for (const { video_id } of file.maps) {
    if (seen.has(video_id)) context.addIssue({ code: "custom", message: "each video has one map" });
    seen.add(video_id);
  }
});
export type CommentMapsFile = z.output<typeof commentMapsFileSchema>;

// The counts ------------------------------------------------------------------------------------------------------------

const Z95 = 1.959964;

/** The 95% Wilson range of k in n, as fractions; null when n is 0. */
export function wilsonRange(k: number, n: number): { low: number; high: number } | null {
  if (n === 0) return null;
  const p = k / n;
  const z2 = Z95 * Z95;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = Z95 * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / (1 + z2 / n);
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

const rangeWords = (k: number, n: number) => {
  const range = wilsonRange(k, n);
  return range === null ? "no range" : `${Math.round(range.low * 100)}–${Math.round(range.high * 100)}%`;
};
// In a narrow table cell a range keeps its dash with its numbers (word joiners, U+2060).
const cellRange = (k: number, n: number) => rangeWords(k, n).replace("–", "⁠–⁠");

/** A video needs this many people who said they tried its method to be ranked (plan 2026-10-31-video-comment-maps.md). */
export const RANK_MIN_TRIED = 20;

export interface ProblemRanking {
  problem: string;
  /** Ranked by the low end of the better share's range, then by people who tried it. */
  ranked: CommentMap[];
  /** Fewer than RANK_MIN_TRIED people who said they tried it: listed, never ranked. */
  tooFew: CommentMap[];
}

/** Videos ranked only against others for the same problem; problems with more videos first. */
export function rankWithinProblems(maps: readonly CommentMap[]): ProblemRanking[] {
  const groups = new Map<string, CommentMap[]>();
  for (const map of maps) groups.set(map.problem, [...(groups.get(map.problem) ?? []), map]);
  const low = (map: CommentMap) => wilsonRange(map.outcomes.better, map.tried)?.low ?? 0;
  const byLabel = (left: CommentMap, right: CommentMap) => left.label.localeCompare(right.label, "en");
  return [...groups.entries()]
    .map(([problem, group]) => ({
      problem,
      ranked: group.filter(({ tried }) => tried >= RANK_MIN_TRIED)
        .sort((left, right) => low(right) - low(left) || right.tried - left.tried || byLabel(left, right)),
      tooFew: group.filter(({ tried }) => tried < RANK_MIN_TRIED)
        .sort((left, right) => right.tried - left.tried || byLabel(left, right)),
    }))
    .sort((left, right) => right.ranked.length + right.tooFew.length - left.ranked.length - left.tooFew.length ||
      left.problem.localeCompare(right.problem, "en"));
}

// The page --------------------------------------------------------------------------------------------------------------

export interface PrivateCommentMapsOptions {
  /** The day the page was rendered (YYYY-MM-DD). */
  renderedOn: string;
  /** Whether each map links its video: in the owner's private view only (decision 171 bars YouTube links on the Atlas). */
  videoLinks: boolean;
}

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
const lasted = (map: CommentMap) => map.better_reports_lasted.months + map.better_reports_lasted.years;
const thousands = (n: number) => n.toLocaleString("en-GB");

type Lead = CommentMap["leads"][number];
/** Ranked by how many people said each helped, then by how many credit it (the plan's "what else helped"). */
const byHelped = (left: Lead, right: Lead) => right.outcomes.better - left.outcomes.better ||
  right.people - left.people || left.method.localeCompare(right.method, "en");

function leadItem(lead: Lead) {
  return html`<li>${lead.method}: ${people(lead.people)} (better ${lead.outcomes.better}, no change ${lead.outcomes.no_change}, worse ${lead.outcomes.worse}, mixed ${lead.outcomes.mixed})${lead.helped_more_than_video === 0 ? ""
    : html`; ${lead.helped_more_than_video} said it helped more than the video’s method`}${lead.helped_after_video_failed === 0
    ? "" : html`; ${lead.helped_after_video_failed} after the video’s method failed`}</li>
`;
}

/** The leads two or more people credit, then the rest folded away, so a long tail stays readable. */
function leadList(leads: readonly Lead[]) {
  if (leads.length === 0) return html`Nothing else was credited.`;
  const ranked = [...leads].sort(byHelped);
  const shown = ranked.filter(({ people: n }) => n >= 2);
  const rest = ranked.filter(({ people: n }) => n < 2);
  return html`${shown.length === 0 ? "" : html`<ul>
${shown.map(leadItem)}</ul>`}${rest.length === 0 ? "" : html`<details><summary>${rest.length === 1
    ? "1 more, credited by one person" : `${rest.length} more, each credited by one person`}</summary><ul>
${rest.map(leadItem)}</ul></details>`}`;
}

function mapSection(map: CommentMap, index: number, options: PrivateCommentMapsOptions) {
  const { outcomes, better_reports_lasted: held } = map;
  const sample = map.sample === "all" ? "every comment the API showed"
    : `the ${thousands(map.sampled)} whose IDs rank lowest by hash, chosen without regard to what they say`;
  return html`<section class="comment-map" id="map-${index + 1}" aria-labelledby="map-${index + 1}-title">
<h3 id="map-${index + 1}-title">${map.label}</h3>
<p class="meta">${map.channel} · for ${map.problem} · mapped ${map.mapped_on}${options.videoLinks
    ? html` · <a href="https://www.youtube.com/watch?v=${map.video_id}">the video</a>` : ""}</p>
<dl class="facts">
<dt>Who tried it</dt>
<dd>${people(map.tried)} said they did the video’s method, in ${thousands(map.sampled)} comments read of ${thousands(map.corpus)}: ${sample}.</dd>
<dt>How it went</dt>
<dd>Better ${outcomes.better}, no change ${outcomes.no_change}, worse ${outcomes.worse}, mixed ${outcomes.mixed}. Better: ${rangeWords(outcomes.better, map.tried)} of those who tried it (the 95% range).</dd>
<dt>How long it had lasted</dt>
<dd>Reports of getting better: right away ${held.immediate}, days ${held.days}, weeks ${held.weeks}, months ${held.months}, years ${held.years}, not said ${held.not_stated}.</dd>
<dt>What went wrong</dt>
<dd>${map.harm_kinds.length === 0 ? "No harm was reported." : map.harm_kinds.map(({ kind, people: n }, at) =>
    html`${at === 0 ? "" : "; "}${kind} (${n})`)}</dd>
<dt>What else they credit</dt>
<dd>${leadList(map.leads)}</dd>
<dt>Left out before counting</dt>
<dd>${map.left_out.promotion} promotion, ${map.left_out.joke} ${map.left_out.joke === 1 ? "joke" : "jokes"}.</dd>
</dl>
</section>
`;
}

const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase("en") + text.slice(1);
const FIGURE_HEADINGS = html`<th scope="col">Tried it</th><th scope="col">Better</th><th scope="col">Worse</th><th scope="col">Lasted months or years</th>`;
const figureCells = (map: CommentMap) => html`<td>${map.tried}</td><td>${map.outcomes.better} (${cellRange(map.outcomes.better, map.tried)})</td><td>${map.outcomes.worse} (${cellRange(map.outcomes.worse, map.tried)})</td><td>${lasted(map)}</td>`;

/** A problem with two or more videos: those with enough reports ranked, the others listed. Tables scroll inside the
 * Atlas's scroll container on a narrow screen, never the page. */
function problemSection(ranking: ProblemRanking, index: number, link: (map: CommentMap) => ReturnType<typeof html>) {
  return html`<section aria-labelledby="problem-${index + 1}">
<h3 id="problem-${index + 1}">${capitalized(ranking.problem)}</h3>
${ranking.ranked.length === 0 ? "" : html`<div class="map-scroll"><table>
<caption>Ranked by the low end of the range of those who said it helped</caption>
<thead><tr><th scope="col">Video</th>${FIGURE_HEADINGS}</tr></thead>
<tbody>
${ranking.ranked.map((map) => html`<tr><td>${link(map)} (${map.channel})</td>${figureCells(map)}</tr>
`)}</tbody>
</table></div>
`}${ranking.tooFew.length === 0 ? "" : html`<p>Too few reports to rank (fewer than ${RANK_MIN_TRIED} people who said they tried it): ${ranking.tooFew.map((map, at) =>
    html`${at === 0 ? "" : "; "}${link(map)} (${people(map.tried)})`)}.</p>
`}</section>
`;
}

/** The problems with one video mapped so far, in one table: nothing to rank them against yet. */
function singleVideoProblems(rankings: readonly ProblemRanking[], link: (map: CommentMap) => ReturnType<typeof html>) {
  const rows = rankings.flatMap(({ problem, ranked, tooFew }) => [...ranked, ...tooFew].map((map) => ({ problem, map })))
    .sort((left, right) => left.problem.localeCompare(right.problem, "en"));
  return html`<section aria-labelledby="one-video">
<h3 id="one-video">One video so far</h3>
<p>Each of these problems has one video mapped, so there is nothing to rank it against yet.</p>
<div class="map-scroll"><table>
<thead><tr><th scope="col">Problem</th><th scope="col">Video</th>${FIGURE_HEADINGS}</tr></thead>
<tbody>
${rows.map(({ problem, map }) => html`<tr><td>${capitalized(problem)}</td><td>${link(map)} (${map.channel})${map.tried < RANK_MIN_TRIED
    ? html`; too few reports to rank` : ""}</td>${figureCells(map)}</tr>
`)}</tbody>
</table></div>
</section>
`;
}

/** The owner's private page of comment maps: grouped by problem, ranked within each, then every map. */
export function renderPrivateCommentMaps(file: CommentMapsFile, options: PrivateCommentMapsOptions): string {
  const maps = file.maps;
  const rankings = rankWithinProblems(maps);
  const link = (map: CommentMap) => html`<a href="#map-${maps.indexOf(map) + 1}">${map.label}</a>`;
  const videos = (ranking: ProblemRanking) => ranking.ranked.length + ranking.tooFew.length;
  const shared = rankings.filter((ranking) => videos(ranking) > 1);
  const single = rankings.filter((ranking) => videos(ranking) === 1);
  const body = html`<p class="breadcrumbs"><a href="/atlas">Atlas</a></p>
<p class="eyebrow">Private: for AskRigor’s owner only</p>
<h1>Comment maps</h1>
<div class="notice">
<p><strong>Not published.</strong> These maps are drawn from YouTube comments, so they stay private until YouTube agrees; AskRigor asked on 31 October 2026. Rendered on ${options.renderedOn} from ${maps.length} ${maps.length === 1 ? "map" : "maps"}. None of it is on askrigor.com.</p>
<p>Each count is of people who commented and said they tried the video’s method, never a success rate: people it helped may comment more, deleted comments can’t be seen, and most reports are from the first days. The range is the 95% range of the share who said it helped, worked out from the counts, so a small sample shows as uncertain. What else commenters credit are leads for a search of the studies, not verdicts.</p>
</div>
<section aria-labelledby="by-problem">
<h2 id="by-problem">By problem</h2>
<p>A video is ranked only against others for the same problem, and only when at least ${RANK_MIN_TRIED} people said they tried its method.</p>
${shared.length === 0 ? html`<p>No problem has two videos mapped yet, so nothing is ranked.</p>
` : shared.map((ranking, index) => problemSection(ranking, index, link))}${single.length === 0 ? ""
    : singleVideoProblems(single, link)}</section>
<section aria-labelledby="the-maps">
<h2 id="the-maps">The maps</h2>
${maps.map((map, index) => mapSection(map, index, options))}</section>`;
  return page({
    path: null,
    noindex: true,
    title: "Comment maps (private) | AskRigor Atlas",
    description: "The owner’s private comment maps, not published until YouTube agrees.",
    body,
  });
}

const STYLESHEET_LINK = '<link rel="stylesheet" href="/atlas/atlas.css">';

/**
 * A rendered page as one file to open on its own: the stylesheet written in, and the Atlas's own links pointed at
 * askrigor.com, since a file has no server behind it.
 */
export function standaloneAtlasPage(rendered: string): string {
  if (rendered.split(STYLESHEET_LINK).length !== 2) throw new Error("ATLAS_PAGE_STYLESHEET_LINK_NOT_FOUND");
  return rendered.replace(STYLESHEET_LINK, () => `<style>\n${ATLAS_CSS}</style>`)
    .replace(/(href|action)="\/atlas/gu, '$1="https://askrigor.com/atlas');
}
