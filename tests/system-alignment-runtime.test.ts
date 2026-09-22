import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  PUBLIC_RUNTIME_RESPONSE_MAX_BYTES,
  createPublicRuntimeBundleStore,
  createPublicRuntimeChunk,
  type PublicRuntimeBundle
} from "../apps/research-mcp/src/public-runtime-bundle.js";
import {
  RESEARCH_OPERATIONS,
  researchOperationsForProfile
} from "../apps/research-mcp/src/register-tools.js";
import {
  applyRuntimeRecheck,
  createInitialResearchSessionState,
  projectResearchSessionView,
  protocolBindingsFromManifests
} from "../apps/research-mcp/src/actions/research-session-controller.js";
import type { ResearchRuntimeBinding } from
  "../apps/research-mcp/src/research-runtime-binding.js";
import { generatePublicPluginRuntime } from
  "../scripts/generate-public-plugin-runtime.mts";

const ROOT = new URL("../", import.meta.url);
const NOW = 1_790_000_000_000;
const SECRET = "r".repeat(32);

describe("system-aligned public runtime", () => {
  it("generates every declared public projection and exact packaged reference", async () => {
    const generated = await generatePublicPluginRuntime();
    const committed = await Promise.all(generated.artifacts.map(async (artifact) => ({
      path: artifact.path,
      text: await readFile(new URL(`../${artifact.path}`, import.meta.url), "utf8")
    })));

    expect(committed).toEqual(generated.artifacts);
    expect(generated.manifest.sources.every(({ path }) =>
      !path.includes("AGENTS.md") &&
      !path.includes("DEVELOPMENT_INHERITANCE") &&
      !path.toLowerCase().includes("mission-control")
    )).toBe(true);
    expect(await readFile(
      new URL("../skills/askrigor/references/PROJECT_INSTRUCTIONS.md", import.meta.url),
      "utf8"
    )).toBe(await readFile(
      new URL("../project/PROJECT_INSTRUCTIONS.md", import.meta.url),
      "utf8"
    ));
    expect(await readFile(
      new URL("../skills/askrigor/references/FORUM_SIGNAL_MODULE.md", import.meta.url),
      "utf8"
    )).toBe(await readFile(
      new URL("../project/FORUM_SIGNAL_MODULE.md", import.meta.url),
      "utf8"
    ));
  });

  it("keeps legacy, standard-v2 and Gemini capability profiles explicit", () => {
    const legacy = researchOperationsForProfile("legacy");
    const standard = researchOperationsForProfile("standard-v2");
    const gemini = researchOperationsForProfile("gemini");

    expect(legacy).toHaveLength(27);
    expect(legacy.some(({ name }) => name === "load_research_runtime")).toBe(false);
    expect(standard).toHaveLength(28);
    expect(standard.at(3)?.name).toBe("load_research_runtime");
    expect(gemini.some(({ name }) => name === "load_research_runtime")).toBe(false);
    expect(RESEARCH_OPERATIONS).toEqual(standard);
  });

  it("reconstructs an immutable escaped Unicode bundle within the serialized response ceiling", async () => {
    const firstBundle = syntheticBundle("alpha 😀 café \\\"\n\t".repeat(8_000));
    const store = createPublicRuntimeBundleStore({
      loadCurrentBundle: async () => firstBundle,
      maximumEntries: 2
    });
    const chunks = [];
    let input: { profile?: "standard-v2"; continuation_handle?: string } = {
      profile: "standard-v2"
    };
    do {
      const chunk = await createPublicRuntimeChunk(input, {
        continuationSecret: SECRET,
        now: () => NOW,
        store
      });
      chunks.push(chunk);
      expect(Buffer.byteLength(JSON.stringify(chunk), "utf8"))
        .toBeLessThanOrEqual(PUBLIC_RUNTIME_RESPONSE_MAX_BYTES);
      input = { continuation_handle: chunk.next_handle };
    } while (input.continuation_handle !== undefined);

    expect(Buffer.concat(chunks.map(({ text }) => Buffer.from(text, "utf8"))))
      .toEqual(firstBundle.bytes);
    expect(chunks.map(({ chunk_index }) => chunk_index)).toEqual(
      Array.from({ length: chunks.length }, (_, index) => index)
    );
    expect(chunks.at(-1)).toMatchObject({ complete: true });
    expect(chunks.at(-1)?.next_handle).toBeUndefined();
  });

  it("rejects tampering, expiry, reordered or skipped pages, and an evicted source chain", async () => {
    let current = syntheticBundle("one 😀".repeat(20_000));
    const store = createPublicRuntimeBundleStore({
      loadCurrentBundle: async () => current,
      maximumEntries: 1
    });
    const dependencies = {
      continuationSecret: SECRET,
      now: () => NOW,
      store
    };
    const first = await createPublicRuntimeChunk(
      { profile: "standard-v2" },
      dependencies
    );
    expect(first.next_handle).toBeDefined();

    const changed = `${first.next_handle!.slice(0, -1)}A`;
    await expect(createPublicRuntimeChunk(
      { continuation_handle: changed },
      dependencies
    )).rejects.toThrow(/invalid/iu);
    await expect(createPublicRuntimeChunk(
      { continuation_handle: first.next_handle },
      { ...dependencies, now: () => NOW + 3_600_000 }
    )).rejects.toThrow(/expired/iu);

    const second = await createPublicRuntimeChunk(
      { continuation_handle: first.next_handle },
      dependencies
    );
    await expect(createPublicRuntimeChunk(
      { continuation_handle: first.next_handle },
      dependencies
    )).rejects.toThrow(/order|replayed/iu);
    if (second.next_handle !== undefined) {
      await expect(createPublicRuntimeChunk(
        { continuation_handle: second.next_handle },
        dependencies
      )).resolves.toMatchObject({ chunk_index: 2 });
    }

    current = syntheticBundle("changed source".repeat(20_000));
    await createPublicRuntimeChunk({ profile: "standard-v2" }, dependencies);
    await expect(createPublicRuntimeChunk(
      { continuation_handle: first.next_handle },
      dependencies
    )).rejects.toThrow(/changed|unavailable/iu);
  });

  it("continues a retained immutable chain after the current source changes", async () => {
    const original = syntheticBundle("original 😀".repeat(20_000));
    const replacement = syntheticBundle("replacement café".repeat(20_000));
    let current = original;
    const store = createPublicRuntimeBundleStore({
      loadCurrentBundle: async () => current,
      maximumEntries: 2
    });
    const dependencies = {
      continuationSecret: SECRET,
      now: () => NOW,
      store
    };
    const chunks = [await createPublicRuntimeChunk(
      { profile: "standard-v2" },
      dependencies
    )];
    current = replacement;
    await createPublicRuntimeChunk({ profile: "standard-v2" }, dependencies);

    while (chunks.at(-1)?.next_handle !== undefined) {
      chunks.push(await createPublicRuntimeChunk({
        continuation_handle: chunks.at(-1)!.next_handle
      }, dependencies));
    }

    expect(Buffer.concat(chunks.map(({ text }) => Buffer.from(text, "utf8"))))
      .toEqual(original.bytes);
    expect(chunks.every(({ bundle_sha256 }) =>
      bundle_sha256 === original.bundle_sha256
    )).toBe(true);
  });

  it("accepts an empty public document without losing bundle identity", async () => {
    const bundle = syntheticBundle("");
    const store = createPublicRuntimeBundleStore({
      loadCurrentBundle: async () => bundle,
      maximumEntries: 1
    });
    const first = await createPublicRuntimeChunk({ profile: "standard-v2" }, {
      continuationSecret: SECRET,
      now: () => NOW,
      store
    });
    expect(first.document_hashes).toContainEqual({
      document_id: "synthetic",
      sha256: sha256("")
    });
  });

  it("turns a module-only source change into explicit policy drift", () => {
    const original = syntheticRuntimeBinding("1".repeat(64));
    const observed = syntheticRuntimeBinding("2".repeat(64));
    const state = createInitialResearchSessionState({
      research_target: "Synthetic bounded treatment comparison",
      diagnosis_status: "user_supplied_diagnosis"
    }, protocolBindingsFromManifests(
      syntheticProtocolManifest("Universal", "3".repeat(64)),
      syntheticProtocolManifest("HRP", "4".repeat(64))
    ), original);

    const drifted = applyRuntimeRecheck(state, observed);
    const view = projectResearchSessionView(
      "ars1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      drifted
    );
    expect(drifted.protocol_binding.currency).toBe("CURRENT");
    expect(drifted.runtime_binding).toMatchObject({
      expected: original,
      currency: "DRIFTED",
      observed_current: observed,
      drift_reason: "POLICY_SOURCE_CHANGED"
    });
    expect(view).toMatchObject({
      execution_status: "POLICY_DRIFT",
      required_next_capabilities: ["restart_under_current_protocols"]
    });
  });
});

