import { describe, expect, it } from "vitest";

import { parseRobotsTxt, robotsResponseAllows, robotsTxtAllows } from "../packages/sources/src/robots-txt.js";

const allowed = (text: string, path: string, agent = "ExampleBot/1.0") =>
  robotsTxtAllows(parseRobotsTxt(text), agent, `https://forum.example${path}`);

describe("RFC 9309 robots.txt", () => {
  it("combines the matching groups in Figure 2, case insensitively", () => {
    const robots = "user-agent: ExampleBot\ndisallow: /foo\n\nuser-agent: examplebot\ndisallow: /bar";
    expect(allowed(robots, "/foo")).toBe(false);
    expect(allowed(robots, "/bar")).toBe(false);
    expect(allowed(robots, "/baz")).toBe(true);
  });

  it("uses the wildcard fallback from Figure 3 only without a matching group", () => {
    const robots = "user-agent: *\ndisallow: /foo\ndisallow: /bar\n\nuser-agent: BazBot\ndisallow: /baz";
    expect(allowed(robots, "/foo")).toBe(false);
    expect(allowed(robots, "/bar")).toBe(false);
    expect(allowed(robots, "/baz")).toBe(true);
    expect(allowed(robots, "/foo", "BazBot")).toBe(true);
    expect(allowed(robots, "/baz", "BazBot")).toBe(false);
  });

  it.each([
    ["/foo/bar?baz=quz", "/foo/bar?baz=quz"],
    ["/foo/bar?baz=https%3A%2F%2Ffoo.bar", "/foo/bar?baz=https%3a%2f%2ffoo.bar"],
    ["/foo/bar/ツ", "/foo/bar/%E3%83%84"],
    ["/foo/bar/%E3%83%84", "/foo/bar/ツ"],
    ["/foo/bar/%62%61%7A", "/foo/bar/baz"]
  ])("matches the percent-encoding example %s from Figure 4", (rule, path) => {
    expect(allowed(`user-agent: *\ndisallow: ${rule}`, path)).toBe(false);
  });

  it("preserves reserved percent-encoded octets", () => {
    expect(allowed("user-agent: *\ndisallow: /foo%2Fbar", "/foo/bar")).toBe(true);
    expect(allowed("user-agent: *\ndisallow: /foo%2Fbar", "/foo%2fbar")).toBe(false);
  });

  it("uses comments, wildcards and an end marker as in Figure 5", () => {
    const robots = "# comment\nuser-agent: *\ndisallow: /this/*/exactly$ # comment";
    expect(allowed(robots, "/this//exactly")).toBe(false);
    expect(allowed(robots, "/this/a/b/exactly")).toBe(false);
    expect(allowed(robots, "/this/a/exactly/more")).toBe(true);
    expect(allowed(robots, "/This/a/exactly")).toBe(true);
  });

  it.each([
    ["/path/file-with-a-%2A.html", "/path/file-with-a-*.html"],
    ["/path/foo-%24", "/path/foo-$"]
  ])("matches the literal special character %s from Figure 6", (rule, path) => {
    expect(allowed(`user-agent: *\ndisallow: ${rule}`, path)).toBe(false);
  });

  it("uses the longest match, allowing equivalent ties", () => {
    const robots = "user-agent: *\ndisallow: /\nallow: /public/\ndisallow: /public/private/\nallow: /same\ndisallow: /same";
    expect(allowed(robots, "/public/page")).toBe(true);
    expect(allowed(robots, "/public/private/page")).toBe(false);
    expect(allowed(robots, "/same")).toBe(true);
  });

  it("ignores ungrouped and empty rules and retains groups across other records", () => {
    const robots = "disallow: /ignored\r\nuser-agent: ExampleBot\ruser-agent: OtherBot\nsitemap: /map\ndisallow:\nallow:\ndisallow: /private\n\ndisallow: /second";
    expect(allowed(robots, "/ignored")).toBe(true);
    expect(allowed(robots, "/private", "OtherBot")).toBe(false);
    expect(allowed(robots, "/second")).toBe(false);
    expect(allowed(robots, "/private", "UnmatchedBot")).toBe(true);
  });

  it("implicitly allows robots.txt and allows a matching final empty group", () => {
    expect(allowed("user-agent: *\ndisallow: /", "/robots.txt")).toBe(true);
    expect(allowed("\uFEFFuser-agent: *\ndisallow: /\nuser-agent: ExampleBot", "/page")).toBe(true);
  });

  it.each([400, 401, 403, 404, 410, 429, 451, 499])("allows robots HTTP %i", (status) => {
    expect(robotsResponseAllows(status, "user-agent: *\ndisallow: /", "ExampleBot", "https://forum.example/page")).toBe(true);
  });

  it.each([undefined, 301, 500, 503, 599])("disallows an unreachable robots response %s", (status) => {
    expect(robotsResponseAllows(status, "", "ExampleBot", "https://forum.example/page")).toBe(false);
  });

  it("uses the rules of a successful robots response", () => {
    expect(robotsResponseAllows(200, "user-agent: *\ndisallow: /", "ExampleBot", "https://forum.example/page")).toBe(false);
  });

  it("reads fields with spaces around the colon, and stays quick on a long run of spaces", () => {
    const groups = parseRobotsTxt(`User-agent : *\n  Disallow  :  /private  # comment\n-:${" ".repeat(200_000)}x\nno colon here\n`);
    expect(groups).toEqual([{ userAgents: ["*"], rules: [{ allow: false, path: "/private" }] }]);
    const start = Date.now();
    parseRobotsTxt(`-:${" ".repeat(2_000_000)}\n`.repeat(3));
    expect(Date.now() - start).toBeLessThan(1_000);
  });
});
