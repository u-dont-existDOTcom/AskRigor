import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  loadProtocolSnapshot,
  type ProtocolManifest,
  type ProtocolName,
  type ProtocolSnapshot
} from "@askrigor/protocol";

import {
  researchSemanticPolicyWorkerInstruction,
  type ResearchSemanticWork
} from "./research-semantic-worker.js";
import { controlledWorkerWorkDigest } from "./controlled-worker-payload.js";

export const RESEARCH_SEMANTIC_POLICY_CONTEXT_VERSION =
  "askrigor_semantic_policy_context_v1" as const;

const DIGEST = /^[a-f0-9]{64}$/u;
const POLICY_DOCUMENTS = Object.freeze([
  {
    document_id: "universal",
    path: "protocols/Universal_Instructions.xml",
    protocol: "universal"
  },
  {
    document_id: "hrp",
    path: "protocols/HRP_Full.xml",
    protocol: "hrp"
  },
  {
    document_id: "project_router",
    path: "project/PROJECT_INSTRUCTIONS.md"
  },
  {
    document_id: "forum_signal_module",
    path: "project/FORUM_SIGNAL_MODULE.md"
  }
] as const);

export type ResearchSemanticPolicyDocumentId =
  (typeof POLICY_DOCUMENTS)[number]["document_id"];
export type ResearchSemanticProjectDocumentId = Extract<
  ResearchSemanticPolicyDocumentId,
  "project_router" | "forum_signal_module"
>;

export interface ResearchSemanticPolicyDocument {
  document_id: ResearchSemanticPolicyDocumentId;
  path: string;
  text: string;
  utf8_bytes: number;
  sha256: string;
  protocol_manifest?: ProtocolManifest;
}

export interface ResearchSemanticPolicyContext {
  context_version: typeof RESEARCH_SEMANTIC_POLICY_CONTEXT_VERSION;
  documents: ResearchSemanticPolicyDocument[];
  context_sha256: string;
}

export interface ExpectedResearchProtocolIdentity {
  protocol: ProtocolName;
  name: string;
  version: string;
  revision_date: string;
  sha256: string;
}

export type ExpectedResearchProtocolBinding = readonly [
  ExpectedResearchProtocolIdentity & { protocol: "universal" },
  ExpectedResearchProtocolIdentity & { protocol: "hrp" }
];

export interface ResearchSemanticPolicyDependencies {
  loadProtocolSnapshot?: (
    protocol: ProtocolName
  ) => Promise<ProtocolSnapshot>;
  readProjectDocument?: (
    documentId: ResearchSemanticProjectDocumentId
  ) => Promise<Uint8Array>;
}

export interface ResearchSemanticPolicyInputs {
  instruction: string;
  policy_context: ResearchSemanticPolicyContext;
}

export class ResearchSemanticPolicyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchSemanticPolicyInputError";
  }
}

/** Build the server-owned semantic instruction and complete canonical context. */
export async function createResearchSemanticPolicyInputs(input: {
  kind: ResearchSemanticWork["kind"];
  expectedProtocols: ExpectedResearchProtocolBinding;
  dependencies?: ResearchSemanticPolicyDependencies;
}): Promise<ResearchSemanticPolicyInputs> {
  return {
    instruction: researchSemanticPolicyWorkerInstruction(input.kind),
    policy_context: await loadResearchSemanticPolicyContext(
      input.expectedProtocols,
      input.dependencies
    )
  };
}

