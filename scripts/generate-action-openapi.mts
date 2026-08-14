import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { createActionOpenApiDocument } from
  "../apps/research-mcp/src/actions/openapi.js";
import { createDefaultActionRoutes } from
  "../apps/research-mcp/src/lessons/runtime.js";

const outputUrl = new URL("../docs/custom-gpt-action-openapi.json", import.meta.url);

export function generateActionOpenApiJson(): string {
  const document = createActionOpenApiDocument(createDefaultActionRoutes());
  return `${JSON.stringify(document, null, 2)}\n`;
}

async function main(): Promise<void> {
  await writeFile(outputUrl, generateActionOpenApiJson(), "utf8");
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await main();
}
