// Exact comparison of what a push adds against the owner's private comment maps (owner answers 175, 208b and 212b:
// per-video comment counts and IDs stay off public pages). The maps are read from the owner's private pages; this
// file holds no value from them. Three times a map's numbers headed for the public repository and each time a person
// caught them (31 Oct 2026 registry, 1 Nov judgment draft, 2 Nov test fixture). Whether an added line repeats a number
// or an ID is an exact question, so code answers it and nothing here judges meaning.
//
// What it refuses, per map:
//   - a video ID in an added line, a changed file name or a commit message, unless the public branches already hold
//     it (a mapped video's ID is a test fixture and a registry entry; only a new appearance is news);
//   - a comment total of four digits or more as a number of its own;
//   - several of the map's counts within a few lines of each other, when they are most of the numbers there
//     (a SQL parameter list or a table of run results holds many numbers and is not a map).
// Small numbers alone (a sample of 400, twenty people) stay free: ordinary code and prose use them everywhere.
// Limits: it compares digits, so words ("four hundred"), rounded or derived figures (rates, "about 1,200") and
// paraphrases pass; a merge commit's own conflict resolution is not read.

export interface PrivateMap {
  source: string;
  ordinal: number;
  videoIds: string[];
  sample: string | null;
  total: string | null;
  // Every number on the map's "Tried it" line (people, better, no change, worse, mixed), in order, rates left out.
  outcome: string[];
}

export type FindingKind = "video-id" | "comment-total" | "counts";

export interface Finding {
  kind: FindingKind;
  commit: string;
  path: string;
  line: number;
  lastLine: number;
  map: { source: string; ordinal: number };
  // For "video-id": the position in PrivateIndex.videoIds, so a caller can look the ID up without it being printed.
  videoIndex?: number;
}

export interface ScanOptions {
  // Added lines count as close together when their line numbers differ by less than this.
  windowLines: number;
  // This many different counts of two digits or more from one map, inside one window, are refused ...
  minValues: number;
  // ... when at least this share of the window's numbers of two digits or more are that map's counts.
  minPurity: number;
}

export const DEFAULT_SCAN_OPTIONS: ScanOptions = { windowLines: 8, minValues: 3, minPurity: 0.6 };
export const MESSAGE_PATH = "(commit message)";
export const LONE_TOTAL_MIN_DIGITS = 4;

