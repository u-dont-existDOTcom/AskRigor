// The phone relay (owner answer 385b, 20 Nov 2026): it seats the owner's laptop and his phone page and copies the
// binary frames between them, which both ends encrypt end to end. It never parses, stores or logs a frame, and it
// writes nothing to stdout or stderr: the one startup line belongs to index.ts. The exact rules are in the release's
// relay-spec.md; every limit and timer is an option so the tests can shorten them.
import { createPublicKey, randomBytes, verify, type KeyObject } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { isIP, type AddressInfo, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import WebSocket, { WebSocketServer } from "ws";

export interface RelayOptions {
  /** Ed25519 public keys allowed to hold laptop seats and pairing rooms: 32 raw bytes each, unpadded base64url. */
  laptopKeys?: readonly string[];
  joinTimeoutMs?: number;
  maxJoinBytes?: number;
  roomLifetimeMs?: number;
  maxPayload?: number;
  maxSocketsPerAddress?: number;
  maxAttemptsPerAddress?: number;
  attemptWindowMs?: number;
  maxSockets?: number;
  maxChannelsPerKey?: number;
  maxChannels?: number;
  maxRoomsPerKey?: number;
  maxRooms?: number;
  maxPairJoinsPerAddress?: number;
  pairJoinWindowMs?: number;
  /** The window the three frame budgets below refill over. */
  rateWindowMs?: number;
  messagesPerWindow?: number;
  messageBurst?: number;
  bytesPerWindow?: number;
  byteBurst?: number;
  /** All sockets together; the bucket holds one window's worth. */
  globalBytesPerWindow?: number;
  pauseAboveBytes?: number;
  resumeBelowBytes?: number;
  backpressureCheckMs?: number;
  stallTimeoutMs?: number;
  pingIntervalMs?: number;
  headersTimeoutMs?: number;
  requestTimeoutMs?: number;
  maxHeaderSize?: number;
  keepAliveTimeoutMs?: number;
  /** How often Node checks the two request timeouts (its own default, 30 s, would let them run up to 40 s). */
  connectionsCheckingIntervalMs?: number;
  /** On close(), how long sockets get to finish their closing handshake before they are cut. */
  shutdownGraceMs?: number;
}

const MiB = 1024 * 1024;

export const RELAY_DEFAULTS = {
  joinTimeoutMs: 10_000,
  maxJoinBytes: 1024,
  roomLifetimeMs: 5 * 60_000,
  maxPayload: 65_536,
  maxSocketsPerAddress: 12,
  maxAttemptsPerAddress: 30,
  attemptWindowMs: 60_000,
  maxSockets: 400,
  maxChannelsPerKey: 8,
  maxChannels: 200,
  maxRoomsPerKey: 2,
  maxRooms: 50,
  maxPairJoinsPerAddress: 10,
  pairJoinWindowMs: 60_000,
  rateWindowMs: 60_000,
  messagesPerWindow: 300,
  messageBurst: 60,
  bytesPerWindow: 16 * MiB,
  byteBurst: 4 * MiB,
  globalBytesPerWindow: 128 * MiB,
  pauseAboveBytes: 1 * MiB,
  resumeBelowBytes: 256 * 1024,
  backpressureCheckMs: 100,
  stallTimeoutMs: 30_000,
  pingIntervalMs: 30_000,
  headersTimeoutMs: 10_000,
  requestTimeoutMs: 10_000,
  maxHeaderSize: 8192,
  keepAliveTimeoutMs: 5_000,
  connectionsCheckingIntervalMs: 1_000,
  shutdownGraceMs: 2_000
} as const satisfies Required<Omit<RelayOptions, "laptopKeys">>;

export interface Relay {
  server: Server;
  /** Resolves with the bound port. */
  listen(port: number, host?: string): Promise<number>;
  /** Closes every socket with 1001 and stops the server. */
  close(): Promise<void>;
}

/** Close codes. Every close the relay makes carries an empty reason. */
export const CLOSE = {
  shutdown: 1001,
  badJoin: 4400,
  notAllowed: 4401,
  noSeat: 4404,
  timeout: 4408,
  replaced: 4409,
  roomPartnerLeft: 4410,
  rateLimited: 4429,
  full: 4503
} as const;

type Role = "laptop" | "pair-host" | "phone" | "pair-join";

const JOIN_KEYS = new Map<string, readonly string[]>([
  ["laptop", ["chan", "key", "sig"]],
  ["pair-host", ["room", "key", "sig"]],
  ["phone", ["chan"]],
  ["pair-join", ["room"]]
]);

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const BASE64URL = /^[A-Za-z0-9_-]+$/u;
const ROOM_ID = /^[0-9a-f]{32}$/u;
const NOT_FOUND = "HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n";
const TOO_MANY = "HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n";
const JOINED = JSON.stringify({ t: "joined" });
const PEER_HERE = JSON.stringify({ t: "peer", here: true });
const PEER_GONE = JSON.stringify({ t: "peer", here: false });

const noop = (): void => undefined;

/** Strict unpadded base64url that decodes to exactly `bytes` bytes (and re-encodes to the same text). */
function decodeBase64url(value: string, bytes: number): Buffer | undefined {
  if (!BASE64URL.test(value)) return undefined;
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== bytes || decoded.toString("base64url") !== value) return undefined;
  return decoded;
}

