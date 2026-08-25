import { describe, expect, it } from "vitest";

import {
  controlledWorkerWorkDigest,
  createControlledWorkerPayloadPage,
  verifyControlledWorkerPayloadReceipt
} from "../apps/research-mcp/src/controlled-worker-payload.js";

const SECRET = "controlled-worker-test-secret-32-bytes-minimum";
const IDENTITY = {
  sessionId: `ars1_${"a".repeat(32)}`,
  stateDigest: "b".repeat(64),
  workDigest: controlledWorkerWorkDigest({ kind: "test" })
};

describe("controlled worker payload chain", () => {
  it("requires the complete sequential signed chain before issuing a terminal receipt", () => {
    const workerInput = { text: "é".repeat(70_000), work: { kind: "test" } };
    const chunks: string[] = [];
    let cursor: string | undefined;
    let receipt: unknown;
    do {
      const page = createControlledWorkerPayloadPage({
        identity: IDENTITY,
        workerInput,
        signingSecret: SECRET,
        ...(cursor === undefined ? {} : { cursor }),
        now: () => 1_000
      });
      chunks.push(page.worker_input_json_chunk);
      cursor = page.next_cursor;
      receipt = page.terminal_receipt;
      if (page.complete) break;
    } while (true);
    expect(chunks.length).toBeGreaterThan(2);
    expect(JSON.parse(chunks.join(""))).toEqual(workerInput);
    expect(verifyControlledWorkerPayloadReceipt({
      receipt,
      identity: IDENTITY,
      workerInput,
      signingSecret: SECRET,
      now: () => 1_001
    })).toMatchObject({ chunk_count: chunks.length });
  });

  it("rejects tampering, replay against another state, and expiry", () => {
    const workerInput = { work: "bounded" };
    const page = createControlledWorkerPayloadPage({
      identity: IDENTITY,
      workerInput,
      signingSecret: SECRET,
      now: () => 1_000
    });
    expect(() => verifyControlledWorkerPayloadReceipt({
      receipt: page.terminal_receipt,
      identity: { ...IDENTITY, stateDigest: "c".repeat(64) },
      workerInput,
      signingSecret: SECRET,
      now: () => 1_001
    })).toThrow();
    expect(() => verifyControlledWorkerPayloadReceipt({
      receipt: { ...page.terminal_receipt, payload_digest: "d".repeat(64) },
      identity: IDENTITY,
      workerInput,
      signingSecret: SECRET,
      now: () => 1_001
    })).toThrow();
    expect(() => verifyControlledWorkerPayloadReceipt({
      receipt: page.terminal_receipt,
      identity: IDENTITY,
      workerInput,
      signingSecret: SECRET,
      now: () => 3_601_001
    })).toThrow(/expired/iu);
  });
});
