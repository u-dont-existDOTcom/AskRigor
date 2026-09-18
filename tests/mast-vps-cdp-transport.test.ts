import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { ROUND_2_STUDY_ID } from "../evaluation/mast/src/fresh-validation-round-2.js";
import {
  VPS_BROWSER,
  VPS_CDP_ENDPOINT,
  VPS_DEVICE,
  VPS_PRIVATE_ROOT,
  VPS_USER,
  assertVpsPacketTransferEligible,
  vpsPacketTransferReceiptSchema,
  vpsRuntimeAttestationSchema,
} from "../evaluation/mast/src/vps-cdp-transport.js";

const digest = "a".repeat(64);

function transferRecord(sequence: number) {
  const opaqueInputId = `run-${sequence.toString(16).padStart(24, "0")}`;
  return {
    sequence,
    opaqueInputId,
    sourceRelativePath: `generation/inputs/${sequence.toString().padStart(3, "0")}-${opaqueInputId}.txt`,
    destinationRelativePath: `packets/${sequence.toString().padStart(3, "0")}-${opaqueInputId}.txt`,
    expectedSha256: digest,
    sourceSha256: digest,
    destinationSha256: digest,
    sourceUtf8Bytes: 167_433,
    destinationUtf8Bytes: 167_433,
    eligible: true as const,
  };
}

describe("MAST Round 2 VPS CDP transport", () => {
  it("requires exact source/destination identity for all 144 packets", () => {
    const receipt = {
      schemaVersion: 1 as const,
      studyId: ROUND_2_STUDY_ID,
      device: VPS_DEVICE,
      user: VPS_USER,
      privateRoot: VPS_PRIVATE_ROOT,
      transferredAt: "2026-09-18T23:00:00.000Z",
      records: Array.from({ length: 144 }, (_, index) => transferRecord(index + 1)),
    };
    expect(assertVpsPacketTransferEligible(receipt).records).toHaveLength(144);
    expect(() => vpsPacketTransferReceiptSchema.parse({
      ...receipt,
      records: receipt.records.map((record, index) => index === 0 ? { ...record, destinationSha256: "b".repeat(64) } : record),
    })).toThrow("VPS_PACKET_TRANSFER_IDENTITY_MISMATCH");
  });

  it("rejects missing, duplicate, and reordered packet coverage", () => {
    const records = Array.from({ length: 144 }, (_, index) => transferRecord(index + 1));
    const base = {
      schemaVersion: 1 as const, studyId: ROUND_2_STUDY_ID, device: VPS_DEVICE, user: VPS_USER,
      privateRoot: VPS_PRIVATE_ROOT, transferredAt: "2026-09-18T23:00:00.000Z",
    };
    expect(() => vpsPacketTransferReceiptSchema.parse({ ...base, records: records.slice(1) })).toThrow();
    expect(() => vpsPacketTransferReceiptSchema.parse({ ...base, records: [records[0], ...records.slice(0, -1)] })).toThrow("VPS_PACKET_TRANSFER_COVERAGE_INVALID");
    expect(() => vpsPacketTransferReceiptSchema.parse({ ...base, records: [...records].reverse() })).toThrow("VPS_PACKET_TRANSFER_COVERAGE_INVALID");
  });

  it("binds the exact VPS browser and loopback CDP endpoint", () => {
    expect(vpsRuntimeAttestationSchema.parse({
      schemaVersion: 1, studyId: ROUND_2_STUDY_ID, device: VPS_DEVICE, user: VPS_USER,
      browser: VPS_BROWSER, cdpEndpoint: VPS_CDP_ENDPOINT, cdpAttached: true,
      authenticated: true, tabCount: 1, observedAt: "2026-09-18T23:00:00.000Z",
    }).authenticated).toBe(true);
    expect(() => vpsRuntimeAttestationSchema.parse({
      schemaVersion: 1, studyId: ROUND_2_STUDY_ID, device: VPS_DEVICE, user: VPS_USER,
      browser: VPS_BROWSER, cdpEndpoint: "http://0.0.0.0:9222", cdpAttached: true,
      authenticated: true, tabCount: 1, observedAt: "2026-09-18T23:00:00.000Z",
    })).toThrow();
  });

  it("freezes local Playwright CDP, single-operation insertion, readback, and no prohibited relay path", async () => {
    const source = await readFile(new URL("../scripts/mast-vps-cdp-generation.mjs", import.meta.url), "utf8");
    expect(source).toContain("chromium.connectOverCDP(CDP_ENDPOINT");
    expect(source).toContain("element.innerText = text");
    expect(source).toContain("composerObservation(page)");
    expect(source.indexOf("composerObservation(page)")).toBeLessThan(source.indexOf("send.click"));
    expect(source).toContain("POST_SEND_AMBIGUITY_REQUIRES_STOP");
    expect(source).toContain("INTERRUPTED_AFTER_SEND_CAPTURE_AMBIGUOUS");
    expect(source).not.toMatch(/wl-copy|xclip|clipboard|cloudflared|trycloudflare/iu);
    expect(source).not.toContain("keyboard.type");
  });
});
