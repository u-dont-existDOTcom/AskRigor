import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

import {
  GEMINI_SIGN_IN_MODELS,
  type GeminiSignInModel,
  type GeminiSignInRowStore,
} from "@askrigor/evidence-repository";
import type { Adapter, AdapterPayload } from "oidc-provider";

import type { GeminiSignInKeys } from "./config.js";

/**
 * How the authorization server's records are kept (design section 6, v2 F7): a row's key and indexes are HMACs under one
 * derived key; its payload is AES-256-GCM under another, bound to its model and key; and the payloads of codes, access
 * tokens and refresh tokens are stored without their `jti`, which is the code or token value itself, so only HMACs of
 * those values exist at rest. The value is restored from the one presented when a record is looked up.
 */
const TOKEN_VALUE_MODELS: ReadonlySet<GeminiSignInModel> = new Set(["AuthorizationCode", "AccessToken", "RefreshToken"]);
const SEAL_VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const MAX_SEALED_BYTES = 65_536;

export class GeminiSignInSealer {
  constructor(private readonly keys: Pick<GeminiSignInKeys, "storeIndex" | "storeSeal">) {
    if (keys.storeIndex.byteLength !== 32 || keys.storeSeal.byteLength !== 32) throw new Error("GEMINI_SIGN_IN_KEYS_INVALID");
  }

  private mac(kind: string, value: string): Buffer {
    return createHmac("sha256", this.keys.storeIndex).update(`${kind}\u0000${value}`, "utf8").digest();
  }

  keyOf(model: GeminiSignInModel, id: string): Buffer {
    return this.mac(`row\u0000${model}`, id);
  }

  grantKeyOf(grantId: string): Buffer {
    return this.mac("grant", grantId);
  }

  uidKeyOf(uid: string): Buffer {
    return this.mac("uid", uid);
  }

  /** Finds one person's links: an HMAC of their OAuth subject under this server's key, never the subject itself. */
  accountRefOf(accountId: string): Buffer {
    return this.mac("account", accountId);
  }

  private static associatedData(model: GeminiSignInModel, key: Buffer): Buffer {
    return Buffer.from(`askrigor-gemini-sign-in-v${SEAL_VERSION}\u0000${model}\u0000${key.toString("hex")}`, "utf8");
  }

