import { expect } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { PROTOCOL_PAGE_IN_TEXT, resultForClient } from "../../apps/research-mcp/src/tool-result.js";

type ReceivedResult = { content?: unknown; structuredContent?: unknown };
type Block = CallToolResult["content"][number];

/**
 * The content blocks the tool itself built, from a result received by an MCP client that sent none of ChatGPT's
 * signals: every such result also carries its payload as text for clients that read only text (lesson #59). This
 * checks that payload and takes it off. For a load_protocol page (`tool` "load_protocol" and a page's text in the
 * structured content), the payload is the other fields' JSON and then the page's exact bytes, and the summary's
 * sentence saying where they are comes off too; for every other result, the structured content's JSON.
 */
export function builtContent(result: ReceivedResult, tool?: string): Block[] {
  const content = result.content as Block[];
  const structured = result.structuredContent as Record<string, unknown> | undefined;
  if (structured === undefined) return content;
  if (tool === "load_protocol" && structured.ok === true && typeof structured.text === "string") {
    const { text, ...fields } = structured;
    expect(content.slice(-2)).toEqual([
      { type: "text", text: JSON.stringify(fields) },
      { type: "text", text }
    ]);
    const built = content.slice(0, -2);
    const summary = built.findIndex((block) => block.type === "text");
    const first = built[summary] as { type: "text"; text: string };
    expect(first.text.endsWith(PROTOCOL_PAGE_IN_TEXT)).toBe(true);
    return built.map((block, index) => index === summary
      ? { ...first, text: first.text.slice(0, -PROTOCOL_PAGE_IN_TEXT.length) } : block);
  }
  expect(content.at(-1)).toEqual({ type: "text", text: JSON.stringify(structured) });
  return content.slice(0, -1);
}

/** Every text block of a result, as a client that reads only text joins them. */
export function textOnly(result: ReceivedResult): string[] {
  return (result.content as Block[]).flatMap((block) => block.type === "text" ? [block.text] : []);
}

/**
 * Claude Code puts a result bigger than this in a file instead of the conversation (its MCP documentation, "MCP output
 * limits"). Measured on 8 Nov 2026 with Claude Code 2.1.312: it counts the part it shows the model, the structured
 * content, so an 82,745-character result whose structured part was 41,119 stayed inline.
 */
export const CLAUDE_CODE_INLINE_CHARACTERS = 50_000;
/** The largest tool result claude.ai and Claude Desktop take, over the whole result (Claude's connector documentation). */
export const CLAUDE_APP_RESULT_CHARACTERS = 150_000;

/**
 * The bytes each kind of client takes in from a result received without ChatGPT's signals: ChatGPT shows the model
 * both the content it gets (resultForClient's ChatGPT form) and the structured content, so the whole result counts;
 * a client that reads only text takes in the text blocks alone; Claude Code shows the structured content alone; and a
 * Claude app that takes the whole result takes both, as received. Bytes are never fewer than characters, so a limit in
 * characters holds when these do.
 */
export function clientViewBytes(result: ReceivedResult & { isError?: boolean }, tool?: string):
  { chatGpt: number; textOnly: number; structured: number; whole: number } {
  const chatGpt = resultForClient(tool ?? "", {
    content: builtContent(result, tool),
    ...(result.structuredContent === undefined ? {} : { structuredContent: result.structuredContent as Record<string, unknown> }),
    ...(result.isError === undefined ? {} : { isError: result.isError }),
  }, true);
  return {
    chatGpt: Buffer.byteLength(JSON.stringify(chatGpt), "utf8"),
    textOnly: textOnly(result).reduce((total, text) => total + Buffer.byteLength(text, "utf8"), 0),
    structured: result.structuredContent === undefined ? 0 : Buffer.byteLength(JSON.stringify(result.structuredContent), "utf8"),
    whole: Buffer.byteLength(JSON.stringify({ content: result.content, structuredContent: result.structuredContent }), "utf8"),
  };
}
