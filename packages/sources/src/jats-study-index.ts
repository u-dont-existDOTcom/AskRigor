import { createHash } from "node:crypto";

import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

import type { EuropePmcFullTextArticle } from "./europe-pmc-full-text.js";

const orderedParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: false
});
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const jatsStudyBlockSchema = z.object({
  block_id: z.string().regex(/^jats_[0-9]{6}_[a-f0-9]{12}$/u),
  kind: z.enum(["abstract", "paragraph", "table", "figure_caption", "list_item"]),
  section_path: z.array(z.string().min(1).max(500)).max(20),
  text: z.string().min(1).max(200_000),
  text_sha256: sha256Schema
}).strict();

export const jatsStudyIndexSchema = z.object({
  source: z.object({
    pmcid: z.string().regex(/^PMC[1-9]\d{0,15}$/u),
    pmid: z.string().optional(),
    doi: z.string().optional(),
    title: z.string().optional(),
    content_sha256: sha256Schema,
    document_completeness: z.enum(["full_text_with_body", "front_matter_only"])
  }).strict(),
  section_paths: z.array(z.array(z.string().min(1).max(500)).max(20)).max(10_000),
  blocks: z.array(jatsStudyBlockSchema).max(100_000)
}).strict();

export type JatsStudyBlock = z.output<typeof jatsStudyBlockSchema>;
export type JatsStudyIndex = z.output<typeof jatsStudyIndexSchema>;

/**
 * Builds a stable source-linked text index from already identity-checked JATS.
 * This indexes inspectable content; it does not interpret study quality.
 */
export function indexJatsStudyDocument(
  article: EuropePmcFullTextArticle
): JatsStudyIndex {
  const actualHash = sha256(article.xml);
  if (actualHash !== article.content_sha256) {
    throw new Error("JATS study source hash mismatch");
  }
  let parsed: unknown;
  try {
    parsed = orderedParser.parse(article.xml);
  } catch {
    throw new Error("JATS study XML was not parseable");
  }
  const root = Array.isArray(parsed) ? parsed : [];
  const articleNode = findNamedChildren(root, "article")[0];
  if (articleNode === undefined) throw new Error("JATS study article root was missing");

  const blocks: JatsStudyBlock[] = [];
  const sectionPaths = new Map<string, string[]>();
  const front = findNamedChildren(articleNode, "front")[0];
  if (front !== undefined) {
    for (const abstract of findNamedDescendants(front, "abstract")) {
      addBlock(blocks, "abstract", ["Abstract"], textContent(abstract));
      sectionPaths.set(JSON.stringify(["Abstract"]), ["Abstract"]);
    }
  }
  const body = findNamedChildren(articleNode, "body")[0];
  if (body !== undefined) visitContainer(body, [], blocks, sectionPaths);

  const index = {
    source: {
      pmcid: article.pmcid,
      ...(article.pmid === undefined ? {} : { pmid: article.pmid }),
      ...(article.doi === undefined ? {} : { doi: article.doi }),
      ...(article.title === undefined ? {} : { title: article.title }),
      content_sha256: article.content_sha256,
      document_completeness: article.document_completeness
    },
    section_paths: [...sectionPaths.values()],
    blocks
  };
  return jatsStudyIndexSchema.parse(index);
}

function visitContainer(
  nodes: OrderedNode[],
  sectionPath: string[],
  blocks: JatsStudyBlock[],
  sectionPaths: Map<string, string[]>
): void {
  for (const node of nodes) {
    const sec = namedChildren(node, "sec");
    if (sec !== undefined) {
      const title = directNamedText(sec, "title") ?? "Untitled section";
      const nextPath = [...sectionPath, title];
      sectionPaths.set(JSON.stringify(nextPath), nextPath);
      visitContainer(sec, nextPath, blocks, sectionPaths);
      continue;
    }
    const paragraph = namedChildren(node, "p");
    if (paragraph !== undefined) {
      addBlock(blocks, "paragraph", sectionPath, textContent(paragraph));
      continue;
    }
    const table = namedChildren(node, "table-wrap");
    if (table !== undefined) {
      addBlock(blocks, "table", sectionPath, textContent(table));
      continue;
    }
    const figure = namedChildren(node, "fig");
    if (figure !== undefined) {
      const caption = findNamedDescendants(figure, "caption")[0];
      if (caption !== undefined) {
        addBlock(blocks, "figure_caption", sectionPath, textContent(caption));
      }
      continue;
    }
    const list = namedChildren(node, "list");
    if (list !== undefined) {
      for (const item of findNamedDescendants(list, "list-item")) {
        addBlock(blocks, "list_item", sectionPath, textContent(item));
      }
      continue;
    }
    for (const child of childArrays(node)) {
      visitContainer(child, sectionPath, blocks, sectionPaths);
    }
  }
}

function addBlock(
  blocks: JatsStudyBlock[],
  kind: JatsStudyBlock["kind"],
  sectionPath: string[],
  rawText: string
): void {
  const text = normalizeText(rawText);
  if (text.length === 0) return;
  if (text.length > 200_000) {
    throw new Error("JATS study block exceeds indexing limit");
  }
  const textHash = sha256(text);
  blocks.push({
    block_id: `jats_${String(blocks.length + 1).padStart(6, "0")}_${textHash.slice(0, 12)}`,
    kind,
    section_path: sectionPath,
    text,
    text_sha256: textHash
  });
}

type OrderedNode = Record<string, unknown>;

function findNamedChildren(nodes: OrderedNode[], name: string): OrderedNode[][] {
  const found: OrderedNode[][] = [];
  for (const node of nodes) {
    const children = namedChildren(node, name);
    if (children !== undefined) found.push(children);
  }
  return found;
}

function findNamedDescendants(nodes: OrderedNode[], name: string): OrderedNode[][] {
  const found = findNamedChildren(nodes, name);
  for (const node of nodes) {
    for (const children of childArrays(node)) {
      found.push(...findNamedDescendants(children, name));
    }
  }
  return found;
}

function namedChildren(node: OrderedNode, name: string): OrderedNode[] | undefined {
  const value = node[name];
  return Array.isArray(value)
    ? value.filter(isRecord)
    : undefined;
}

function childArrays(node: OrderedNode): OrderedNode[][] {
  return Object.entries(node)
    .filter(([key, value]) => key !== ":@" && key !== "#text" && Array.isArray(value))
    .map(([, value]) => (value as unknown[]).filter(isRecord));
}

function directNamedText(nodes: OrderedNode[], name: string): string | undefined {
  const children = findNamedChildren(nodes, name)[0];
  if (children === undefined) return undefined;
  const text = normalizeText(textContent(children));
  return text.length === 0 ? undefined : text;
}

function textContent(nodes: OrderedNode[]): string {
  const values: string[] = [];
  for (const node of nodes) {
    if (typeof node["#text"] === "string" || typeof node["#text"] === "number") {
      values.push(String(node["#text"]));
    }
    for (const child of childArrays(node)) values.push(textContent(child));
  }
  return values.join(" ");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function isRecord(value: unknown): value is OrderedNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
