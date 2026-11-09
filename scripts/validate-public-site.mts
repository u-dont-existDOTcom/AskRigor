import { lstat, readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";

export interface SiteValidationResult {
  pages: 8;
  internalLinks: number;
  errors: string[];
}

const pageRequirements = [
  {
    path: "index.html",
    title: "AskRigor | Evidence-first research retrieval",
    canonical: "https://askrigor.com/",
    fragments: [
      "does not diagnose",
      "does not treat or prescribe",
      "not a substitute for professional advice",
      "provider data may be incomplete, delayed, or unavailable"
    ]
  },
  {
    path: "privacy/index.html",
    title: "Privacy | AskRigor",
    canonical: "https://askrigor.com/privacy",
    fragments: [
      "public YouTube author/channel IDs",
      "display names",
      "comment and reply text",
      "NCBI/PubMed",
      "Europe PMC",
      "ClinicalTrials.gov",
      "Crossref",
      "YouTube Data API v3",
      "Google Privacy Policy",
      "does not require Google or YouTube sign-in",
      "creates no Google/YouTube account connection or authorization grant",
      "YouTube refresh, storage, and deletion",
      "expires after 72 hours without use and no later than seven days after creation",
      "released immediately after successful report finalization",
      "hourly sweep removes expired files",
      "acknowledge and agree to this Privacy Notice before using",
      "During research",
      "does not create user accounts",
      "connected client",
      "operational metadata",
      "Public evidence-gap contributions",
      "OpenAI ChatGPT",
      "Auth0",
      "no automatic expiration"
    ]
  },
  {
    path: "terms/index.html",
    title: "Terms | AskRigor",
    canonical: "https://askrigor.com/terms",
    fragments: [
      "read-only",
      "lawful use",
      "no medical, legal, or financial advice",
      "rate limits",
      "YouTube Terms of Service",
      "third-party",
      "as available",
      "applicable law",
      "Evidence-gap contributions"
    ]
  },
  {
    path: "support/index.html",
    title: "Support | AskRigor",
    canonical: "https://askrigor.com/support",
    fragments: [
      "accessibility",
      "security",
      "Do not email API keys",
      "emergency",
      "local emergency services"
    ]
  },
  {
    path: "add/index.html",
    title: "Add AskRigor | AskRigor",
    canonical: "https://askrigor.com/add",
    fragments: [
      "https://mcp.askrigor.com/mcp",
      "Add custom connector",
      "coming to ChatGPT's app directory",
      "doesn't diagnose, treat or prescribe"
    ]
  },
  {
    path: "roadmap/index.html",
    title: "Roadmap | AskRigor",
    canonical: "https://askrigor.com/roadmap",
    fragments: [
      "What we're building.",
      '<section id="why">',
      "Why it works this way",
      '<section id="whats-new">',
      "What's new",
      "Tell us what you think",
      "doesn't diagnose, treat or prescribe"
    ]
  },
  {
    path: "compare/index.html",
    title: "Compare: the same AI, with and without AskRigor | AskRigor",
    canonical: "https://askrigor.com/compare",
    fragments: [
      "doesn't diagnose, treat or prescribe",
      "isn't a substitute for professional advice",
      'href="/compare/free-chatgpt"',
      '<link rel="stylesheet" href="/assets/compare.css">'
    ]
  },
  {
    path: "compare/free-chatgpt/index.html",
    title: "ChatGPT Instant, with the research done | AskRigor",
    canonical: "https://askrigor.com/compare/free-chatgpt",
    fragments: [
      "doesn't diagnose, treat or prescribe",
      "isn't a substitute for professional advice",
      "Worked for 5 min 50 s",
      "Neither answer is medical advice",
      '<link rel="stylesheet" href="/assets/compare.css">'
    ]
  }
] as const;

const expectedFiles = new Set([
  ...pageRequirements.map(({ path }) => path),
  "assets/askrigor-mark.svg",
  "assets/site.css",
  "assets/compare.css",
  // Openly licensed photos for the free ChatGPT page, credited on it (Wikimedia Commons, CC BY-SA 4.0 and CC BY 4.0).
  "assets/piliostigma/shrub-senegal.jpg",
  "assets/piliostigma/dried-leaves-nigeria.jpg",
  "assets/piliostigma/sign-senegal.jpg",
  "robots.txt"
]);

/**
 * robots.txt (owner answer 224a): the sitemap of reviewed findings, and no rule that keeps crawlers from a finding or
 * topic page, whose noindex they must read to keep an unreviewed one out of search results.
 */
export function validateRobots(text: string): string[] {
  const errors: string[] = [];
  const lines = text.split("\n").map((line) => line.replace(/#.*$/u, "").trim()).filter(Boolean);
  for (const required of ["User-agent: *", "Sitemap: https://askrigor.com/atlas/sitemap.xml", "Disallow: /atlas/search"]) {
    if (!lines.includes(required)) errors.push(pathError("robots.txt", `is missing: ${required}`));
  }
  for (const line of lines.filter((entry) => /^disallow:/iu.test(entry))) {
    const path = line.replace(/^disallow:\s*/iu, "");
    if (path === "/" || path === "/atlas" || path === "/atlas/" || /^\/atlas\/(?:findings|topics|map|changes)/u.test(path)) {
      errors.push(pathError("robots.txt", `must not keep crawlers from ${path}: its noindex has to be read`));
    }
  }
  return errors;
}

const commonFragments = [
  "joel@askrigor.com",
  "AskRigor is a product operated by Mayan Roots LLC.",
  'href="/privacy"',
  'href="/terms"',
  'href="/support"',
  'class="skip-link" href="#content"',
  'rel="icon" href="/assets/askrigor-mark.svg" type="image/svg+xml"',
  'class="brand-mark" src="/assets/askrigor-mark.svg"',
  'aria-label="Primary navigation"',
  // The menu item for the benefit comparisons (the owner, 5 Nov 2026).
  '<li><a href="/compare">Compare</a></li>',
  '<li><a href="/add">Add AskRigor</a></li>',
  '<li><a href="/roadmap">Roadmap</a></li>',
  'aria-label="Footer navigation"'
] as const;

const prohibitedPatterns = [
  [/<script\b/i, "must not contain scripts"],
  [/<form\b/i, "must not contain forms"],
  [/http:\/\//i, "must not contain insecure HTTP URLs"],
  [/https?:\/\/[^\s"']+\.(?:css|woff2?|ttf|png|jpe?g|gif|svg|webp)/i, "must not load remote assets"],
  [/\b(?:TBD|TODO)\b/, "must not contain placeholders"],
  [/\{\{[^}]+\}\}|<%[^%]+%>/, "must not contain template markers"],
  [/(?:google-analytics|gtag\(|segment\.io|mixpanel|tracking pixel)/i, "must not contain tracking or analytics"],
  [/(?:api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{8,}/i, "must not contain embedded credentials"]
] as const;

function countMatches(value: string, expression: RegExp): number {
  return [...value.matchAll(expression)].length;
}

function pathError(path: string, message: string): string {
  return `${path}: ${message}`;
}

async function collectFiles(rootPath: string): Promise<{ files: string[]; errors: string[] }> {
  const files: string[] = [];
  const errors: string[] = [];

  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      errors.push(pathError(relative(rootPath, directory) || ".", "directory is missing or unreadable"));
      return;
    }

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const fullPath = resolve(directory, entry.name);
      const sitePath = relative(rootPath, fullPath).replaceAll("\\", "/");
      let status;
      try {
        status = await lstat(fullPath);
      } catch {
        errors.push(pathError(sitePath, "path is unreadable"));
        continue;
      }

      if (status.isSymbolicLink()) {
        errors.push(pathError(sitePath, "symlinks are not allowed"));
      } else if (status.isDirectory()) {
        await visit(fullPath);
      } else if (status.isFile()) {
        files.push(sitePath);
      } else {
        errors.push(pathError(sitePath, "only regular files are allowed"));
      }
    }
  }

  await visit(rootPath);
  return { files, errors };
}

function validateHtml(path: string, html: string, requirement: (typeof pageRequirements)[number]): { errors: string[]; internalLinks: number } {
  const errors: string[] = [];
  const add = (message: string) => errors.push(pathError(path, message));

  if (!/<html\s+lang="en">/i.test(html)) add('must set lang="en"');
  if (!html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">')) add("must include viewport metadata");
  if (!/<meta name="description" content="[^"\n]+">/i.test(html)) add("must include a nonempty description");
  if (!html.includes(`<title>${requirement.title}</title>`)) add("has an incorrect title");
  if (!html.includes(`<link rel="canonical" href="${requirement.canonical}">`)) add("has an incorrect canonical URL");
  if (!html.includes('<link rel="stylesheet" href="/assets/site.css">')) add("must use the shared stylesheet");
  if (countMatches(html, /<main\b/gi) !== 1) add("must contain exactly one main element");
  if (countMatches(html, /<h1\b/gi) !== 1) add("must contain exactly one h1 element");
  if (!/<main\b[^>]*\bid="content"/i.test(html)) add('must provide main id="content" for the skip link');
  if (!html.includes("<header")) add("must include a shared header");
  if (!html.includes("<footer")) add("must include a shared footer");

  for (const fragment of commonFragments) {
    if (!html.includes(fragment)) add(`is missing required content: ${fragment}`);
  }
  for (const fragment of requirement.fragments) {
    if (!html.includes(fragment)) add(`is missing required content: ${fragment}`);
  }
  for (const [pattern, message] of prohibitedPatterns) {
    if (pattern.test(html)) add(message);
  }

  const internalLinks = [...html.matchAll(/<a\b[^>]*\shref="(\/[^"\s]*)"/gi)]
    .filter(([, href]) => !href.startsWith("//"))
    .length;
  return { errors, internalLinks };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
] as const;

const RELEASE_RECORD = /^(\d{4})-(\d{2})-(\d{2})-.+-production-release\.md$/u;

/**
 * Every production release record has its line in the roadmap's "What's new" (the owner, 6 Nov 2026: release notes
 * people will notice, kept with the roadmap). A record in docs/audits named YYYY-MM-DD-...-production-release.md needs a
 * fold in the roadmap's whats-new section whose summary is that day, written "4 November 2026". An exact check of
 * dates and names only: what the notes say is the author's call.
 */
export function validateWhatsNew(roadmapHtml: string, releaseRecords: readonly string[]): string[] {
  const section = /<section id="whats-new">([\s\S]*?)<\/section>/u.exec(roadmapHtml)?.[1];
  if (section === undefined) return [pathError("roadmap/index.html", 'is missing its "What\'s new" section (<section id="whats-new">)')];
  const summaries = new Set([...section.matchAll(/<summary>([^<]+)<\/summary>/gu)].map((match) => match[1].trim()));
  // A release with nothing people would notice (dependency updates, internal fixes) is named in one comment instead:
  // <!-- Releases people wouldn't notice: 2026-10-11, ... -->
  const quiet = new Set(
    [...section.matchAll(/<!-- Releases people wouldn't notice: ([0-9, -]+) -->/gu)]
      .flatMap((match) => match[1].split(",").map((date) => date.trim()))
      .filter((date) => date !== "")
  );
  const errors: string[] = [];
  for (const record of [...releaseRecords].sort()) {
    const match = RELEASE_RECORD.exec(record);
    if (!match) continue;
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      errors.push(pathError(`docs/audits/${record}`, "has an impossible date in its name"));
      continue;
    }
    const expected = `${day} ${MONTH_NAMES[month - 1]} ${match[1]}`;
    if (quiet.has(`${match[1]}-${match[2]}-${match[3]}`)) continue;
    if (!summaries.has(expected)) {
      errors.push(pathError("roadmap/index.html", `"What's new" has no fold for the release recorded in docs/audits/${record}: add <summary>${expected}</summary> with what people will notice`));
    }
  }
  return errors;
}

function validateBrandMark(svg: string): string[] {
  const errors: string[] = [];
  const required = [
    '<svg xmlns="http://www.w3.org/2000/svg"',
    'viewBox="0 0 72 72"',
    'id="askrigor-mark-gradient"',
    'aria-label="AskRigor science and community mark"',
    "</svg>"
  ];
  for (const fragment of required) {
    if (!svg.includes(fragment)) errors.push(pathError("assets/askrigor-mark.svg", `is missing required SVG content: ${fragment}`));
  }
  if (/<script\b/i.test(svg)) errors.push(pathError("assets/askrigor-mark.svg", "must not contain scripts"));
  return errors;
}

function validateCss(css: string): string[] {
  const errors: string[] = [];
  const required = [":focus-visible", "prefers-reduced-motion", "prefers-color-scheme: dark", "max-width"];
  for (const fragment of required) {
    if (!css.includes(fragment)) errors.push(pathError("assets/site.css", `is missing required style: ${fragment}`));
  }
  if (!/@media\s*\([^)]*(?:48rem|[0-4]?\d(?:\.\d+)?rem)[^)]*\)/.test(css)) {
    errors.push(pathError("assets/site.css", "must include a responsive media query at or below 48rem"));
  }
  if (/https?:\/\//i.test(css)) errors.push(pathError("assets/site.css", "must not load remote assets"));
  return errors;
}

export async function validatePublicSite(root: URL): Promise<SiteValidationResult> {
  const rootPath = fileURLToPath(root);
  const errors: string[] = [];
  let rootStatus;
  try {
    rootStatus = await lstat(rootPath);
  } catch {
    return { pages: 8, internalLinks: 0, errors: [pathError(".", "site root is missing or unreadable")] };
  }
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) {
    return { pages: 8, internalLinks: 0, errors: [pathError(".", "site root must be a real directory")] };
  }

  const { files, errors: fileErrors } = await collectFiles(rootPath);
  errors.push(...fileErrors);
  for (const file of files) {
    if (!expectedFiles.has(file)) errors.push(pathError(file, "unexpected file"));
  }
  for (const file of expectedFiles) {
    if (!files.includes(file)) errors.push(pathError(file, "required file is missing"));
  }

  let internalLinks = 0;
  for (const requirement of pageRequirements) {
    const filePath = resolve(rootPath, requirement.path);
    let html: string;
    try {
      html = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const result = validateHtml(requirement.path, html, requirement);
    internalLinks += result.internalLinks;
    errors.push(...result.errors);
  }

  try {
    errors.push(...validateRobots(await readFile(resolve(rootPath, "robots.txt"), "utf8")));
  } catch {
    // Missing: reported with the expected files above.
  }

  try {
    errors.push(...validateBrandMark(await readFile(resolve(rootPath, "assets/askrigor-mark.svg"), "utf8")));
  } catch {
    // The required-file error above is the stable diagnostic for a missing mark.
  }

  try {
    errors.push(...validateCss(await readFile(resolve(rootPath, "assets/site.css"), "utf8")));
  } catch {
    // The required-file error above is the stable diagnostic for a missing stylesheet.
  }

  // Release notes: checked when the repository's release records sit beside the site (always in the repository and
  // CI; a site folder copied elsewhere has none to compare).
  let releaseRecords: string[] | undefined;
  try {
    releaseRecords = await readdir(resolve(rootPath, "../docs/audits"));
  } catch {
    releaseRecords = undefined;
  }
  if (releaseRecords !== undefined) {
    try {
      errors.push(...validateWhatsNew(await readFile(resolve(rootPath, "roadmap/index.html"), "utf8"), releaseRecords));
    } catch {
      // A missing roadmap is reported with the expected files above.
    }
  }

  return { pages: 8, internalLinks, errors: errors.sort((left, right) => left.localeCompare(right)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validatePublicSite(new URL("../site/", import.meta.url));
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(`Validated AskRigor public site: ${pageRequirements.length} pages`);
  }
}