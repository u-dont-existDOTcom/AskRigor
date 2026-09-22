import { createHash } from "node:crypto";

export const RESEARCH_RUNTIME_BINDING_VERSION =
  "askrigor_research_runtime_binding_v1" as const;
export const RESEARCH_RUNTIME_CONTEXT_VERSION =
  "askrigor_semantic_policy_context_v1" as const;

export type ResearchRuntimeDocumentId =
  | "universal"
  | "hrp"
  | "project_router"
  | "forum_signal_module";

export interface ResearchRuntimeBinding {
  binding_version: typeof RESEARCH_RUNTIME_BINDING_VERSION;
  context_version: typeof RESEARCH_RUNTIME_CONTEXT_VERSION;
  context_sha256: string;
  documents: Array<{
    document_id: ResearchRuntimeDocumentId;
    path: string;
    sha256: string;
  }>;
}

export function runtimeBindingFromPolicyContext(context: {
  context_version: typeof RESEARCH_RUNTIME_CONTEXT_VERSION;
  context_sha256: string;
  documents: Array<{
    document_id: ResearchRuntimeDocumentId;
    path: string;
    sha256: string;
  }>;
}): ResearchRuntimeBinding {
  return runtimeBindingFromDocumentIdentities(context.documents);
}

export function runtimeBindingFromDocumentIdentities(
  documents: ResearchRuntimeBinding["documents"]
): ResearchRuntimeBinding {
  const exactDocuments = documents.map((document) => ({
    document_id: document.document_id,
    path: document.path,
    sha256: document.sha256
  }));
  const unsigned = {
    binding_version: RESEARCH_RUNTIME_BINDING_VERSION,
    context_version: RESEARCH_RUNTIME_CONTEXT_VERSION,
    documents: exactDocuments
  };
  return {
    ...unsigned,
    context_sha256: createHash("sha256")
      .update(JSON.stringify(unsigned), "utf8")
      .digest("hex")
  };
}

export function sameRuntimeBinding(
  left: ResearchRuntimeBinding,
  right: ResearchRuntimeBinding
): boolean {
  return left.binding_version === right.binding_version &&
    left.context_version === right.context_version &&
    left.context_sha256 === right.context_sha256 &&
    JSON.stringify(left.documents) === JSON.stringify(right.documents);
}
