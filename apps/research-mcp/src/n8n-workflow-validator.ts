import { createHash } from "node:crypto";

import { z } from "zod";

const EXPECTED_NODES = new Map<string, string>([
  ["Receive Opaque Execution ID", "n8n-nodes-base.webhook"],
  ["AskRigor Tick", "n8n-nodes-base.httpRequest"],
  ["Use AskRigor Directive", "n8n-nodes-base.switch"],
  ["Bounded Retry Wait", "n8n-nodes-base.wait"],
  ["AskRigor Retry Tick", "n8n-nodes-base.httpRequest"],
  ["Use Retry Directive", "n8n-nodes-base.switch"],
  ["Require Comparative Permit", "n8n-nodes-base.if"],
  ["Require Bounded Permit", "n8n-nodes-base.if"],
  ["Release Comparative Completion", "n8n-nodes-base.respondToWebhook"],
  ["Release Bounded Completion", "n8n-nodes-base.respondToWebhook"],
  ["Stop Without Permit", "n8n-nodes-base.stopAndError"],
  ["Stop Incomplete Research", "n8n-nodes-base.stopAndError"],
  ["Reject Incomplete Response", "n8n-nodes-base.respondToWebhook"],
  ["Reject Permit Response", "n8n-nodes-base.respondToWebhook"]
]);

// This hash binds every execution-relevant tracked workflow field, including
// complete node parameters, node retry settings, connections, workflow
// settings, active state, and pinned data. n8n may add or revise top-level
// export metadata during an import/export round trip, so that metadata is
// deliberately excluded from the projection. Any executable mutation must be
// reviewed here and in the tracked workflow rather than passing a loose set of
// substring checks.
const EXPECTED_WORKFLOW_SECURITY_PROJECTION_SHA256 =
  "83e176d51d7b3bbd447b5c380f26e01acc29b975b401a770121c48f1337358c0";

const nodeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: z.string().min(1),
  typeVersion: z.number().positive(),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.string(), z.unknown())
}).passthrough();

const workflowSchema = z.object({
  name: z.literal("AskRigor Server-Controlled Research Pilot"),
  nodes: z.array(nodeSchema),
  connections: z.record(z.string(), z.unknown()),
  active: z.literal(false),
  settings: z.object({
    executionOrder: z.literal("v1"),
    saveManualExecutions: z.literal(false),
    saveExecutionProgress: z.literal(false)
  }).passthrough(),
  pinData: z.record(z.string(), z.unknown())
}).passthrough();

export interface N8nWorkflowValidationReceipt {
  workflow_contract: "askrigor_n8n_workflow_validation_v1";
  valid: true;
  workflow_sha256: string;
  node_count: number;
  successful_terminal_nodes: readonly [
    "Release Comparative Completion",
    "Release Bounded Completion"
  ];
  public_inventory_changed: false;
}

