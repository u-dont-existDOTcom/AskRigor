import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createLatestJ3PreSendReceipt } from "./zero-spend-mast-four-arm-base-finalization-v2.mjs";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
};

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mastRoot = argument("--mast-root");
const artifactRoot = argument("--artifact-root");
const ordinalRaw = argument("--j3-ordinal");
const attemptRaw = argument("--attempt");
const selectorLabel = argument("--selector-label");
const reasoningUiLabel = argument("--reasoning-ui-label");
const physicalTabId = argument("--physical-tab-id");
const accountStatus = argument("--consumer-account-continuity-status");
const chatModeStatus = argument("--chat-mode-status");
const freshConversationStatus = argument("--fresh-conversation-status");
const physicalTabReuseStatus = argument("--physical-tab-reuse-status");

if (!mastRoot || !artifactRoot || !ordinalRaw || !attemptRaw || !selectorLabel
  || !reasoningUiLabel || !physicalTabId || !accountStatus || !chatModeStatus
  || !freshConversationStatus || !physicalTabReuseStatus) {
  process.stderr.write(
    "Usage: --mast-root PATH --artifact-root PATH --j3-ordinal N --attempt N "
      + "--selector-label LABEL --reasoning-ui-label LABEL --physical-tab-id ID "
      + "--consumer-account-continuity-status STATUS --chat-mode-status STATUS "
      + "--fresh-conversation-status STATUS --physical-tab-reuse-status STATUS\n",
  );
  process.exitCode = 1;
} else {
  const j3Ordinal = Number(ordinalRaw);
  const attempt = Number(attemptRaw);
  if (!Number.isInteger(j3Ordinal) || !Number.isInteger(attempt)) {
    process.stderr.write("Evaluator v2 J3 Latest pre-send failed: ordinal and attempt must be integers\n");
    process.exitCode = 1;
  } else {
    createLatestJ3PreSendReceipt({
      repositoryRoot,
      mastRoot,
      artifactRoot,
      j3Ordinal,
      attempt,
      evaluatorSelectorLabel: selectorLabel,
      evaluatorReasoningUiLabelObserved: reasoningUiLabel,
      physicalTabId,
      consumerAccountContinuityStatus: accountStatus,
      chatModeStatus,
      freshConversationStatus,
      physicalTabReuseStatus,
    }).then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }).catch((error: unknown) => {
      process.stderr.write(
        `Evaluator v2 J3 Latest pre-send failed: ${error instanceof Error ? error.message : "unknown failure"}\n`,
      );
      process.exitCode = 1;
    });
  }
}
