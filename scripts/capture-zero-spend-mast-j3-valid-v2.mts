import { chmod, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sha256 } from "./zero-spend-mast-four-arm-base-evaluation.mjs";
import {
  acceptLatestJ3PreSendReceipt,
  latestJ3RootDirectory,
  recordV2J3Attempt,
} from "./zero-spend-mast-four-arm-base-finalization-v2.mjs";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
};
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mastRoot = argument("--mast-root");
const artifactRoot = argument("--artifact-root");
const j3OrdinalRaw = argument("--j3-ordinal");
const attemptRaw = argument("--attempt");
const chatLocator = argument("--chat-locator");
const conversationId = argument("--conversation-id");
const userMessageId = argument("--user-message-id");
const assistantMessageId = argument("--assistant-message-id");
const capturedAt = argument("--captured-at");
const outputFile = argument("--output-file");
const outputSha256 = argument("--output-sha256");
const outputBytesRaw = argument("--output-bytes");
const automaticToolsRaw = argument("--automatic-tool-invocation-observed") ?? "false";
const visibleToolTypeRaw = argument("--visible-tool-type");
const citationCountRaw = argument("--web-citation-ui-artifact-count") ?? "0";
const preSendReceiptFile = argument("--pre-send-receipt-file");
const preSendReceiptSha256 = argument("--pre-send-receipt-sha256");

