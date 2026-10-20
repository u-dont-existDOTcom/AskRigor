import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { z } from "zod";

export const CARRIED_STATE_MAX_CHARACTERS = 48_000;
export const CARRIED_STATE_TOO_LARGE = "This conversation's state is too large to carry to the next final check.";
export const userObservationSchema = z.object({
  observation: z.string().trim().min(1).max(200).describe("What was used, how and when, and what happened, as a short noun phrase in the user's terms, such as \"a friend's drowsiness after the same product\"."),
  response: z.enum(["effect", "no_effect", "uncertain", "withdrawn"]).describe("effect: something happened; no_effect: an attempt or comparison where nothing happened; uncertain: whoever reported it is no longer sure; withdrawn: whoever reported it took it back."),
  source: z.enum(["user", "someone_else"]).describe("The user's own observation, or one the user reports about someone else.")
}).strict();

export const carriedStateSchema = z.object({
  v: z.literal(1),
  issued_at: z.iso.datetime(),
  observations: z.array(userObservationSchema).max(30),
  retracted: z.array(z.string().max(200)).max(12),
  primary_outcome: z.string().trim().min(1).max(300).optional(),
  rejected: z.array(z.string().trim().min(1).max(120)).max(12),
  named_communities: z.array(z.string().trim().min(1).max(120)).max(8)
}).strict();
export type CarriedState = z.output<typeof carriedStateSchema>;
type Options = { secret: string };
type Verification = { ok: true; state: CarriedState } |
  { ok: false; reason: "malformed" | "bad_signature" | "unsupported_version" };

function mac(body: string, secret: string): Buffer {
  const key = createHmac("sha256", secret).update("askrigor carried state v1").digest();
  return createHmac("sha256", key).update(body).digest().subarray(0, 16);
}

/** Stateless conversation state, domain-separated from research receipts. No expiry. */
export function issueCarriedState(state: CarriedState, { secret }: Options): string | undefined {
  const checked = carriedStateSchema.parse(state);
  const retracted = [...checked.retracted];
  for (;;) {
    // Deliberately fixed key order, independent of the caller's object order.
    const ordered: CarriedState = {
      v: 1, issued_at: checked.issued_at, observations: checked.observations, retracted,
      ...(checked.primary_outcome === undefined ? {} : { primary_outcome: checked.primary_outcome }),
      rejected: checked.rejected, named_communities: checked.named_communities
    };
    const payload = deflateRawSync(Buffer.from(JSON.stringify(ordered))).toString("base64url");
    const body = `cs1~${payload}`;
    const token = `${body}~${mac(body, secret).toString("base64url")}`;
    if (token.length <= CARRIED_STATE_MAX_CHARACTERS) return token;
    if (retracted.length === 0) return undefined;
    retracted.shift();
  }
}

export function verifyCarriedState(token: string, { secret }: Options): Verification {
  if (token.length > CARRIED_STATE_MAX_CHARACTERS) return { ok: false, reason: "malformed" };
  const parts = token.split("~");
  if (parts.length !== 3 || !/^cs\d+$/u.test(parts[0]!) ||
      !/^[A-Za-z0-9_-]+$/u.test(parts[1]!) || !/^[A-Za-z0-9_-]{22}$/u.test(parts[2]!)) {
    return { ok: false, reason: "malformed" };
  }
  if (parts[0] !== "cs1") return { ok: false, reason: "unsupported_version" };
  const body = `${parts[0]}~${parts[1]}`;
  const signature = Buffer.from(parts[2]!, "base64url");
  if (signature.length !== 16 || signature.toString("base64url") !== parts[2] ||
      !timingSafeEqual(mac(body, secret), signature)) return { ok: false, reason: "bad_signature" };
  try {
    const payload = Buffer.from(parts[1]!, "base64url");
    if (payload.toString("base64url") !== parts[1]) return { ok: false, reason: "malformed" };
    const raw: unknown = JSON.parse(inflateRawSync(payload, { maxOutputLength: 256 * 1024 }).toString("utf8"));
    if (typeof raw === "object" && raw !== null && "v" in raw && raw.v !== 1) {
      return { ok: false, reason: "unsupported_version" };
    }
    const parsed = carriedStateSchema.safeParse(raw);
    return parsed.success ? { ok: true, state: parsed.data } : { ok: false, reason: "malformed" };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
