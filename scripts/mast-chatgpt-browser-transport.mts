import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  composerObservationSchema,
  encodeBrowserFillPayload,
  normalizeTransportText,
  transportTextIdentity,
  verifyComposerTransfer,
} from "../evaluation/mast/src/chatgpt-browser-transport.js";

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function requiredArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`TRANSPORT_ARGUMENT_REQUIRED:${name}`);
  return resolve(value);
}

async function copyq(args: string[], input?: Uint8Array): Promise<Buffer> {
  return new Promise((accept, reject) => {
    const child = spawn("copyq", args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? accept(Buffer.concat(stdout))
      : reject(new Error(`COPYQ_FAILED:${code}:${Buffer.concat(stderr).toString("utf8").trim()}`)));
    if (input) child.stdin.end(input); else child.stdin.end();
  });
}

async function stageClipboard(packetPath: string) {
  const sourceRaw = await readFile(packetPath, "utf8");
  const source = normalizeTransportText(sourceRaw);
  const identity = transportTextIdentity(source);
  await copyq(["disable"]);
  try {
    await copyq(["copy", "-"], Buffer.from(source, "utf8"));
    const clipboard = normalizeTransportText((await copyq(["clipboard"])).toString("utf8"));
    const clipboardIdentity = transportTextIdentity(clipboard);
    if (JSON.stringify(identity) !== JSON.stringify(clipboardIdentity)) {
      throw new Error("CLIPBOARD_SOURCE_MISMATCH");
    }
    return { status: "CLIPBOARD_STAGED", packetPath, source: identity, clipboard: clipboardIdentity };
  } catch (error) {
    await copyq(["enable"]).catch(() => undefined);
    throw error;
  }
}

async function clearClipboard() {
  await copyq(["copy", "" ]);
  await copyq(["enable"]);
  return { status: "CLIPBOARD_CLEARED_AND_HISTORY_ENABLED" };
}

async function verifyObservation(packetPath: string, observationPath: string) {
  const source = await readFile(packetPath, "utf8");
  const observation = composerObservationSchema.parse(JSON.parse(await readFile(observationPath, "utf8")));
  return { status: "COMPOSER_EXACT", ...verifyComposerTransfer({ source, observation }) };
}

async function encodePacket(packetPath: string, outputPath: string) {
  const payload = encodeBrowserFillPayload(await readFile(packetPath, "utf8"));
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return { status: "BROWSER_FILL_PAYLOAD_ENCODED", outputPath, source: payload.source,
    chunkCount: payload.chunks.length, encodedUtf8Bytes: Buffer.byteLength(JSON.stringify(payload), "utf8") };
}

async function captureClipboard(outputPath: string) {
  const bytes = await copyq(["clipboard"]);
  if (bytes.byteLength === 0) throw new Error("CAPTURED_CLIPBOARD_EMPTY");
  await writeFile(outputPath, bytes, { flag: "wx", mode: 0o600 });
  return { status: "CLIPBOARD_CAPTURED", outputPath, utf8Bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex") };
}

const command = process.argv[2];
let result: unknown;
if (command === "stage-clipboard") result = await stageClipboard(requiredArgument("--packet"));
else if (command === "clear-clipboard") result = await clearClipboard();
else if (command === "encode-packet") result = await encodePacket(requiredArgument("--packet"), requiredArgument("--output"));
else if (command === "verify-observation") result = await verifyObservation(requiredArgument("--packet"), requiredArgument("--observation"));
else if (command === "capture-clipboard") result = await captureClipboard(requiredArgument("--output"));
else throw new Error("TRANSPORT_COMMAND_INVALID");
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