if (!mastRoot || !artifactRoot || !j3OrdinalRaw || !attemptRaw || !chatLocator
  || !conversationId || !userMessageId || !assistantMessageId || !capturedAt
  || !outputFile || !outputSha256 || !outputBytesRaw || !preSendReceiptFile
  || !preSendReceiptSha256) {
  process.stderr.write(
    "Usage: --mast-root PATH --artifact-root PATH --j3-ordinal N --attempt N "
      + "--chat-locator URL --conversation-id ID --user-message-id ID --assistant-message-id ID "
      + "--captured-at ISO --output-file RELATIVE_FILE --output-sha256 SHA --output-bytes N "
      + "--pre-send-receipt-file RELATIVE_JSON --pre-send-receipt-sha256 SHA\n",
  );
  process.exitCode = 1;
} else {
  (async () => {
    const artifactReal = await realpath(artifactRoot);
    const j3Ordinal = Number(j3OrdinalRaw);
    const attempt = Number(attemptRaw);
    const outputBytes = Number(outputBytesRaw);
    const citationCount = Number(citationCountRaw);
    const automaticTools = automaticToolsRaw === "true";
    if (!Number.isInteger(j3Ordinal) || j3Ordinal < 1
      || !Number.isInteger(attempt) || attempt < 1 || attempt > 4
      || !Number.isInteger(outputBytes) || outputBytes < 1
      || !Number.isInteger(citationCount) || citationCount < 0
      || !/^[a-f0-9]{64}$/u.test(outputSha256)
      || !/^[a-f0-9]{64}$/u.test(preSendReceiptSha256)
      || (automaticToolsRaw !== "true" && automaticToolsRaw !== "false")
      || (visibleToolTypeRaw !== null && visibleToolTypeRaw !== "WEB_SEARCH")
      || (visibleToolTypeRaw !== null && !automaticTools)
      || (citationCount > 0 && !automaticTools)) {
      throw new Error("EVALUATOR_V2_J3_CAPTURE_ARGUMENT_INVALID");
    }
    const schedule = JSON.parse(await readFile(
      resolve(artifactReal, latestJ3RootDirectory, "evaluation-schedule.json"),
      "utf8",
    )) as { records: Array<{
      j3Ordinal: number;
      opaqueResponseId: string;
      caseId: string;
      evaluatorReplicate: 3;
      packetFile: string;
      exactPacketSha256: string;
    }> };
    const slot = schedule.records[j3Ordinal - 1];
    if (!slot || slot.j3Ordinal !== j3Ordinal || slot.evaluatorReplicate !== 3) {
      throw new Error("EVALUATOR_V2_J3_CAPTURE_SLOT_INVALID");
    }
    const preSendPath = await realpath(resolve(artifactReal, preSendReceiptFile));
    const preSendRel = relative(artifactReal, preSendPath);
    const preSendInfo = await lstat(preSendPath);
    const preSendBytes = await readFile(preSendPath, "utf8");
    if (preSendRel.startsWith("..") || isAbsolute(preSendRel) || !preSendInfo.isFile()
      || preSendInfo.isSymbolicLink() || (preSendInfo.mode & 0o777) !== 0o600
      || sha256(preSendBytes) !== preSendReceiptSha256) {
      throw new Error("EVALUATOR_V2_J3_CAPTURE_PRE_SEND_RECEIPT_INVALID");
    }
    const preSend = acceptLatestJ3PreSendReceipt(JSON.parse(preSendBytes));
    if (preSend.series_ordinal !== j3Ordinal || preSend.attempt_number !== attempt
      || preSend.packet_file !== slot.packetFile
      || preSend.packet_sha256 !== slot.exactPacketSha256) {
      throw new Error("EVALUATOR_V2_J3_CAPTURE_PRE_SEND_SLOT_MISMATCH");
    }
    const outputPath = await realpath(resolve(artifactReal, outputFile));
    const rel = relative(artifactReal, outputPath);
    const info = await lstat(outputPath);
    const bytes = await readFile(outputPath);
    if (rel.startsWith("..") || isAbsolute(rel)
      || !rel.startsWith(`${latestJ3RootDirectory}/judgments/`)
      || !info.isFile() || info.isSymbolicLink()
      || (info.mode & 0o777) !== 0o600 || bytes.length !== outputBytes
      || sha256(bytes) !== outputSha256) {
      throw new Error("EVALUATOR_V2_J3_CAPTURE_OUTPUT_IDENTITY_INVALID");
    }
    const receiptFile = `${latestJ3RootDirectory}/receipts/${String(j3Ordinal).padStart(3, "0")}`
      + `-${slot.opaqueResponseId}-J3-attempt-${attempt}-valid.json`;
    const receiptPath = resolve(artifactReal, receiptFile);
    const receipt = {
      j3Ordinal,
      opaqueResponseId: slot.opaqueResponseId,
      caseId: slot.caseId,
      evaluatorReplicate: 3,
      attempt,
      status: "VALID",
      providerSurface: "CHATGPT_CONSUMER_CHAT",
      modelNameObserved: preSend.evaluator_selector_label,
      thinkingEffortObserved: preSend.evaluator_reasoning_ui_label_observed,
      modelSlugObserved: null,
      chatLocator,
      conversationId,
      userMessageId,
      assistantMessageId,
      sentAtSource: null,
      sentAtSourceStatus: "UNAVAILABLE",
      capturedAt,
      toolsInvoked: automaticTools,
      browsingInvoked: automaticTools,
      manualToolSelection: false,
      automaticToolInvocationObserved: automaticTools,
      visibleToolType: visibleToolTypeRaw,
      webCitationUiArtifactCount: citationCount,
      freshConversation: true,
      exactInputCaptured: true,
      inputFile: slot.packetFile,
      exactInputSha256: slot.exactPacketSha256,
      provenanceStatus: "VERIFIED",
      transport: "PASTED_TEXT_ATTACHMENT",
      outputFile,
      exactOutputSha256: outputSha256,
      exactOutputUtf8Bytes: outputBytes,
      exactOutputStoredPrivately: true,
      series_id: preSend.series_id,
      series_ordinal: preSend.series_ordinal,
      frozen_schedule_slot_id: preSend.frozen_schedule_slot_id,
      evaluator_selector_label: preSend.evaluator_selector_label,
      evaluator_reasoning_ui_label_observed: preSend.evaluator_reasoning_ui_label_observed,
      provider_model_slug: null,
      provider_model_slug_status: preSend.provider_model_slug_status,
      consumer_account_continuity_status: preSend.consumer_account_continuity_status,
      chat_mode_status: preSend.chat_mode_status,
      fresh_conversation_status: preSend.fresh_conversation_status,
      physical_tab_reuse_status: preSend.physical_tab_reuse_status,
      physical_tab_id: preSend.physical_tab_id,
      packet_sha256: preSend.packet_sha256,
      attempt_number: preSend.attempt_number,
      attempt_ceiling: preSend.attempt_ceiling,
      execution_repository_branch: preSend.execution_repository_branch,
      execution_repository_commit: preSend.execution_repository_commit,
      local_head_at_record: preSend.local_head_at_record,
      github_head_at_record: preSend.github_head_at_record,
      local_github_head_match: preSend.local_github_head_match,
      structural_pre_send_verification_status: preSend.structural_pre_send_verification_status,
      condition_map_access_status: preSend.condition_map_access_status,
      clinical_content_inspection_status: preSend.clinical_content_inspection_status,
      paid_api_use_status: preSend.paid_api_use_status,
      receipt_created_at: capturedAt,
      previous_valid_checkpoint_sha256: preSend.previous_valid_checkpoint_sha256,
      pre_send_receipt_file: preSendRel,
      pre_send_receipt_sha256: preSendReceiptSha256,
    };
    await mkdir(dirname(receiptPath), { recursive: true, mode: 0o700 });
    await chmod(dirname(receiptPath), 0o700);
    const receiptBytes = `${JSON.stringify(receipt, null, 2)}\n`;
    await writeFile(receiptPath, receiptBytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await chmod(receiptPath, 0o600);
    const recorded = await recordV2J3Attempt({
      repositoryRoot,
      mastRoot,
      artifactRoot: artifactReal,
      receiptValue: receipt,
    });
    return {
      ...recorded,
      opaqueResponseId: slot.opaqueResponseId,
      receiptFile,
      receiptSha256: sha256(receiptBytes),
    };
  })().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`Evaluator v2 J3 capture failed: ${error instanceof Error ? error.message : "unknown failure"}\n`);
    process.exitCode = 1;
  });
}
