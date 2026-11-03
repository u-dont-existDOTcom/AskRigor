import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mapFilesFrom, MAPS_VARIABLE } from "../scripts/check-private-map-leaks.mts";
import { buildIndex, numbersIn, parsePrivateMaps, redact, scanDiff } from "../scripts/lib/private-map-leaks.mts";

// Every figure and ID below is invented, and was compared with the owner's private pages and found on none of them.
const VIDEO_ONE = "Aq7_Zv-Lm3k";
const VIDEO_TWO = "Zk3-q9_Wx5m";
const INVENTED_MAPS = `# Invented comment maps

Private by design; every figure here is invented for the tests.

## An invented routine, for an invented complaint

[Invented Channel](https://www.youtube.com/watch?v=${VIDEO_ONE}) · comments read: 350 of 7,413 · YouTube units: 640 · left out: 3 promotion

- **Tried it:** 53 people. Better 41, no change 3, worse 6, mixed 3; better 66–86% of those who tried.
- **What went wrong:** nausea (4); a fall (2).

## A second invented routine

[Another Channel](https://youtu.be/${VIDEO_TWO}) · comments read: all 187 · YouTube units: 12 · left out: none

- **Tried it:** 36 people. Better 24, no change 5, worse 5, mixed 2; better 51–77% of those who tried.

## Next to map

Several more videos, after the list ends.
`;

const index = buildIndex(parsePrivateMaps(INVENTED_MAPS, "comment-maps-invented.md"));

// The format of `git log -p -U0 --format=%x01%H%n%B%x02`, with one new file per entry.
function diffOf(files: Record<string, string[]>, message = "A change"): string[] {
  const lines = [`\x01${"c".repeat(40)}`, ...message.split("\n"), "\x02", ""];
  for (const [path, added] of Object.entries(files)) {
    lines.push(
      `diff --git a/${path} b/${path}`,
      "new file mode 100644",
      "--- /dev/null",
      `+++ b/${path}`,
      `@@ -0,0 +1,${added.length} @@`,
      ...added.map((line) => `+${line}`),
    );
  }
  return lines;
}

async function findingsOf(files: Record<string, string[]>, message?: string, isPublic?: () => boolean) {
  return (await scanDiff(diffOf(files, message), index, undefined, isPublic)).findings;
}

describe("numbers in text", () => {
  it("reads the group separators of several languages as one number", () => {
    for (const written of ["7413", "7,413", "7.413", "7 413", "7 413", "7 413", "7_413"]) {
      expect(numbersIn(`total: ${written} comments`)).toEqual(["7413"]);
    }
  });

  it("reads a comma or space run also as a list when asked, as added lines are read", () => {
    expect(numbersIn("[350,187]", true)).toEqual(expect.arrayContaining(["350187", "350", "187"]));
    expect(numbersIn("350 187", true)).toEqual(expect.arrayContaining(["350", "187"]));
    expect(numbersIn("350,187")).toEqual(["350187"]);
  });

  it("leaves out decimals, versions, hex digests, identifiers and units", () => {
    expect(numbersIn("v1.2.3 3.14 0x1f4 ab1234cd id_400 400px 9.5% 200.00 12ab")).toEqual([]);
  });

  it("reads digits of other scripts and numbers touching CJK text", () => {
    expect(numbersIn("٣٥٠")).toEqual(["350"]);
    expect(numbersIn("３５０")).toEqual(["350"]);
    expect(numbersIn("有350人")).toEqual(["350"]);
  });
});

describe("reading a private map", () => {
  it("takes the video ID, sample, total and outcome counts, and leaves rates out", () => {
    const maps = parsePrivateMaps(INVENTED_MAPS, "comment-maps-invented.md");
    expect(maps).toHaveLength(2);
    expect(maps[0]).toMatchObject({ ordinal: 1, videoIds: [VIDEO_ONE], sample: "350", total: "7413", outcome: ["53", "41", "3", "6", "3"] });
    expect(maps[1]).toMatchObject({ ordinal: 2, videoIds: [VIDEO_TWO], sample: "187", total: "187", outcome: ["36", "24", "5", "5", "2"] });
  });

  it("starts a map at every line that links a video, headed or not", () => {
    const text = `## Two of them\n\n**First** ([the video](https://www.youtube.com/watch?v=${VIDEO_ONE})) · comments read: 120 of 2,468\n`
      + `- **Tried it:** 12 people. Better 8, no change 1, worse 2, mixed 1.\n\n**Second** ([the video](https://youtu.be/${VIDEO_TWO})) · comments read: all 90\n`;
    const maps = parsePrivateMaps(text, "comment-maps-x.md");
    expect(maps.map((map) => [map.videoIds, map.sample, map.total, map.outcome])).toEqual([
      [[VIDEO_ONE], "120", "2468", ["12", "8", "1", "2", "1"]],
      [[VIDEO_TWO], "90", "90", []],
    ]);
  });

  it("recognizes nothing in a page without a linked video", () => {
    expect(parsePrivateMaps("# Notes\n\nNothing mapped yet: 350 of 7,413.\n", "comment-maps-x.md")).toEqual([]);
  });
});

