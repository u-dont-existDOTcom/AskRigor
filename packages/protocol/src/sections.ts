import { createHash } from "node:crypto";

import type { ProtocolName } from "./index.js";

/** Largest protocol text a single tool result may carry. */
export const PROTOCOL_PAGE_MAX_BYTES = 40_000;

const SUMMARY_MAX_CHARACTERS = 240;

/**
 * Sections kept in the canonical files but not needed by a model doing
 * ordinary research (index `runtime: false`): maintainer material (revision
 * history, release and version process, regression cases that restate rules
 * found elsewhere) and HRP's audit-record forms, which its own Purpose says to
 * load only for a technical audit or debug export.
 */
const NON_RUNTIME_SECTIONS: Record<ProtocolName, ReadonlySet<string>> = {
  hrp: new Set([
    "RevisionHistory",
    "VersionDiscipline",
    "ReleasePackagingRequirements",
    "StressTestExpectations",
    "ResearchAuditTemplates"
  ]),
  universal: new Set(["revision_history"])
};

/**
 * Sections every research run loads first. The section index maps the
 * remaining modules; HRP's Architecture section says to load and apply only
 * the ones the question needs.
 */
const CORE_SECTIONS: Record<ProtocolName, readonly string[]> = {
  hrp: [
    "Purpose",
    "CoreHierarchy",
    "Architecture",
    "SafetyAndScopeGate",
    "HeterodoxEpistemology",
    "EvidenceLayers",
    "EpistemicSafetyRules"
  ],
  universal: [
    "priority",
    "epistemics",
    "sources",
    "untrusted_content",
    "reasoning_style",
    "health_labs_supplements_environmental_health",
    "null_evidence_and_safety_language",
    "output_style"
  ]
};

export interface ProtocolSection {
  name: string;
  ordinal: number;
  byte_start: number;
  byte_end_exclusive: number;
  bytes: number;
  pages: number;
  sha256: string;
  core: boolean;
  runtime: boolean;
  summary: string;
}

export interface ProtocolTextPage {
  page: number;
  page_count: number;
  byte_start: number;
  byte_end_exclusive: number;
  scope_bytes: number;
  scope_sha256: string;
  text: string;
  complete: boolean;
}

interface SectionSpan {
  name: string;
  start: number;
  end: number;
}

/** Top-level sections of a canonical protocol, as exact byte ranges of its file. */
export function protocolSections(
  protocolName: ProtocolName,
  text: string
): ProtocolSection[] {
  const bytes = Buffer.from(text, "utf8");
  const core = new Set(CORE_SECTIONS[protocolName]);
  const nonRuntime = NON_RUNTIME_SECTIONS[protocolName];

  return topLevelSpans(text).map((span, ordinal) => {
    const byteStart = Buffer.byteLength(text.slice(0, span.start), "utf8");
    const byteEnd = byteStart + Buffer.byteLength(text.slice(span.start, span.end), "utf8");
    const sectionBytes = bytes.subarray(byteStart, byteEnd);
    return {
      name: span.name,
      ordinal,
      byte_start: byteStart,
      byte_end_exclusive: byteEnd,
      bytes: sectionBytes.length,
      pages: pageBoundaries(sectionBytes).length - 1,
      sha256: sha256(sectionBytes),
      core: core.has(span.name),
      runtime: !nonRuntime.has(span.name),
      summary: sectionSummary(text.slice(span.start, span.end))
    };
  });
}

/** Names of the sections every research run loads first. */
export function coreSectionNames(protocolName: ProtocolName): readonly string[] {
  return CORE_SECTIONS[protocolName];
}

