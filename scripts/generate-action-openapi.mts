import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { generateCustomGptActionOpenApiJson } from
  "./generate-custom-gpt-packet.mts";

const outputUrl = new URL("../docs/custom-gpt-action-openapi.json", import.meta.url);

export function generateActionOpenApiJson(): string {
  return generateCustomGptActionOpenApiJson();
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
