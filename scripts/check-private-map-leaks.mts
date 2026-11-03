import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import {
  buildIndex,
  DEFAULT_SCAN_OPTIONS,
  describeFinding,
  MESSAGE_PATH,
  parsePrivateMaps,
  redact,
  scanDiff,
  type Finding,
  type PrivateIndex,
  type PrivateMap,
} from "./lib/private-map-leaks.mts";

// Refuses a push that would publish numbers or IDs from the owner's private comment maps. The maps stay on the
// owner's laptop (a private page), so on CI or another machine the check says it was skipped and passes.
//   pre-push <remote name> <remote URL>   what git's pre-push hook passes; reads the refs from standard input
//   range <git log revisions...>          scans any commits, for example `range origin/main..HEAD` or `range main`
// The hook is .githooks/pre-push; it stays off until the owner runs `git config core.hooksPath .githooks`.

export const MAPS_VARIABLE = "ASKRIGOR_PRIVATE_COMMENT_MAPS";
const MAP_FILE = /^comment-maps-.*\.md$/;
const MAX_LISTED_FINDINGS = 20;
// `range` hands its arguments to `git log`, some of whose options write files, so only revisions and these pass.
const REVISION_OPTION = /^--(?:not|all|branches|tags|remotes(?:=\S*)?)$/;

export interface CheckIo {
  environment: NodeJS.ProcessEnv;
  cwd: string;
  home: string;
  readStdin: () => Promise<string>;
  stderr: (text: string) => void;
}

export function defaultMapsDirectory(home: string = homedir()): string {
  return join(home, "claude-work", "owner-pages", "askrigor");
}

// The variable holds files or folders (several with the platform's path delimiter); a folder contributes its
// comment-maps-*.md files. A path that cannot be read counts as absent.
export function mapFilesFrom(environment: NodeJS.ProcessEnv, home: string = homedir()): string[] {
  const configured = environment[MAPS_VARIABLE];
  const entries = configured === undefined || configured === ""
    ? [defaultMapsDirectory(home)]
    : configured.split(delimiter).filter((entry) => entry !== "");
  const files: string[] = [];
  for (const entry of entries) {
    try {
      if (statSync(entry).isDirectory()) {
        for (const name of readdirSync(entry).sort()) if (MAP_FILE.test(name)) files.push(join(entry, name));
      } else {
        files.push(entry);
      }
    } catch {
      // A path that is missing, or that a sandbox cannot read, holds no maps for this machine.
    }
  }
  return files;
}

function git(args: string[], cwd: string) {
  return spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C" } });
}

// The commits a push publishes: what the pushed refs reach that the remote already has neither under its old tip
// nor in the remote-tracking refs of that remote.
function prePushRevisions(stdin: string, remoteName: string | undefined, cwd: string): { revisions: string[]; known: string[] } {
  const pushed = new Set<string>();
  const known = new Set<string>();
  for (const line of stdin.split("\n")) {
    const [, localSha, , remoteSha] = line.trim().split(/\s+/);
    if (localSha === undefined || /^0*$/.test(localSha)) continue;
    pushed.add(localSha);
    if (remoteSha !== undefined && !/^0*$/.test(remoteSha) && git(["cat-file", "-e", `${remoteSha}^{commit}`], cwd).status === 0) {
      known.add(remoteSha);
    }
  }
  if (pushed.size === 0) return { revisions: [], known: [] };
  const revisions = [...pushed, "--not", ...known];
  if (remoteName !== undefined && git(["remote"], cwd).stdout.split("\n").includes(remoteName)) {
    revisions.push(`--remotes=${remoteName}`);
  }
  return { revisions, known: [...known] };
}

// A video ID the public branches already hold is no news: the push adds nothing the repository does not show.
// `trees` names the commits whose files count as public for the commit being scanned.
export function publicIdChecker(cwd: string, trees: (commit: string) => string[]) {
  return (id: string, commit: string): boolean => {
    const revisions = trees(commit);
    return revisions.length > 0 && git(["grep", "-q", "-F", "-e", id, ...revisions, "--"], cwd).status === 0;
  };
}

function remoteTips(remoteName: string | undefined, known: string[], cwd: string): string[] {
  const tips = new Set(known);
  if (remoteName !== undefined) {
    const listed = git(["for-each-ref", "--format=%(objectname)", `refs/remotes/${remoteName}/`], cwd);
    for (const sha of listed.stdout.split("\n")) if (sha !== "") tips.add(sha);
  }
  return [...tips];
}

