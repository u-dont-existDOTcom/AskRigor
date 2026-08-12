import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { XMLParser, XMLValidator } from "fast-xml-parser";

export type ProtocolName = "hrp" | "universal";

export interface ProtocolManifest {
  name: string;
  version: string;
  revisionDate: string;
  sha256: string;
}

const PROTOCOL_FILES: Record<ProtocolName, string> = {
  hrp: "HRP_Full.xml",
  universal: "Universal_Instructions.xml"
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false
});

interface LoadedProtocol {
  text: string;
  manifest: ProtocolManifest;
}

export async function loadProtocol(protocolName: ProtocolName): Promise<string> {
  return (await readProtocol(protocolName)).text;
}

export async function getProtocolManifest(
  protocolName: ProtocolName
): Promise<ProtocolManifest> {
  return (await readProtocol(protocolName)).manifest;
}

export async function verifyProtocolIntegrity(
  protocolName: ProtocolName,
  expectedSha256: string
): Promise<ProtocolManifest> {
  const { manifest } = await readProtocol(protocolName);

  if (manifest.sha256 !== expectedSha256) {
    throw new Error("Protocol SHA-256 mismatch");
  }

  return manifest;
}

async function readProtocol(protocolName: ProtocolName): Promise<LoadedProtocol> {
  const fileName = PROTOCOL_FILES[protocolName];
  if (!fileName) {
    throw new Error("Unknown protocol name");
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(protocolFileUrl(fileName));
  } catch {
    throw new Error("Unable to read protocol file");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Protocol file is not valid UTF-8");
  }

  const manifest = manifestFromText(text, createHash("sha256").update(bytes).digest("hex"));
  return { text, manifest };
}

function protocolFileUrl(fileName: string): URL {
  return new URL(`../../../protocols/${fileName}`, import.meta.url);
}

function manifestFromText(text: string, sha256: string): ProtocolManifest {
  if (XMLValidator.validate(text) !== true) {
    throw new Error("Protocol XML is malformed");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Protocol XML is malformed");
  }

  const root = parsed.Protocol;
  if (!isRecord(root)) {
    throw new Error("Protocol root element is required");
  }

  return {
    name: requiredRootAttribute(root, "name"),
    version: requiredRootAttribute(root, "version"),
    revisionDate: requiredRootAttribute(root, "revisionDate"),
    sha256
  };
}

function requiredRootAttribute(root: Record<string, unknown>, name: string): string {
  const value = root[`@_${name}`];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Protocol root attribute ${name} is required`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
