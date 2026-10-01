/**
 * The prose a reader sees in a Markdown answer, for the caveat check in
 * finalize_research.
 *
 * Block structure follows CommonMark 0.31 and the line-by-line strategy of
 * its reference implementation (commonmark.js): each line first continues
 * the open containers, block quotes and list items (an item by its own
 * content offset), then may open new blocks, and is otherwise paragraph text,
 * continued lazily when a paragraph is open. Fenced code, indented code and
 * the seven kinds of HTML block open and close as the specification says, and
 * a block ends with its container.
 *
 * Only paragraphs and headings outside block quotes are returned. Inside
 * them, inline code becomes NOT_PROSE, raw HTML such as comments and tags is
 * dropped, and an image and the rest of its paragraph become NOT_PROSE, since
 * an image's description is not shown. A link keeps its text between
 * LINK_OPEN and LINK_TARGET, then its destination before LINK_CLOSE; its
 * title and a reference link's label are dropped. visibleText and
 * linkTargets read these marks. What the parser does not model fails closed:
 * a paragraph that may be a link reference definition is left out, and so is
 * everything after nesting deeper than MAX_NESTING, which also keeps a
 * hostile draft to linear time.
 */

/** Stands for inline code or an image: shown, but not prose. */
export const NOT_PROSE = "\u0000";
/** Mark a link: LINK_OPEN, its shown text, LINK_TARGET, its destination (not shown), LINK_CLOSE. */
export const LINK_OPEN = "\u0002";
export const LINK_TARGET = "\u0003";
export const LINK_CLOSE = "\u0004";

const MAX_NESTING = 64;

type OpenBlock =
  | { type: "quote" }
  | { type: "item"; offset: number; hasChild: boolean }
  | { type: "paragraph"; lines: string[]; quoted: boolean }
  | { type: "fence"; character: string; length: number }
  | { type: "indented" }
  | { type: "html"; kind: number };