export async function* gitLogLines(revisions: string[], cwd: string): AsyncGenerator<string> {
  const child = spawn("git", [
    "-c", "core.quotePath=false", "log", "--reverse", "-p", "-U0", "-M", "--no-color", "--no-ext-diff",
    "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/", "--format=%x01%H%n%B%x02", ...revisions, "--",
  ], { cwd, env: { ...process.env, LC_ALL: "C", LANG: "C" }, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    if (stderr.length < 2_048) stderr += chunk.toString("utf8");
  });
  const finished = new Promise<number | null>((done, fail) => {
    child.on("error", fail);
    child.on("close", done);
  });
  for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) yield line;
  const status = await finished;
  if (status !== 0) throw new Error(`git log exited with ${status}: ${stderr.trim()}`);
}

function formatFinding(finding: Finding, index: PrivateIndex): string {
  const span = finding.lastLine > finding.line ? `-${finding.lastLine}` : "";
  const where = finding.path === MESSAGE_PATH
    ? `${MESSAGE_PATH} line ${finding.line}`
    : finding.line === 0
      ? `${redact(finding.path, index)} (file name)`
      : `${redact(finding.path, index)}:${finding.line}${span}`;
  return `  ${finding.commit.slice(0, 8)} ${where}: ${describeFinding(finding)}`;
}

function loadMaps(files: string[]): { maps: PrivateMap[]; empty: string[] } {
  const maps: PrivateMap[] = [];
  const empty: string[] = [];
  for (const file of files) {
    const found = parsePrivateMaps(readFileSync(file, "utf8"), basename(file));
    if (found.length === 0) empty.push(basename(file));
    maps.push(...found);
  }
  return { maps, empty };
}

export async function runPrivateMapCheck(argv: string[], io: CheckIo): Promise<number> {
  const [mode, ...rest] = argv;
  const badRange = mode === "range" && (rest.length === 0 || rest.some((arg) => arg.startsWith("-") && !REVISION_OPTION.test(arg)));
  if ((mode !== "pre-push" && mode !== "range") || badRange) {
    io.stderr("Usage: check-private-map-leaks.mts pre-push <remote name> <remote URL> | range <revisions, --not, --all, --branches, --tags, --remotes>\n");
    return 2;
  }

  const files = mapFilesFrom(io.environment, io.home);
  if (files.length === 0) {
    io.stderr(
      `Private-map check skipped: no comment maps found or readable (${MAPS_VARIABLE}, else ${defaultMapsDirectory(io.home)}); `
      + "this is probably CI or another machine.\n",
    );
    return 0;
  }

  let index: PrivateIndex | undefined;
  try {
    const { maps, empty } = loadMaps(files);
    for (const name of empty) io.stderr(`Private-map check: ${name} holds no map the reader recognizes.\n`);
    if (maps.length === 0) {
      io.stderr(
        "Push refused: private comment maps are here but none was recognized, so the check cannot protect them. "
        + "The page's layout may have changed (scripts/lib/private-map-leaks.mts parsePrivateMaps).\n",
      );
      return 1;
    }
    index = buildIndex(maps);

    let revisions = rest;
    let trees = (commit: string) => [`${commit}^`];
    if (mode === "pre-push") {
      const push = prePushRevisions(await io.readStdin(), rest[0], io.cwd);
      revisions = push.revisions;
      const tips = remoteTips(rest[0], push.known, io.cwd);
      trees = () => tips;
    }
    if (revisions.length === 0) {
      io.stderr("Private-map check: nothing is being pushed.\n");
      return 0;
    }
    const { findings, commits } = await scanDiff(
      gitLogLines(revisions, io.cwd),
      index,
      DEFAULT_SCAN_OPTIONS,
      publicIdChecker(io.cwd, trees),
    );
    if (findings.length === 0) {
      io.stderr(`Private-map check: ${commits} commit(s) against ${maps.length} map(s) from ${files.length} file(s); nothing to refuse.\n`);
      return 0;
    }

    const shown = index;
    const listed = findings.slice(0, MAX_LISTED_FINDINGS).map((finding) => formatFinding(finding, shown));
    if (findings.length > listed.length) listed.push(`  ... and ${findings.length - listed.length} more`);
    const flagged = new Set(findings.map((finding) => finding.commit)).size;
    io.stderr(
      "Push refused: it would publish numbers or IDs from the owner's private comment maps "
      + `(${findings.length} place(s) in ${flagged} of ${commits} commit(s)).\n${listed.join("\n")}\n`
      + "The values are not printed. Remove them, and invent numbers that match no private map. "
      + "If a match is a coincidence, the owner decides: `git push --no-verify` skips this check.\n",
    );
    return 1;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    io.stderr(`Private-map check could not run: ${index === undefined ? reason : redact(reason, index)}\n`);
    return 1;
  }
}

async function readProcessStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  process.exitCode = await runPrivateMapCheck(process.argv.slice(2), {
    environment: process.env,
    cwd: process.cwd(),
    home: homedir(),
    readStdin: readProcessStdin,
    stderr: (text) => void process.stderr.write(text),
  });
}
