import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createOneTimeTextRelay,
  relayPageObservationSchema,
  verifyRelayPageTransfer,
} from "../evaluation/mast/src/authenticated-text-relay.js";
import {
  composerObservationSchema,
  transportTextIdentity,
  verifyComposerTransfer,
} from "../evaluation/mast/src/chatgpt-browser-transport.js";

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function requiredValue(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`TRANSPORT_ARGUMENT_REQUIRED:${name}`);
  return value;
}

function requiredPath(name: string): string {
  return resolve(requiredValue(name));
}

async function startRelay() {
  const packetPath = requiredPath("--packet");
  const relay = await createOneTimeTextRelay({
    packetPath,
    opaqueInputId: requiredValue("--opaque-input-id"),
    expectedPacketSha256: requiredValue("--expected-sha256"),
    ttlMs: Number(argument("--ttl-ms") ?? "300000"),
    maxServes: Number(argument("--max-serves") ?? "2"),
    onEvent: (event) => process.stderr.write(`${JSON.stringify(event)}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    status: "TEXT_RELAY_READY",
    opaqueInputId: relay.opaqueInputId,
    expectedPacketSha256: relay.expectedPacketSha256,
    sourceIdentity: relay.sourceIdentity,
    localUrl: relay.localUrl,
    port: relay.port,
    tokenSha256: relay.tokenSha256,
    startedAt: relay.startedAt,
    expiresAt: relay.expiresAt,
  })}\n`);
  process.stdin.setEncoding("utf8");
  let pending = "";
  await new Promise<void>((accept, reject) => {
    let stopping = false;
    let onData: (chunk: string) => void;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      try {
        process.stdin.off("data", onData);
        process.stdin.pause();
        await relay.close();
        process.stdout.write(`${JSON.stringify({ status: "TEXT_RELAY_STOPPED", ...relay.status() })}\n`);
        accept();
      } catch (error) { reject(error); }
    };
    process.once("SIGINT", () => void stop());
    process.once("SIGTERM", () => void stop());
    onData = (chunk: string) => {
      pending += chunk;
      while (pending.includes("\n")) {
        const index = pending.indexOf("\n");
        const command = pending.slice(0, index).trim();
        pending = pending.slice(index + 1);
        if (command === "status") process.stdout.write(`${JSON.stringify(relay.status())}\n`);
        else if (command === "invalidate") {
          relay.invalidate();
          process.stdout.write(`${JSON.stringify({ status: "TEXT_RELAY_INVALIDATED", ...relay.status() })}\n`);
        } else if (command === "stop") void stop();
        else if (command.length > 0) process.stdout.write(`${JSON.stringify({ status: "TEXT_RELAY_COMMAND_REJECTED" })}\n`);
      }
    };
    process.stdin.on("data", onData);
  });
}

async function verifyRelayObservation() {
  const packet = await readFile(requiredPath("--packet"), "utf8");
  const source = transportTextIdentity(packet);
  const observation = relayPageObservationSchema.parse(JSON.parse(
    await readFile(requiredPath("--observation"), "utf8"),
  ));
  return {
    status: "RELAY_PAGE_EXACT",
    ...verifyRelayPageTransfer({
      expectedPacketSha256: source.sha256,
      expectedUtf8Bytes: source.utf8Bytes,
      expectedCodePoints: source.codePoints,
      expectedPathname: requiredValue("--expected-pathname"),
      observation,
    }),
  };
}

async function verifyComposerObservation() {
  const source = await readFile(requiredPath("--packet"), "utf8");
  const observation = composerObservationSchema.parse(JSON.parse(
    await readFile(requiredPath("--observation"), "utf8"),
  ));
  return { status: "COMPOSER_EXACT", ...verifyComposerTransfer({ source, observation }) };
}

const command = process.argv[2];
if (command === "start-relay") await startRelay();
else {
  let result: unknown;
  if (command === "verify-relay-observation") result = await verifyRelayObservation();
  else if (command === "verify-composer-observation") result = await verifyComposerObservation();
  else throw new Error("TRANSPORT_COMMAND_INVALID");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
