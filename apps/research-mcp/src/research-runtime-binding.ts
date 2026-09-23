import { createHash } from "node:crypto";

import {
  PUBLIC_RUNTIME_FORMAT_VERSION,
  type PublicRuntimeBundle
} from "./public-runtime-bundle.js";

export const LEGACY_RESEARCH_RUNTIME_BINDING_VERSION =
  "askrigor_research_runtime_binding_v1" as const;
export const RESEARCH_RUNTIME_BINDING_VERSION =
  "askrigor_research_runtime_binding_v2" as const;
export const RESEARCH_RUNTIME_CONTEXT_VERSION =
  "askrigor_semantic_policy_context_v1" as const;

export type ResearchRuntimeDocumentId =
  | "universal"
  | "hrp"
  | "project_router"
  | "forum_signal_module";

export interface ResearchRuntimeSemanticIdentity {
  context_version: typeof RESEARCH_RUNTIME_CONTEXT_VERSION;
  context_sha256: string;
  documents: Array<{
    document_id: ResearchRuntimeDocumentId;
    path: string;
    sha256: string;
  }>;
}

export interface ResearchRuntimePublicIdentity {
  format_version: typeof PUBLIC_RUNTIME_FORMAT_VERSION;
  profile: "standard-v2";
  release_manifest_sha256: string;
  bundle_sha256: string;
  document_hashes: Array<{
    document_id: string;
    sha256: string;
  }>;
}

export interface LegacyResearchRuntimeBinding
  extends ResearchRuntimeSemanticIdentity {
  binding_version: typeof LEGACY_RESEARCH_RUNTIME_BINDING_VERSION;
}

export interface ResearchRuntimeBinding
  extends ResearchRuntimeSemanticIdentity {
  binding_version: typeof RESEARCH_RUNTIME_BINDING_VERSION;
  public_runtime: ResearchRuntimePublicIdentity;
  runtime_sha256: string;
}

export type PersistedResearchRuntimeBinding =
  | LegacyResearchRuntimeBinding
  | ResearchRuntimeBinding;

const REQUIRED_PUBLIC_RUNTIME_DOCUMENT_IDS = Object.freeze([
  "public_plugin_adapter",
  "public_runtime_bindings",
  "mcp_initialization",
  "public_runtime_source_manifest"
] as const);

export function runtimeBindingFromPolicyContext(
  context: {
    context_version: typeof RESEARCH_RUNTIME_CONTEXT_VERSION;
    documents: Array<{
      document_id: ResearchRuntimeDocumentId;
      path: string;
      sha256: string;
    }>;
  },
  publicRuntime: ResearchRuntimePublicIdentity
): ResearchRuntimeBinding {
  return runtimeBindingFromDocumentIdentities(context.documents, publicRuntime);
}

export function runtimeBindingFromDocumentIdentities(
  documents: ResearchRuntimeSemanticIdentity["documents"],
  publicRuntime: ResearchRuntimePublicIdentity
): ResearchRuntimeBinding {
  const exactDocuments = documents.map((document) => ({
    document_id: document.document_id,
    path: document.path,
    sha256: document.sha256
  }));
  const exactPublicRuntime = {
    ...publicRuntime,
    document_hashes: publicRuntime.document_hashes.map((document) => ({
      document_id: document.document_id,
      sha256: document.sha256
    }))
  };
  assertRuntimeCoverage(exactDocuments, exactPublicRuntime);
  const unsigned = {
    binding_version: RESEARCH_RUNTIME_BINDING_VERSION,
    context_version: RESEARCH_RUNTIME_CONTEXT_VERSION,
    context_sha256: bindingContextSha256(
      RESEARCH_RUNTIME_BINDING_VERSION,
      exactDocuments
    ),
    documents: exactDocuments,
    public_runtime: exactPublicRuntime
  };
  return {
    ...unsigned,
    runtime_sha256: sha256(JSON.stringify(unsigned))
  };
}

