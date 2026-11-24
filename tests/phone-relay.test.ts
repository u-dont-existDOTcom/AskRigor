// The phone relay (owner answer 385b): every rule of the release's relay-spec.md, with short timings passed as options.
import { spawn, type ChildProcess } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { connect, type Socket } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  addressKey,
  createRelay,
  parseLaptopKeys,
  RELAY_DEFAULTS,
  type Relay,
  type RelayOptions
} from "../apps/phone-relay/src/relay.ts";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const MiB = 1024 * 1024;

interface Identity {
  key: string;
  privateKey: KeyObject;
}

function identity(): Identity {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  // The raw public key is the last 32 bytes of the SPKI DER export.
  const raw = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  return { key: raw.toString("base64url"), privateKey };
}

/** Caddy's proxy secret in these tests, and a forwarded address as Caddy sends it (with the secret). */
const PROXY = "P".repeat(43);
const from = (address: string) => ({ "x-askrigor-client-ip": address, "x-askrigor-proxy-secret": PROXY });

const owner = identity();
const second = identity();
const stranger = identity();

const signed = (who: Identity, role: string, id: string, challenge: string) =>
  sign(null, Buffer.from(`askrigor-relay/1\n${role}\n${id}\n${challenge}`, "utf8"), who.privateKey).toString("base64url");
const newChan = () => randomBytes(32).toString("base64url");
const newRoom = () => randomBytes(16).toString("hex");
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

async function until(check: () => boolean, what: string, ms = 4000): Promise<void> {
  const deadline = performance.now() + ms;
  while (!check()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(5);
  }
}

const relays: Relay[] = [];
const clients: WebSocket[] = [];
const rawSockets: Socket[] = [];
const children: ChildProcess[] = [];
const closeReasons: Array<{ code: number; reason: string }> = [];
const relayTexts: string[] = [];

/** The only text messages the relay ever sends. */
const RELAY_TEXT = /^(?:\{"t":"hello","v":1,"challenge":"[A-Za-z0-9_-]{43}"\}|\{"t":"joined"\}|\{"t":"peer","here":(?:true|false)\})$/u;

afterEach(async () => {
  for (const ws of clients.splice(0)) ws.terminate();
  for (const socket of rawSockets.splice(0)) socket.destroy();
  for (const child of children.splice(0)) child.kill("SIGKILL");
  await Promise.all(relays.splice(0).map((relay) => relay.close()));
  // Every close reason the relay sent, in every test, was empty; every text it sent was hello, joined or peer.
  expect(closeReasons.splice(0).filter(({ reason }) => reason !== "")).toEqual([]);
  expect(relayTexts.splice(0).filter((text) => !RELAY_TEXT.test(text))).toEqual([]);
});

/** A relay on an ephemeral port. Admission limits are raised unless a test sets them, so tests can open many sockets. */
async function start(options: RelayOptions = {}): Promise<{ relay: Relay; port: number; url: string }> {
  const relay = createRelay({
    laptopKeys: [owner.key, second.key],
    proxySecret: PROXY,
    maxAttemptsPerAddress: 10_000,
    maxSocketsPerAddress: 10_000,
    maxPairJoinsPerAddress: 10_000,
    ...options
  });
  relays.push(relay);
  const port = await relay.listen(0, "127.0.0.1");
  return { relay, port, url: `ws://127.0.0.1:${port}/relay` };
}

class Refused extends Error {
  constructor(readonly status: number) {
    super(`refused with HTTP ${status}`);
  }
}

interface Client {
  ws: WebSocket;
  challenge: string;
  /** Text messages after hello, parsed. */
  texts: Array<Record<string, unknown>>;
  frames: Buffer[];
  closed: Promise<{ code: number; reason: string }>;
  closeCode?: number;
}

function open(url: string, options: { headers?: Record<string, string>; autoPong?: boolean } = {}): Promise<Client> {
  return new Promise<Client>((resolveOpen, rejectOpen) => {
    const ws = new WebSocket(url, { headers: options.headers, autoPong: options.autoPong ?? true, perMessageDeflate: false });
    clients.push(ws);
    const client = { ws, challenge: "", texts: [], frames: [] } as unknown as Client;
    client.closed = new Promise((done) => {
      ws.on("close", (code, reason) => {
        closeReasons.push({ code, reason: reason.toString() });
        client.closeCode = code;
        done({ code, reason: reason.toString() });
        rejectOpen(new Error(`closed with ${code} before hello`));
      });
    });
    ws.on("error", () => undefined);
    ws.on("unexpected-response", (_request, response) => {
      rejectOpen(new Refused(response.statusCode ?? 0));
      response.resume();
      ws.terminate();
    });
    ws.on("message", (data, isBinary) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      if (isBinary) {
        client.frames.push(Buffer.from(buffer));
        return;
      }
      const text = buffer.toString("utf8");
      relayTexts.push(text);
      const message = JSON.parse(text) as Record<string, unknown>;
      if (client.challenge === "" && message.t === "hello") {
        client.challenge = message.challenge as string;
        resolveOpen(client);
      } else {
        client.texts.push(message);
      }
    });
  });
}

const sendJoin = (client: Client, fields: Record<string, unknown>) =>
  client.ws.send(JSON.stringify({ t: "join", v: 1, ...fields }));

async function joinedOrClosed(client: Client): Promise<void> {
  await until(() => client.texts.some((message) => message.t === "joined") || client.closeCode !== undefined, "the join");
  if (client.closeCode !== undefined) throw new Error(`join refused with ${client.closeCode}`);
}

async function seatLaptop(url: string, chan: string, who: Identity = owner): Promise<Client> {
  const client = await open(url);
  sendJoin(client, { role: "laptop", chan, key: who.key, sig: signed(who, "laptop", chan, client.challenge) });
  await joinedOrClosed(client);
  return client;
}

async function seatPhone(url: string, chan: string): Promise<Client> {
  const client = await open(url);
  sendJoin(client, { role: "phone", chan });
  await joinedOrClosed(client);
  return client;
}

async function hostRoom(url: string, room: string, who: Identity = owner): Promise<Client> {
  const client = await open(url);
  sendJoin(client, { role: "pair-host", room, key: who.key, sig: signed(who, "pair-host", room, client.challenge) });
  await joinedOrClosed(client);
  return client;
}

async function joinRoom(url: string, room: string, headers?: Record<string, string>): Promise<Client> {
  const client = await open(url, { headers });
  sendJoin(client, { role: "pair-join", room });
  await joinedOrClosed(client);
  return client;
}

/** Opens a socket, sends `build(client)` as its first message, and returns the close code. */
async function closeCodeFor(url: string, build: (client: Client) => string | Buffer, binary = false): Promise<number> {
  const client = await open(url);
  client.ws.send(build(client), { binary });
  return (await client.closed).code;
}

const peerHere = (client: Client) => client.texts.filter((message) => message.t === "peer" && message.here === true).length;
const peerGone = (client: Client) => client.texts.filter((message) => message.t === "peer" && message.here === false).length;

function httpCall(port: number, path: string, method = "GET"): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((done, fail) => {
    const call = request({ host: "127.0.0.1", port, path, method, agent: false }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        body += chunk;
      });
      response.on("end", () => done({ status: response.statusCode ?? 0, headers: response.headers, body }));
    });
    call.on("error", fail);
    call.end();
  });
}

