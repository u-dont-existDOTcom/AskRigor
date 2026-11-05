import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { commentMapsBlock, commentMapsFileSchema, type CommentMapsFile } from "./comment-map-pages.js";
import { atlasPageProblems, type AtlasPageProblem } from "./page-guard.js";
import { ACCOUNT_PATH, PRIVATE_PAGES_PATH, html, page, type AtlasPageReader } from "./pages.js";

/**
 * The owner's private page on the Atlas (the owner, 5 November 2026: "i don't see my private pages, they don't show on
 * my askrigor home page"; 2 November, of the comment maps: "i thought you were building this for me privately and then
 * when yt ap[proves we can publish"). Only the signed-in owner can open it: signed out, it asks for a sign-in as the
 * other account pages do, and anyone else signed in gets the Atlas's own "Not found". It shows the owner's comment maps,
 * read from a file on the server that the operator copies from the private owner-pages repository (never from this
 * repository or the image), each map linking its video; and links to the owner's other private pages on GitHub. Nothing
 * here is stored, cached or published: every response is private and never kept.
 */

/** The owner's other private pages, in the private owner-pages repository on GitHub. */
export const OWNER_GITHUB_PAGES = [
  {
    href: "https://github.com/u-dont-existDOTcom/owner-pages/blob/main/askrigor/OWNER-QUESTIONS.md",
    label: "Your questions",
    about: "what AskRigor is waiting for you to decide",
  },
  {
    href: "https://github.com/u-dont-existDOTcom/owner-pages/blob/main/askrigor/atlas-forum-and-site-2026-11-05.md",
    label: "The Atlas, forums and the site",
    about: "5 November",
  },
  {
    href: "https://github.com/u-dont-existDOTcom/owner-pages/blob/main/askrigor/comment-maps-2026-10-31.md",
    label: "The comment maps with their notes and claim checks",
    about: "31 October",
  },
] as const;

/** The most a maps file may hold: 500 maps are well under it. */
export const PRIVATE_COMMENT_MAPS_MAX_BYTES = 16 * 1_024 * 1_024;

/** The comment maps the server holds for the owner: none installed, a file that can't be read, or the maps. */
export type PrivateCommentMaps =
  | { state: "none" }
  | { state: "unreadable" }
  | { state: "installed"; file: CommentMapsFile };

/**
 * The private maps file, read afresh for each request of the owner's page (so a new copy shows at once): none when no
 * path is set or no file is there; unreadable when the path isn't absolute, is not a plain file, is too large, or does
 * not hold a maps file as the schema reads one (commentMapsFileSchema). It never throws.
 */
export async function readPrivateCommentMaps(path: string | undefined): Promise<PrivateCommentMaps> {
  if (path === undefined) return { state: "none" };
  if (!isAbsolute(path)) return { state: "unreadable" };
  let text: string;
  try {
    const handle = await open(path, "r");
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > PRIVATE_COMMENT_MAPS_MAX_BYTES) return { state: "unreadable" };
      text = await handle.readFile("utf8");
    } finally {
      await handle.close();
    }
  } catch (error) {
    return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT" ? { state: "none" } : { state: "unreadable" };
  }
  try {
    const parsed = commentMapsFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? { state: "installed", file: parsed.data } : { state: "unreadable" };
  } catch {
    return { state: "unreadable" };
  }
}

// The one exception to the pages' last check (page-guard.ts), on this page alone: a map's link to its video, exactly as
// the maps' renderer writes it, from an 11-character video ID. Any other YouTube text, a script or a card's reference
// still stops the page, and every other route keeps the last check whole.
const VIDEO_LINK = /<a href="https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}">/gu;

/** What the last check finds in the owner's private page, its maps' video links set aside. */
export function ownerPageProblems(rendered: string): AtlasPageProblem[] {
  return atlasPageProblems(rendered.replace(VIDEO_LINK, "<a>"));
}

export interface AtlasOwnerPagesView {
  maps: PrivateCommentMaps;
  /** The day the page was read (YYYY-MM-DD). */
  readOn: string;
}

/** The owner's private page: the links to the owner's pages on GitHub, then the comment maps or why there are none. */
export function renderAtlasOwnerPages(view: AtlasOwnerPagesView, reader: AtlasPageReader): string {
  const maps = view.maps;
  return page({
    reader,
    path: null,
    noindex: true,
    noReferrer: true,
    current: "private",
    title: "Your private pages | AskRigor Atlas",
    description: "Your private pages, for AskRigor’s owner only.",
    body: html`<p class="breadcrumbs"><a href="/atlas">Atlas</a> › <a href="${ACCOUNT_PATH}">Your account</a></p>
<p class="eyebrow">Private: for AskRigor’s owner only</p>
<h1>Your private pages</h1>
<p class="lede">Only you can open this page. It isn’t published or linked for anyone else, and search engines are asked to leave it out.</p>
<section aria-labelledby="on-github">
<h2 id="on-github">Your pages on GitHub</h2>
<p>These are in AskRigor’s private owner-pages repository, so GitHub shows them when you are signed in there.</p>
<ul>
${OWNER_GITHUB_PAGES.map(({ href, label, about }) => html`<li><a href="${href}">${label}</a> (${about})</li>
`)}</ul>
</section>
<section aria-labelledby="private-maps">
<h2 id="private-maps">Comment maps</h2>
${maps.state === "none" ? html`<p>No comment maps are installed on the server yet.</p>`
    : maps.state === "unreadable" ? html`<p>The comment maps file on the server can’t be read, so no map is shown.</p>`
      : commentMapsBlock(maps.file, { renderedOn: view.readOn, videoLinks: true, shown: "atlas" })}
</section>`,
  });
}
