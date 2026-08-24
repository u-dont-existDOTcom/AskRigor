import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateN8nControlPlaneWorkflow } from
  "../apps/research-mcp/src/n8n-workflow-validator.js";

const path = resolve(
  process.cwd(),
  process.argv[2] ?? "ops/n8n/askrigor-control-plane.workflow.json"
);
const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
const workflow: unknown = Array.isArray(parsed) && parsed.length === 1
  ? parsed[0]
  : parsed;
process.stdout.write(`${JSON.stringify(validateN8nControlPlaneWorkflow(workflow), null, 2)}\n`);