export function runtimeBundleIdentityFromPublicBundle(
  bundle: PublicRuntimeBundle
): ResearchRuntimePublicIdentity {
  if (bundle.profile !== "standard-v2") {
    throw new Error("Research session runtime identity requires the standard-v2 bundle");
  }
  return {
    format_version: bundle.format_version,
    profile: bundle.profile,
    release_manifest_sha256: bundle.release_manifest_sha256,
    bundle_sha256: bundle.bundle_sha256,
    document_hashes: bundle.document_hashes.map((document) => ({
      document_id: document.document_id,
      sha256: document.sha256
    }))
  };
}

export function runtimeBindingMatchesPolicyContext(
  binding: PersistedResearchRuntimeBinding,
  context: {
    context_version: typeof RESEARCH_RUNTIME_CONTEXT_VERSION;
    documents: Array<{
      document_id: ResearchRuntimeDocumentId;
      path: string;
      sha256: string;
    }>;
  }
): boolean {
  const contextDocuments = context.documents.map((document) => ({
    document_id: document.document_id,
    path: document.path,
    sha256: document.sha256
  }));
  return binding.context_version === context.context_version &&
    binding.context_sha256 === bindingContextSha256(
      binding.binding_version,
      binding.documents
    ) &&
    JSON.stringify(binding.documents) === JSON.stringify(contextDocuments);
}

export function sameRuntimeBinding(
  left: PersistedResearchRuntimeBinding,
  right: PersistedResearchRuntimeBinding
): boolean {
  if (
    left.binding_version !== right.binding_version ||
    left.context_version !== right.context_version ||
    left.context_sha256 !== right.context_sha256 ||
    JSON.stringify(left.documents) !== JSON.stringify(right.documents)
  ) return false;
  if (
    left.binding_version === LEGACY_RESEARCH_RUNTIME_BINDING_VERSION ||
    right.binding_version === LEGACY_RESEARCH_RUNTIME_BINDING_VERSION
  ) {
    return left.binding_version === right.binding_version;
  }
  return left.runtime_sha256 === right.runtime_sha256 &&
    left.runtime_sha256 === runtimeIdentitySha256(left) &&
    right.runtime_sha256 === runtimeIdentitySha256(right) &&
    JSON.stringify(left.public_runtime) === JSON.stringify(right.public_runtime);
}

function assertRuntimeCoverage(
  documents: ResearchRuntimeSemanticIdentity["documents"],
  publicRuntime: ResearchRuntimePublicIdentity
): void {
  if (
    publicRuntime.format_version !== PUBLIC_RUNTIME_FORMAT_VERSION ||
    publicRuntime.profile !== "standard-v2"
  ) {
    throw new Error("Public runtime identity is not the standard-v2 release");
  }
  const identities = new Map<string, string>();
  for (const document of publicRuntime.document_hashes) {
    if (identities.has(document.document_id)) {
      throw new Error("Public runtime identity contains duplicate documents");
    }
    identities.set(document.document_id, document.sha256);
  }
  for (const document of documents) {
    if (identities.get(document.document_id) !== document.sha256) {
      throw new Error(
        `Semantic policy document is not bound to the public runtime: ${document.document_id}`
      );
    }
  }
  for (const documentId of REQUIRED_PUBLIC_RUNTIME_DOCUMENT_IDS) {
    if (!identities.has(documentId)) {
      throw new Error(
        `Public runtime identity is missing required document: ${documentId}`
      );
    }
  }
}

function bindingContextSha256(
  bindingVersion:
    | typeof LEGACY_RESEARCH_RUNTIME_BINDING_VERSION
    | typeof RESEARCH_RUNTIME_BINDING_VERSION,
  documents: ResearchRuntimeSemanticIdentity["documents"]
): string {
  return sha256(JSON.stringify({
    binding_version: bindingVersion,
    context_version: RESEARCH_RUNTIME_CONTEXT_VERSION,
    documents
  }));
}

function runtimeIdentitySha256(binding: ResearchRuntimeBinding): string {
  return sha256(JSON.stringify({
    binding_version: binding.binding_version,
    context_version: binding.context_version,
    context_sha256: binding.context_sha256,
    documents: binding.documents,
    public_runtime: binding.public_runtime
  }));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
