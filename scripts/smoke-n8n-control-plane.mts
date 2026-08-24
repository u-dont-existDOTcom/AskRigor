import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { validateN8nControlPlaneWorkflow } from
  "../apps/research-mcp/src/n8n-workflow-validator.js";

const IMAGE = "docker.n8n.io/n8nio/n8n@sha256:166d7e3ca384afdffe75394bf00046c299d84a4bf17b19b35d6cf7773af0a147";
const WORKFLOW = resolve("ops/n8n/askrigor-control-plane.workflow.json");
const ADAPTER_KEY = "phase-j-disposable-adapter-key-long-enough";
const EXECUTION_IDS = {
  complete: `arn8n1_${"C".repeat(32)}`,
  bounded: `arn8n1_${"B".repeat(32)}`,
  retry: `arn8n1_${"R".repeat(32)}`,
  blocked: `arn8n1_${"X".repeat(32)}`,
  forged: `arn8n1_${"F".repeat(32)}`,
  continue: `arn8n1_${"N".repeat(32)}`
} as const;

const home = await mkdtemp(join(tmpdir(), "askrigor-n8n-runtime-"));
await chmod(home, 0o700);
const containerName = `askrigor-n8n-phase-j-${process.pid}`;
let n8n: ChildProcess | undefined;
let fixture: Server | undefined;
let logs = "";

