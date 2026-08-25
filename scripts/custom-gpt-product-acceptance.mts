import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  verifyCustomGptAcceptanceReceipt,
  type CustomGptAcceptanceReceipt
} from "../apps/research-mcp/src/custom-gpt-acceptance-receipt.js";

export interface CustomGptProductAcceptanceResult {
  pass: boolean;
  issues: string[];
  verified?: {
    challenge_id: string;
    session_id: string;
    bundle_sha256: string;
    final_boundary: string;
    transition_count: number;
    report_digest: string;
  };
}

/**
 * Validate only a signed receipt issued by the controlled server. Caller-made
 * counts, operation lists, completion claims, and answer prose are not inputs.
 */
export function assessCustomGptProductAcceptance(input: {
  receipt: unknown;
  signingSecret: string;
  expectedKeyId: string;
  now?: () => Date;
}): CustomGptProductAcceptanceResult {
  try {
    const receipt = verifyCustomGptAcceptanceReceipt({
      receipt: input.receipt,
      signingSecret: input.signingSecret,
      expectedKeyId: input.expectedKeyId,
      ...(input.now === undefined ? {} : { now: input.now })
    });
    return {
      pass: true,
      issues: [],
      verified: project(receipt)
    };
  } catch {
    return {
      pass: false,
      issues: [
        "The server-issued product acceptance receipt is invalid, mismatched, or not bound to the reviewed Custom GPT bundle."
      ]
    };
  }
}

function project(receipt: CustomGptAcceptanceReceipt) {
  return {
    challenge_id: receipt.challenge_id,
    session_id: receipt.session_id,
    bundle_sha256: receipt.installation_bundle.bundle_sha256,
    final_boundary: receipt.final_boundary,
    transition_count: receipt.transition_trace.length,
    report_digest: receipt.report_digest
  };
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  const path = process.argv[2];
  const signingSecret = process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
  const expectedKeyId = process.env.ASKRIGOR_FINALIZATION_KEY_ID;
  if (path === undefined || signingSecret === undefined || expectedKeyId === undefined) {
    process.stderr.write(
      "Usage: ASKRIGOR_FINALIZATION_SIGNING_SECRET=... ASKRIGOR_FINALIZATION_KEY_ID=... npm run validate:custom-gpt-product -- path/to/server-receipt.json\n"
    );
    process.exitCode = 2;
  } else {
    const receipt = JSON.parse(await readFile(resolve(path), "utf8"));
    const result = assessCustomGptProductAcceptance({
      receipt,
      signingSecret,
      expectedKeyId
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.pass ? 0 : 1;
  }
}
