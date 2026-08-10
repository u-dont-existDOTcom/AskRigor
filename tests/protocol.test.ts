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
  "b94bda38e6f341f7e5691494643e656a10e9ced68438689ffd4b7614b487911c";
const UNIVERSAL_SHA_256 =
  "df324fd4900c0db26ad66b46a73986869aca8fbf05e524ecb525ad8ff5bd5cb3";

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
      version: "20.5.14",
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
      version: "20.5.10",
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

  it("fails closed when required root attributes are absent", async () => {
    readFileMock.mockResolvedValueOnce(
      Buffer.from(
        "<?xml version=\"1.0\"?><Protocol name=\"HRP\" version=\"20.5.14\" />"
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