try {
  docker([
    "run", "--rm",
    "-v", `${home}:/home/node/.n8n`,
    "-v", `${WORKFLOW}:/data/workflow.json:ro`,
    ...baseEnvironment(),
    IMAGE,
    "import:workflow", "--input=/data/workflow.json"
  ]);
  docker([
    "run", "--rm",
    "-v", `${home}:/home/node/.n8n`,
    ...baseEnvironment(),
    IMAGE,
    "export:workflow", "--id=askrigor-control-plane-v1",
    "--output=/home/node/.n8n/export.json", "--pretty"
  ]);
  const exported: unknown = JSON.parse(await readFile(join(home, "export.json"), "utf8"));
  if (!Array.isArray(exported) || exported.length !== 1) {
    throw new Error("n8n round-trip export was not a single workflow");
  }
  const roundTrip = validateN8nControlPlaneWorkflow(exported[0]);
  docker([
    "run", "--rm",
    "-v", `${home}:/home/node/.n8n`,
    ...baseEnvironment(),
    IMAGE,
    "publish:workflow", "--id=askrigor-control-plane-v1"
  ]);

  const fixtureState = new Map<string, number>();
  fixture = createServer(async (request, response) => {
    if (
      request.method !== "POST" ||
      request.url !== "/internal/n8n/v1/tick" ||
      request.headers.authorization !== `Bearer ${ADAPTER_KEY}`
    ) {
      response.writeHead(401).end();
      return;
    }
    let body = "";
    for await (const chunk of request) body += String(chunk);
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (
      Object.keys(parsed).length !== 1 ||
      typeof parsed.execution_id !== "string"
    ) {
      response.writeHead(422).end();
      return;
    }
    const executionId = parsed.execution_id;
    fixtureState.set(executionId, (fixtureState.get(executionId) ?? 0) + 1);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(fixtureDirective(
      executionId,
      fixtureState.get(executionId)!
    )));
  });
  const fixturePort = await listen(fixture);

  const n8nPortServer = createServer();
  const n8nPort = await listen(n8nPortServer);
  await close(n8nPortServer);
  n8n = spawn("docker", [
    "run", "--rm", "--name", containerName, "--network", "host",
    "-v", `${home}:/home/node/.n8n`,
    ...baseEnvironment(),
    "-e", `N8N_PORT=${n8nPort}`,
    "-e", "N8N_LISTEN_ADDRESS=127.0.0.1",
    "-e", "N8N_HOST=127.0.0.1",
    "-e", "N8N_PROTOCOL=http",
    "-e", "N8N_SECURE_COOKIE=false",
    "-e", "N8N_BLOCK_ENV_ACCESS_IN_NODE=false",
    "-e", "N8N_RUNNERS_ENABLED=false",
    "-e", "N8N_COMMUNITY_PACKAGES_ENABLED=false",
    "-e", "N8N_UNVERIFIED_PACKAGES_ENABLED=false",
    "-e", "N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true",
    "-e", `N8N_WEBHOOK_URL=http://127.0.0.1:${n8nPort}/`,
    "-e", `ASKRIGOR_N8N_ADAPTER_URL=http://127.0.0.1:${fixturePort}`,
    "-e", `ASKRIGOR_N8N_ADAPTER_BEARER=${ADAPTER_KEY}`,
    "-e", "NODES_EXCLUDE=[\"n8n-nodes-base.code\",\"n8n-nodes-base.function\",\"n8n-nodes-base.functionItem\",\"n8n-nodes-base.executeCommand\",\"n8n-nodes-base.readWriteFile\",\"n8n-nodes-base.readBinaryFile\",\"n8n-nodes-base.writeBinaryFile\"]",
    IMAGE
  ], { stdio: ["ignore", "pipe", "pipe"] });
  n8n.stdout?.on("data", (chunk) => { logs = boundedLogs(logs + String(chunk)); });
  n8n.stderr?.on("data", (chunk) => { logs = boundedLogs(logs + String(chunk)); });
  await waitForHealthy(n8nPort, n8n);

  const webhook = new URL(
    `/webhook/askrigor-control-plane-v1`,
    `http://127.0.0.1:${n8nPort}`
  );
  const complete = await invokeWhenRegistered(webhook, EXECUTION_IDS.complete);
  assertCompletion(complete, "complete", "FINALIZATION_ALLOWED");
  const bounded = await invoke(webhook, EXECUTION_IDS.bounded);
  assertCompletion(bounded, "bounded_complete", "BOUNDED_NONRANKING_ONLY");
  const retry = await invoke(webhook, EXECUTION_IDS.retry);
  assertCompletion(retry, "complete", "FINALIZATION_ALLOWED");
  for (const id of [
    EXECUTION_IDS.blocked,
    EXECUTION_IDS.forged,
    EXECUTION_IDS.continue
  ]) {
    const denied = await invoke(webhook, id);
    if (denied.status >= 200 && denied.status < 300) {
      throw new Error(`n8n incorrectly succeeded for ${id}`);
    }
    if (denied.body.includes('"status":"complete"')) {
      throw new Error("n8n emitted completion without a server permit");
    }
  }

  process.stdout.write(`${JSON.stringify({
    smoke_contract: "askrigor_n8n_runtime_smoke_v1",
    image: IMAGE,
    import_export_round_trip: roundTrip.valid,
    comparative_completion_required_permit: true,
    bounded_completion_required_permit: true,
    retry_then_permit_completed: true,
    blocked_rejected: true,
    forged_completion_rejected: true,
    incomplete_rejected: true,
    execution_data_persistence: "disabled",
    private_research_content_sent_to_n8n: false
  }, null, 2)}\n`);
} catch (error) {
  if (logs.length > 0) process.stderr.write(`${logs}\n`);
  throw error;
} finally {
  if (n8n !== undefined && n8n.exitCode === null) {
    try {
      execFileSync("docker", ["stop", "--time", "5", containerName], {
        stdio: "ignore",
        timeout: 15_000
      });
    } catch {
      n8n.kill("SIGKILL");
    }
  }
  if (fixture !== undefined) await close(fixture);
  await rm(home, { recursive: true, force: true });
}

