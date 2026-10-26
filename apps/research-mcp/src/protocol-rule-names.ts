import { loadProtocol } from "@askrigor/protocol";
import { z } from "zod";
import { XMLParser } from "fast-xml-parser";

export const preventingRuleSchema = z.union([z.literal("no_rule"), z.string().trim().min(1).max(160)]);

/** The element tags and name/id identities load_protocol can select, including lowercase Universal tags. */
export function protocolElementNamesFrom(texts: readonly string[]): ReadonlySet<string> {
  const names = new Set<string>();
  const parser = new XMLParser({ ignoreAttributes: false, preserveOrder: true });
  const visit = (node: unknown, depth = 0): void => {
    if (Array.isArray(node)) { node.forEach((child) => visit(child, depth)); return; }
    if (typeof node !== "object" || node === null) return;
    for (const [name, children] of Object.entries(node)) {
      if (name.startsWith("#") || name.startsWith("?") || name === ":@") continue;
      names.add(name);
      if (depth > 0 && ":@" in node) {
        const attributes = node[":@"] as Record<string, unknown>;
        for (const key of ["@_name", "@_id"]) if (typeof attributes[key] === "string") names.add(attributes[key]);
      }
      visit(children, depth + 1);
    }
  };
  for (const text of texts) visit(parser.parse(text));
  return names;
}
let current: Promise<ReadonlySet<string>> | undefined;
export function currentProtocolElementNames(): Promise<ReadonlySet<string>> {
  current ??= Promise.all([loadProtocol("hrp"), loadProtocol("universal")]).then(protocolElementNamesFrom)
    .catch((error: unknown) => { current = undefined; throw error; });
  return current;
}
