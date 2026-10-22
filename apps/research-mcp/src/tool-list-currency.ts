import { z } from "zod";

import { runningVersionsText, type RunningVersions } from "./version.js";

/**
 * Owner request (2026-10-22): an app keeps the tool list it loaded until its user refreshes AskRigor, so after a
 * release it cannot send the newest fields, and nothing told the user. The model gives the user this sentence.
 */
export const TOOL_LIST_REFRESH_SENTENCE = "AskRigor has been updated since this app loaded its tools. To use its " +
  "newest checks, refresh AskRigor in this app's settings and start a new chat.";

/** A build as a client copies it back: the commit, or at least its first 7 hexadecimal characters. */
const BUILD_PATTERN = /^[0-9a-f]{7,40}$/u;

export const toolListBuildSchema = z.string().trim().max(100);

/** tool_list_build as a release publishes it: its description carries that release's build, which the model sends back. */
export function toolListBuildField(running: RunningVersions | undefined) {
  return toolListBuildSchema.optional().describe(running === undefined || running.build === "unknown"
    ? "The AskRigor build this tool list was loaded from."
    : `The AskRigor build this tool list was loaded from: "${running.build}". The result says whether this app's ` +
      "copy of AskRigor's tools is out of date.");
}

/**
 * Whether this app's copy of AskRigor's tools is older than the server, as a sentence for the model. Certain when the
 * call sends the build its tool list names (an exact comparison with the running build); otherwise the comparison is
 * the model's, with the versions at the start of get_protocol_manifest's description. Nothing without a known build.
 */
export function toolListNotice(declared: string | undefined, running: RunningVersions | undefined): string | undefined {
  if (running === undefined || !BUILD_PATTERN.test(running.build)) return undefined;
  const build = declared?.trim().toLowerCase();
  if (build !== undefined && BUILD_PATTERN.test(build)) {
    return running.build.startsWith(build)
      ? undefined
      : "This app's copy of AskRigor's tools is from an earlier build than the one AskRigor now runs " +
        `(${running.build.slice(0, 12)}). Before anything else, tell the user, in their language: ` +
        `"${TOOL_LIST_REFRESH_SENTENCE}"`;
  }
  return `AskRigor now runs ${runningVersionsText(running)}. If the versions at the start of get_protocol_manifest's ` +
    "description in this app's tool list are older, the app's copy of AskRigor's tools is out of date: tell the " +
    `user, in their language: "${TOOL_LIST_REFRESH_SENTENCE}"`;
}
