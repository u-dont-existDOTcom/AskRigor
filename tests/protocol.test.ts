import { beforeEach, describe, expect, it, vi } from "vitest";

const { readFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn()
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: readFileMock };
});

import {
  getProtocolManifest,
  loadProtocol,
  verifyProtocolIntegrity
} from "@askrigor/protocol";

const HRP_SHA_256 =
  "a61181bb9325b84b542decf8795703f62bac880fa1e60bbeeb89051d874f61f0";
const UNIVERSAL_SHA_256 =
  "1a4c61627b593a8ddabbc68608f69d4c7062896535b480056b6b5efe5f47d9aa";

describe("canonical protocol loader", () => {
  let actualReadFile: typeof import("node:fs/promises").readFile;

  beforeEach(async () => {
    actualReadFile = (
      await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")
    ).readFile;
    readFileMock.mockReset();
    readFileMock.mockImplementation(actualReadFile);
  });

  it("derives the HRP manifest from its root attributes", async () => {
    await expect(getProtocolManifest("hrp")).resolves.toMatchObject({
      name: "HRP",
      version: "20.5.15",
      revisionDate: "2026-08-10"
    });
  });

  it("returns the original canonical file text unchanged", async () => {
    const original = await actualReadFile(
      new URL("../protocols/HRP_Full.xml", import.meta.url),
      "utf8"
    );

    await expect(loadProtocol("hrp")).resolves.toBe(original);
  });

  it("rejects an expected digest that does not match the exact file bytes", async () => {
    await expect(
      verifyProtocolIntegrity("hrp", "0".repeat(64))
    ).rejects.toThrow("Protocol SHA-256 mismatch");
  });

  it("accepts the published digest for the canonical HRP file", async () => {
    await expect(verifyProtocolIntegrity("hrp", HRP_SHA_256)).resolves.toMatchObject({
      name: "HRP",
      sha256: HRP_SHA_256
    });
  });

  it("derives the Universal manifest from its root attributes", async () => {
    await expect(getProtocolManifest("universal")).resolves.toMatchObject({
      name: "AskRigor.com universal saved instructions",
      version: "20.5.11",
      revisionDate: "2026-08-07"
    });
  });

  it("returns the original Universal file text unchanged", async () => {
    const original = await actualReadFile(
      new URL("../protocols/Universal_Instructions.xml", import.meta.url),
      "utf8"
    );

    await expect(loadProtocol("universal")).resolves.toBe(original);
  });

  it("accepts the published digest for the canonical Universal file", async () => {
    await expect(verifyProtocolIntegrity("universal", UNIVERSAL_SHA_256)).resolves.toMatchObject({
      name: "AskRigor.com universal saved instructions",
      sha256: UNIVERSAL_SHA_256
    });
  });

  it("preserves every Universal 20.5.11 return-artifact closure gate", async () => {
    const text = await loadProtocol("universal");

    expect(text).toContain('<revision version="20.5.11" priority="Critical">');
    expect(text).toContain("Added a domain-general Return-Artifact Closure and End-State Design rule.");
    expect(text).toContain("12. Return-artifact closure:");
    expect(text).toContain("13. End-state design before implementation:");
    expect(text).toContain("14. End-to-end completion test:");
    expect(text).toContain("Return-artifact closure check:");
    expect(text).toContain("UPLOAD THIS FILE: /path/to/artifact");
  });

  it("fails closed when required root attributes are absent", async () => {
    readFileMock.mockResolvedValueOnce(
      Buffer.from(
        "<?xml version=\"1.0\"?><Protocol name=\"HRP\" version=\"20.5.15\" />"
      )
    );

    await expect(getProtocolManifest("hrp")).rejects.toThrow(
      "Protocol root attribute revisionDate is required"
    );
  });

  it("fails closed when the canonical XML is malformed", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("<Protocol name=\"HRP\">"));

    await expect(loadProtocol("hrp")).rejects.toThrow("Protocol XML is malformed");
  });

  it("fails closed when the canonical file cannot be read", async () => {
    readFileMock.mockRejectedValueOnce(new Error("permission denied"));

    await expect(loadProtocol("hrp")).rejects.toThrow("Unable to read protocol file");
  });

  it("fails closed when the canonical file is not valid UTF-8", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from([0xc3, 0x28]));

    await expect(loadProtocol("hrp")).rejects.toThrow("Protocol file is not valid UTF-8");
  });
});