describe("refusing what a push would publish", () => {
  it("refuses a video ID in an added line and names the file and line", async () => {
    const findings = await findingsOf({ "tests/fixtures/video.json": ["{", `  "videoId": "${VIDEO_ONE}",`, "}"] });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "video-id", path: "tests/fixtures/video.json", line: 2, map: { ordinal: 1 } });
  });

  it("finds the ID in a link, a file name and a commit message too", async () => {
    const findings = await findingsOf(
      { [`fixtures/${VIDEO_TWO}.json`]: [`See https://www.youtube.com/watch?v=${VIDEO_TWO}&t=9`] },
      `Fixture\n\nFor ${VIDEO_ONE}`,
    );
    expect(findings.map((finding) => [finding.kind, finding.path, finding.line, finding.map.ordinal])).toEqual([
      ["video-id", "(commit message)", 3, 1],
      ["video-id", `fixtures/${VIDEO_TWO}.json`, 0, 2],
      ["video-id", `fixtures/${VIDEO_TWO}.json`, 1, 2],
    ]);
  });

  it("lets through an ID the public branches already hold", async () => {
    const files = { "docs/registry.md": [`| Channel | \`${VIDEO_ONE}\` |`] };
    expect(await findingsOf(files, undefined, () => true)).toEqual([]);
    expect(await findingsOf(files, undefined, () => false)).toHaveLength(1);
  });

  it("refuses a comment total of four digits in any common writing", async () => {
    const written = ["7413", "7,413", "7.413", "7 413", "7 413", "7_413"];
    const findings = await findingsOf({ "docs/x.md": written.map((total) => `It has ${total} comments.`) });
    expect(findings.map((finding) => [finding.kind, finding.line, finding.map.ordinal])).toEqual(
      written.map((_, position) => ["comment-total", position + 1, 1]),
    );
  });

  it("lets a sample, a three-digit total and other small numbers through alone", async () => {
    const findings = await findingsOf({
      "src/limits.ts": [
        "const sample = 350;",
        "const limit = 20;",
        "export const status = 400, port = 8080, timeoutMs = 5000, year = 2026;",
        "// 187 rows in the fixture",
        "const dated = '2026-11-03T00:14:03.310Z';",
      ],
    });
    expect(findings).toEqual([]);
  });

  it("refuses several of a map's counts split across nearby lines", async () => {
    const findings = await findingsOf({
      "tests/fixtures/map.ts": [
        "export const map = {",
        "  sample: 350,",
        "  rank: 1,",
        "  tried: 53,",
        "  // what they said",
        "  better: 41,",
        "};",
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "counts", path: "tests/fixtures/map.ts", line: 2, lastLine: 6, map: { ordinal: 1 } });
  });

  it("refuses a map's whole outcome line even when its numbers are small", async () => {
    const findings = await findingsOf({ "docs/x.md": ["53 people tried it: 41 better, 3 no change, 6 worse, 3 mixed."] });
    expect(findings.map((finding) => [finding.kind, finding.map.ordinal])).toEqual([["counts", 1]]);
    expect(await findingsOf({ "docs/x.md": ["2 of 5 people tried it: 1 better, 3 no change, 6 worse, 3 mixed."] })).toEqual([]);
  });

  it("lets the same counts through when they are far apart", async () => {
    const filler = Array.from({ length: 12 }, (_, position) => `// line ${position}`);
    const findings = await findingsOf({ "src/x.ts": ["const a = 350;", ...filler, "const b = 53;", ...filler, "const c = 41;"] });
    expect(findings).toEqual([]);
  });

  it("lets a few matching numbers through when they are a small part of the numbers around them", async () => {
    const findings = await findingsOf({
      "src/grid.ts": ["const grid = [11, 12, 13, 14, 15, 53, 16, 17, 41, 18, 19, 20, 21, 22, 350];"],
    });
    expect(findings).toEqual([]);
  });

  it("reads the lines it can refuse by their number in the new file, across hunks", async () => {
    const lines = [
      `\x01${"d".repeat(40)}`, "Edit", "\x02", "", "diff --git a/docs/x.md b/docs/x.md", "--- a/docs/x.md", "+++ b/docs/x.md",
      "@@ -3,0 +4,1 @@", "+Of 350 comments read,", "@@ -9,2 +11,2 @@ context", "-old", "-older", "+53 people tried it, 41 better,", "+and so on",
    ];
    const { findings, commits } = await scanDiff(lines, index);
    expect(commits).toBe(1);
    expect(findings.map((finding) => [finding.kind, finding.line, finding.lastLine])).toEqual([["counts", 4, 11]]);
  });

  it("ignores a deleted file, whose name holds an ID", async () => {
    const lines = [`\x01${"e".repeat(40)}`, "Remove it", "\x02", "", `diff --git a/${VIDEO_ONE}.json b/${VIDEO_ONE}.json`, "deleted file mode 100644", `--- a/${VIDEO_ONE}.json`, "+++ /dev/null", "@@ -1 +0,0 @@", "-{}"];
    expect((await scanDiff(lines, index)).findings).toEqual([]);
  });
});

