import { lstat, readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";

export interface SiteValidationResult {
  pages: 4;
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
      "acknowledge and agree to this Privacy Notice before using",
      "During research",
      "does not create user accounts",
      "connected client",
      "operational metadata"
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
      "applicable law"
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
  }
] as const;

const expectedFiles = new Set([
  ...pageRequirements.map(({ path }) => path),
  "assets/site.css"
]);

const commonFragments = [
  "joel@askrigor.com",
  'href="/privacy"',
  'href="/terms"',
  'href="/support"',
  'class="skip-link" href="#content"',
  'aria-label="Primary navigation"',
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
    return { pages: 4, internalLinks: 0, errors: [pathError(".", "site root is missing or unreadable")] };
  }
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) {
    return { pages: 4, internalLinks: 0, errors: [pathError(".", "site root must be a real directory")] };
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
    errors.push(...validateCss(await readFile(resolve(rootPath, "assets/site.css"), "utf8")));
  } catch {
    // The required-file error above is the stable diagnostic for a missing stylesheet.
  }

  return { pages: 4, internalLinks, errors: errors.sort((left, right) => left.localeCompare(right)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validatePublicSite(new URL("../site/", import.meta.url));
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log("Validated AskRigor public site: 4 pages");
  }
}