/** A raw TCP connection that records what it receives and when it was closed. */
function raw(port: number): { socket: Socket; text: () => string; closed: Promise<void>; isClosed: () => boolean } {
  const socket = connect(port, "127.0.0.1");
  rawSockets.push(socket);
  let data = "";
  let closed = false;
  socket.setEncoding("latin1");
  socket.on("data", (chunk: string) => {
    data += chunk;
  });
  socket.on("error", () => undefined);
  const closedPromise = new Promise<void>((done) => socket.on("close", () => {
    closed = true;
    done();
  }));
  return { socket, text: () => data, closed: closedPromise, isClosed: () => closed };
}

const upgradeRequest = (path: string, extra = "") =>
  `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n` +
  `Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString("base64")}\r\n${extra}\r\n`;

describe("phone relay: HTTP", () => {
  it("answers GET /relay/health with ok and every other plain request with an empty 404", async () => {
    const { port } = await start();
    const health = await httpCall(port, "/relay/health");
    expect(health.status).toBe(200);
    expect(health.body).toBe("ok");
    expect(health.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(health.headers["cache-control"]).toBe("no-store");
    for (const [path, method] of [["/relay", "GET"], ["/", "GET"], ["/relay/health/", "GET"], ["/relay/health?x=1", "GET"],
      ["/relay/health", "POST"], ["/relay/health", "HEAD"], ["/phone/", "GET"]] as const) {
      const other = await httpCall(port, path, method);
      expect(other.status, `${method} ${path}`).toBe(404);
      expect(other.body, `${method} ${path}`).toBe("");
    }
  });

  it("upgrades only on exactly /relay, and answers every other upgrade path with a bare 404", async () => {
    const { port, url } = await start();
    for (const path of ["/relay/", "/relay?x=1", "/relay/health", "/", "/Relay", "/relay/x"]) {
      await expect(open(`ws://127.0.0.1:${port}${path}`), path).rejects.toMatchObject({ status: 404 });
    }
    const wrong = raw(port);
    wrong.socket.write(upgradeRequest("/relay/"));
    await wrong.closed;
    expect(wrong.text()).toBe("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    // On /relay the socket opens with the hello and a fresh 32-byte challenge.
    const client = await open(url);
    expect(Buffer.from(client.challenge, "base64url")).toHaveLength(32);
    expect(relayTexts[relayTexts.length - 1]).toBe(JSON.stringify({ t: "hello", v: 1, challenge: client.challenge }));
    const other = await open(url);
    expect(other.challenge).not.toBe(client.challenge);
  });

  it("drops requests whose headers exceed 8192 bytes without answering", async () => {
    const { port } = await start({ maxHeaderSize: RELAY_DEFAULTS.maxHeaderSize });
    const small = raw(port);
    small.socket.write(`GET /relay/health HTTP/1.1\r\nHost: x\r\nX-Pad: ${"a".repeat(7000)}\r\nConnection: close\r\n\r\n`);
    await small.closed;
    expect(small.text()).toMatch(/^HTTP\/1\.1 200 OK\r\n/u);
    const big = raw(port);
    big.socket.write(`GET /relay/health HTTP/1.1\r\nHost: x\r\nX-Pad: ${"a".repeat(9000)}\r\n\r\n`);
    await big.closed;
    // The client error is not answered (no 431): the socket is destroyed quietly.
    expect(big.text()).toBe("");
  });

  it("closes a connection whose headers do not arrive in time, quietly", async () => {
    const { port } = await start({ headersTimeoutMs: 200, requestTimeoutMs: 5_000, connectionsCheckingIntervalMs: 50 });
    const slow = raw(port);
    slow.socket.write("GET /relay/health HTTP/1.1\r\nHost: x\r\n");
    await sleep(150);
    expect(slow.isClosed()).toBe(false);
    await Promise.race([slow.closed, sleep(1500)]);
    expect(slow.isClosed()).toBe(true);
    expect(slow.text()).toBe("");
  });

  it("closes a connection whose request does not complete in time", async () => {
    const { port } = await start({ headersTimeoutMs: 200, requestTimeoutMs: 400, connectionsCheckingIntervalMs: 50 });
    const slow = raw(port);
    slow.socket.write("POST /relay/health HTTP/1.1\r\nHost: x\r\nContent-Length: 100\r\n\r\nab");
    await Promise.race([slow.closed, sleep(1500)]);
    expect(slow.isClosed()).toBe(true);
  });

  it("closes an idle keep-alive connection after the keep-alive timeout", async () => {
    const { port } = await start({ keepAliveTimeoutMs: 200 });
    const idle = raw(port);
    idle.socket.write("GET /relay/health HTTP/1.1\r\nHost: x\r\n\r\n");
    await until(() => idle.text().endsWith("ok"), "the health answer");
    await Promise.race([idle.closed, sleep(2500)]);
    expect(idle.isClosed()).toBe(true);
  });
});

describe("phone relay: admission before the upgrade", () => {
  it("refuses a 13th open socket from one address with a bare 429, by default", async () => {
    const relay = createRelay({ laptopKeys: [owner.key], proxySecret: PROXY });
    relays.push(relay);
    const port = await relay.listen(0, "127.0.0.1");
    const url = `ws://127.0.0.1:${port}/relay`;
    const twelve = [];
    for (let index = 0; index < 12; index += 1) twelve.push(await open(url));
    await expect(open(url)).rejects.toMatchObject({ status: 429 });
    const refused = raw(port);
    refused.socket.write(upgradeRequest("/relay"));
    await refused.closed;
    expect(refused.text()).toBe("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
    // A closed socket frees its place.
    twelve[0].ws.close();
    await twelve[0].closed;
    await sleep(20);
    expect((await open(url, { headers: from("127.0.0.1") })).challenge).toHaveLength(43);
  });

  it("counts by the forwarded client address when Caddy sent it with the secret and it is a plain IP literal", async () => {
    const { url } = await start({ maxSocketsPerAddress: 2 });
    const first = from("203.0.113.7");
    await open(url, { headers: first });
    await open(url, { headers: first });
    await expect(open(url, { headers: first })).rejects.toMatchObject({ status: 429 });
    await open(url, { headers: from("2001:db8::7") });
    await open(url, { headers: from("::ffff:198.51.100.1") });
    // Not a plain literal: these count as the connection's own address, 127.0.0.1.
    await open(url, { headers: from("203.0.113.7, 203.0.113.8") });
    await open(url, { headers: from("not-an-address") });
    await expect(open(url)).rejects.toMatchObject({ status: 429 });
    await expect(open(url, { headers: from("127.0.0.1") })).rejects.toMatchObject({ status: 429 });
  });

  it("believes a forwarded address only with Caddy's proxy secret: another container can't name addresses", async () => {
    const { url } = await start({ maxSocketsPerAddress: 1 });
    await open(url, { headers: { "x-askrigor-client-ip": "203.0.113.50" } });
    // Without the secret, or with a wrong one, every header names nothing: all of these are 127.0.0.1, already full.
    await expect(open(url, { headers: { "x-askrigor-client-ip": "203.0.113.51" } })).rejects.toMatchObject({ status: 429 });
    await expect(open(url, { headers: { "x-askrigor-client-ip": "203.0.113.52", "x-askrigor-proxy-secret": "Q".repeat(43) } }))
      .rejects.toMatchObject({ status: 429 });
    await expect(open(url, { headers: { "x-askrigor-client-ip": "203.0.113.53", "x-askrigor-proxy-secret": PROXY.slice(1) } }))
      .rejects.toMatchObject({ status: 429 });
    await open(url, { headers: from("203.0.113.54") });
    // A relay given no secret believes no header at all.
    const bare = createRelay({ laptopKeys: [owner.key], maxSocketsPerAddress: 1 });
    relays.push(bare);
    const port = await bare.listen(0, "127.0.0.1");
    await open(`ws://127.0.0.1:${port}/relay`, { headers: from("203.0.113.60") });
    await expect(open(`ws://127.0.0.1:${port}/relay`, { headers: from("203.0.113.61") })).rejects.toMatchObject({ status: 429 });
  });

  it("counts an IPv4-mapped address as its IPv4 address and an IPv6 address by its /64", async () => {
    expect(addressKey("::ffff:198.51.100.1")).toBe("198.51.100.1");
    expect(addressKey("198.51.100.1")).toBe("198.51.100.1");
    expect(addressKey("2001:db8::7")).toBe("2001:0db8:0000:0000::/64");
    expect(addressKey("2001:DB8:0:0:ffff::1")).toBe("2001:0db8:0000:0000::/64");
    expect(addressKey("2001:db8:1::1")).toBe("2001:0db8:0001:0000::/64");
    expect(addressKey("64:ff9b::192.0.2.1")).toBe("0064:ff9b:0000:0000::/64");
    expect(addressKey("::1")).toBe("0000:0000:0000:0000::/64");
    // Every spelling of an IPv4-mapped address is that IPv4 address.
    expect(addressKey("::ffff:c000:201")).toBe("192.0.2.1");
    expect(addressKey("0:0:0:0:0:ffff:192.0.2.1")).toBe("192.0.2.1");
    expect(addressKey("::FFFF:C000:0201")).toBe("192.0.2.1");
    const { url } = await start({ maxSocketsPerAddress: 1 });
    await open(url, { headers: from("2001:db8::1") });
    await expect(open(url, { headers: from("2001:db8::2") })).rejects.toMatchObject({ status: 429 });
    await open(url, { headers: from("2001:db8:0:1::2") });
  });

  it("refuses a new address once 4096 are tracked (shortened to 2), and all upgrades past 600 a minute (shortened to 3)", async () => {
    const tracked = await start({ maxTrackedAddresses: 2 });
    await open(tracked.url, { headers: from("203.0.113.1") });
    await open(tracked.url, { headers: from("203.0.113.2") });
    await expect(open(tracked.url, { headers: from("203.0.113.3") })).rejects.toMatchObject({ status: 429 });
    await open(tracked.url, { headers: from("203.0.113.1") });
    const total = await start({ maxAttemptsTotal: 3 });
    await open(total.url, { headers: from("198.51.100.1") });
    await open(total.url, { headers: from("198.51.100.2") });
    await open(total.url, { headers: from("198.51.100.3") });
    await expect(open(total.url, { headers: from("198.51.100.4") })).rejects.toMatchObject({ status: 429 });
  });

  it("caps open HTTP connections in all (1000 by default)", async () => {
    const { relay } = await start();
    expect(relay.server.maxConnections).toBe(RELAY_DEFAULTS.maxConnections);
    const small = await start({ maxConnections: 7 });
    expect(small.relay.server.maxConnections).toBe(7);
  });

  it("refuses the 31st upgrade attempt from one address in 60 s, by default, even with no socket open", async () => {
    const relay = createRelay({ laptopKeys: [owner.key], proxySecret: PROXY });
    relays.push(relay);
    const port = await relay.listen(0, "127.0.0.1");
    const url = `ws://127.0.0.1:${port}/relay`;
    for (let index = 0; index < 30; index += 1) {
      const client = await open(url);
      client.ws.close();
      await client.closed;
    }
    await expect(open(url)).rejects.toMatchObject({ status: 429 });
    expect((await open(url, { headers: from("203.0.113.9") })).challenge).toHaveLength(43);
  });

  it("counts refused attempts in the sliding window", async () => {
    const { url } = await start({ maxAttemptsPerAddress: 3, attemptWindowMs: 600, maxSocketsPerAddress: 100 });
    const started = performance.now();
    await open(url);
    await open(url);
    await sleep(300);
    await open(url);
    await expect(open(url)).rejects.toMatchObject({ status: 429 });
    await sleep(Math.max(0, 720 - (performance.now() - started)));
    // The first two have left the window; the third and the refused fourth have not.
    await open(url);
    await expect(open(url)).rejects.toMatchObject({ status: 429 });
  });

  it("refuses an upgrade when 400 relay sockets are open in all (shortened to 2)", async () => {
    const { url } = await start({ maxSockets: 2 });
    const a = await open(url, { headers: from("203.0.113.1") });
    await open(url, { headers: from("203.0.113.2") });
    await expect(open(url, { headers: from("203.0.113.3") })).rejects.toMatchObject({ status: 429 });
    a.ws.close();
    await a.closed;
    await sleep(20);
    await open(url, { headers: from("203.0.113.3") });
  });

  it("counts pings and pongs against the socket's message budget, and answers a ping within it", async () => {
    const { url } = await start({ messageBurst: 5, messagesPerWindow: 5 });
    const polite = await open(url);
    const pong = new Promise<void>((done) => polite.ws.once("pong", () => done()));
    polite.ws.ping("x");
    await pong;
    const flood = await open(url);
    for (let index = 0; index < 10; index += 1) flood.ws.ping();
    expect((await flood.closed).code).toBe(4429);
  });
});

describe("phone relay: joins", () => {
  it("seats a laptop and a phone, says joined to each and peer to both", async () => {
    const { url } = await start();
    const chan = newChan();
    const laptop = await seatLaptop(url, chan);
    expect(laptop.texts).toEqual([{ t: "joined" }]);
    const phone = await seatPhone(url, chan);
    await until(() => peerHere(laptop) === 1, "peer here");
    expect(laptop.texts).toEqual([{ t: "joined" }, { t: "peer", here: true }]);
    expect(phone.texts).toEqual([{ t: "joined" }, { t: "peer", here: true }]);
  });

  it("refuses every malformed first message with 4400", async () => {
    const { url } = await start();
    const chan = newChan();
    await seatLaptop(url, chan);
    const room = newRoom();
    const laptop = (client: Client, fields: Record<string, unknown> = {}) => JSON.stringify({
      t: "join", v: 1, role: "laptop", chan, key: owner.key, sig: signed(owner, "laptop", chan, client.challenge), ...fields
    });
    const zeros = Buffer.alloc(32).toString("base64url");
    const cases: Array<[string, (client: Client) => string | Buffer, boolean?]> = [
      ["not JSON", () => "nope"],
      ["a JSON array", () => "[]"],
      ["JSON null", () => "null"],
      ["a JSON string", () => "\"join\""],
      ["a binary first message", (client) => Buffer.from(laptop(client)), true],
      ["wrong t", (client) => laptop(client, { t: "joins" })],
      ["v as a string", (client) => laptop(client, { v: "1" })],
      ["v = 2", (client) => laptop(client, { v: 2 })],
      ["an unknown role", () => JSON.stringify({ t: "join", v: 1, role: "watcher", chan })],
      ["role as a number", () => JSON.stringify({ t: "join", v: 1, role: 1, chan })],
      ["an extra key", (client) => laptop(client, { extra: "x" })],
      ["a __proto__ key", () => `{"t":"join","v":1,"role":"phone","chan":"${chan}","__proto__":"x"}`],
      ["a missing key", () => JSON.stringify({ t: "join", v: 1, role: "phone" })],
      ["a laptop without sig", () => JSON.stringify({ t: "join", v: 1, role: "laptop", chan, key: owner.key })],
      ["a phone with a key", () => JSON.stringify({ t: "join", v: 1, role: "phone", chan, key: owner.key })],
      ["pair-join with chan", () => JSON.stringify({ t: "join", v: 1, role: "pair-join", chan })],
      ["chan as a number", () => JSON.stringify({ t: "join", v: 1, role: "phone", chan: 1 })],
      ["key as a number", (client) => laptop(client, { key: 5 })],
      ["sig as null", (client) => laptop(client, { sig: null })],
      ["room as an object", () => JSON.stringify({ t: "join", v: 1, role: "pair-join", room: {} })],
      ["chan of 31 bytes", () => JSON.stringify({ t: "join", v: 1, role: "phone", chan: randomBytes(31).toString("base64url") })],
      ["chan of 33 bytes", () => JSON.stringify({ t: "join", v: 1, role: "phone", chan: randomBytes(33).toString("base64url") })],
      ["key of 31 bytes", (client) => laptop(client, { key: randomBytes(31).toString("base64url") })],
      ["sig of 63 bytes", (client) => laptop(client, { sig: randomBytes(63).toString("base64url") })],
      ["room of 31 hex characters", () => JSON.stringify({ t: "join", v: 1, role: "pair-join", room: room.slice(1) })],
      ["room of 33 hex characters", () => JSON.stringify({ t: "join", v: 1, role: "pair-join", room: `${room}a` })],
      ["room in capitals", () => JSON.stringify({ t: "join", v: 1, role: "pair-join", room: "A".repeat(32) })],
      ["room not hex", () => JSON.stringify({ t: "join", v: 1, role: "pair-join", room: "g".repeat(32) })],
      ["padded base64url", () => JSON.stringify({ t: "join", v: 1, role: "phone", chan: `${chan}=` })],
      ["standard base64 characters", () => JSON.stringify({ t: "join", v: 1, role: "phone", chan: `+/${chan.slice(2)}` })],
      ["a space inside", () => JSON.stringify({ t: "join", v: 1, role: "phone", chan: `${chan.slice(0, 20)} ${chan.slice(21)}` })],
      ["non-canonical last character", () => JSON.stringify({ t: "join", v: 1, role: "phone", chan: `${zeros.slice(0, 42)}B` })],
      ["over 1024 bytes", (client) => laptop(client).replace("{", `{${" ".repeat(1100)}`)]
    ];
    for (const [name, build, binary] of cases) {
      expect(await closeCodeFor(url, build, binary), name).toBe(4400);
    }
  });

  it("accepts a join of exactly 1024 bytes and refuses 1025", async () => {
    const relay = createRelay({ laptopKeys: [owner.key] });
    relays.push(relay);
    const url = `ws://127.0.0.1:${await relay.listen(0, "127.0.0.1")}/relay`;
    const chan = newChan();
    await seatLaptop(url, chan);
    const padded = (size: number) => {
      const text = JSON.stringify({ t: "join", v: 1, role: "phone", chan });
      return text.replace("{", `{${" ".repeat(size - Buffer.byteLength(text))}`);
    };
    expect(Buffer.byteLength(padded(1024))).toBe(1024);
    const fits = await open(url);
    fits.ws.send(padded(1024));
    await joinedOrClosed(fits);
    expect(await closeCodeFor(url, () => padded(1025))).toBe(4400);
  });

  it("refuses a bad signature or a key not in the allowlist with 4401", async () => {
    const { url } = await start();
    const chan = newChan();
    const room = newRoom();
    const other = await open(url);
    const cases: Array<[string, (client: Client) => string]> = [
      ["signed by another key", (client) => JSON.stringify({ t: "join", v: 1, role: "laptop", chan, key: owner.key,
        sig: signed(stranger, "laptop", chan, client.challenge) })],
      ["signed over another socket's challenge", () => JSON.stringify({ t: "join", v: 1, role: "laptop", chan,
        key: owner.key, sig: signed(owner, "laptop", chan, other.challenge) })],
      ["signed for another role", (client) => JSON.stringify({ t: "join", v: 1, role: "laptop", chan, key: owner.key,
        sig: signed(owner, "pair-host", chan, client.challenge) })],
      ["signed for another channel", (client) => JSON.stringify({ t: "join", v: 1, role: "laptop", chan, key: owner.key,
        sig: signed(owner, "laptop", newChan(), client.challenge) })],
      ["a random signature", () => JSON.stringify({ t: "join", v: 1, role: "laptop", chan, key: owner.key,
        sig: randomBytes(64).toString("base64url") })],
      ["a key not allowed", (client) => JSON.stringify({ t: "join", v: 1, role: "laptop", chan, key: stranger.key,
        sig: signed(stranger, "laptop", chan, client.challenge) })],
      ["a pair-host with a bad signature", (client) => JSON.stringify({ t: "join", v: 1, role: "pair-host", room,
        key: owner.key, sig: signed(owner, "pair-host", newRoom(), client.challenge) })],
      ["a pair-host key not allowed", (client) => JSON.stringify({ t: "join", v: 1, role: "pair-host", room,
        key: stranger.key, sig: signed(stranger, "pair-host", room, client.challenge) })]
    ];
    for (const [name, build] of cases) expect(await closeCodeFor(url, build), name).toBe(4401);
    // The same signatures made properly are accepted.
    await seatLaptop(url, chan);
    await hostRoom(url, room);
  });

  it("refuses every laptop and pair-host join when no laptop key is configured", async () => {
    const relay = createRelay({ maxSocketsPerAddress: 100, maxAttemptsPerAddress: 100 });
    relays.push(relay);
    const url = `ws://127.0.0.1:${await relay.listen(0, "127.0.0.1")}/relay`;
    const chan = newChan();
    const room = newRoom();
    expect(await closeCodeFor(url, (client) => JSON.stringify({ t: "join", v: 1, role: "laptop", chan, key: owner.key,
      sig: signed(owner, "laptop", chan, client.challenge) }))).toBe(4401);
    expect(await closeCodeFor(url, (client) => JSON.stringify({ t: "join", v: 1, role: "pair-host", room,
      key: owner.key, sig: signed(owner, "pair-host", room, client.challenge) }))).toBe(4401);
  });

  it("closes a socket that does not join in time with 4408", async () => {
    const { url } = await start({ joinTimeoutMs: 200 });
    const started = performance.now();
    const idle = await open(url);
    expect((await idle.closed).code).toBe(4408);
    expect(performance.now() - started).toBeGreaterThanOrEqual(150);
    // A socket that joins in time keeps its seat past the timer.
    const laptop = await seatLaptop(url, newChan());
    await sleep(350);
    expect(laptop.closeCode).toBeUndefined();
  });

  it("refuses a phone whose channel has no laptop with 4404", async () => {
    const { url } = await start();
    expect(await closeCodeFor(url, () => JSON.stringify({ t: "join", v: 1, role: "phone", chan: newChan() }))).toBe(4404);
  });
});

describe("phone relay: frames", () => {
  it("copies random binary frames byte for byte both ways, one message for one message", async () => {
    const { url } = await start();
    const chan = newChan();
    const laptop = await seatLaptop(url, chan);
    const phone = await seatPhone(url, chan);
    const sizes = [1, 7, 100, 1000, 4096, 30_000, 65_535, 65_536, 0, 3];
    const toPhone = sizes.map((size) => randomBytes(size));
    const toLaptop = sizes.map((size) => randomBytes(size));
    for (const frame of toPhone) laptop.ws.send(frame);
    for (const frame of toLaptop) phone.ws.send(frame);
    await until(() => phone.frames.length === sizes.length && laptop.frames.length === sizes.length, "the frames");
    expect(phone.frames).toEqual(toPhone);
    expect(laptop.frames).toEqual(toLaptop);
  });

  it("drops frames while the other seat is empty", async () => {
    const { url } = await start();
    const chan = newChan();
    const laptop = await seatLaptop(url, chan);
    laptop.ws.send(Buffer.from("before the phone"));
    await sleep(50);
    const phone = await seatPhone(url, chan);
    laptop.ws.send(Buffer.from("after"));
    await until(() => phone.frames.length === 1, "the frame");
    await sleep(30);
    expect(phone.frames.map((frame) => frame.toString())).toEqual(["after"]);
    expect(laptop.closeCode).toBeUndefined();
  });

  it("closes a socket that sends text after its join with 4400", async () => {
    const { url } = await start();
    const chan = newChan();
    const laptop = await seatLaptop(url, chan);
    const phone = await seatPhone(url, chan);
    phone.ws.send("hello");
    expect((await phone.closed).code).toBe(4400);
    laptop.ws.send("hello");
    expect((await laptop.closed).code).toBe(4400);
  });

  it("lets ws close a 65537-byte frame with 1009 and copies a 65536-byte one", async () => {
    const relay = createRelay({ laptopKeys: [owner.key] });
    relays.push(relay);
    const url = `ws://127.0.0.1:${await relay.listen(0, "127.0.0.1")}/relay`;
    const chan = newChan();
    const laptop = await seatLaptop(url, chan);
    const phone = await seatPhone(url, chan);
    laptop.ws.send(randomBytes(65_536));
    await until(() => phone.frames.length === 1, "the full-size frame");
    laptop.ws.send(randomBytes(65_537));
    expect((await laptop.closed).code).toBe(1009);
    expect((await phone.closed).code).toBe(4404);
    expect(phone.frames).toHaveLength(1);
  });
});

describe("phone relay: channels", () => {
  it("replaces a laptop seat with 4409 and keeps the phone, which is told the peer is here again", async () => {
    const { url } = await start();
    const chan = newChan();
    const first = await seatLaptop(url, chan);
    const phone = await seatPhone(url, chan);
    await until(() => peerHere(first) === 1, "peer here");
    const replacement = await seatLaptop(url, chan, second);
    expect((await first.closed).code).toBe(4409);
    await until(() => peerHere(phone) === 2 && peerHere(replacement) === 1, "peer here again");
    await sleep(50);
    expect(phone.closeCode).toBeUndefined();
    expect(peerGone(phone)).toBe(0);
    phone.ws.send(Buffer.from("to the new laptop"));
    replacement.ws.send(Buffer.from("to the phone"));
    await until(() => replacement.frames.length === 1 && phone.frames.length === 1, "frames");
    expect(first.frames).toEqual([]);
  });

  it("sends peer here to both on every phone join, and never peer gone for a replaced phone (4409)", async () => {
    const { url } = await start();
    const chan = newChan();
    const laptop = await seatLaptop(url, chan);
    const phoneA = await seatPhone(url, chan);
    await until(() => peerHere(laptop) === 1, "peer here for phone A");
    expect(phoneA.texts).toEqual([{ t: "joined" }, { t: "peer", here: true }]);
    const phoneB = await seatPhone(url, chan);
    expect((await phoneA.closed).code).toBe(4409);
    await until(() => peerHere(laptop) === 2, "peer here for phone B");
    expect(phoneB.texts).toEqual([{ t: "joined" }, { t: "peer", here: true }]);
    // Phone A's close event has fired by now; it was no longer seated, so the laptop heard nothing of it.
    await sleep(100);
    expect(laptop.texts).toEqual([{ t: "joined" }, { t: "peer", here: true }, { t: "peer", here: true }]);
    laptop.ws.send(Buffer.from("to B"));
    await until(() => phoneB.frames.length === 1, "the frame to B");
    expect(phoneA.frames).toEqual([]);
  });

  it("closes the phone with 4404 and deletes the channel when the laptop leaves", async () => {
    const { url } = await start();
    const chan = newChan();
    const laptop = await seatLaptop(url, chan);
    const phone = await seatPhone(url, chan);
    laptop.ws.close(1000);
    expect((await phone.closed).code).toBe(4404);
    expect(await closeCodeFor(url, () => JSON.stringify({ t: "join", v: 1, role: "phone", chan }))).toBe(4404);
  });

  it("tells the laptop the phone left, and keeps its seat", async () => {
    const { url } = await start();
    const chan = newChan();
    const laptop = await seatLaptop(url, chan);
    const phone = await seatPhone(url, chan);
    phone.ws.close(1000);
    await until(() => peerGone(laptop) === 1, "peer gone");
    expect(laptop.texts[laptop.texts.length - 1]).toEqual({ t: "peer", here: false });
    const again = await seatPhone(url, chan);
    await until(() => peerHere(laptop) === 2, "peer here again");
    again.ws.send(Buffer.from("back"));
    await until(() => laptop.frames.length === 1, "the frame");
    expect(laptop.closeCode).toBeUndefined();
  });

  it("lets one key hold at most 8 channels, and the relay 200 (shortened to 2 and 3)", async () => {
    const { url } = await start({ maxChannelsPerKey: 2, maxChannels: 3 });
    const [a, b] = [newChan(), newChan()];
    await seatLaptop(url, a);
    await seatLaptop(url, b);
    const third = newChan();
    expect(await closeCodeFor(url, (client) => JSON.stringify({ t: "join", v: 1, role: "laptop", chan: third,
      key: owner.key, sig: signed(owner, "laptop", third, client.challenge) }))).toBe(4503);
    // Replacing a channel the key already holds is not a new channel.
    await seatLaptop(url, a);
    await seatLaptop(url, third, second);
    const fourth = newChan();
    expect(await closeCodeFor(url, (client) => JSON.stringify({ t: "join", v: 1, role: "laptop", chan: fourth,
      key: second.key, sig: signed(second, "laptop", fourth, client.challenge) }))).toBe(4503);
  });

  it("frees a key's channel when its laptop leaves", async () => {
    const { url } = await start({ maxChannelsPerKey: 1 });
    const laptop = await seatLaptop(url, newChan());
    laptop.ws.close();
    await laptop.closed;
    await sleep(20);
    await seatLaptop(url, newChan());
  });
});

describe("phone relay: pairing rooms", () => {
  it("seats one joiner, copies frames both ways, and refuses a second joiner and a missing room with 4404", async () => {
    const { url } = await start();
    const room = newRoom();
    const host = await hostRoom(url, room);
    expect(host.texts).toEqual([{ t: "joined" }]);
    const joiner = await joinRoom(url, room);
    await until(() => peerHere(host) === 1 && peerHere(joiner) === 1, "peer here");
    const toJoiner = randomBytes(5000);
    const toHost = randomBytes(700);
    host.ws.send(toJoiner);
    joiner.ws.send(toHost);
    await until(() => joiner.frames.length === 1 && host.frames.length === 1, "frames");
    expect(joiner.frames[0]).toEqual(toJoiner);
    expect(host.frames[0]).toEqual(toHost);
    expect(await closeCodeFor(url, () => JSON.stringify({ t: "join", v: 1, role: "pair-join", room }))).toBe(4404);
    expect(await closeCodeFor(url, () => JSON.stringify({ t: "join", v: 1, role: "pair-join", room: newRoom() }))).toBe(4404);
    expect(host.closeCode).toBeUndefined();
  });

  it("closes both sides with 4408 when the room's 5 minutes run out (shortened)", async () => {
    const { url } = await start({ roomLifetimeMs: 300 });
    const room = newRoom();
    const started = performance.now();
    const host = await hostRoom(url, room);
    const joiner = await joinRoom(url, room);
    expect((await host.closed).code).toBe(4408);
    expect((await joiner.closed).code).toBe(4408);
    expect(performance.now() - started).toBeGreaterThanOrEqual(250);
    expect(await closeCodeFor(url, () => JSON.stringify({ t: "join", v: 1, role: "pair-join", room }))).toBe(4404);
  });

  it("closes the host with 4410 when the joiner leaves, and the room serves no second attempt", async () => {
    const { url } = await start();
    const room = newRoom();
    const host = await hostRoom(url, room);
    const joiner = await joinRoom(url, room);
    joiner.ws.close(1000);
    expect((await host.closed).code).toBe(4410);
    expect(await closeCodeFor(url, () => JSON.stringify({ t: "join", v: 1, role: "pair-join", room }))).toBe(4404);
  });

  it("closes the joiner with 4410 when the host leaves, and a hostless room is gone", async () => {
    const { url } = await start();
    const room = newRoom();
    const host = await hostRoom(url, room);
    const joiner = await joinRoom(url, room);
    host.ws.close(1000);
    expect((await joiner.closed).code).toBe(4410);
    const lone = newRoom();
    const loneHost = await hostRoom(url, lone);
    loneHost.ws.close(1000);
    await loneHost.closed;
    await sleep(20);
    expect(await closeCodeFor(url, () => JSON.stringify({ t: "join", v: 1, role: "pair-join", room: lone }))).toBe(4404);
  });

  it("replaces a room with the same id, closing its old sockets with 4409", async () => {
    const { url } = await start();
    const room = newRoom();
    const host = await hostRoom(url, room);
    const joiner = await joinRoom(url, room);
    const newHost = await hostRoom(url, room);
    expect((await host.closed).code).toBe(4409);
    expect((await joiner.closed).code).toBe(4409);
    await sleep(50);
    expect(newHost.closeCode).toBeUndefined();
    const newJoiner = await joinRoom(url, room);
    await until(() => peerHere(newHost) === 1 && peerHere(newJoiner) === 1, "peer here in the new room");
  });

  it("lets one key hold at most 2 rooms, and the relay 50 (shortened to 3)", async () => {
    const { url } = await start({ maxRooms: 3 });
    await hostRoom(url, newRoom());
    await hostRoom(url, newRoom());
    const third = newRoom();
    expect(await closeCodeFor(url, (client) => JSON.stringify({ t: "join", v: 1, role: "pair-host", room: third,
      key: owner.key, sig: signed(owner, "pair-host", third, client.challenge) }))).toBe(4503);
    await hostRoom(url, third, second);
    const fourth = newRoom();
    expect(await closeCodeFor(url, (client) => JSON.stringify({ t: "join", v: 1, role: "pair-host", room: fourth,
      key: second.key, sig: signed(second, "pair-host", fourth, client.challenge) }))).toBe(4503);
  });

  it("allows 10 pair-join messages per address per 60 s, found or not, then 4429", async () => {
    const relay = createRelay({ laptopKeys: [owner.key], proxySecret: PROXY });
    relays.push(relay);
    const url = `ws://127.0.0.1:${await relay.listen(0, "127.0.0.1")}/relay`;
    const address = from("198.51.100.20");
    for (let index = 0; index < 10; index += 1) {
      const client = await open(url, { headers: address });
      sendJoin(client, { role: "pair-join", room: newRoom() });
      expect((await client.closed).code).toBe(4404);
    }
    const room = newRoom();
    await hostRoom(url, room);
    const over = await open(url, { headers: address });
    sendJoin(over, { role: "pair-join", room });
    expect((await over.closed).code).toBe(4429);
    // Another address still gets in.
    await joinRoom(url, room, from("198.51.100.21"));
  });
});

describe("phone relay: rates", () => {
  const unlimited = {
    messageBurst: 1e9, messagesPerWindow: 1e9, byteBurst: 1e12, bytesPerWindow: 1e12, globalBytesPerWindow: 1e12
  } satisfies RelayOptions;

  it("closes a socket over its message budget with 4429 (300 per 60 s, burst 120), and refills it", async () => {
    const relay = createRelay({ laptopKeys: [owner.key] });
    relays.push(relay);
    const url = `ws://127.0.0.1:${await relay.listen(0, "127.0.0.1")}/relay`;
    const chan = newChan();
    const laptop = await seatLaptop(url, chan);
    const phone = await seatPhone(url, chan);
    for (let index = 0; index <= 120; index += 1) laptop.ws.send(Buffer.from([index % 256]));
    expect((await laptop.closed).code).toBe(4429);
    expect((await phone.closed).code).toBe(4404);
    expect(phone.frames).toHaveLength(120);

    const { url: quick } = await start({ ...unlimited, messageBurst: 2, messagesPerWindow: 2, rateWindowMs: 200 });
    const refilled = await seatLaptop(quick, newChan());
    refilled.ws.send(Buffer.from([1]));
    refilled.ws.send(Buffer.from([2]));
    await sleep(250);
    refilled.ws.send(Buffer.from([3]));
    refilled.ws.send(Buffer.from([4]));
    await sleep(50);
    expect(refilled.closeCode).toBeUndefined();
    refilled.ws.send(Buffer.from([5]));
    expect((await refilled.closed).code).toBe(4429);
  });

  it("closes a socket over its byte budget with 4429 (16 MiB per 60 s, burst 4 MiB; shortened)", async () => {
    const { url: shortened } = await start({ ...unlimited, byteBurst: 100_000, bytesPerWindow: 100_000 });
    const chan2 = newChan();
    const sender = await seatLaptop(shortened, chan2);
    const reader = await seatPhone(shortened, chan2);
    sender.ws.send(Buffer.alloc(60_000));
    await until(() => reader.frames.length === 1, "the first frame");
    sender.ws.send(Buffer.alloc(60_000));
    expect((await sender.closed).code).toBe(4429);
    expect(reader.frames).toHaveLength(1);
  });

  it("closes the socket whose frame would pass the relay's 128 MiB per 60 s (shortened)", async () => {
    const { url } = await start({ ...unlimited, globalBytesPerWindow: 150_000 });
    const [a, b] = [newChan(), newChan()];
    const laptopA = await seatLaptop(url, a);
    const phoneA = await seatPhone(url, a);
    const laptopB = await seatLaptop(url, b);
    await seatPhone(url, b);
    laptopA.ws.send(Buffer.alloc(50_000));
    laptopA.ws.send(Buffer.alloc(50_000));
    await until(() => phoneA.frames.length === 2, "A's frames");
    laptopB.ws.send(Buffer.alloc(60_000));
    expect((await laptopB.closed).code).toBe(4429);
    expect(laptopA.closeCode).toBeUndefined();
  });
});

describe("phone relay: backpressure", () => {
  const roomy = {
    messageBurst: 1e9, messagesPerWindow: 1e9, byteBurst: 1e12, bytesPerWindow: 1e12, globalBytesPerWindow: 1e12,
    pauseAboveBytes: 256 * 1024, resumeBelowBytes: 64 * 1024, backpressureCheckMs: 10
  } satisfies RelayOptions;
  const frames = (count: number) => Array.from({ length: count }, (_, index) => {
    const frame = randomBytes(65_536);
    frame.writeUInt32BE(index, 0);
    return frame;
  });

  it("stops reading a sender while its reader does not read, then resumes it without losing a byte", async () => {
    const { url } = await start({ ...roomy, stallTimeoutMs: 60_000 });
    const chan = newChan();
    const laptop = await seatLaptop(url, chan);
    const phone = await seatPhone(url, chan);
    phone.ws.pause();
    const sent = frames(384);
    for (const frame of sent) laptop.ws.send(frame);
    // The ping sits behind 24 MiB. Unpaused, the relay would read all of it and answer at once; paused, it cannot.
    let ponged = false;
    laptop.ws.on("pong", () => {
      ponged = true;
    });
    laptop.ws.ping();
    await sleep(700);
    expect(ponged).toBe(false);
    expect(phone.frames.length).toBe(0);
    phone.ws.resume();
    await until(() => phone.frames.length === sent.length, "all 24 MiB", 15_000);
    await until(() => ponged, "the pong");
    expect(Buffer.compare(Buffer.concat(phone.frames), Buffer.concat(sent))).toBe(0);
    expect(laptop.closeCode).toBeUndefined();
  }, 30_000);

  it("closes both with 4408 when the sender stays paused for 30 s (shortened)", async () => {
    const { url } = await start({ ...roomy, stallTimeoutMs: 300 });
    const chan = newChan();
    const laptop = await seatLaptop(url, chan);
    const phone = await seatPhone(url, chan);
    phone.ws.pause();
    const started = performance.now();
    for (const frame of frames(384)) laptop.ws.send(frame);
    expect((await laptop.closed).code).toBe(4408);
    expect(performance.now() - started).toBeGreaterThanOrEqual(300);
    phone.ws.resume();
    expect((await phone.closed).code).toBe(4408);
  }, 30_000);
});

describe("phone relay: liveness and shutdown", () => {
  it("terminates a joined socket that does not answer the previous ping, and leaves the others", async () => {
    const { url } = await start({ pingIntervalMs: 100, joinTimeoutMs: 5_000 });
    const chan = newChan();
    const silent = await open(url, { autoPong: false });
    sendJoin(silent, { role: "laptop", chan, key: owner.key, sig: signed(owner, "laptop", chan, silent.challenge) });
    await joinedOrClosed(silent);
    const phone = await seatPhone(url, chan);
    const answering = await seatLaptop(url, newChan());
    // Not yet joined: governed by the join timer, never pinged.
    const unseated = await open(url, { autoPong: false });
    expect((await silent.closed).code).toBe(1006);
    expect((await phone.closed).code).toBe(4404);
    await sleep(400);
    expect(answering.closeCode).toBeUndefined();
    expect(unseated.closeCode).toBeUndefined();
  });

  it("closes every socket with 1001 and stops listening on close()", async () => {
    const { relay, port, url } = await start();
    const chan = newChan();
    const laptop = await seatLaptop(url, chan);
    const phone = await seatPhone(url, chan);
    const unseated = await open(url);
    const room = await hostRoom(url, newRoom());
    await relay.close();
    for (const client of [laptop, phone, unseated, room]) expect((await client.closed).code).toBe(1001);
    await expect(httpCall(port, "/relay/health")).rejects.toThrow();
  });

  it("starts from src/index.ts through tsx, prints only its startup line, and exits 0 on SIGTERM", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", "apps/phone-relay/src/index.ts"], {
      cwd: root,
      env: {
        PATH: process.env.PATH ?? "",
        PHONE_RELAY_PORT: "0",
        PHONE_RELAY_HOST: "127.0.0.1",
        PHONE_RELAY_LAPTOP_KEYS: `${owner.key},${second.key}`
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    children.push(child);
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    const exited = new Promise<number | null>((done) => child.on("exit", (code) => done(code)));
    await until(() => stdout.includes("\n"), "the startup line", 8000);
    const port = Number(/^phone-relay v1 listening on (\d+) with 2 laptop key\(s\)\n$/u.exec(stdout)?.[1]);
    expect(port).toBeGreaterThan(0);
    const url = `ws://127.0.0.1:${port}/relay`;
    // Good connections.
    expect((await httpCall(port, "/relay/health")).body).toBe("ok");
    const chan = newChan();
    const laptop = await seatLaptop(url, chan);
    const phone = await seatPhone(url, chan);
    laptop.ws.send(Buffer.from([1, 2, 3]));
    await until(() => phone.frames.length === 1, "the frame");
    // Bad ones.
    await expect(open(`ws://127.0.0.1:${port}/nope`)).rejects.toMatchObject({ status: 404 });
    expect((await httpCall(port, "/nope")).status).toBe(404);
    expect(await closeCodeFor(url, () => "{not json")).toBe(4400);
    expect(await closeCodeFor(url, (client) => JSON.stringify({ t: "join", v: 1, role: "laptop", chan: newChan(),
      key: owner.key, sig: signed(stranger, "laptop", chan, client.challenge) }))).toBe(4401);
    expect(await closeCodeFor(url, () => JSON.stringify({ t: "join", v: 1, role: "phone", chan: newChan() }))).toBe(4404);
    laptop.ws.send(randomBytes(65_537));
    expect((await laptop.closed).code).toBe(1009);
    expect((await phone.closed).code).toBe(4404);
    const lastLaptop = await seatLaptop(url, newChan(), second);
    const garbage = raw(port);
    garbage.socket.write("NOT HTTP AT ALL\r\n\r\n");
    await garbage.closed;
    child.kill("SIGTERM");
    expect((await lastLaptop.closed).code).toBe(1001);
    expect(await exited).toBe(0);
    expect(stdout).toBe(`phone-relay v1 listening on ${port} with 2 laptop key(s)\n`);
    expect(stderr).toBe("");
  }, 20_000);

  it("exits 1 without printing anything when a laptop key is malformed", async () => {
    for (const keys of ["not-a-key", `${owner.key},`, `${owner.key}=`, ` ${owner.key}`]) {
      const child = spawn(process.execPath, ["--import", "tsx", "apps/phone-relay/src/index.ts"], {
        cwd: root,
        env: { PATH: process.env.PATH ?? "", PHONE_RELAY_PORT: "0", PHONE_RELAY_LAPTOP_KEYS: keys },
        stdio: ["ignore", "pipe", "pipe"]
      });
      children.push(child);
      let output = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      const code = await new Promise<number | null>((done) => child.on("exit", (exitCode) => done(exitCode)));
      expect(code, keys).toBe(1);
      expect(output, keys).toBe("");
    }
  }, 30_000);
});

describe("phone relay: the rules as written", () => {
  it("uses the specification's numbers by default", () => {
    expect(RELAY_DEFAULTS).toMatchObject({
      joinTimeoutMs: 10_000, maxJoinBytes: 1024, roomLifetimeMs: 300_000, maxPayload: 65_536,
      maxSocketsPerAddress: 12, maxAttemptsPerAddress: 30, attemptWindowMs: 60_000, maxSockets: 400,
      maxChannelsPerKey: 8, maxChannels: 200, maxRoomsPerKey: 2, maxRooms: 50,
      maxPairJoinsPerAddress: 10, pairJoinWindowMs: 60_000,
      rateWindowMs: 60_000, messagesPerWindow: 300, messageBurst: 120, bytesPerWindow: 16 * MiB, byteBurst: 8 * MiB,
      maxTrackedAddresses: 4096, maxAttemptsTotal: 600, maxConnections: 1000,
      globalBytesPerWindow: 128 * MiB, pauseAboveBytes: MiB, resumeBelowBytes: 256 * 1024, backpressureCheckMs: 100,
      stallTimeoutMs: 30_000, pingIntervalMs: 30_000, headersTimeoutMs: 10_000, requestTimeoutMs: 10_000,
      maxHeaderSize: 8192, keepAliveTimeoutMs: 5_000
    });
  });

  it("reads laptop keys strictly: none when unset or empty, and a malformed entry throws", () => {
    expect(parseLaptopKeys(undefined)).toEqual([]);
    expect(parseLaptopKeys("")).toEqual([]);
    expect(parseLaptopKeys(`${owner.key},${second.key},${owner.key}`)).toEqual([owner.key, second.key]);
    for (const bad of ["x", `${owner.key},`, `${owner.key}=`, owner.key.slice(1), `${owner.key} `,
      Buffer.alloc(33).toString("base64url")]) {
      expect(() => parseLaptopKeys(bad), bad).toThrow();
      expect(() => createRelay({ laptopKeys: [bad] }), bad).toThrow();
    }
  });

  it("sends an empty reason with every close code it uses", async () => {
    const { relay, url } = await start({ joinTimeoutMs: 300, roomLifetimeMs: 300, messageBurst: 1, messagesPerWindow: 1,
      maxChannels: 1 });
    const seen = new Map<number, string>();
    const record = async (client: Client) => {
      const { code, reason } = await client.closed;
      seen.set(code, reason);
    };
    const notJson = await open(url);
    notJson.ws.send("x");
    await record(notJson);
    const signedJoin = (client: Client, chan: string) => JSON.stringify({ t: "join", v: 1, role: "laptop", chan,
      key: owner.key, sig: signed(stranger, "laptop", chan, client.challenge) });
    const badKey = await open(url);
    badKey.ws.send(signedJoin(badKey, newChan()));
    await record(badKey);
    const chan = newChan();
    const laptop = await seatLaptop(url, chan);
    const phone = await seatPhone(url, chan);
    await seatPhone(url, chan);
    await record(phone);
    const full = await open(url);
    const otherChan = newChan();
    sendJoin(full, { role: "laptop", chan: otherChan, key: owner.key, sig: signed(owner, "laptop", otherChan, full.challenge) });
    await record(full);
    const room = newRoom();
    const host = await hostRoom(url, room);
    const joiner = await joinRoom(url, room);
    joiner.ws.close();
    await record(host);
    await record(await open(url));
    const expiring = await hostRoom(url, newRoom());
    await record(expiring);
    laptop.ws.send(Buffer.from([1]));
    laptop.ws.send(Buffer.from([2]));
    await record(laptop);
    const lastChan = newChan();
    const big = await seatLaptop(url, lastChan);
    const lastPhone = await seatPhone(url, lastChan);
    big.ws.send(randomBytes(65_537));
    await record(big);
    await record(lastPhone);
    const remaining = await seatLaptop(url, newChan());
    await relay.close();
    await record(remaining);
    expect([...seen.keys()].sort((left, right) => left - right)).toEqual([1001, 1009, 4400, 4401, 4404, 4408, 4409, 4410, 4429, 4503]);
    expect([...seen.values()].every((reason) => reason === "")).toBe(true);
  });

  it("writes nothing but the startup line: no console, no stderr, one stdout write", async () => {
    const relaySource = await readFile(resolve(root, "apps/phone-relay/src/relay.ts"), "utf8");
    const indexSource = await readFile(resolve(root, "apps/phone-relay/src/index.ts"), "utf8");
    for (const source of [relaySource, indexSource]) {
      expect(source).not.toMatch(/\bconsole\b|process\.stderr/u);
    }
    expect(relaySource).not.toContain("process.stdout");
    expect(indexSource.match(/process\.stdout\.write\(/gu)).toHaveLength(1);
    expect(indexSource).toContain("process.stdout.write(`phone-relay v1 listening on ${bound} with ${keys.length} laptop key(s)\\n`)");
  });

  it("deploys as its own Compose project with the hardening the specification lists", async () => {
    const compose = await readFile(resolve(root, "infra/phone-relay/compose.yaml"), "utf8");
    for (const line of [
      "name: askrigor-phone-relay",
      "  phone-relay:",
      "    image: ${ASKRIGOR_PHONE_RELAY_IMAGE:?",
      "    entrypoint: [node, apps/phone-relay/dist/index.js]",
      "    env_file: [/opt/askrigor/phone-relay.env]",
      "    read_only: true",
      "    cap_drop: [ALL]",
      "    security_opt: [no-new-privileges:true]",
      "    mem_limit: 128m",
      "    cpus: 0.25",
      "    pids_limit: 64",
      "    restart: unless-stopped",
      "    ports: []",
      "      driver: json-file",
      "        max-size: 1m",
      "        aliases: [phone-relay]",
      "  askrigor_default:",
      "    external: true"
    ]) {
      expect(compose, line).toContain(`${line}`);
    }
    const settings = compose.replace(/^\s*#.*$/gmu, "");
    expect(settings).not.toMatch(/volumes:|secrets:|living_evidence_private|privileged|network_mode|environment:/u);
    expect(settings.match(/^ {2}[a-z_-]+:$/gmu)).toEqual(["  phone-relay:", "  askrigor_default:"]);
    expect(settings.match(/^ {4}[a-z_]+:/gmu)).toHaveLength(14);
  });
});