describe("what the script prints", () => {
  it("masks IDs and totals in anything it prints", () => {
    const text = redact(`fixtures/${VIDEO_ONE}-7,413.json and 350 and 20`, index);
    expect(text).toBe("fixtures/[private video ID]-[private total].json and 350 and 20");
  });
});

describe("finding the private maps", () => {
  let folder = "";
  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), "askrigor-maps-"));
    mkdirSync(join(folder, "maps"));
    writeFileSync(join(folder, "maps", "comment-maps-a.md"), INVENTED_MAPS);
    writeFileSync(join(folder, "maps", "comment-maps-b.md"), INVENTED_MAPS);
    writeFileSync(join(folder, "maps", "notes.md"), "not a map file");
    writeFileSync(join(folder, "single.md"), INVENTED_MAPS);
  });
  afterAll(() => rmSync(folder, { recursive: true, force: true }));

  it("reads the comment-maps pages of a folder, a named file, or several of them", () => {
    expect(mapFilesFrom({ [MAPS_VARIABLE]: join(folder, "maps") }).map((file) => file.slice(folder.length))).toEqual(["/maps/comment-maps-a.md", "/maps/comment-maps-b.md"]);
    expect(mapFilesFrom({ [MAPS_VARIABLE]: join(folder, "single.md") })).toEqual([join(folder, "single.md")]);
    expect(mapFilesFrom({ [MAPS_VARIABLE]: [join(folder, "single.md"), join(folder, "nowhere")].join(delimiter) })).toEqual([join(folder, "single.md")]);
  });

  it("counts a path that cannot be read as absent", () => {
    expect(mapFilesFrom({ [MAPS_VARIABLE]: join(folder, "single.md", "inside") })).toEqual([]);
  });

  it("looks under the owner-pages checkout of the home folder when no path is given", () => {
    mkdirSync(join(folder, "home", "claude-work", "owner-pages", "askrigor"), { recursive: true });
    writeFileSync(join(folder, "home", "claude-work", "owner-pages", "askrigor", "comment-maps-2026-11-03.md"), INVENTED_MAPS);
    expect(mapFilesFrom({}, join(folder, "home"))).toHaveLength(1);
    expect(mapFilesFrom({ [MAPS_VARIABLE]: "" }, join(folder, "home"))).toHaveLength(1);
    expect(mapFilesFrom({}, join(folder, "empty-home"))).toEqual([]);
  });
});