// Group separators of several languages: "1,234", "1.234", "1 234", "1_234" and the no-break spaces.
const SEPARATORS = ",. \u00a0\u202f\u2009_";
const SEPARATOR = new RegExp(`[${SEPARATORS}]`);
// Digits only, not touching a letter, digit or underscore (hex digests, identifiers, "400px") and not a decimal
// fraction or a version part ("3.14", "1.2.3"). CJK text and other scripts may touch a number.
const NUMBER = new RegExp(
  `(?<![0-9A-Za-z_]|[0-9]\\.)(\\d{1,3}(?:[${SEPARATORS}]\\d{3})+|\\d+)(?![0-9A-Za-z_]|\\.[0-9])`,
  "g",
);
const VIDEO_URL = /(?:youtube\.com\/(?:watch\?(?:[^\s)#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/g;
const PERCENT = /\d+(?:[.,]\d+)?\s*(?:[–—-]\s*\d+(?:[.,]\d+)?\s*)?%/g;

// Digits of other scripts (Arabic-Indic, fullwidth, ...) become ASCII digits; their values follow their block order.
function asciiDigits(text: string): string {
  if (!/[^\u0000-\u007f]/.test(text)) return text;
  return text.replace(/\p{Nd}/gu, (digit) => {
    const code = digit.codePointAt(0) ?? 0;
    let offset = 0;
    while (/\p{Nd}/u.test(String.fromCodePoint(code - offset - 1))) offset += 1;
    return String(offset % 10);
  });
}

// Numbers as digit strings with their group separators removed. With `split`, a run joined by commas or spaces is
// also read as a list ("1,234" in a JSON array is two numbers), which is how added lines are read.
export function numbersIn(text: string, split = false): string[] {
  const numbers: string[] = [];
  for (const [run] of asciiDigits(text).matchAll(NUMBER)) {
    const parts = run.split(SEPARATOR);
    numbers.push(parts.join(""));
    if (split && parts.length > 1 && /[, ]/.test(run)) numbers.push(...parts);
  }
  return numbers;
}

function newMap(source: string, ordinal: number, videoIds: string[]): PrivateMap {
  return { source, ordinal, videoIds, sample: null, total: null, outcome: [] };
}

// A map starts at a line that links a video and runs to the next such line or heading. Its header line says
// "comments read: 400 of 1,234" (or "all 87"); its "Tried it" bullet carries the outcome counts.
export function parsePrivateMaps(markdown: string, source: string): PrivateMap[] {
  const maps: PrivateMap[] = [];
  let current: PrivateMap | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^#{1,2}\s/.test(line)) current = null;
    const ids = [...new Set([...line.matchAll(VIDEO_URL)].map((match) => match[1]!))];
    if (ids.length > 0) {
      current = newMap(source, maps.length + 1, ids);
      maps.push(current);
    }
    if (current === null) continue;
    const read = /comments read:\s*([^·|;]*)/i.exec(line);
    if (read !== null) {
      const numbers = numbersIn(read[1]!);
      const all = /\ball\b/i.test(read[1]!);
      current.sample = numbers[0] ?? null;
      current.total = all ? current.sample : numbers[1] ?? null;
    }
    const tried = /\*\*Tried it:\*\*(.*)$/i.exec(line);
    if (tried !== null) current.outcome = numbersIn(tried[1]!.replace(PERCENT, " "));
  }
  return maps;
}

// The structured store the owner's private Atlas view of the maps is rendered from (owner-pages
// askrigor/comment-maps.json). Reading it as well as the pages means a page's layout can't hide a map: on 5 Nov 2026
// six maps written on the page as one summary table, without video links, were not read until that was noticed.
export const MAPS_JSON_SCHEMA = "askrigor.comment-maps.v1";

export function parsePrivateMapsJson(text: string, source: string): PrivateMap[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (typeof data !== "object" || data === null || (data as { schema?: unknown }).schema !== MAPS_JSON_SCHEMA) return [];
  const entries = (data as { maps?: unknown }).maps;
  if (!Array.isArray(entries)) return [];
  const count = (value: unknown): string | null =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  const maps: PrivateMap[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const map = entry as { video_id?: unknown; sampled?: unknown; corpus?: unknown; tried?: unknown; outcomes?: unknown };
    const outcomes = (typeof map.outcomes === "object" && map.outcomes !== null ? map.outcomes : {}) as Record<string, unknown>;
    const videoId = typeof map.video_id === "string" && /^[A-Za-z0-9_-]{11}$/.test(map.video_id) ? map.video_id : null;
    maps.push({
      source,
      ordinal: maps.length + 1,
      videoIds: videoId === null ? [] : [videoId],
      sample: count(map.sampled),
      total: count(map.corpus),
      // In the order of a page's "Tried it" line: people, better, no change, worse, mixed.
      outcome: [map.tried, outcomes.better, outcomes.no_change, outcomes.worse, outcomes.mixed]
        .map(count).filter((value): value is string => value !== null),
    });
  }
  return maps;
}

interface MapProfile {
  // Counts of two digits or more: sample, total and outcome numbers.
  distinct: ReadonlySet<string>;
  // The outcome numbers with how often each occurs, when the line has enough of them to be a fingerprint.
  tuple: ReadonlyMap<string, number> | null;
}

export interface PrivateIndex {
  maps: PrivateMap[];
  videoIds: Array<{ id: string; map: number }>;
  totals: Map<string, number[]>;
  hits: Map<string, number[]>;
  profiles: MapProfile[];
}

function profileOf(map: PrivateMap): MapProfile {
  const distinct = new Set(
    [map.sample, map.total, ...map.outcome].filter((value): value is string => value !== null && value.length >= 2),
  );
  const counted = new Map<string, number>();
  for (const value of map.outcome) counted.set(value, (counted.get(value) ?? 0) + 1);
  const fingerprint = map.outcome.length >= 4 && map.outcome.some((value) => value.length >= 2);
  return { distinct, tuple: fingerprint ? counted : null };
}

export function buildIndex(maps: PrivateMap[]): PrivateIndex {
  const index: PrivateIndex = { maps, videoIds: [], totals: new Map(), hits: new Map(), profiles: maps.map(profileOf) };
  const seen = new Set<string>();
  const add = (table: Map<string, number[]>, value: string, map: number) => {
    const owners = table.get(value) ?? [];
    if (!owners.includes(map)) table.set(value, [...owners, map]);
  };
  maps.forEach((map, position) => {
    for (const id of map.videoIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      index.videoIds.push({ id, map: position });
    }
    if (map.total !== null && map.total.length >= LONE_TOTAL_MIN_DIGITS) add(index.totals, map.total, position);
    const profile = index.profiles[position]!;
    for (const value of profile.distinct) add(index.hits, value, position);
    for (const value of profile.tuple?.keys() ?? []) add(index.hits, value, position);
  });
  return index;
}

// Whatever the script prints passes through here, so a path or message can never carry a value out.
export function redact(text: string, index: PrivateIndex): string {
  let clean = asciiDigits(text);
  for (const { id } of index.videoIds) clean = clean.split(id).join("[private video ID]");
  return clean.replace(NUMBER, (run) =>
    numbersIn(run, true).some((number) => index.totals.has(number)) ? "[private total]" : run);
}

interface RecentLine {
  line: number;
  tokens: string[];
}

export interface ScanResult {
  findings: Finding[];
  commits: number;
}

// Reads `git log -p -U0` output whose format is "\x01<sha>", the message, "\x02", then the diff, and returns the
// findings of every commit in order. Merge commits carry no diff there, so only their messages are read. Video IDs
// the caller says are already public (`isPublic`) are not findings.
export async function scanDiff(
  lines: AsyncIterable<string> | Iterable<string>,
  index: PrivateIndex,
  options: ScanOptions = DEFAULT_SCAN_OPTIONS,
  isPublic: (videoId: string, commit: string) => boolean | Promise<boolean> = () => false,
): Promise<ScanResult> {
  const findings: Finding[] = [];
  let commits = 0;
  let commit = "";
  let path: string | null = null;
  let state: "message" | "header" | "hunk" = "header";
  let counter = 0;
  // The added lines with numbers of the last `windowLines` line numbers, and where each map's last finding ended.
  let recent: RecentLine[] = [];
  let reachedAt = new Map<number, number>();
  const reported = new Set<string>();

  const report = (kind: FindingKind, map: number, line: number, lastLine = line, videoIndex?: number) => {
    const key = `${kind}\0${commit}\0${path}\0${map}\0${line}`;
    if (reported.has(key)) return;
    reported.add(key);
    const { source, ordinal } = index.maps[map]!;
    findings.push({ kind, commit, path: path ?? "", line, lastLine, map: { source, ordinal }, videoIndex });
  };

  // The tightest run of recent lines ending here in which one map has enough different counts, or all its outcome
  // numbers, and its counts are most of the numbers of two digits or more.
  const clusterOf = (map: number, lastEnd: number) => {
    const { distinct, tuple } = index.profiles[map]!;
    let best: { first: number; values: number } | null = null;
    for (let from = recent.length - 1; from >= 0; from -= 1) {
      const window = recent.slice(from);
      if (window[0]!.line <= lastEnd) break;
      const values = new Set<string>();
      const counts = new Map<string, number>();
      let own = 0;
      let all = 0;
      for (const { tokens } of window) {
        for (const token of tokens) {
          // One-digit numbers say nothing either way: every data file and list has them.
          if (token.length >= 2) all += 1;
          if (distinct.has(token)) {
            own += 1;
            values.add(token);
          }
          if (tuple?.has(token)) counts.set(token, (counts.get(token) ?? 0) + 1);
        }
      }
      const covered = tuple !== null && [...tuple].every(([value, needed]) => (counts.get(value) ?? 0) >= needed);
      if ((values.size >= options.minValues || covered) && own / all >= options.minPurity) {
        if (best === null || values.size > best.values) best = { first: window[0]!.line, values: values.size };
      }
    }
    return best;
  };

  const scanText = (text: string, line: number) => {
    for (const [position, { id, map }] of index.videoIds.entries()) {
      if (text.includes(id)) report("video-id", map, line, line, position);
    }
    if (!/[0-9]|\p{Nd}/u.test(text)) return;
    const tokens = numbersIn(text, true);
    const mapsHit = new Set<number>();
    for (const token of tokens) {
      for (const map of index.totals.get(token) ?? []) report("comment-total", map, line);
      for (const map of index.hits.get(token) ?? []) mapsHit.add(map);
    }
    if (line === 0) return;
    recent.push({ line, tokens });
    recent = recent.filter((entry) => entry.line > line - options.windowLines);
    for (const map of mapsHit) {
      const found = clusterOf(map, reachedAt.get(map) ?? -1);
      if (found === null) continue;
      report("counts", map, found.first, line);
      reachedAt.set(map, line);
    }
  };

  const endFile = () => {
    recent = [];
    reachedAt = new Map();
  };

  const scanPath = (name: string) => {
    path = name;
    scanText(name, 0);
  };

  let messageLine = 0;
  for await (const text of lines) {
    if (text.startsWith("\x01")) {
      endFile();
      commit = text.slice(1).trim();
      commits += 1;
      state = "message";
      path = MESSAGE_PATH;
      messageLine = 0;
      continue;
    }
    if (state === "message") {
      const end = text.indexOf("\x02");
      const body = end === -1 ? text : text.slice(0, end);
      if (end === -1 || body !== "") scanText(body, ++messageLine);
      if (end !== -1) {
        endFile();
        path = null;
        state = "header";
      }
      continue;
    }
    if (text.startsWith("diff --git ")) {
      endFile();
      path = null;
      state = "header";
      continue;
    }
    if (state === "header") {
      if (text.startsWith("+++ ")) {
        const name = diffPath(text.slice(4));
        if (name !== null) scanPath(name);
        continue;
      }
      if (!text.startsWith("@@")) continue;
      state = "hunk";
    }
    if (text.startsWith("@@")) {
      counter = Number(/\+(\d+)/.exec(text)?.[1] ?? 1);
    } else if (path !== null && text.startsWith("+")) {
      scanText(text.slice(1), counter++);
    } else if (text.startsWith(" ")) {
      counter += 1;
    }
  }

  const kept: Finding[] = [];
  const known = new Map<string, boolean>();
  for (const finding of findings) {
    if (finding.kind === "video-id" && finding.videoIndex !== undefined) {
      const id = index.videoIds[finding.videoIndex]!.id;
      const key = `${id}\0${finding.commit}`;
      if (!known.has(key)) known.set(key, await isPublic(id, finding.commit));
      if (known.get(key)) continue;
    }
    kept.push(finding);
  }
  return { findings: kept, commits };
}

// "b/dir/file.md", "b/dir/file name.md<TAB>" or a quoted path; null for a deleted file.
function diffPath(header: string): string | null {
  const bare = header.replace(/\t.*$/, "");
  if (bare === "/dev/null") return null;
  const unquoted = bare.startsWith('"') && bare.endsWith('"')
    ? bare.slice(1, -1).replace(/\\(["\\])/g, "$1")
    : bare;
  return unquoted.replace(/^b\//, "");
}

export function describeFinding(finding: Finding): string {
  const where = `map ${finding.map.ordinal} of ${finding.map.source}`;
  if (finding.kind === "video-id") return `a video ID of ${where}`;
  if (finding.kind === "comment-total") return `a comment total of ${where}`;
  return `several counts of ${where} close together`;
}
