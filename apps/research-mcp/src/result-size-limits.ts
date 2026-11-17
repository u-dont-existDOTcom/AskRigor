/**
 * Claude Code saves an MCP tool's result to a file, in place of showing it inline, when the result is longer than
 * 50,000 characters, unless the tool's entry in tools/list declares a larger size in
 * `_meta["anthropic/maxResultSizeChars"]`, up to a ceiling of 500,000 characters (Claude Code's MCP documentation,
 * "Raise the limit for a specific tool", read 17 Nov 2026). The MCP SDK this server uses (1.32.2) publishes a tool's
 * `_meta` in tools/list as given, so a declaration needs nothing new from it.
 *
 * A declaration changes tools/list, which owner answer 189a keeps fixed (tests/fixtures/frozen-tool-lists), and every
 * app's copy of the tools then needs one refresh. So nothing is declared unless ASKRIGOR_DECLARE_RESULT_SIZES=enabled:
 * the release that turns it on needs the owner's yes, rewrites the frozen lists with it on and says in its record that
 * apps need one refresh.
 *
 * What each tool that can return a large result returns at most, from its own code (server fix 3, 17 Nov 2026):
 * - load_protocol pages, acquire_open_full_text and continue_open_full_text pages (34,000 serialized characters of text
 *   a page), the YouTube video audit (40,000) and the Atlas lookup (46,000 bytes) are paged under 50,000 already, and
 *   tests hold them there (tests/text-only-clients.test.ts, tests/mcp-tools.test.ts): nothing to declare.
 * - read_forum_thread: a forum page holds at most 60,000 characters of page text (packages/sources/src/forum-page.ts),
 *   at most about 125,000 as JSON when every quote and line break is escaped. A Reddit call stops fetching once its
 *   comments hold more than 100,000 characters of text, so it returns that plus the page it was fetching, and each
 *   comment carries about 245 characters of fields besides its text (measured with the test host, 17 Nov 2026). A call
 *   that reaches its text limit with comments of a few hundred characters returns about 200,000 to 250,000 characters;
 *   a call of over a thousand very short comments, or one whose last page brought many long ones, can return more, up
 *   to over 500,000, and is then saved to a file as every larger result is today. 250,000 covers the calls the reader
 *   is built to return without inviting the rare larger one into the conversation.
 * - get_youtube_comments returns every comment a call retrieves (up to 48 MiB of text by its limits) and has no page
 *   size a declaration could honestly name: it needs a page size of its own first. Not declared.
 */

/** The key Claude Code reads in a tool's tools/list `_meta`. */
export const MAX_RESULT_SIZE_META_KEY = "anthropic/maxResultSizeChars";
/** Claude Code's default: a longer result is saved to a file. */
export const CLAUDE_CODE_DEFAULT_RESULT_CHARACTERS = 50_000;
/** The largest declaration Claude Code honours. */
export const CLAUDE_CODE_RESULT_CEILING = 500_000;

/** The declared sizes, by tool: only tools whose results are built to pass 50,000 characters. */
export const DECLARED_RESULT_SIZES: Readonly<Record<string, number>> = Object.freeze({
  read_forum_thread: 250_000,
});

/** Whether the declarations go into tools/list: ASKRIGOR_DECLARE_RESULT_SIZES set to "enabled". */
export function resultSizeDeclarationsFromEnv(value = process.env.ASKRIGOR_DECLARE_RESULT_SIZES): boolean {
  return value?.trim() === "enabled";
}

/**
 * The `_meta` entries a tool gets: its declared size when declarations are on and the surface serves Claude's apps.
 * The Gemini surface gets none: the key is Claude Code's alone.
 */
export function resultSizeMeta(tool: string, options: { declare: boolean; gemini: boolean }): Record<string, number> {
  const size = DECLARED_RESULT_SIZES[tool];
  return !options.declare || options.gemini || size === undefined ? {} : { [MAX_RESULT_SIZE_META_KEY]: size };
}