function baseEnvironment(): string[] {
  return [
    "-e", "N8N_DIAGNOSTICS_ENABLED=false",
    "-e", "N8N_PERSONALIZATION_ENABLED=false",
    "-e", "N8N_VERSION_NOTIFICATIONS_ENABLED=false",
    "-e", "N8N_RUNNERS_ENABLED=false",
    "-e", "N8N_COMMUNITY_PACKAGES_ENABLED=false",
    "-e", "N8N_UNVERIFIED_PACKAGES_ENABLED=false",
    "-e", "N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true",
    "-e", "EXECUTIONS_DATA_SAVE_ON_ERROR=none",
    "-e", "EXECUTIONS_DATA_SAVE_ON_SUCCESS=none",
    "-e", "EXECUTIONS_DATA_SAVE_ON_PROGRESS=false",
    "-e", "EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false",
    "-e", "EXECUTIONS_DATA_PRUNE=true",
    "-e", "EXECUTIONS_DATA_MAX_AGE=1",
    "-e", "N8N_ENCRYPTION_KEY=phase-j-disposable-encryption-key-not-a-secret"
  ];
}

function docker(args: string[]): void {
  execFileSync("docker", args, {
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 120_000
  });
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Local smoke server did not bind an IPv4 port");
  }
  return address.port;
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => error === undefined ? resolvePromise() : reject(error));
  });
}

async function waitForHealthy(port: number, process: ChildProcess): Promise<void> {
  const deadline = Date.now() + 55_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error("n8n exited before becoming healthy");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("n8n did not become healthy within the bounded startup window");
}

async function invoke(url: URL, executionId: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ execution_id: executionId })
  });
  return { status: response.status, body: await response.text() };
}

async function invokeWhenRegistered(url: URL, executionId: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = await invoke(url, executionId);
    if (result.status !== 404) return result;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("n8n did not register the published webhook in time");
}

function assertCompletion(
  result: { status: number; body: string },
  status: "complete" | "bounded_complete",
  boundary: "FINALIZATION_ALLOWED" | "BOUNDED_NONRANKING_ONLY"
): void {
  if (result.status !== 200) {
    throw new Error(`n8n completion path returned ${result.status}: ${result.body}`);
  }
  const body = JSON.parse(result.body) as Record<string, unknown>;
  if (
    body.status !== status || body.output_boundary !== boundary ||
    typeof body.permit_payload_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(body.permit_payload_sha256)
  ) throw new Error("n8n completion response lacked the exact permit binding");
}

function fixtureDirective(executionId: string, call: number) {
  const base = {
    control_version: "askrigor_n8n_control_v1",
    execution_id: executionId,
    reason_code: null,
    created_at: "2026-08-24T12:00:00.000Z",
    updated_at: "2026-08-24T12:00:00.000Z"
  };
  if (executionId === EXECUTION_IDS.complete ||
      executionId === EXECUTION_IDS.retry && call > 1) {
    return {
      ...base,
      directive: "COMPLETE",
      permit_verified: true,
      output_boundary: "FINALIZATION_ALLOWED",
      permit_payload_sha256: "a".repeat(64)
    };
  }
  if (executionId === EXECUTION_IDS.bounded) {
    return {
      ...base,
      directive: "BOUNDED_COMPLETE",
      permit_verified: true,
      output_boundary: "BOUNDED_NONRANKING_ONLY",
      permit_payload_sha256: "b".repeat(64)
    };
  }
  if (executionId === EXECUTION_IDS.retry) {
    return {
      ...base,
      directive: "RETRY_AFTER",
      permit_verified: false,
      output_boundary: null,
      reason_code: "RETRYABLE_PROVIDER_FAILURE",
      retry_after_ms: 1_000
    };
  }
  if (executionId === EXECUTION_IDS.forged) {
    return {
      ...base,
      directive: "COMPLETE",
      permit_verified: false,
      output_boundary: "FINALIZATION_ALLOWED",
      permit_payload_sha256: "f".repeat(64)
    };
  }
  if (executionId === EXECUTION_IDS.blocked) {
    return {
      ...base,
      directive: "BLOCKED",
      permit_verified: false,
      output_boundary: null,
      reason_code: "TERMINAL_BOUNDARY"
    };
  }
  return {
    ...base,
    directive: "CONTINUE_NOW",
    permit_verified: false,
    output_boundary: null
  };
}

function boundedLogs(value: string): string {
  return value.length <= 20_000 ? value : value.slice(-20_000);
}