export function validateN8nControlPlaneWorkflow(
  rawWorkflow: unknown
): N8nWorkflowValidationReceipt {
  const workflow = workflowSchema.parse(rawWorkflow);
  if (
    workflowSecurityProjectionSha256(workflow) !==
      EXPECTED_WORKFLOW_SECURITY_PROJECTION_SHA256
  ) fail();
  if (workflow.nodes.length !== EXPECTED_NODES.size) fail();
  const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));
  if (nodes.size !== EXPECTED_NODES.size) fail();
  for (const [name, type] of EXPECTED_NODES) {
    const node = nodes.get(name);
    if (node?.type !== type || "credentials" in node || node.disabled === true) fail();
  }
  if (Object.keys(workflow.pinData).length !== 0) fail();

  const serialized = JSON.stringify(workflow);
  for (const forbidden of [
    "research_target",
    "diagnosis_status",
    "semantic_work",
    "session_id",
    "completed_operation_count",
    "completed_operations",
    "all_work_done",
    "synthesis_permitted",
    "candidate_count",
    "paper_count",
    "video_count",
    "protocol_manifest",
    "source_corpus"
  ]) {
    if (serialized.includes(forbidden)) fail();
  }

  for (const name of ["AskRigor Tick", "AskRigor Retry Tick"]) {
    const node = nodes.get(name)!;
    const parameters = JSON.stringify(node.parameters);
    if (
      node.retryOnFail !== true || node.maxTries !== 3 ||
      node.waitBetweenTries !== 1_000 ||
      !parameters.includes("ASKRIGOR_N8N_ADAPTER_URL") ||
      !parameters.includes("/internal/n8n/v1/tick") ||
      !parameters.includes("ASKRIGOR_N8N_ADAPTER_BEARER") ||
      !parameters.includes("execution_id")
    ) fail();
  }

  const primaryTargets = connectionTargets(
    workflow.connections,
    "Use AskRigor Directive"
  );
  expectTargets(primaryTargets, [
    ["Bounded Retry Wait"],
    ["Bounded Retry Wait"],
    ["Reject Incomplete Response"],
    ["Reject Incomplete Response"],
    ["Reject Incomplete Response"],
    ["Require Comparative Permit"],
    ["Require Bounded Permit"],
    ["Reject Permit Response"]
  ]);
  const retryTargets = connectionTargets(
    workflow.connections,
    "Use Retry Directive"
  );
  expectTargets(retryTargets, [
    ["Require Comparative Permit"],
    ["Require Bounded Permit"],
    ["Reject Incomplete Response"]
  ]);

  assertExactTarget(
    workflow.connections,
    "Receive Opaque Execution ID",
    "AskRigor Tick"
  );
  assertExactTarget(workflow.connections, "AskRigor Tick", "Use AskRigor Directive");
  assertExactTarget(workflow.connections, "Bounded Retry Wait", "AskRigor Retry Tick");
  assertExactTarget(workflow.connections, "AskRigor Retry Tick", "Use Retry Directive");
  expectTargets(connectionTargets(
    workflow.connections,
    "Require Comparative Permit"
  ), [
    ["Release Comparative Completion"],
    ["Reject Permit Response"]
  ]);
  expectTargets(connectionTargets(
    workflow.connections,
    "Require Bounded Permit"
  ), [
    ["Release Bounded Completion"],
    ["Reject Permit Response"]
  ]);
  assertExactTarget(
    workflow.connections,
    "Reject Incomplete Response",
    "Stop Incomplete Research"
  );
  assertExactTarget(
    workflow.connections,
    "Reject Permit Response",
    "Stop Without Permit"
  );

  assertGuard(
    nodes.get("Require Comparative Permit")!,
    "FINALIZATION_ALLOWED"
  );
  assertGuard(
    nodes.get("Require Bounded Permit")!,
    "BOUNDED_NONRANKING_ONLY"
  );
  for (const name of [
    "Release Comparative Completion",
    "Release Bounded Completion"
  ]) {
    const response = JSON.stringify(nodes.get(name)!.parameters);
    if (
      !response.includes("execution_id") ||
      !response.includes("output_boundary") ||
      !response.includes("permit_payload_sha256")
    ) fail();
  }
  for (const name of ["Reject Incomplete Response", "Reject Permit Response"]) {
    const response = JSON.stringify(nodes.get(name)!.parameters);
    if (!response.includes('"responseCode":409')) fail();
  }

  const terminalNames = workflow.nodes
    .filter(({ name }) => workflow.connections[name] === undefined)
    .map(({ name }) => name)
    .sort();
  expectStringList(terminalNames, [
    "Release Bounded Completion",
    "Release Comparative Completion",
    "Stop Incomplete Research",
    "Stop Without Permit"
  ]);
  for (const node of workflow.nodes) {
    if (node.type === "n8n-nodes-base.respondToWebhook") {
      const success = node.name === "Release Comparative Completion" ||
        node.name === "Release Bounded Completion";
      const responseCode = (node.parameters.options as Record<string, unknown>)
        ?.responseCode;
      if (success ? responseCode !== 200 : responseCode !== 409) fail();
    }
  }

  return Object.freeze({
    workflow_contract: "askrigor_n8n_workflow_validation_v1",
    valid: true,
    workflow_sha256: createHash("sha256")
      .update(JSON.stringify(rawWorkflow))
      .digest("hex"),
    node_count: workflow.nodes.length,
    successful_terminal_nodes: [
      "Release Comparative Completion",
      "Release Bounded Completion"
    ] as const,
    public_inventory_changed: false
  });
}

function workflowSecurityProjectionSha256(
  workflow: z.output<typeof workflowSchema>
): string {
  const projection = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    active: workflow.active,
    settings: workflow.settings,
    pinData: workflow.pinData
  };
  return createHash("sha256")
    .update(stableJson(projection))
    .digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertGuard(node: z.output<typeof nodeSchema>, boundary: string): void {
  const parameters = JSON.stringify(node.parameters);
  if (
    !parameters.includes("permit_verified") ||
    !parameters.includes(boundary) ||
    !parameters.includes("permit_payload_sha256")
  ) fail();
}

function connectionTargets(
  connections: Record<string, unknown>,
  nodeName: string
): string[][] {
  const parsed = z.object({
    main: z.array(z.array(z.object({
      node: z.string(),
      type: z.literal("main"),
      index: z.literal(0)
    }).strict()))
  }).strict().parse(connections[nodeName]);
  return parsed.main.map((output) => output.map(({ node }) => node));
}

function assertExactTarget(
  connections: Record<string, unknown>,
  from: string,
  to: string
): void {
  expectTargets(connectionTargets(connections, from), [[to]]);
}

function expectTargets(actual: string[][], expected: string[][]): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail();
}

function expectStringList(actual: string[], expected: string[]): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail();
}

function fail(): never {
  throw new Error("Invalid AskRigor n8n control-plane workflow");
}