export function displayedProse(markdown: string): string[] {
  const prose: string[] = [];
  const open: OpenBlock[] = [];
  const show = (text: string): void => {
    prose.push(shownInline(text));
  };
  // Closes the open blocks from index `from` on; a paragraph among them is shown.
  const close = (from: number): void => {
    const tip = open.at(-1);
    if (open.length > from && tip?.type === "paragraph" && !tip.quoted) {
      const text = tip.lines.join(" ");
      if (!mayDefineLink(text)) show(text);
    }
    open.length = Math.min(open.length, from);
  };
  const quoted = (): boolean => open.some((block) => block.type === "quote");
  // A new block ends an open paragraph, which holds no other block, and gives an item a child.
  const addChild = (block: OpenBlock): void => {
    if (open.at(-1)?.type === "paragraph") close(open.length - 1);
    const parent = open.at(-1);
    if (parent?.type === "item") parent.hasChild = true;
    open.push(block);
  };

  // The marks above never come from the draft itself (CommonMark shows U+0000 as U+FFFD too).
  for (const rawLine of markdown.replace(/[\u0000\u0002-\u0004]/gu, "\uFFFD").split(/\r\n?|\n/u)) {
    const line = expandTabs(rawLine);
    let at = 0;
    // 1. Continue the open blocks, outermost first, until one does not continue.
    let matched = 0;
    let lineDone = false;
    for (; matched < open.length; matched += 1) {
      const block = open[matched]!;
      const next = nonSpace(line, at);
      const indent = next - at;
      const blank = next === line.length;
      if (block.type === "quote") {
        if (indent >= 4 || line[next] !== ">") break;
        at = next + 1;
        if (line[at] === " ") at += 1;
      } else if (block.type === "item") {
        if (blank) {
          // An item that began with a blank line ends at the next one.
          if (!block.hasChild) break;
          at = next;
        } else if (indent >= block.offset) {
          at += block.offset;
        } else {
          break;
        }
      } else if (block.type === "paragraph") {
        if (blank) break;
      } else if (block.type === "fence") {
        if (indent <= 3 && closesFence(line, next, block)) {
          open.length = matched;
          lineDone = true;
          break;
        }
      } else if (block.type === "indented") {
        if (indent >= 4) at += 4;
        else if (blank) at = next;
        else break;
      } else if (blank && (block.kind === 6 || block.kind === 7)) {
        break;
      }
    }
    if (lineDone) continue;

    const allMatched = matched === open.length;
    let unmatchedClosed = allMatched;
    const closeUnmatched = (): void => {
      if (!unmatchedClosed) close(matched);
      unmatchedClosed = true;
    };
    const tip = open.at(-1);
    const inCodeOrHtml = allMatched && (tip?.type === "fence" || tip?.type === "indented" || tip?.type === "html");

    // 2. Open new blocks, unless the line belongs to open code or HTML.
    let containerIsParagraph = allMatched && tip?.type === "paragraph";
    let leafTookLine = false;
    while (!inCodeOrHtml) {
      const next = nonSpace(line, at);
      const indent = next - at;
      const blank = next === line.length;
      if (indent >= 4) {
        // Indented code cannot interrupt a paragraph, even one continued lazily.
        if (!blank && open.at(-1)?.type !== "paragraph") {
          closeUnmatched();
          addChild({ type: "indented" });
          leafTookLine = true;
        }
        break;
      }
      if (open.length >= MAX_NESTING) return prose;
      const character = line[next];
      if (character === ">") {
        closeUnmatched();
        at = next + 1;
        if (line[at] === " ") at += 1;
        addChild({ type: "quote" });
        containerIsParagraph = false;
        continue;
      }
      const heading = atxHeading(line, next);
      if (heading !== undefined) {
        closeUnmatched();
        const inQuote = quoted();
        addChild({ type: "paragraph", lines: [heading], quoted: inQuote });
        close(open.length - 1);
        leafTookLine = true;
        break;
      }
      const fence = fenceOpening(line, next);
      if (fence !== undefined) {
        closeUnmatched();
        addChild({ type: "fence", ...fence });
        leafTookLine = true;
        break;
      }
      // An HTML block that needs a complete tag cannot interrupt a paragraph, even one continued lazily.
      const htmlKind = htmlBlockKind(line, next,
        !containerIsParagraph && !(!unmatchedClosed && !blank && open.at(-1)?.type === "paragraph"));
      if (htmlKind !== undefined) {
        closeUnmatched();
        addChild({ type: "html", kind: htmlKind });
        if (endsHtmlBlock(htmlKind, line, next)) open.length -= 1;
        leafTookLine = true;
        break;
      }
      if (containerIsParagraph && isSetextUnderline(line, next)) {
        // The paragraph becomes a heading, shown the same way.
        closeUnmatched();
        close(open.length - 1);
        leafTookLine = true;
        break;
      }
      if (isThematicBreak(line, next)) {
        closeUnmatched();
        if (open.at(-1)?.type === "paragraph") close(open.length - 1);
        const parent = open.at(-1);
        if (parent?.type === "item") parent.hasChild = true;
        leafTookLine = true;
        break;
      }
      const item = listItem(line, next, containerIsParagraph);
      if (item !== undefined) {
        closeUnmatched();
        at = item.contentStart;
        addChild({ type: "item", offset: indent + item.padding, hasChild: false });
        containerIsParagraph = false;
        continue;
      }
      break;
    }
    if (leafTookLine) continue;

    // 3. The rest is text: a lazy paragraph continuation, or text for the innermost block.
    const next = nonSpace(line, at);
    const blank = next === line.length;
    const lazyTip = open.at(-1);
    if (!unmatchedClosed && !blank && lazyTip?.type === "paragraph") {
      lazyTip.lines.push(line.slice(next));
      continue;
    }
    closeUnmatched();
    const target = open.at(-1);
    if (target?.type === "fence" || target?.type === "indented") continue;
    if (target?.type === "html") {
      if (endsHtmlBlock(target.kind, line, at)) open.length -= 1;
      continue;
    }
    if (blank) continue;
    if (target?.type === "paragraph") {
      target.lines.push(line.slice(next));
    } else {
      const inQuote = quoted();
      addChild({ type: "paragraph", lines: [line.slice(next)], quoted: inQuote });
    }
  }
  close(0);
  return prose;
}

/** The line with each tab replaced by spaces to the next multiple of four, as CommonMark reads indentation. */
function expandTabs(line: string): string {
  if (!line.includes("\t")) return line;
  let result = "";
  for (let index = 0; index < line.length; index += 1) {
    result += line[index] === "\t" ? " ".repeat(4 - (result.length % 4)) : line[index];
  }
  return result;
}

