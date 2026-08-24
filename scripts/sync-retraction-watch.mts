import { runRetractionWatchSyncCli } from "../apps/research-mcp/src/retraction-watch-sync-cli.js";

process.exitCode = await runRetractionWatchSyncCli(process.argv.slice(2));