function publicKey(raw: Buffer): KeyObject {
  return createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });
}

/**
 * PHONE_RELAY_LAPTOP_KEYS: comma-separated keys. Missing or empty means none; a malformed entry throws (index.ts then
 * exits 1 without printing). Duplicates count once.
 */
export function parseLaptopKeys(value: string | undefined): string[] {
  if (value === undefined || value === "") return [];
  const keys = value.split(",");
  for (const key of keys) {
    const raw = decodeBase64url(key, 32);
    if (raw === undefined) throw new Error("malformed laptop key");
    publicKey(raw);
  }
  return [...new Set(keys)];
}

class TokenBucket {
  private tokens: number;
  private last = performance.now();

  constructor(private readonly capacity: number, private readonly perMs: number) {
    this.tokens = capacity;
  }

  take(amount: number): boolean {
    const now = performance.now();
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.perMs);
    this.last = now;
    if (amount > this.tokens) return false;
    this.tokens -= amount;
    return true;
  }
}

/** Records one event and says whether `limit` events were already recorded in the last `windowMs`. */
function hitLimit(log: Map<string, number[]>, address: string, limit: number, windowMs: number): boolean {
  const now = performance.now();
  const times = log.get(address) ?? [];
  while (times.length > 0 && now - times[0] >= windowMs) times.shift();
  const over = times.length >= limit;
  times.push(now);
  // Only the newest `limit` times decide the next answer.
  if (times.length > limit) times.shift();
  log.set(address, times);
  return over;
}

function prune(log: Map<string, number[]>, windowMs: number): void {
  const now = performance.now();
  for (const [address, times] of log) {
    if (times.length === 0 || now - times[times.length - 1] >= windowMs) log.delete(address);
  }
}

function adjust(counts: Map<string, number>, key: string, delta: number): void {
  const next = (counts.get(key) ?? 0) + delta;
  if (next > 0) counts.set(key, next);
  else counts.delete(key);
}

function toBuffer(data: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

interface Join {
  role: Role;
  id: string;
  key?: string;
  sig?: Buffer;
}

/** The first message's exact shape, or undefined (4400). Allowlist and signature are checked after. */
function parseJoin(text: string): Join | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const extra = typeof record.role === "string" ? JOIN_KEYS.get(record.role) : undefined;
  if (record.t !== "join" || record.v !== 1 || extra === undefined) return undefined;
  const expected = ["t", "v", "role", ...extra];
  const keys = Object.keys(record);
  if (keys.length !== expected.length || !expected.every((key) => Object.hasOwn(record, key))) return undefined;
  for (const key of expected) {
    if (key !== "v" && typeof record[key] !== "string") return undefined;
  }
  const role = record.role as Role;
  const id = (role === "laptop" || role === "phone" ? record.chan : record.room) as string;
  if (role === "laptop" || role === "phone") {
    if (decodeBase64url(id, 32) === undefined) return undefined;
  } else if (!ROOM_ID.test(id)) {
    return undefined;
  }
  if (role === "phone" || role === "pair-join") return { role, id };
  const key = record.key as string;
  const sig = decodeBase64url(record.sig as string, 64);
  if (decodeBase64url(key, 32) === undefined || sig === undefined) return undefined;
  return { role, id, key, sig };
}