function nonSpace(line: string, from: number): number {
  let at = from;
  while (at < line.length && line[at] === " ") at += 1;
  return at;
}

const onlySpaces = (line: string, from: number): boolean => nonSpace(line, from) === line.length;

/** An ATX heading's text without its markers, or undefined. */
function atxHeading(line: string, at: number): string | undefined {
  let end = at;
  while (end < line.length && line[end] === "#") end += 1;
  if (end - at < 1 || end - at > 6 || (end < line.length && line[end] !== " ")) return undefined;
  let stop = line.length;
  while (stop > end && line[stop - 1] === " ") stop -= 1;
  // A closing run of # follows a space.
  let hashes = stop;
  while (hashes > end && line[hashes - 1] === "#") hashes -= 1;
  if (hashes === end || line[hashes - 1] === " ") stop = hashes;
  return line.slice(end, stop).trim();
}

/** A code fence's character and length, or undefined; a backtick fence's info string has no backtick. */
function fenceOpening(line: string, at: number): { character: string; length: number } | undefined {
  const character = line[at];
  if (character !== "`" && character !== "~") return undefined;
  let end = at;
  while (line[end] === character) end += 1;
  if (end - at < 3 || (character === "`" && line.includes("`", end))) return undefined;
  return { character, length: end - at };
}

/** A closing fence repeats the opening character at least as many times, followed only by spaces. */
function closesFence(line: string, at: number, fence: { character: string; length: number }): boolean {
  let end = at;
  while (line[end] === fence.character) end += 1;
  return end - at >= fence.length && onlySpaces(line, end);
}

function isSetextUnderline(line: string, at: number): boolean {
  const character = line[at];
  if (character !== "=" && character !== "-") return false;
  let end = at;
  while (line[end] === character) end += 1;
  return onlySpaces(line, end);
}

function isThematicBreak(line: string, at: number): boolean {
  const character = line[at];
  if (character !== "-" && character !== "*" && character !== "_") return false;
  let count = 0;
  for (let index = at; index < line.length; index += 1) {
    if (line[index] === character) count += 1;
    else if (line[index] !== " ") return false;
  }
  return count >= 3;
}

const ORDERED_MARKER = /\d{1,9}[.)]/uy;

/**
 * A list item's start: where its content begins and its padding (marker width
 * plus the spaces after it). One space counts when the item is empty or five
 * or more follow, which makes its content indented code.
 */
function listItem(
  line: string,
  at: number,
  interruptsParagraph: boolean
): { contentStart: number; padding: number } | undefined {
  let end: number;
  const character = line[at];
  if (character === "-" || character === "+" || character === "*") {
    end = at + 1;
  } else {
    ORDERED_MARKER.lastIndex = at;
    const marker = ORDERED_MARKER.exec(line)?.[0];
    // An ordered item interrupts a paragraph only when it starts at 1.
    if (marker === undefined || (interruptsParagraph && Number.parseInt(marker, 10) !== 1)) return undefined;
    end = at + marker.length;
  }
  if (end < line.length && line[end] !== " ") return undefined;
  const spaces = nonSpace(line, end) - end;
  const empty = end + spaces === line.length;
  // An empty item cannot interrupt a paragraph.
  if (empty && interruptsParagraph) return undefined;
  const width = end - at;
  if (empty || spaces >= 5) return { contentStart: Math.min(end + 1, line.length), padding: width + 1 };
  return { contentStart: end + spaces, padding: width + spaces };
}

const RAW_TEXT_TAG = /<(?:pre|script|style|textarea)(?=[ >]|$)/iuy;
const BLOCK_TAG = new RegExp(
  "</?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|" +
    "dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|" +
    "legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|" +
    "tbody|td|tfoot|th|thead|title|tr|track|ul)(?=[ >]|/>|$)",
  "iuy"
);

