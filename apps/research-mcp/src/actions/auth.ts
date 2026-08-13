import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export function hasValidActionAuthorization(
  request: IncomingMessage,
  configuredApiKey: string | undefined
): boolean {
  if (configuredApiKey === undefined || configuredApiKey.length === 0) {
    return false;
  }

  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || actionAuthorizationCount(request) !== 1) {
    return false;
  }

  const match = /^Bearer (.+)$/.exec(authorization);
  if (match === null) {
    return false;
  }

  const presentedDigest = sha256(match[1]);
  const configuredDigest = sha256(configuredApiKey);
  return timingSafeEqual(presentedDigest, configuredDigest);
}

function actionAuthorizationCount(request: IncomingMessage): number {
  let count = 0;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === "authorization") {
      count += 1;
    }
  }
  return count;
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
