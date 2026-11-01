export interface RobotsRule {
  allow: boolean;
  path: string;
}

export interface RobotsGroup {
  userAgents: string[];
  rules: RobotsRule[];
}

export function parseRobotsTxt(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let group: RobotsGroup | undefined;
  let hasRules = false;
  for (const line of text.replace(/^\uFEFF/u, "").split(/\r\n|\r|\n/u)) {
    const record = line.split("#", 1)[0]!.match(/^\s*([a-z-]+)\s*:\s*(.*?)\s*$/iu);
    if (record === null) continue;
    const field = record[1]!.toLowerCase();
    const value = record[2]!;
    if (field === "user-agent") {
      if (!/^(?:\*|[a-z_-]+)$/iu.test(value)) continue;
      if (group === undefined || hasRules) {
        group = { userAgents: [], rules: [] };
        groups.push(group);
        hasRules = false;
      }
      group.userAgents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && group !== undefined) {
      hasRules = true;
      if (value.startsWith("/")) group.rules.push({ allow: field === "allow", path: value });
    }
  }
  return groups;
}

export function robotsTxtAllows(groups: readonly RobotsGroup[], userAgent: string, value: string): boolean {
  const url = new URL(value);
  if (url.pathname === "/robots.txt") return true;
  const token = userAgent.match(/^[a-z_-]+/iu)?.[0].toLowerCase() ?? "";
  const exact = groups.filter((group) => group.userAgents.includes(token));
  const selected = exact.length > 0 ? exact : groups.filter((group) => group.userAgents.includes("*"));
  const path = normalizeOctets(`${url.pathname}${url.search}`, false);
  let longest = -1;
  let allowed = true;
  for (const group of selected) {
    for (const rule of group.rules) {
      const anchored = rule.path.endsWith("$");
      const pattern = normalizeOctets(anchored ? rule.path.slice(0, -1) : rule.path, true);
      if (!matchesPath(pattern, path, anchored)) continue;
      const length = new TextEncoder().encode(pattern.replace(/\*/gu, "")).byteLength;
      if (length > longest || (length === longest && rule.allow)) {
        longest = length;
        allowed = rule.allow;
      }
    }
  }
  return allowed;
}

export function robotsResponseAllows(
  status: number | undefined, text: string, userAgent: string, url: string
): boolean {
  if (status !== undefined && status >= 400 && status < 500) return true;
  return status !== undefined && status >= 200 && status < 300 && robotsTxtAllows(parseRobotsTxt(text), userAgent, url);
}

function normalizeOctets(value: string, pattern: boolean): string {
  return value.replace(/%[0-9a-f]{2}|[^\x00-\x7f]|[$*]/giu, (part) => {
    if (part.startsWith("%")) {
      const character = String.fromCharCode(parseInt(part.slice(1), 16));
      return /^[a-z0-9._~-]$/iu.test(character) ? character : part.toUpperCase();
    }
    if (part === "*" && pattern) return part;
    return part === "*" ? "%2A" : part === "$" ? "%24" : encodeURIComponent(part);
  });
}

function matchesPath(pattern: string, path: string, anchored: boolean): boolean {
  let rule = 0;
  let target = 0;
  let wildcard = -1;
  let restart = 0;
  while (target < path.length) {
    if (rule === pattern.length && !anchored) return true;
    if (pattern[rule] === "*") { wildcard = rule++; restart = target; }
    else if (pattern[rule] === path[target]) { rule += 1; target += 1; }
    else if (wildcard !== -1) { rule = wildcard + 1; target = ++restart; }
    else return false;
  }
  while (pattern[rule] === "*") rule += 1;
  return rule === pattern.length;
}