/** The kind (1-7) of HTML block a line starts, per CommonMark, or undefined. */
function htmlBlockKind(line: string, at: number, completeTagAllowed: boolean): number | undefined {
  if (line[at] !== "<") return undefined;
  const startsWith = (pattern: RegExp): boolean => {
    pattern.lastIndex = at;
    return pattern.test(line);
  };
  if (startsWith(RAW_TEXT_TAG)) return 1;
  if (line.startsWith("<!--", at)) return 2;
  if (line.startsWith("<?", at)) return 3;
  if (line[at + 1] === "!" && isAsciiLetter(line.charCodeAt(at + 2))) return 4;
  if (line.startsWith("<![CDATA[", at)) return 5;
  if (startsWith(BLOCK_TAG)) return 6;
  if (completeTagAllowed && isCompleteTagLine(line, at)) return 7;
  return undefined;
}

/** Whether an HTML block of this kind ends on this line; kinds 6 and 7 end at a blank line instead. */
function endsHtmlBlock(kind: number, line: string, from: number): boolean {
  const rest = line.slice(from);
  if (kind === 1) return /<\/(?:pre|script|style|textarea)>/iu.test(rest);
  if (kind === 2) return rest.includes("-->");
  if (kind === 3) return rest.includes("?>");
  if (kind === 4) return rest.includes(">");
  if (kind === 5) return rest.includes("]]>");
  return false;
}