/** One page of `scope`, cut on UTF-8 character boundaries. Pages are 1-based. */
export function protocolTextPage(scope: Buffer, page: number): ProtocolTextPage {
  const boundaries = pageBoundaries(scope);
  const pageCount = boundaries.length - 1;
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    throw new RangeError(`Page ${page} is outside 1-${pageCount}`);
  }
  const start = boundaries[page - 1]!;
  const end = boundaries[page]!;
  return {
    page,
    page_count: pageCount,
    byte_start: start,
    byte_end_exclusive: end,
    scope_bytes: scope.length,
    scope_sha256: sha256(scope),
    text: scope.subarray(start, end).toString("utf8"),
    complete: page === pageCount
  };
}

function pageBoundaries(bytes: Buffer): number[] {
  const boundaries = [0];
  if (bytes.length === 0) {
    return [0, 0];
  }
  while (boundaries.at(-1)! < bytes.length) {
    const start = boundaries.at(-1)!;
    let end = Math.min(start + PROTOCOL_PAGE_MAX_BYTES, bytes.length);
    // Prefer ending a page at a line break so XML elements stay readable.
    if (end < bytes.length) {
      const newline = bytes.lastIndexOf(0x0a, end - 1);
      if (newline > start + PROTOCOL_PAGE_MAX_BYTES / 2) {
        end = newline + 1;
      }
    }
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) {
      end -= 1;
    }
    if (end <= start) {
      throw new Error("Protocol page boundary did not advance");
    }
    boundaries.push(end);
  }
  return boundaries;
}

/**
 * Spans of the root element's children. The text has already passed XML
 * validation, so a tag scanner that honors comments, CDATA, processing
 * instructions, and quoted attribute values is sufficient.
 */
function topLevelSpans(text: string): SectionSpan[] {
  const spans: SectionSpan[] = [];
  let index = 0;
  let depth = 0;
  let current: { name: string; start: number } | undefined;

  while (index < text.length) {
    const open = text.indexOf("<", index);
    if (open < 0) {
      break;
    }
    if (text.startsWith("<!--", open)) {
      index = requiredIndex(text, "-->", open) + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", open)) {
      index = requiredIndex(text, "]]>", open) + 3;
      continue;
    }
    if (text.startsWith("<?", open) || text.startsWith("<!", open)) {
      index = requiredIndex(text, ">", open) + 1;
      continue;
    }
    const close = tagEnd(text, open);
    const tag = text.slice(open, close);
    if (tag.startsWith("</")) {
      depth -= 1;
      if (depth === 1 && current !== undefined) {
        spans.push({ ...current, end: close });
        current = undefined;
      }
    } else {
      const selfClosing = tag.endsWith("/>");
      if (depth === 1) {
        const name = /^<([^\s/>]+)/u.exec(tag)?.[1];
        if (name === undefined) {
          throw new Error("Protocol section tag has no name");
        }
        if (selfClosing) {
          spans.push({ name, start: open, end: close });
        } else {
          current = { name, start: open };
        }
      }
      if (!selfClosing) {
        depth += 1;
      }
    }
    index = close;
  }

  if (depth !== 0 || current !== undefined) {
    throw new Error("Protocol sections are not balanced");
  }
  return spans;
}

function tagEnd(text: string, open: number): number {
  let quote: string | undefined;
  for (let index = open + 1; index < text.length; index += 1) {
    const character = text[index]!;
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index + 1;
    }
  }
  throw new Error("Protocol tag is not closed");
}

function requiredIndex(text: string, token: string, from: number): number {
  const index = text.indexOf(token, from);
  if (index < 0) {
    throw new Error("Protocol markup is not closed");
  }
  return index;
}

function sectionSummary(sectionText: string): string {
  const lead = /<(Purpose|purpose|Activation|activation)\b[^>]*>([\s\S]*?)<\/\1>/u
    .exec(sectionText)?.[2] ?? sectionText;
  const plain = decodeEntities(lead.replace(/<[^>]*>/gu, " "))
    .replace(/\s+/gu, " ")
    .trim();
  return plain.length <= SUMMARY_MAX_CHARACTERS
    ? plain
    : `${plain.slice(0, SUMMARY_MAX_CHARACTERS - 1).trimEnd()}…`;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/gu, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&");
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
