/**
 * Atlas Release B: the main session's and the owner's list and decisions on claims about named people (design 4.6;
 * Fable's recheck 3 and 4.7), and the list to withdraw before serving an image older than Release B (design 3.3).
 * Run on the server, with the research review role and the pages' reader configured and ASKRIGOR_ATLAS_PERSON_MARK set:
 *
 *   node apps/research-mcp/dist/atlas/person-claims-admin.js queue
 *   node apps/research-mcp/dist/atlas/person-claims-admin.js take-off P-1234 <sentence key> [dispute number] [why]
 *   node apps/research-mcp/dist/atlas/person-claims-admin.js restore P-1234 <sentence key> [dispute number] [why]
 *   node apps/research-mcp/dist/atlas/person-claims-admin.js rollback-list
 *
 * queue prints the open disputes, legal letters and data requests first, one JSON line each; rollback-list prints every
 * publication whose page shows an unverified claim about a person or that isn't read yet: withdraw each (the owner's
 * unpublish_finding) after switching the mark off and before an older image serves.
 */
import { pathToFileURL } from "node:url";

import { PostgresAtlasPageSource, PostgresAtlasPersonClaimStore, type AtlasPageSource } from "@askrigor/evidence-repository";

import { livingEvidenceReuseConfigFromEnv, researchContributionReviewConfigFromEnv } from "../config.js";
import { allShown, type ShownFinding } from "./page-data.js";
import { personSentencesOf } from "./person-claims.js";
import { personMarkSinceFromEnv } from "./person-reading.js";

async function findings(source: AtlasPageSource, raw: boolean): Promise<ShownFinding[]> {
  return await source.read(async (reads) => {
    const all: ShownFinding[] = [];
    for await (const finding of allShown(reads, undefined, true, raw)) all.push(finding);
    return all;
  });
}

export async function runPersonClaimsAdmin(argv: readonly string[], env: NodeJS.ProcessEnv = process.env,
  out: (line: string) => void = (line) => console.log(line)): Promise<number> {
  const [command, publicationNumber, sentenceKey, dispute, ...why] = argv;
  const since = personMarkSinceFromEnv(env);
  const review = researchContributionReviewConfigFromEnv(env);
  const reader = livingEvidenceReuseConfigFromEnv(env);
  if (since === undefined || review === undefined || reader === undefined) {
    out("not configured: ASKRIGOR_ATLAS_PERSON_MARK, the review role and the pages' reader are all needed");
    return 2;
  }
  const store = new PostgresAtlasPersonClaimStore({ connectionString: review.connectionString, schema: review.schema,
    ssl: review.ssl });
  const source = new PostgresAtlasPageSource({ connectionString: reader.connectionString, schema: reader.schema,
    ssl: reader.ssl, personClaimsSince: since });
  try {
    const at = new Date().toISOString();
    if (command === "queue") {
      for (const item of await store.listQueue(200)) out(JSON.stringify(item));
      return 0;
    }
    if (command === "rollback-list") {
      const marked = new Map((await findings(source, false)).map((finding) => [finding.publicationNumber, finding]));
      for (const finding of await findings(source, true)) {
        const shown = marked.get(finding.publicationNumber);
        // Unread, marked, or with a sentence taken off: an older image would show any of them unmarked (Codex, B).
        if (shown === undefined || shown.personClaims?.noindex === true ||
          shown.personClaims?.sentences.some(({ verdict }) => verdict === "taken_off")) out(finding.publicationNumber);
      }
      return 0;
    }
    if ((command === "take-off" || command === "restore") && publicationNumber !== undefined && sentenceKey !== undefined) {
      const disputeNumber = dispute === undefined || dispute === "-" ? null : Number(dispute);
      if (disputeNumber !== null && !Number.isSafeInteger(disputeNumber)) { out("the dispute number is not a number"); return 2; }
      const resolution = why.join(" ").slice(0, 500) || `${command} by the main session`;
      let sentence: string | null = null;
      let foldedNames: string[] = [];
      if (command === "take-off") {
        const finding = (await findings(source, true)).find((item) => item.publicationNumber === publicationNumber);
        sentence = finding === undefined ? null
          : personSentencesOf(finding).find(({ key }) => key === sentenceKey)?.text ?? null;
        if (sentence === null) { out("no such sentence on that publication's pages"); return 1; }
        foldedNames = await source.read(async (reads) => (await reads.personClaims!.readReadings([publicationNumber]))[0]
          ?.sentences.find(({ key }) => key === sentenceKey)?.foldedNames ?? []);
      }
      const done = await store.decide({ publicationNumber, sentenceKey,
        action: command === "take-off" ? "take_off" : "restore", sentence, foldedNames, disputeNumber, resolution, at });
      out(done ? `${command}: done` : `${command}: nothing to change`);
      return done ? 0 : 1;
    }
    out("commands: queue | take-off P-1234 <sentence key> [dispute] [why] | restore P-1234 <sentence key> [dispute] [why] | rollback-list");
    return 2;
  } finally {
    await store.close();
    await (source as PostgresAtlasPageSource).close();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runPersonClaimsAdmin(process.argv.slice(2)).then((code) => { process.exitCode = code; },
    () => { console.error("person claims admin: failed"); process.exitCode = 1; });
}