const isAsciiLetter = (code: number): boolean => (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
const isDigit = (code: number): boolean => code >= 48 && code <= 57;

/**
 * Whether the line is one complete open or closing tag followed only by
 * spaces: CommonMark's seventh kind of HTML block. As in commonmark.js and
 * micromark, a raw-text name such as </pre> qualifies too.
 */
function isCompleteTagLine(line: string, at: number): boolean {
  const end = tagEnd(line, at);
  return end !== undefined && onlySpaces(line, end);
}

/**
 * Where a complete open or closing tag starting at `at` ends, or undefined.
 * Read in one pass rather than with a backtracking pattern.
 */
function tagEnd(text: string, at: number): number | undefined {
  let index = at + 1;
  const closing = text[index] === "/";
  if (closing) index += 1;
  if (!isAsciiLetter(text.charCodeAt(index))) return undefined;
  while (index < text.length && (isAsciiLetter(text.charCodeAt(index)) || isDigit(text.charCodeAt(index)) ||
    text[index] === "-")) {
    index += 1;
  }
  if (closing) {
    index = nonSpace(text, index);
    return text[index] === ">" ? index + 1 : undefined;
  }
  for (;;) {
    const spaced = nonSpace(text, index);
    if (text[spaced] === ">") return spaced + 1;
    if (text[spaced] === "/" && text[spaced + 1] === ">") return spaced + 2;
    // An attribute follows a space: a name, then optionally = and a value.
    const first = text.charCodeAt(spaced);
    if (spaced === index || !(isAsciiLetter(first) || text[spaced] === "_" || text[spaced] === ":")) return undefined;
    index = spaced + 1;
    while (index < text.length && (isAsciiLetter(text.charCodeAt(index)) || isDigit(text.charCodeAt(index)) ||
      "_.:-".includes(text[index]!))) {
      index += 1;
    }
    const equals = nonSpace(text, index);
    if (text[equals] !== "=") continue;
    const value = nonSpace(text, equals + 1);
    const quote = text[value];
    if (quote === "\"" || quote === "'") {
      const end = text.indexOf(quote, value + 1);
      if (end < 0) return undefined;
      index = end + 1;
    } else {
      let end = value;
      while (end < text.length && !" \"'=<>`".includes(text[end]!)) end += 1;
      if (end === value) return undefined;
      index = end;
    }
  }
}

/**
 * Whether a paragraph may start with a link reference definition, which is
 * not shown: its first bracketed label, with brackets escaped by a backslash
 * skipped, is followed by a colon.
 */
function mayDefineLink(text: string): boolean {
  if (!text.startsWith("[")) return false;
  for (let index = 1; index < text.length; index += 1) {
    if (text[index] === "\\") index += 1;
    else if (text[index] === "]") return text[index + 1] === ":";
  }
  return false;
}

const BACKTICK = 96;

/**
 * Paragraph or heading text as shown, read left to right as CommonMark's
 * inline parser does, whichever construct starts first winning:
 * - inline code becomes NOT_PROSE: a run of backticks opens a span that the
 *   next run of the same length closes, and a run with no match is literal;
 * - raw HTML (comments, processing instructions, declarations, CDATA, and
 *   tags with their attributes) is dropped;
 * - an image, whose description is not shown, ends the text with NOT_PROSE;
 * - at a closing bracket, an inline link's destination and title are read
 *   from the source: the link's text stays between LINK_OPEN and LINK_TARGET,
 *   its destination (whitespace encoded, so it can never read as prose)
 *   follows before LINK_CLOSE, and its title is dropped. A reference link's
 *   label is dropped too. Where CommonMark would show brackets literally (a
 *   link inside a link, or a label with no definition), hiding them fails
 *   closed.
 * Reading link parts is bounded by a work budget; past it, the rest of the
 * text is left out. The whole text is read in linear time.
 */
function shownInline(text: string): string {
  const runs: Array<{ start: number; end: number }> = [];
  for (let at = text.indexOf("`"); at >= 0; at = text.indexOf("`", at)) {
    const start = at;
    while (at < text.length && text.charCodeAt(at) === BACKTICK) at += 1;
    runs.push({ start, end: at });
  }
  // For each run, the next run of the same length.
  const closer = new Array<number>(runs.length).fill(-1);
  const laterByLength = new Map<number, number>();
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const length = runs[index]!.end - runs[index]!.start;
    closer[index] = laterByLength.get(length) ?? -1;
    laterByLength.set(length, index);
  }
  const runAt = new Map(runs.map((run, index) => [run.start, index]));
  const parts: string[] = [];
  // Where each open bracket sits in `parts`.
  const openers: number[] = [];
  let budget = 4 * text.length + 4_096;
  let at = 0;
  while (at < text.length) {
    const character = text[at]!;
    if (character === "\\") {
      parts.push(text.slice(at, at + 2));
      at += 2;
      continue;
    }
    const run = character === "`" ? runAt.get(at) : undefined;
    if (run !== undefined) {
      const close = closer[run]!;
      parts.push(close < 0 ? text.slice(runs[run]!.start, runs[run]!.end) : NOT_PROSE);
      at = close < 0 ? runs[run]!.end : runs[close]!.end;
      continue;
    }
    if (character === "<") {
      const end = rawHtmlEnd(text, at);
      if (end !== undefined) {
        at = end;
        continue;
      }
    } else if (character === "!" && text[at + 1] === "[") {
      parts.push(NOT_PROSE);
      return parts.join("");
    } else if (character === "[") {
      openers.push(parts.length);
    } else if (character === "]" && openers.length > 0) {
      const open = openers.pop()!;
      const tail = inlineLinkTail(text, at + 1, budget);
      budget = tail.budget;
      if (tail.kind === "link") {
        parts[open] = LINK_OPEN;
        parts.push(LINK_TARGET + tail.destination.replace(/\s/gu, "%20") + LINK_CLOSE);
        at = tail.end;
        continue;
      }
      if (tail.kind === "none" && text[at + 1] === "[") {
        // A reference link's label ends at the next unescaped "]"; an unescaped "[" means none.
        let labelEnd = at + 2;
        for (; labelEnd < text.length && text[labelEnd] !== "]" && text[labelEnd] !== "["; labelEnd += 1) {
          if ((budget -= 1) < 0) break;
          if (text[labelEnd] === "\\") labelEnd += 1;
        }
        if (budget >= 0 && text[labelEnd] === "]") {
          parts[open] = "";
          at = labelEnd + 1;
          continue;
        }
      }
      if (budget < 0) {
        // Past the budget, the text from this link on is left out.
        parts.length = open;
        parts.push(NOT_PROSE);
        return parts.join("");
      }
    }
    parts.push(character);
    at += 1;
  }
  return parts.join("");
}

/**
 * Where inline raw HTML starting at `at` ends, or undefined when none starts
 * there. An unclosed comment, processing instruction, declaration or CDATA
 * section hides the rest, which fails closed.
 */
function rawHtmlEnd(text: string, at: number): number | undefined {
  const through = (marker: string, from: number): number => {
    const close = text.indexOf(marker, from);
    return close < 0 ? text.length : close + marker.length;
  };
  if (text.startsWith("<!--", at)) return commentEnd(text, at);
  if (text.startsWith("<?", at)) return through("?>", at + 2);
  if (text.startsWith("<![CDATA[", at)) return through("]]>", at + 9);
  if (text[at + 1] === "!" && isAsciiLetter(text.charCodeAt(at + 2))) return through(">", at + 3);
  return tagEnd(text, at);
}

