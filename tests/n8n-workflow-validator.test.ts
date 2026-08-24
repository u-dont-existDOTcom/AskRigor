import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  validateN8nControlPlaneWorkflow
} from "../apps/research-mcp/src/n8n-workflow-validator.js";

let canonical: Record<string, any>;

beforeAll(async () => {
  canonical = JSON.parse(await readFile(resolve(
    process.cwd(),
    "ops/n8n/askrigor-control-plane.workflow.json"
  ), "utf8")) as Record<string, any>;
});

describe("n8n workflow enforcement", () => {
  it("accepts the exact safe tracked workflow", () => {
    expect(validateN8nControlPlaneWorkflow(canonical)).toMatchObject({
      valid: true,
      node_count: 14,
      public_inventory_changed: false,
      successful_terminal_nodes: [
        "Release Comparative Completion",
        "Release Bounded Completion"
      ]
    });
  });

  it("rejects a direct incomplete-to-success rewire", () => {
    const mutated = copy();
    mutated.connections["Use AskRigor Directive"].main[0] = [{
      node: "Release Comparative Completion",
      type: "main",
      index: 0
    }];
    expectRejected(mutated);
  });

  it("rejects bypassing either final permit guard", () => {
    const mutated = copy();
    mutated.connections["Require Comparative Permit"].main[0][0].node =
      "Stop Without Permit";
    expectRejected(mutated);
  });

  it("rejects quota logic, caller completion claims, or private research fields", () => {
    for (const injection of [
      "candidate_count >= 8",
      "all_work_done=true",
      "research_target",
      "session_id"
    ]) {
      const mutated = copy();
      mutated.nodes.find((node: any) => node.name === "Use AskRigor Directive")
        .parameters.owner_authored_rule = injection;
      expectRejected(mutated);
    }
  });

  it("rejects code, command, file, or extra success nodes", () => {
    for (const type of [
      "n8n-nodes-base.code",
      "n8n-nodes-base.executeCommand",
      "n8n-nodes-base.readWriteFile",
      "n8n-nodes-base.respondToWebhook"
    ]) {
      const mutated = copy();
      mutated.nodes.find((node: any) => node.name === "Bounded Retry Wait")
        .type = type;
      expectRejected(mutated);
    }
  });

  it("rejects embedded credentials, unbounded retries, or pinned private data", () => {
    const credentialed = copy();
    credentialed.nodes.find((node: any) => node.name === "AskRigor Tick")
      .credentials = { httpHeaderAuth: { id: "secret", name: "secret" } };
    expectRejected(credentialed);

    const unbounded = copy();
    unbounded.nodes.find((node: any) => node.name === "AskRigor Tick")
      .maxTries = 999;
    expectRejected(unbounded);

    const pinned = copy();
    pinned.pinData = { "AskRigor Tick": [{ json: { private: "content" } }] };
    expectRejected(pinned);
  });

  it("rejects endpoint or environment-secret exfiltration mutations", () => {
    const externalEndpoint = copy();
    externalEndpoint.nodes.find((node: any) => node.name === "AskRigor Tick")
      .parameters.url = "https://example.invalid/collect";
    expectRejected(externalEndpoint);

    const unrelatedSecret = copy();
    unrelatedSecret.nodes.find((node: any) => node.name === "AskRigor Tick")
      .parameters.headerParameters.parameters.push({
        name: "X-Unrelated-Secret",
        value: "={{ $env.UNRELATED_SECRET }}"
      });
    expectRejected(unrelatedSecret);
  });

  it("rejects parameter additions and expanded success responses", () => {
    const extraParameter = copy();
    extraParameter.nodes.find((node: any) =>
      node.name === "Use AskRigor Directive"
    ).parameters.unreviewed_option = true;
    expectRejected(extraParameter);

    const expandedResponse = copy();
    expandedResponse.nodes.find((node: any) =>
      node.name === "Release Comparative Completion"
    ).parameters.responseBody =
      "={{ { status: 'complete', execution_id: $json.execution_id, " +
      "output_boundary: $json.output_boundary, " +
      "permit_payload_sha256: $json.permit_payload_sha256, " +
      "private_detail: $json.private_detail } }}";
    expectRejected(expandedResponse);
  });
});

function copy(): Record<string, any> {
  return structuredClone(canonical);
}

function expectRejected(workflow: unknown): void {
  expect(() => validateN8nControlPlaneWorkflow(workflow)).toThrow(
    "Invalid AskRigor n8n control-plane workflow"
  );
}
