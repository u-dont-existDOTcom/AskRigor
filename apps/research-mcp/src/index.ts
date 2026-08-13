import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { DEFAULT_PORT } from "./config.js";
import { createAskRigorHttpServer } from "./server.js";

export { createAskRigorHttpServer, createAskRigorServer } from "./server.js";
export { createActionOpenApiDocument } from "./actions/openapi.js";
export type {
  ActionRequestContext,
  ActionResult,
  ActionRoute
} from "./actions/types.js";

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const server = createAskRigorHttpServer();

  server.listen(port, "0.0.0.0", () => {
    console.log(`AskRigor MCP server listening on port ${port}`);
  });
}
