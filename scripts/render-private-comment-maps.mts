// Renders the owner's private comment maps as one Atlas page (owner answer 227, 2 Nov 2026: built privately, published
// when YouTube agrees). The maps file and the page both stay outside this repository, which is public: the maps are
// drawn from YouTube comments (owner answers 173, 175 and 208b).
//
// Usage: npx tsx scripts/render-private-comment-maps.mts <maps.json> <page.html> [--no-video-links]
import { realpath, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  commentMapsFileSchema,
  renderPrivateCommentMaps,
  standaloneAtlasPage,
} from "../apps/research-mcp/src/atlas/comment-map-pages.js";

const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Whether a resolved path is the repository or inside it. */
export function insideRepository(path: string, repository = REPOSITORY): boolean {
  const from = relative(repository, path);
  return from === "" || (!from.startsWith("..") && !isAbsolute(from));
}

/** Reads, checks and renders the maps; refuses a maps file or a page inside the repository, links followed. */
export async function renderPrivateCommentMapsFile(input: string, output: string,
  options: { videoLinks: boolean; renderedOn: string; repository?: string }): Promise<{ maps: number }> {
  const repository = await realpath(options.repository ?? REPOSITORY);
  const source = await realpath(input);
  const target = resolve(await realpath(dirname(resolve(output))), basename(output));
  if (insideRepository(source, repository) || insideRepository(target, repository)) {
    throw new Error("The private maps and their page stay outside this repository, which is public.");
  }
  const file = commentMapsFileSchema.parse(JSON.parse(await readFile(source, "utf8")));
  const page = renderPrivateCommentMaps(file, { videoLinks: options.videoLinks, renderedOn: options.renderedOn });
  await writeFile(target, standaloneAtlasPage(page), { encoding: "utf8", mode: 0o600 });
  return { maps: file.maps.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const [input, output] = args.filter((arg) => !arg.startsWith("--"));
  if (input === undefined || output === undefined) {
    console.error("Usage: npx tsx scripts/render-private-comment-maps.mts <maps.json> <page.html> [--no-video-links]");
    process.exit(2);
  }
  const { maps } = await renderPrivateCommentMapsFile(input, output, {
    videoLinks: !args.includes("--no-video-links"),
    renderedOn: new Date().toISOString().slice(0, 10),
  });
  console.log(`Rendered ${maps} comment maps to ${output}`);
}
