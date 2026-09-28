import { describe, expect, it } from "vitest";

import {
  displayedProse,
  LINK_CLOSE,
  LINK_OPEN,
  LINK_TARGET,
  linkTargets,
  NOT_PROSE,
  visibleText
} from "../apps/research-mcp/src/displayed-prose.js";

describe("displayed prose", () => {
  it("returns paragraphs, headings and list items as shown", () => {
    expect(displayedProse("# Title ##\n\nFirst line\n   wrapped.\n\n- One\n- Two\n\n1. Three\n\nSetext\n===\n"))
      .toEqual(["Title", "First line wrapped.", "One", "Two", "Three", "Setext"]);
    // An ordered item interrupts a paragraph only when it starts at 1.
    expect(displayedProse("Intro\n2. The caveat.")).toEqual(["Intro 2. The caveat."]);
    expect(displayedProse("Intro\n1. The caveat.")).toEqual(["Intro", "The caveat."]);
    expect(displayedProse("-\tThe caveat.\r\n\r\n#\tHeading")).toEqual(["The caveat.", "Heading"]);
  });

  it("leaves out quotations, code, comments, image descriptions and link definitions", () => {
    // A line after a quoted paragraph continues it lazily, inside the quotation.
    expect(displayedProse("> Quoted\nlazy line\n\n>\tAlso quoted.\n\nAfter.")).toEqual(["After."]);
    expect(displayedProse("```\ncode\n```\n\n    indented\n\nText `code` more.")).toEqual([`Text ${NOT_PROSE} more.`]);
    expect(displayedProse("Before <!-- hidden --> after.\n\n<!--\nblock\n\nstill hidden\n-->\n\nEnd."))
      .toEqual(["Before  after.", "End."]);
    expect(displayedProse("See ![A chart. The caveat.](x.png) and more.\n\nNext.")).toEqual([`See ${NOT_PROSE}`, "Next."]);
    expect(displayedProse("[1]: https://example.com \"Title. The caveat.\"\n\n[a\nb]: /u 'Intro. The caveat.'\n\nText."))
      .toEqual(["Text."]);
    // A comment that opens inside a paragraph cannot hide the fence on the next line.
    expect(displayedProse("Intro <!--\n```\n--> The caveat.")).toEqual(["Intro "]);
  });

  it("reads list items by their own content offset, as CommonMark does", () => {
    // After a blank line, four spaces are not enough to stay in an item whose content starts five in:
    // the line is top-level indented code.
    expect(displayedProse("100. Search log\n\n    The caveat.")).toEqual(["Search log"]);
    expect(displayedProse("100. Search log\n\n     The caveat.")).toEqual(["Search log", "The caveat."]);
    expect(displayedProse("   - Item\n\n    The caveat.")).toEqual(["Item"]);
    expect(displayedProse("1. Item\n\n   The caveat.")).toEqual(["Item", "The caveat."]);
    // Five spaces after a marker make the item's content indented code.
    expect(displayedProse("-     The caveat.")).toEqual([]);
    // An item that begins with a blank line ends at the next one.
    expect(displayedProse("-\n\n    The caveat.")).toEqual([]);
    expect(displayedProse("-\n\n  The caveat.")).toEqual(["The caveat."]);
    // A fence ends with its item; an unindented fence line then opens a new one.
    expect(displayedProse("- Item\n  ```\n```\nThe caveat.")).toEqual(["Item"]);
    expect(displayedProse("- a\n  - b\n\n    The caveat.")).toEqual(["a", "b", "The caveat."]);
    // CommonMark's example: the last line is too indented to start an item, so it continues "d" lazily.
    expect(displayedProse("- a\n - b\n  - c\n   - d\n    - e")).toEqual(["a", "b", "c", "d - e"]);
  });

  it("recognizes the seven kinds of HTML block", () => {
    // A block tag runs to the next blank line and takes the list marker with it.
    expect(displayedProse("<div>\n- item\n</div>\n\n    The caveat.")).toEqual([]);
    expect(displayedProse("<script>\nThe caveat.\n\nStill script.\n</script>\n\nAfter.")).toEqual(["After."]);
    expect(displayedProse("<?php\n\nThe caveat.\n?>\n\nAfter.")).toEqual(["After."]);
    expect(displayedProse("<!DOCTYPE x\n\nThe caveat.>\n\n<![CDATA[\n\nThe caveat.]]>\n\nAfter.")).toEqual(["After."]);
    // A block tag interrupts a paragraph, with or without text after it.
    expect(displayedProse("Intro\n<div class=\"note\">\nThe caveat.\n\n<div>The caveat.\n\nAfter.")).toEqual(["Intro", "After."]);
    // A lone tag starts a block after a blank line, but cannot interrupt a paragraph.
    expect(displayedProse("<span class=\"note\">\nThe caveat.\n\nAfter.")).toEqual(["After."]);
    expect(displayedProse("Intro\n<span>\nThe caveat.")).toEqual(["Intro  The caveat."]);
    // Inline, tags and their attributes are not shown, nor are declarations, processing instructions or CDATA.
    expect(displayedProse("<b>Note:</b> The caveat.")).toEqual(["Note: The caveat."]);
    expect(displayedProse("Intro. <span title='Hidden. The caveat.'>shown</span>")).toEqual(["Intro. shown"]);
    expect(displayedProse("Intro <!X\nhidden. The caveat.> after <?x hidden. The caveat. ?> and <![CDATA[ hidden ]]>."))
      .toEqual(["Intro  after  and ."]);
    // A "<" that starts none of them, as in an autolink or a comparison, is shown.
    expect(displayedProse("See <https://example.com> for doses < 5 mg.")).toEqual(["See <https://example.com> for doses < 5 mg."]);
  });

  it("shows a link's text, not its destination, title or reference label", () => {
    const [marked] = displayedProse("See [the study](https://doi.org/10.1/x \"Hidden. Words.\") now.");
    expect(marked).toBe(`See ${LINK_OPEN}the study${LINK_TARGET}https://doi.org/10.1/x${LINK_CLOSE} now.`);
    expect(visibleText(marked!)).toBe("See the study now.");
    expect(linkTargets(marked!)).toBe("See https://doi.org/10.1/x now.");
    const shown = (markdown: string) => displayedProse(markdown).map(visibleText);
    // Codex's case: a relative destination is not shown either.
    expect(shown("YouTube comments: [details](/helped/no-effect/adverse)")).toEqual(["YouTube comments: details"]);
    expect(shown("[a](<Hidden words.> 'Hidden. Words.') [b](u (Hidden.)) [c](u(v)w)")).toEqual(["a b c"]);
    // A reference link's label is hidden, even with an escaped bracket; an unescaped "[" means no label.
    expect(shown("[details][helped no effect] [t][a\\] hidden words] [x][y[z]")).toEqual(["details t [x][y[z]"]);
    // A link inside a link: CommonMark shows the outer brackets, and hiding them fails closed.
    expect(shown("[x [y](u) z](v)")).toEqual(["x y z"]);
    // Not links: a space before the parenthesis, unbalanced parentheses, an unclosed title.
    expect(shown("[a] (u) [b](u(v) [c](u 'open")).toEqual(["[a] (u) [b](u(v) [c](u 'open"]);
    // A link keeps its destination for binding, and a nested one's destination replaces its text.
    expect(displayedProse("[x [y](u) z](v)").map(linkTargets)).toEqual(["v"]);
    // Marks never come from the draft itself.
    expect(shown("Shown \u0002hidden?\u0003x\u0004 text.")).toEqual(["Shown \uFFFDhidden?\uFFFDx\uFFFD text."]);
  });

  it("fails closed past its nesting limit and reads a hostile draft in linear time", () => {
    expect(displayedProse(`Before.\n\n${"- ".repeat(70)}Deep`)).toEqual(["Before."]);
    const started = Date.now();
    for (const hostile of [
      `${"- ".repeat(20_000)}x${"\n".repeat(20_000)}`,
      "> ".repeat(30_000),
      `${"1. a\n".repeat(12_000)}`,
      `<a b${" c".repeat(29_000)}`,
      "[".repeat(60_000),
      "`a".repeat(30_000),
      "![".repeat(30_000),
      "<!--".repeat(15_000),
      `${" ".repeat(59_000)}x`,
      `${"#".repeat(59_000)} x`,
      `\`\`\`${"`".repeat(59_000)}`,
      `${"> - ".repeat(15)}x\n`.repeat(1_000),
      "[a](".repeat(15_000),
      `[](${"(".repeat(59_000)}`,
      "[a](u 'x".repeat(7_000),
      "[a][b\\".repeat(10_000),
      `${"[".repeat(30_000)}${"](a".repeat(10_000)}`
    ]) {
      displayedProse(hostile);
    }
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
