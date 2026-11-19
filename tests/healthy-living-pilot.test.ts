import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";

// The healthy-living pilot is one offline file (labs/healthy-living-pilot-1/index.html).
// These checks hold it to the approved draft: nothing loaded or sent, the never-list absent,
// every emergency line visible without a fold, and the owner's stroke heading (answer 345a).

const root = fileURLToPath(new URL("..", import.meta.url));
let html = "";

beforeAll(async () => {
  html = await readFile(resolve(root, "labs/healthy-living-pilot-1/index.html"), "utf8");
});

function inlineScripts(source: string): string[] {
  return [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((match) => {
    expect(match[1]).not.toMatch(/\bsrc=/i);
    return match[2];
  });
}

function insideDetails(source: string, index: number): boolean {
  const before = source.slice(0, index);
  const opened = (before.match(/<details\b/gi) ?? []).length;
  const closed = (before.match(/<\/details>/gi) ?? []).length;
  return opened > closed;
}

describe("healthy-living pilot 1", () => {
  it("loads nothing and sends nothing", () => {
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/connect-src|<link\b[^>]*rel="stylesheet"|<img\b|<iframe\b|<video\b|<audio\b|<object\b|<embed\b|<form\b/i);
    expect(html).not.toMatch(/\bsrc=/i);
    expect(html).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|\bimport\(|serviceWorker/);
    expect(html).not.toMatch(/http:\/\//i);
    for (const match of html.matchAll(/<a\b([^>]*)\shref="(https:[^"]+)"([^>]*)>/gi)) {
      const attributes = match[1] + match[3];
      expect(attributes, match[2]).toContain('rel="noopener noreferrer"');
      expect(attributes, match[2]).toContain('target="_blank"');
    }
  });

  it("has a script that parses", () => {
    const scripts = inlineScripts(html);
    expect(scripts).toHaveLength(1);
    expect(() => new Script(scripts[0])).not.toThrow();
  });

  it("says plainly that it is a pilot and not personal medical advice", () => {
    expect(html).toContain("This is a pilot");
    expect(html).toContain("It is not personal medical advice.");
    expect(html).toContain("Everything you type is saved in this browser as you go.");
    expect(html).toContain("Nothing is sent online.");
  });

  it("never names the substances the owner rules out, nor the owner", () => {
    expect(html).not.toMatch(/ashwagandha|lion.s mane|finasteride|\bSSRIs?\b/i);
    expect(html).not.toMatch(/\bJoel\b/);
  });

  it("shows all twenty emergency lines and the passed line without a fold", () => {
    const lines = [...html.matchAll(/data-em="([^"]+)"/g)];
    expect(lines.map((match) => match[1])).toEqual([
      ...Array.from({ length: 20 }, (_, index) => String(index + 1)),
      "passed"
    ]);
    for (const match of lines) expect(insideDetails(html, match.index ?? 0), `line ${match[1]}`).toBe(false);
    for (const match of lines) expect(html).toContain(`id="msg-${match[1]}"`);
  });

  it("uses the owner's stroke heading and keeps the honest false-alarm line", () => {
    expect(html.match(/<h3 id="stroke-passed">Call now, even though it passed<\/h3>/g)).toHaveLength(1);
    expect(html).not.toContain("Get seen today. Phone");
    expect(html).toContain("in one UK study, fast care cut strokes in the next 3 months from 10 in 100 to 2 in 100.");
    expect(html).toContain("Many callers turn out not to have had a stroke, often about half, and that is expected.");
    expect(html).toContain("say: possible warning stroke");
    expect(html).toContain("Don't drive yourself.");
  });

  it("keeps the owner's 18 Nov additions", () => {
    expect(html).toContain("Start everything at the lowest dose");
    expect(html).toContain("only smell first");
    expect(html).toContain("The person receiving closes their eyes.");
    expect(html).toContain("45-80% of a full deep breath");
  });

  it("leaves out what the approved defaults leave out", () => {
    expect(html).not.toMatch(/not into buteyko/i);
    expect(html).not.toMatch(/either person stops it with a word/i);
    expect(html).not.toMatch(/\b(?:TBD|TODO)\b/);
  });
});
