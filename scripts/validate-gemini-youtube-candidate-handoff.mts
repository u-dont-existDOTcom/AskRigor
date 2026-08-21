import { readFile } from "node:fs/promises";

import {
  GeminiYoutubeCandidateHandoffError,
  validateGeminiYoutubeCandidateHandoff
} from "@askrigor/sources";

const usage = "Usage: npm run validate:gemini-handoff -- <spark-response-file|->";
const args = process.argv.slice(2);

if (args.length !== 1) {
  console.error(usage);
  process.exitCode = 2;
} else {
  const inputPath = args[0]!;
  try {
    const response = inputPath === "-"
      ? await readFile(0, "utf8")
      : await readFile(inputPath, "utf8");
    const receipt = await validateGeminiYoutubeCandidateHandoff(response, {
      apiKey: process.env.YOUTUBE_API_KEY ?? ""
    });
    console.log(JSON.stringify(receipt, null, 2));
    if (receipt.status !== "accepted") process.exitCode = 1;
  } catch (error) {
    const rejected = error instanceof GeminiYoutubeCandidateHandoffError
      ? {
          packet_name: "askrigor_gemini_youtube_candidate_validation",
          packet_version: "1.0",
          status: "rejected",
          error: { code: error.code, issues: error.issues }
        }
      : {
          packet_name: "askrigor_gemini_youtube_candidate_validation",
          packet_version: "1.0",
          status: "rejected",
          error: {
            code: "validator_runtime_error",
            issues: [{ path: "validator", message: "validation could not complete" }]
          }
        };
    console.log(JSON.stringify(rejected, null, 2));
    process.exitCode = 1;
  }
}