describe("the check as a command and a pre-push hook", () => {
  const repoRoot = join(import.meta.dirname, "..");
  const script = join(repoRoot, "scripts", "check-private-map-leaks.mts");
  const hook = join(repoRoot, ".githooks", "pre-push");
  let work = "";
  let mapsFolder = "";
  let env: NodeJS.ProcessEnv = {};

  const run = (command: string, args: string[], cwd: string, input?: string) =>
    spawnSync(command, args, { cwd, env, input, encoding: "utf8" });
  const git = (cwd: string, ...args: string[]) => {
    const result = run("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", ...args], cwd);
    expect(result.status, `git ${args.join(" ")}: ${result.stderr}`).toBe(0);
    return result.stdout.trim();
  };
  const check = (cwd: string, ...args: string[]) => run(process.execPath, ["--no-warnings", script, ...args], cwd);
  // Short commit ids can hold any digits; the printed text is compared without them.
  const printed = (result: { stdout: string; stderr: string }) => `${result.stdout}${result.stderr}`.replace(/\b[0-9a-f]{8}\b/g, "<commit>");
  const repoWith = (name: string, files: Record<string, string>) => {
    const repo = join(work, name);
    mkdirSync(repo, { recursive: true });
    git(repo, "init", "-q", "-b", "main");
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), text);
    }
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "Base");
    return repo;
  };
  const commit = (repo: string, files: Record<string, string>, message = "Change") => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), text);
    }
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", message);
  };

  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), "askrigor-private-map-check-"));
    mapsFolder = join(work, "private-maps");
    mkdirSync(mapsFolder);
    writeFileSync(join(mapsFolder, "comment-maps-invented.md"), INVENTED_MAPS);
    env = {
      ...process.env,
      LC_ALL: "C",
      LANG: "C",
      PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      [MAPS_VARIABLE]: mapsFolder,
    };
  });
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  it("ships the hook as an executable file", () => {
    expect(statSync(hook).mode & 0o111).not.toBe(0);
  });

  it("says it was skipped, and passes, where the private maps are not", () => {
    const repo = repoWith("skip", { "README.md": "hello\n" });
    env[MAPS_VARIABLE] = join(work, "nowhere");
    const result = check(repo, "range", "HEAD");
    env[MAPS_VARIABLE] = mapsFolder;
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("skipped");
  });

  it("hands git only revisions, because some of git log's options write files", () => {
    const repo = repoWith("options", { "README.md": "hello\n" });
    const target = join(work, "written-by-git");
    expect(check(repo, "range", `--output=${target}`, "HEAD").status).toBe(2);
    expect(check(repo, "range").status).toBe(2);
    expect(check(repo).status).toBe(2);
    expect(existsSync(target)).toBe(false);
  });

  it("passes ordinary changes and says what it read", () => {
    const repo = repoWith("clean", { "README.md": "hello\n" });
    commit(repo, { "src/limits.ts": "export const limit = 20;\nexport const sample = 350;\n" });
    const result = check(repo, "range", "HEAD~1..HEAD");
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("1 commit(s) against 2 map(s) from 1 file(s); nothing to refuse");
  });

  it("refuses a leak, names the file and line, and prints no private value", () => {
    const repo = repoWith("leak", { "README.md": "hello\n" });
    commit(repo, {
      "docs/note.md": `A note\n\nThe video ${VIDEO_ONE} has 7,413 comments; 350 were read.\n`,
      [`fixtures/${VIDEO_TWO}.json`]: "{}\n",
      "tests/fixture.ts": "const map = {\n  sample: 350,\n  tried: 53,\n  better: 41,\n};\n",
    }, `Mentions ${VIDEO_ONE}`);
    const result = check(repo, "range", "HEAD~1..HEAD");
    const text = printed(result);
    expect(result.status).toBe(1);
    expect(text).toContain("Push refused");
    expect(text).toContain("docs/note.md:3: a video ID of map 1 of comment-maps-invented.md");
    expect(text).toContain("docs/note.md:3: a comment total of map 1 of comment-maps-invented.md");
    expect(text).toContain("tests/fixture.ts:2-4: several counts of map 1 of comment-maps-invented.md close together");
    expect(text).toContain("(commit message) line 1");
    expect(text).toContain("[private video ID].json (file name)");
    for (const value of [VIDEO_ONE, VIDEO_TWO, "7413", "7,413", "350", "53", "41", "187", "36", "24"]) {
      expect(text.includes(value), `the output holds a private value (${value.length} characters)`).toBe(false);
    }
  });

  it("refuses when maps are present but none is recognized, because it could not protect them", () => {
    const repo = repoWith("unrecognized", { "README.md": "hello\n" });
    const empty = join(work, "empty-maps");
    mkdirSync(empty);
    writeFileSync(join(empty, "comment-maps-notes.md"), "# Only notes\n");
    env[MAPS_VARIABLE] = empty;
    const result = check(repo, "range", "HEAD");
    env[MAPS_VARIABLE] = mapsFolder;
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("none was recognized");
  });

  describe("pushing through the hook", () => {
    const clone = (name: string) => {
      const remote = join(work, `${name}-remote.git`);
      git(work, "init", "-q", "--bare", "-b", "main", remote);
      const repo = repoWith(`${name}-clone`, { "README.md": "hello\n", "docs/registry.md": `| Channel | \`${VIDEO_ONE}\` |\n` });
      git(repo, "remote", "add", "origin", remote);
      // The base is already public, with the ID in it; the hook is not on yet.
      git(repo, "push", "-q", "origin", "main");
      git(repo, "config", "core.hooksPath", join(repoRoot, ".githooks"));
      return { repo, remote };
    };
    const remoteHead = (remote: string) => git(remote, "rev-parse", "main");

    it("lets a clean push through, scanning only the new commits", () => {
      const { repo, remote } = clone("clean-push");
      commit(repo, { "src/a.ts": "export const limit = 20;\n" });
      const result = run("git", ["push", "origin", "main"], repo);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("1 commit(s) against 2 map(s)");
      expect(remoteHead(remote)).toBe(git(repo, "rev-parse", "HEAD"));
    });

    it("lets a push through that repeats an ID the remote already holds", () => {
      const { repo, remote } = clone("known-id");
      commit(repo, { "docs/registry.md": `| Channel | \`${VIDEO_ONE}\` | a new note |\n` });
      const result = run("git", ["push", "origin", "main"], repo);
      expect(result.status, result.stderr).toBe(0);
      expect(remoteHead(remote)).toBe(git(repo, "rev-parse", "HEAD"));
    });

    it("refuses a leaking push and leaves the remote as it was", () => {
      const { repo, remote } = clone("leak-push");
      const before = remoteHead(remote);
      commit(repo, { "docs/new.md": `Of 350 comments read from 7,413, ${VIDEO_TWO} was mapped.\n` });
      const result = run("git", ["push", "origin", "main"], repo);
      expect(result.status).not.toBe(0);
      expect(printed(result)).toContain("docs/new.md:1");
      expect(printed(result)).not.toContain(VIDEO_TWO);
      expect(remoteHead(remote)).toBe(before);
    });

    it("refuses a leak on a new branch, and a leak removed again by a later commit of the same push", () => {
      const { repo, remote } = clone("branch-push");
      git(repo, "checkout", "-q", "-b", "feature");
      commit(repo, { "docs/leak.md": `Counts: 350 sampled of 7,413.\n` });
      commit(repo, { "docs/leak.md": "Removed again.\n" });
      const result = run("git", ["push", "origin", "feature"], repo);
      expect(result.status).not.toBe(0);
      expect(printed(result)).toContain("docs/leak.md:1");
      expect(run("git", ["rev-parse", "--verify", "-q", "feature"], remote).status).not.toBe(0);
    });

    it("lets the owner skip the check with --no-verify", () => {
      const { repo } = clone("skipped-push");
      commit(repo, { "docs/new.md": "Of 350 comments read from 7,413.\n" });
      expect(run("git", ["push", "--no-verify", "origin", "main"], repo).status).toBe(0);
    });
  });
});

// Where the owner's real pages are on this machine (never in CI), the reader must still understand their layout, or the
// check would protect nothing without saying so. Only problems are named, never a value.
describe("the owner's real private maps, where this machine has them", () => {
  const files = mapFilesFrom(process.env);

  it.skipIf(files.length === 0)("are still read: every map has a sample and its outcome counts", () => {
    const problems: string[] = [];
    for (const file of files) {
      const maps = parsePrivateMaps(readFileSync(file, "utf8"), basename(file));
      if (maps.length === 0) problems.push(`${basename(file)} holds no map the reader recognizes`);
      for (const map of maps) {
        if (map.sample === null) problems.push(`map ${map.ordinal} of ${basename(file)} has no sample size`);
        if (map.outcome.length < 4) problems.push(`map ${map.ordinal} of ${basename(file)} has fewer than four outcome numbers`);
      }
    }
    expect(problems).toEqual([]);
  });
});