  seal(model: GeminiSignInModel, key: Buffer, payload: AdapterPayload): Buffer {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.keys.storeSeal, nonce);
    cipher.setAAD(GeminiSignInSealer.associatedData(model, key));
    const sealed = Buffer.concat([
      Buffer.from([SEAL_VERSION]),
      nonce,
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    if (sealed.byteLength > MAX_SEALED_BYTES) throw new Error("GEMINI_SIGN_IN_PAYLOAD_TOO_LARGE");
    return sealed;
  }

  open(model: GeminiSignInModel, key: Buffer, sealed: Buffer): AdapterPayload {
    if (sealed.byteLength < 1 + NONCE_BYTES + TAG_BYTES + 1 || sealed[0] !== SEAL_VERSION) {
      throw new Error("GEMINI_SIGN_IN_PAYLOAD_INVALID");
    }
    const nonce = sealed.subarray(1, 1 + NONCE_BYTES);
    const tag = sealed.subarray(sealed.byteLength - TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", this.keys.storeSeal, nonce);
    decipher.setAAD(GeminiSignInSealer.associatedData(model, key));
    decipher.setAuthTag(tag);
    const text = Buffer.concat([
      decipher.update(sealed.subarray(1 + NONCE_BYTES, sealed.byteLength - TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
    const payload: unknown = JSON.parse(text);
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new Error("GEMINI_SIGN_IN_PAYLOAD_INVALID");
    }
    return payload as AdapterPayload;
  }
}

const isModel = (name: string): name is GeminiSignInModel =>
  (GEMINI_SIGN_IN_MODELS as readonly string[]).includes(name);

/** The library's storage adapter over the sealed rows; one instance per model name, as the library asks. */
export function geminiSignInAdapterFactory(
  rows: GeminiSignInRowStore,
  sealer: GeminiSignInSealer,
  now: () => Date = () => new Date(),
): (name: string) => Adapter {
  return (name: string) => (isModel(name) ? new SealedAdapter(name, rows, sealer, now) : new RefusingAdapter());
}

class SealedAdapter implements Adapter {
  constructor(
    private readonly model: GeminiSignInModel,
    private readonly rows: GeminiSignInRowStore,
    private readonly sealer: GeminiSignInSealer,
    private readonly now: () => Date,
  ) {}

  async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
    if (typeof id !== "string" || id.length === 0 || id.length > 512) throw new Error("GEMINI_SIGN_IN_ID_INVALID");
    if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      // Every record here has a lifetime; one without would never leave the store.
      throw new Error("GEMINI_SIGN_IN_EXPIRY_REQUIRED");
    }
    const at = this.now();
    const key = this.sealer.keyOf(this.model, id);
    const stored: AdapterPayload = { ...payload };
    delete stored.consumed;
    if (TOKEN_VALUE_MODELS.has(this.model)) {
      if (stored.jti !== id) throw new Error("GEMINI_SIGN_IN_ID_INVALID");
      delete stored.jti;
    }
    const grantId = this.model === "Grant" ? id : typeof stored.grantId === "string" ? stored.grantId : undefined;
    const row = {
      model: this.model,
      key,
      payload: this.sealer.seal(this.model, key, stored),
      grantKey: grantId === undefined ? null : this.sealer.grantKeyOf(grantId),
      uidKey: this.model === "Session" && typeof stored.uid === "string" ? this.sealer.uidKeyOf(stored.uid) : null,
      accountRef: this.model === "Grant" && typeof stored.accountId === "string"
        ? this.sealer.accountRefOf(stored.accountId)
        : null,
      expiresAt: new Date(at.getTime() + Math.ceil(expiresIn) * 1_000),
    };
    if (this.model === "ReplayDetection") {
      // Atomic insert-if-absent: a second use of a client assertion's jti fails even when two arrive at once.
      if (!(await this.rows.putIfAbsent(row, at))) throw new Error("GEMINI_SIGN_IN_REPLAY");
      return;
    }
    await this.rows.put(row);
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    if (typeof id !== "string" || id.length === 0 || id.length > 512) return undefined;
    const key = this.sealer.keyOf(this.model, id);
    const row = await this.rows.get(this.model, key, this.now());
    if (row === undefined) return undefined;
    return this.restore(row.payload, key, row.consumedAt, id);
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    if (this.model !== "Session" || typeof uid !== "string" || uid.length === 0 || uid.length > 512) return undefined;
    const row = await this.rows.getSessionByUid(this.sealer.uidKeyOf(uid), this.now());
    if (row === undefined) return undefined;
    const payload = this.restore(row.payload, row.key, row.consumedAt, undefined);
    return payload.uid === uid ? payload : undefined;
  }

  async findByUserCode(): Promise<AdapterPayload | undefined> {
    return undefined;
  }

  async consume(id: string): Promise<void> {
    // Atomic: only one of two concurrent redemptions of a code changes the row; the other fails here.
    if (!(await this.rows.consume(this.model, this.sealer.keyOf(this.model, id), this.now()))) {
      throw new Error("GEMINI_SIGN_IN_ALREADY_CONSUMED");
    }
  }

  async destroy(id: string): Promise<void> {
    await this.rows.delete(this.model, this.sealer.keyOf(this.model, id));
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await this.rows.deleteByGrant(this.model, this.sealer.grantKeyOf(grantId));
  }

  private restore(sealed: Buffer, key: Buffer, consumedAt: Date | null, id: string | undefined): AdapterPayload {
    const payload = this.sealer.open(this.model, key, sealed);
    if (TOKEN_VALUE_MODELS.has(this.model) && id !== undefined) payload.jti = id;
    if (consumedAt !== null) payload.consumed = Math.floor(consumedAt.getTime() / 1_000);
    return payload;
  }
}

/** Any other model of the library: nothing of it is ever stored here, and storing one is refused. */
class RefusingAdapter implements Adapter {
  async upsert(): Promise<void> {
    throw new Error("GEMINI_SIGN_IN_MODEL_REFUSED");
  }
  async find(): Promise<AdapterPayload | undefined> {
    return undefined;
  }
  async findByUid(): Promise<AdapterPayload | undefined> {
    return undefined;
  }
  async findByUserCode(): Promise<AdapterPayload | undefined> {
    return undefined;
  }
  async consume(): Promise<void> {
    throw new Error("GEMINI_SIGN_IN_MODEL_REFUSED");
  }
  async destroy(): Promise<void> {}
  async revokeByGrantId(): Promise<void> {}
}