interface Conn {
  readonly ws: WebSocket;
  readonly address: string;
  readonly challenge: string;
  readonly messages: TokenBucket;
  readonly bytes: TokenBucket;
  role?: Role;
  id?: string;
  closing: boolean;
  awaitingPong: boolean;
  joinTimer?: NodeJS.Timeout;
  pausedAt?: number;
  pauseCheck?: NodeJS.Timeout;
}

interface Channel {
  laptop: Conn;
  phone?: Conn;
  key: string;
}

interface Room {
  host: Conn;
  joiner?: Conn;
  key: string;
  created: number;
  expiry?: NodeJS.Timeout;
}

export function createRelay(options: RelayOptions = {}): Relay {
  const settings = { ...RELAY_DEFAULTS, ...options };
  const allowed = new Map<string, KeyObject>();
  for (const key of options.laptopKeys ?? []) {
    const raw = decodeBase64url(key, 32);
    if (raw === undefined) throw new Error("malformed laptop key");
    allowed.set(key, publicKey(raw));
  }

  const conns = new Set<Conn>();
  const channels = new Map<string, Channel>();
  const rooms = new Map<string, Room>();
  const channelsPerKey = new Map<string, number>();
  const roomsPerKey = new Map<string, number>();
  const socketsPerAddress = new Map<string, number>();
  const attempts = new Map<string, number[]>();
  const pairJoins = new Map<string, number[]>();
  const globalBytes = new TokenBucket(settings.globalBytesPerWindow, settings.globalBytesPerWindow / settings.rateWindowMs);
  let openSockets = 0;
  let heartbeat: NodeJS.Timeout | undefined;
  let closed = false;
  let closing: Promise<void> | undefined;
  let drained: (() => void) | undefined;

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: settings.maxPayload,
    perMessageDeflate: false,
    clientTracking: false
  });

  const server = createServer({
    maxHeaderSize: settings.maxHeaderSize,
    headersTimeout: settings.headersTimeoutMs,
    requestTimeout: settings.requestTimeoutMs,
    keepAliveTimeout: settings.keepAliveTimeoutMs,
    connectionsCheckingInterval: settings.connectionsCheckingIntervalMs
  }, (request, response) => {
    if (request.method === "GET" && request.url === "/relay/health") {
      response.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Length": "2"
      });
      response.end("ok");
      return;
    }
    response.writeHead(404, { "Content-Length": "0" });
    response.end();
  });
  server.keepAliveTimeout = settings.keepAliveTimeoutMs;
  server.on("clientError", (_error, socket: Duplex) => {
    socket.destroy();
  });
  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", noop);
    if (closed) {
      socket.destroy();
      return;
    }
    if (request.url !== "/relay") {
      refuse(socket, NOT_FOUND);
      return;
    }
    const address = clientAddress(request, socket);
    // Refused attempts count too.
    const tooFast = hitLimit(attempts, address, settings.maxAttemptsPerAddress, settings.attemptWindowMs);
    if (tooFast || (socketsPerAddress.get(address) ?? 0) >= settings.maxSocketsPerAddress ||
      openSockets >= settings.maxSockets) {
      refuse(socket, TOO_MANY);
      return;
    }
    // The socket is counted from here until its connection closes, whether or not the handshake succeeds.
    openSockets += 1;
    adjust(socketsPerAddress, address, 1);
    socket.once("close", () => {
      openSockets -= 1;
      adjust(socketsPerAddress, address, -1);
    });
    wss.handleUpgrade(request, socket, head, (ws) => accept(ws, address));
  });

  function refuse(socket: Duplex, response: string): void {
    socket.once("finish", () => socket.destroy());
    socket.end(response);
  }

  function clientAddress(request: IncomingMessage, socket: Duplex): string {
    const header = request.headers["x-askrigor-client-ip"];
    if (typeof header === "string" && header.length <= 45 && isIP(header) !== 0) return header;
    return (socket as Socket).remoteAddress ?? "";
  }

  function accept(ws: WebSocket, address: string): void {
    ws.on("error", noop);
    const window = settings.rateWindowMs;
    const conn: Conn = {
      ws,
      address,
      challenge: randomBytes(32).toString("base64url"),
      messages: new TokenBucket(settings.messageBurst, settings.messagesPerWindow / window),
      bytes: new TokenBucket(settings.byteBurst, settings.bytesPerWindow / window),
      closing: false,
      awaitingPong: false
    };
    conns.add(conn);
    ws.on("message", (data, isBinary) => {
      if (conn.closing) return;
      if (conn.role === undefined) {
        join(conn, toBuffer(data), isBinary);
      } else if (!isBinary) {
        closeConns(CLOSE.badJoin, conn);
      } else {
        forward(conn, toBuffer(data));
      }
    });
    ws.on("pong", () => {
      conn.awaitingPong = false;
    });
    ws.on("close", () => {
      conns.delete(conn);
      stopTimers(conn);
      if (!conn.closing) {
        conn.closing = true;
        vacate(conn);
      }
      if (conns.size === 0) drained?.();
    });
    if (closed) {
      closeConns(CLOSE.shutdown, conn);
      return;
    }
    conn.joinTimer = setTimeout(() => {
      if (conn.role === undefined) closeConns(CLOSE.timeout, conn);
    }, settings.joinTimeoutMs);
    ws.send(JSON.stringify({ t: "hello", v: 1, challenge: conn.challenge }));
  }

  function send(conn: Conn | undefined, text: string): void {
    if (conn !== undefined && !conn.closing && conn.ws.readyState === WebSocket.OPEN) conn.ws.send(text);
  }

  function stopTimers(conn: Conn): void {
    clearTimeout(conn.joinTimer);
    conn.joinTimer = undefined;
    clearInterval(conn.pauseCheck);
    conn.pauseCheck = undefined;
    conn.pausedAt = undefined;
  }

  /**
   * Closes sockets with `code` and an empty reason. All of them are marked closing before any seat is given up, so
   * that sockets closed together are never told about each other or closed again with another code.
   */
  function closeConns(code: number, ...targets: Array<Conn | undefined>): void {
    const closingNow = targets.filter((conn): conn is Conn => conn !== undefined && !conn.closing);
    for (const conn of closingNow) {
      conn.closing = true;
      stopTimers(conn);
    }
    for (const conn of closingNow) vacate(conn);
    for (const conn of closingNow) {
      // A paused socket must be read again for its closing handshake to finish.
      if (conn.ws.isPaused) conn.ws.resume();
      conn.ws.close(code);
    }
  }

  /** Gives up the seat `conn` holds, if it still holds it; a replaced socket touches nothing and tells no one. */
  function vacate(conn: Conn): void {
    if (conn.role === undefined || conn.id === undefined) return;
    if (conn.role === "laptop" || conn.role === "phone") {
      const channel = channels.get(conn.id);
      if (channel === undefined) return;
      if (channel.laptop === conn) {
        channels.delete(conn.id);
        adjust(channelsPerKey, channel.key, -1);
        closeConns(CLOSE.noSeat, channel.phone);
      } else if (channel.phone === conn) {
        channel.phone = undefined;
        send(channel.laptop, PEER_GONE);
      }
      return;
    }
    const room = rooms.get(conn.id);
    if (room === undefined || (room.host !== conn && room.joiner !== conn)) return;
    deleteRoom(conn.id, room);
    closeConns(CLOSE.roomPartnerLeft, room.host === conn ? room.joiner : room.host);
  }

  function deleteRoom(id: string, room: Room): void {
    if (rooms.get(id) === room) rooms.delete(id);
    clearTimeout(room.expiry);
    adjust(roomsPerKey, room.key, -1);
  }

  function seat(conn: Conn, role: Role, id: string): void {
    conn.role = role;
    conn.id = id;
  }

  function isOpen(conn: Conn | undefined): conn is Conn {
    return conn !== undefined && !conn.closing && conn.ws.readyState === WebSocket.OPEN;
  }

  function join(conn: Conn, message: Buffer, isBinary: boolean): void {
    clearTimeout(conn.joinTimer);
    conn.joinTimer = undefined;
    const parsed = isBinary || message.length > settings.maxJoinBytes ? undefined : parseJoin(message.toString("utf8"));
    if (parsed === undefined) {
      closeConns(CLOSE.badJoin, conn);
      return;
    }
    if (parsed.role === "laptop" || parsed.role === "pair-host") {
      const key = allowed.get(parsed.key as string);
      const signed = Buffer.from(`askrigor-relay/1\n${parsed.role}\n${parsed.id}\n${conn.challenge}`, "utf8");
      let valid = false;
      if (key !== undefined) {
        try {
          valid = verify(null, signed, key, parsed.sig as Buffer);
        } catch {
          valid = false;
        }
      }
      if (!valid) {
        closeConns(CLOSE.notAllowed, conn);
        return;
      }
    }
    switch (parsed.role) {
      case "laptop":
        joinLaptop(conn, parsed.id, parsed.key as string);
        break;
      case "phone":
        joinPhone(conn, parsed.id);
        break;
      case "pair-host":
        joinHost(conn, parsed.id, parsed.key as string);
        break;
      case "pair-join":
        joinRoom(conn, parsed.id);
        break;
    }
  }

  function joinLaptop(conn: Conn, chan: string, key: string): void {
    const channel = channels.get(chan);
    const held = (channelsPerKey.get(key) ?? 0) - (channel?.key === key ? 1 : 0);
    if ((channel === undefined && channels.size >= settings.maxChannels) || held >= settings.maxChannelsPerKey) {
      closeConns(CLOSE.full, conn);
      return;
    }
    seat(conn, "laptop", chan);
    if (channel === undefined) {
      channels.set(chan, { laptop: conn, key });
      adjust(channelsPerKey, key, 1);
      send(conn, JOINED);
      return;
    }
    const replaced = channel.laptop;
    adjust(channelsPerKey, channel.key, -1);
    adjust(channelsPerKey, key, 1);
    channel.key = key;
    channel.laptop = conn;
    closeConns(CLOSE.replaced, replaced);
    send(conn, JOINED);
    if (channel.phone !== undefined) {
      send(conn, PEER_HERE);
      send(channel.phone, PEER_HERE);
    }
  }

  function joinPhone(conn: Conn, chan: string): void {
    const channel = channels.get(chan);
    if (channel === undefined || !isOpen(channel.laptop)) {
      closeConns(CLOSE.noSeat, conn);
      return;
    }
    const replaced = channel.phone;
    seat(conn, "phone", chan);
    channel.phone = conn;
    closeConns(CLOSE.replaced, replaced);
    send(conn, JOINED);
    send(channel.laptop, PEER_HERE);
    send(conn, PEER_HERE);
  }

  function joinHost(conn: Conn, id: string, key: string): void {
    const existing = rooms.get(id);
    const held = (roomsPerKey.get(key) ?? 0) - (existing?.key === key ? 1 : 0);
    if ((existing === undefined && rooms.size >= settings.maxRooms) || held >= settings.maxRoomsPerKey) {
      closeConns(CLOSE.full, conn);
      return;
    }
    if (existing !== undefined) {
      deleteRoom(id, existing);
      closeConns(CLOSE.replaced, existing.host, existing.joiner);
    }
    const room: Room = { host: conn, key, created: performance.now() };
    room.expiry = setTimeout(() => {
      if (rooms.get(id) !== room) return;
      deleteRoom(id, room);
      closeConns(CLOSE.timeout, room.host, room.joiner);
    }, settings.roomLifetimeMs);
    rooms.set(id, room);
    adjust(roomsPerKey, key, 1);
    seat(conn, "pair-host", id);
    send(conn, JOINED);
  }

  function joinRoom(conn: Conn, id: string): void {
    // Every well-formed pair-join counts, whether or not it finds its room.
    if (hitLimit(pairJoins, conn.address, settings.maxPairJoinsPerAddress, settings.pairJoinWindowMs)) {
      closeConns(CLOSE.rateLimited, conn);
      return;
    }
    const room = rooms.get(id);
    if (room === undefined || room.joiner !== undefined || !isOpen(room.host)) {
      closeConns(CLOSE.noSeat, conn);
      return;
    }
    seat(conn, "pair-join", id);
    room.joiner = conn;
    send(conn, JOINED);
    send(room.host, PEER_HERE);
    send(conn, PEER_HERE);
  }

  /** The socket in the other seat, while `conn` still holds its own. */
  function peerOf(conn: Conn): Conn | undefined {
    if (conn.id === undefined) return undefined;
    if (conn.role === "laptop" || conn.role === "phone") {
      const channel = channels.get(conn.id);
      if (channel?.laptop === conn) return channel.phone;
      if (channel?.phone === conn) return channel.laptop;
      return undefined;
    }
    const room = rooms.get(conn.id);
    if (room?.host === conn) return room.joiner;
    if (room?.joiner === conn) return room.host;
    return undefined;
  }

  function forward(conn: Conn, frame: Buffer): void {
    if (!conn.messages.take(1) || !conn.bytes.take(frame.length) || !globalBytes.take(frame.length)) {
      closeConns(CLOSE.rateLimited, conn);
      return;
    }
    const peer = peerOf(conn);
    if (!isOpen(peer)) return;
    peer.ws.send(frame, { binary: true });
    if (peer.ws.bufferedAmount > settings.pauseAboveBytes) pause(conn, peer);
  }

  function pause(source: Conn, destination: Conn): void {
    if (source.pausedAt !== undefined) return;
    source.ws.pause();
    const pausedAt = performance.now();
    source.pausedAt = pausedAt;
    source.pauseCheck = setInterval(() => {
      if (source.closing) return;
      if (peerOf(source) !== destination || !isOpen(destination) ||
        destination.ws.bufferedAmount < settings.resumeBelowBytes) {
        clearInterval(source.pauseCheck);
        source.pauseCheck = undefined;
        source.pausedAt = undefined;
        source.ws.resume();
        return;
      }
      if (performance.now() - pausedAt >= settings.stallTimeoutMs) closeConns(CLOSE.timeout, source, destination);
    }, settings.backpressureCheckMs);
  }

  function beat(): void {
    for (const conn of conns) {
      // Unseated sockets have their join timer; a socket the relay paused cannot have its pong read yet.
      if (conn.role === undefined || conn.closing || conn.pausedAt !== undefined) continue;
      if (conn.awaitingPong) {
        conn.ws.terminate();
        continue;
      }
      conn.awaitingPong = true;
      conn.ws.ping();
    }
    prune(attempts, settings.attemptWindowMs);
    prune(pairJoins, settings.pairJoinWindowMs);
  }

  function listen(port: number, host = "0.0.0.0"): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.removeListener("error", reject);
        heartbeat ??= setInterval(beat, settings.pingIntervalMs);
        resolve((server.address() as AddressInfo).port);
      });
    });
  }

  function close(): Promise<void> {
    closing ??= new Promise<void>((resolve) => {
      closed = true;
      clearInterval(heartbeat);
      for (const room of rooms.values()) clearTimeout(room.expiry);
      const socketsClosed = new Promise<void>((done) => {
        if (conns.size === 0) done();
        else drained = done;
      });
      closeConns(CLOSE.shutdown, ...conns);
      const grace = setTimeout(() => {
        for (const conn of conns) conn.ws.terminate();
      }, settings.shutdownGraceMs);
      const serverClosed = new Promise<void>((done) => {
        server.close(() => done());
        server.closeAllConnections();
      });
      void Promise.all([socketsClosed, serverClosed]).then(() => {
        clearTimeout(grace);
        wss.close();
        resolve();
      });
    });
    return closing;
  }

  return { server, listen, close };
}