/** Load all four fixed policy sources and bind them to the session tuple. */
export async function loadResearchSemanticPolicyContext(
  expectedProtocols: ExpectedResearchProtocolBinding,
  dependencies: ResearchSemanticPolicyDependencies = {}
): Promise<ResearchSemanticPolicyContext> {
  const snapshotLoader = dependencies.loadProtocolSnapshot ?? loadProtocolSnapshot;
  const projectReader = dependencies.readProjectDocument ?? readCanonicalProjectDocument;
  let universal: ProtocolSnapshot;
  let hrp: ProtocolSnapshot;
  let projectRouterBytes: Uint8Array;
  let forumSignalBytes: Uint8Array;
  try {
    [universal, hrp, projectRouterBytes, forumSignalBytes] = await Promise.all([
      snapshotLoader("universal"),
      snapshotLoader("hrp"),
      projectReader("project_router"),
      projectReader("forum_signal_module")
    ]);
  } catch (error) {
    throw policyError("Unable to load the complete canonical semantic policy", error);
  }

  const documents: ResearchSemanticPolicyDocument[] = [
    protocolDocument(POLICY_DOCUMENTS[0], universal),
    protocolDocument(POLICY_DOCUMENTS[1], hrp),
    textDocument(POLICY_DOCUMENTS[2], projectRouterBytes),
    textDocument(POLICY_DOCUMENTS[3], forumSignalBytes)
  ];
  const unsigned = {
    context_version: RESEARCH_SEMANTIC_POLICY_CONTEXT_VERSION,
    documents
  };
  return validateResearchSemanticPolicyContext(
    {
      ...unsigned,
      context_sha256: controlledWorkerWorkDigest(unsigned)
    },
    expectedProtocols
  );
}

/** Validate a context with the same checks used for production construction. */
export function validateResearchSemanticPolicyContext(
  value: unknown,
  expectedProtocols: ExpectedResearchProtocolBinding
): ResearchSemanticPolicyContext {
  const context = requireRecord(value, "Policy context must be an object");
  requireExactKeys(
    context,
    ["context_version", "documents", "context_sha256"],
    "Policy context fields are invalid"
  );
  if (context.context_version !== RESEARCH_SEMANTIC_POLICY_CONTEXT_VERSION) {
    throw new ResearchSemanticPolicyInputError("Policy context version is invalid");
  }
  if (!Array.isArray(context.documents)) {
    throw new ResearchSemanticPolicyInputError("Policy context documents must be an array");
  }
  const ids = context.documents.map((document) =>
    requireRecord(document, "Policy document must be an object").document_id
  );
  if (new Set(ids).size !== ids.length) {
    throw new ResearchSemanticPolicyInputError("Policy context contains a duplicate document");
  }
  if (context.documents.length !== POLICY_DOCUMENTS.length) {
    throw new ResearchSemanticPolicyInputError("Policy context is missing a canonical document");
  }

  const documents = context.documents.map((rawDocument, index) => {
    const document = requireRecord(rawDocument, "Policy document must be an object");
    const expected = POLICY_DOCUMENTS[index]!;
    const isProtocol = "protocol" in expected;
    requireExactKeys(
      document,
      isProtocol
        ? ["document_id", "path", "text", "utf8_bytes", "sha256", "protocol_manifest"]
        : ["document_id", "path", "text", "utf8_bytes", "sha256"],
      "Policy document fields are invalid"
    );
    if (
      document.document_id !== expected.document_id ||
      document.path !== expected.path
    ) {
      throw new ResearchSemanticPolicyInputError(
        "Policy context document order or identity is invalid"
      );
    }
    if (typeof document.text !== "string") {
      throw new ResearchSemanticPolicyInputError("Policy document text is invalid");
    }
    const bytes = exactUtf8Bytes(document.text);
    if (document.utf8_bytes !== bytes.byteLength) {
      throw new ResearchSemanticPolicyInputError("Policy document byte count is invalid");
    }
    const digest = sha256(bytes);
    if (document.sha256 !== digest) {
      throw new ResearchSemanticPolicyInputError("Policy document SHA-256 is invalid");
    }
    if (isProtocol) {
      const manifest = validateProtocolManifest(document.protocol_manifest);
      if (manifest.sha256 !== digest) {
        throw new ResearchSemanticPolicyInputError(
          "Protocol manifest does not match its exact policy text"
        );
      }
      const binding = expectedProtocols[index];
      if (
        binding === undefined ||
        binding.protocol !== expected.protocol ||
        binding.name !== manifest.name ||
        binding.version !== manifest.version ||
        binding.revision_date !== manifest.revisionDate ||
        binding.sha256 !== manifest.sha256
      ) {
        throw new ResearchSemanticPolicyInputError(
          "Canonical policy protocol does not match the session binding"
        );
      }
    }
    return document as unknown as ResearchSemanticPolicyDocument;
  });

  if (typeof context.context_sha256 !== "string" || !DIGEST.test(context.context_sha256)) {
    throw new ResearchSemanticPolicyInputError("Policy context SHA-256 is invalid");
  }
  const expectedContextDigest = controlledWorkerWorkDigest({
    context_version: RESEARCH_SEMANTIC_POLICY_CONTEXT_VERSION,
    documents
  });
  if (context.context_sha256 !== expectedContextDigest) {
    throw new ResearchSemanticPolicyInputError("Policy context digest does not match its documents");
  }
  return context as unknown as ResearchSemanticPolicyContext;
}

