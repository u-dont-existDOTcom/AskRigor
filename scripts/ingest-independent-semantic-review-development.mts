import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ingestEpistemicRepresentationReview } from "../apps/research-mcp/src/epistemic-representation-review.js";
import {
  RAW_INVALID_STATE_REVIEW_ENVELOPE_VERSION,
  ingestRawInvalidStateRepresentationReview
} from "../evaluation/epistemic-verifier/independent-review-development/raw-invalid-state-review.js";

const [workArgument, submissionArgument, receiptArgument] = process.argv.slice(2);
if (!workArgument || !submissionArgument || !receiptArgument) {
  throw new Error("usage: tsx scripts/ingest-independent-semantic-review-development.mts <work-package.json> <normalized-output.json> <receipt.json>");
}

const work = JSON.parse(await readFile(resolve(workArgument), "utf8"));
const submission = JSON.parse(await readFile(resolve(submissionArgument), "utf8"));
const receipt = work.package_version === RAW_INVALID_STATE_REVIEW_ENVELOPE_VERSION
  ? ingestRawInvalidStateRepresentationReview(work, submission)
  : ingestEpistemicRepresentationReview(work, submission);

await writeFile(resolve(receiptArgument), `${JSON.stringify(receipt, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx"
});
console.log(JSON.stringify({ status: receipt.status, critical_representation: receipt.critical_representation }));
