import { getProtocolManifest, type ProtocolManifest } from "@askrigor/protocol";

import { SERVICE_NAME, SERVICE_VERSION, askrigorBuildCommitFromEnv } from "./config.js";

/**
 * GET /version answers which AskRigor is running, so anyone can compare it with
 * the latest release: the deployed build (ASKRIGOR_BUILD_COMMIT) and the exact
 * protocol versions and SHA-256s get_protocol_manifest reports. It carries no
 * user data and nothing secret, and needs no sign-in.
 */
export const VERSION_PATH = "/version";

export interface VersionPayload {
  service: string;
  version: string;
  /** The deployed build's commit, or "unknown" when the deployment did not set it. */
  build: string;
  protocols: {
    hrp: ProtocolIdentity;
    universal: ProtocolIdentity;
  };
}

interface ProtocolIdentity {
  version: string;
  revision_date: string;
  sha256: string;
}

// The protocol files never change inside one image, so they are read once.
let protocolIdentities: Promise<VersionPayload["protocols"]> | undefined;

export async function versionPayload(build = askrigorBuildCommitFromEnv()): Promise<VersionPayload> {
  protocolIdentities ??= readProtocolIdentities();
  let protocols: VersionPayload["protocols"];
  try {
    protocols = await protocolIdentities;
  } catch (error) {
    // A failed read is retried on the next request instead of being remembered.
    protocolIdentities = undefined;
    throw error;
  }
  return { service: SERVICE_NAME, version: SERVICE_VERSION, build, protocols };
}

async function readProtocolIdentities(): Promise<VersionPayload["protocols"]> {
  const [hrp, universal] = await Promise.all([
    getProtocolManifest("hrp"),
    getProtocolManifest("universal"),
  ]);
  return { hrp: identity(hrp), universal: identity(universal) };
}

function identity(manifest: ProtocolManifest): ProtocolIdentity {
  return { version: manifest.version, revision_date: manifest.revisionDate, sha256: manifest.sha256 };
}