function protocolDocument(
  source: (typeof POLICY_DOCUMENTS)[0] | (typeof POLICY_DOCUMENTS)[1],
  snapshot: ProtocolSnapshot
): ResearchSemanticPolicyDocument {
  const bytes = exactUtf8Bytes(snapshot.text);
  return {
    document_id: source.document_id,
    path: source.path,
    text: snapshot.text,
    utf8_bytes: bytes.byteLength,
    sha256: sha256(bytes),
    protocol_manifest: { ...snapshot.manifest }
  };
}

function textDocument(
  source: (typeof POLICY_DOCUMENTS)[2] | (typeof POLICY_DOCUMENTS)[3],
  bytes: Uint8Array
): ResearchSemanticPolicyDocument {
  if (!(bytes instanceof Uint8Array)) {
    throw new ResearchSemanticPolicyInputError("Canonical project policy bytes are invalid");
  }
  const text = decodeUtf8(bytes);
  const exactBytes = exactUtf8Bytes(text);
  if (!Buffer.from(exactBytes).equals(Buffer.from(bytes))) {
    throw new ResearchSemanticPolicyInputError(
      "Policy document text does not reproduce its exact source bytes"
    );
  }
  return {
    document_id: source.document_id,
    path: source.path,
    text,
    utf8_bytes: exactBytes.byteLength,
    sha256: sha256(exactBytes)
  };
}

async function readCanonicalProjectDocument(
  documentId: ResearchSemanticProjectDocumentId
): Promise<Uint8Array> {
  const source = POLICY_DOCUMENTS.find(
    (candidate) => candidate.document_id === documentId
  );
  if (source === undefined || "protocol" in source) {
    throw new ResearchSemanticPolicyInputError("Unknown canonical project policy document");
  }
  return readFile(new URL(`../../../${source.path}`, import.meta.url));
}

function validateProtocolManifest(value: unknown): ProtocolManifest {
  const manifest = requireRecord(value, "Protocol manifest is required");
  requireExactKeys(
    manifest,
    ["name", "version", "revisionDate", "sha256"],
    "Protocol manifest fields are invalid"
  );
  if (
    typeof manifest.name !== "string" || manifest.name.length === 0 ||
    typeof manifest.version !== "string" || manifest.version.length === 0 ||
    typeof manifest.revisionDate !== "string" || manifest.revisionDate.length === 0 ||
    typeof manifest.sha256 !== "string" || !DIGEST.test(manifest.sha256)
  ) {
    throw new ResearchSemanticPolicyInputError("Protocol manifest is invalid");
  }
  return manifest as unknown as ProtocolManifest;
}

function exactUtf8Bytes(text: string): Buffer {
  const bytes = Buffer.from(text, "utf8");
  if (decodeUtf8(bytes) !== text) {
    throw new ResearchSemanticPolicyInputError(
      "Policy document cannot be represented as exact UTF-8"
    );
  }
  return bytes;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new ResearchSemanticPolicyInputError("Policy document is not valid UTF-8");
  }
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ResearchSemanticPolicyInputError(message);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  message: string
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new ResearchSemanticPolicyInputError(message);
  }
}

function policyError(message: string, cause: unknown): ResearchSemanticPolicyInputError {
  if (cause instanceof ResearchSemanticPolicyInputError) return cause;
  return new ResearchSemanticPolicyInputError(message);
}