function syntheticBundle(text: string): PublicRuntimeBundle {
  const document = {
    document_id: "synthetic",
    path: "synthetic.txt",
    sha256: sha256(text),
    utf8_bytes: Buffer.byteLength(text, "utf8"),
    text
  };
  const serialized = `${JSON.stringify({
    format_version: "askrigor_public_runtime_bundle_v1",
    profile: "standard-v2",
    documents: [document]
  })}\n`;
  const bytes = Buffer.from(serialized, "utf8");
  return Object.freeze({
    format_version: "askrigor_public_runtime_bundle_v1",
    profile: "standard-v2",
    release_manifest_sha256: sha256("manifest"),
    bundle_sha256: sha256(bytes),
    document_hashes: Object.freeze([{
      document_id: document.document_id,
      sha256: document.sha256
    }]),
    bytes
  });
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function syntheticRuntimeBinding(projectSha256: string): ResearchRuntimeBinding {
  const documents = [
    ["universal", "protocols/Universal_Instructions.xml", "3".repeat(64)],
    ["hrp", "protocols/HRP_Full.xml", "4".repeat(64)],
    ["project_router", "project/PROJECT_INSTRUCTIONS.md", projectSha256],
    ["forum_signal_module", "project/FORUM_SIGNAL_MODULE.md", "5".repeat(64)]
  ] as const;
  return {
    binding_version: "askrigor_research_runtime_binding_v1",
    context_version: "askrigor_semantic_policy_context_v1",
    context_sha256: sha256(documents.flat().join("\0")),
    documents: documents.map(([document_id, path, digest]) => ({
      document_id,
      path,
      sha256: digest
    }))
  };
}

function syntheticProtocolManifest(name: string, digest: string) {
  return {
    name,
    version: "test",
    revisionDate: "2026-09-22",
    sha256: digest
  };
}