/** Where an HTML comment ends: "<!-->" and "<!--->" are whole comments, as in CommonMark 0.31. */
function commentEnd(text: string, open: number): number {
  if (text.startsWith(">", open + 4)) return open + 5;
  if (text.startsWith("->", open + 4)) return open + 6;
  const close = text.indexOf("-->", open + 4);
  // An unclosed comment hides the rest, which fails closed.
  return close < 0 ? text.length : close + 3;
}

type LinkTail =
  | { kind: "link"; end: number; destination: string; budget: number }
  | { kind: "none"; budget: number }
  | { kind: "over_budget"; budget: number };

/**
 * An inline link's "(destination "title")" starting at `at`, as CommonMark
 * defines it: a destination in angle brackets, or without spaces and with
 * balanced parentheses; then, after a space, an optional title in double or
 * single quotes or parentheses; then the closing parenthesis.
 */
function inlineLinkTail(text: string, at: number, startBudget: number): LinkTail {
  let budget = startBudget;
  if (text[at] !== "(") return { kind: "none", budget };
  let index = nonSpace(text, at + 1);
  let destination: string;
  if (text[index] === "<") {
    let end = index + 1;
    for (; end < text.length && text[end] !== ">"; end += 1) {
      if ((budget -= 1) < 0) return { kind: "over_budget", budget };
      if (text[end] === "<") return { kind: "none", budget };
      if (text[end] === "\\") end += 1;
    }
    if (end >= text.length) return { kind: "none", budget };
    destination = text.slice(index + 1, end);
    index = end + 1;
  } else {
    let depth = 0;
    let end = index;
    for (; end < text.length; end += 1) {
      if ((budget -= 1) < 0) return { kind: "over_budget", budget };
      const character = text[end]!;
      if (character === "\\") {
        end += 1;
      } else if (character === " " || character.charCodeAt(0) < 32) {
        break;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        if (depth === 0) break;
        depth -= 1;
      }
    }
    if (depth !== 0) return { kind: "none", budget };
    destination = text.slice(index, end);
    index = end;
  }
  const spaced = nonSpace(text, index);
  const quote = text[spaced];
  if (spaced > index && (quote === "\"" || quote === "'" || quote === "(")) {
    const closer = quote === "(" ? ")" : quote;
    let end = spaced + 1;
    for (; end < text.length && text[end] !== closer; end += 1) {
      if ((budget -= 1) < 0) return { kind: "over_budget", budget };
      if (text[end] === "\\") end += 1;
      else if (quote === "(" && text[end] === "(") return { kind: "none", budget };
    }
    if (end >= text.length) return { kind: "none", budget };
    index = nonSpace(text, end + 1);
  } else {
    index = spaced;
  }
  return text[index] === ")" ? { kind: "link", end: index + 1, destination, budget } : { kind: "none", budget };
}

/** Marked text as the reader sees it: link text without destinations. */
export function visibleText(text: string): string {
  let result = "";
  let from = 0;
  for (let target = text.indexOf(LINK_TARGET); target >= 0; target = text.indexOf(LINK_TARGET, from)) {
    result += text.slice(from, target);
    const close = text.indexOf(LINK_CLOSE, target);
    from = close < 0 ? text.length : close + 1;
  }
  return (result + text.slice(from)).replaceAll(LINK_OPEN, "");
}

/** Marked text with each link replaced by its destination, so a link's text may vary. */
export function linkTargets(text: string): string {
  const parts: string[] = [];
  const starts: number[] = [];
  for (let at = 0; at < text.length; at += 1) {
    const character = text[at]!;
    if (character === LINK_OPEN) {
      starts.push(parts.length);
    } else if (character === LINK_TARGET) {
      parts.length = starts.pop() ?? parts.length;
      const close = text.indexOf(LINK_CLOSE, at);
      const end = close < 0 ? text.length : close;
      parts.push(text.slice(at + 1, end));
      at = end;
    } else {
      parts.push(character);
    }
  }
  return parts.join("");
}
