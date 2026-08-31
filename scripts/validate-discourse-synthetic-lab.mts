import { readFile } from "node:fs/promises";

import { discourseSyntheticLabManifestSchema } from "../packages/contracts/src/index.js";

const manifestUrl = new URL(
  "../labs/discourse-synthetic/lab-manifest.json",
  import.meta.url,
);
const composeUrl = new URL(
  "../labs/discourse-synthetic/compose.yaml",
  import.meta.url,
);

const manifest = discourseSyntheticLabManifestSchema.parse(
  JSON.parse(await readFile(manifestUrl, "utf8")) as unknown,
);
const compose = await readFile(composeUrl, "utf8");

const required = [
  `${manifest.discourse.image}@${manifest.discourse.imageDigest}`,
  `platform: ${manifest.discourse.platform}`,
  `${manifest.hostBind}:\${ASKRIGOR_DISCOURSE_HTTP_PORT:-33000}:3000`,
  'com.askrigor.synthetic-only: "true"',
  'com.askrigor.real-health-data-allowed: "false"',
  'com.askrigor.public-deployment-authorized: "false"',
];
for (const token of required) {
  if (!compose.includes(token))
    throw new Error(`DISCOURSE_SYNTHETIC_LAB_COMPOSE_MISMATCH token=${token}`);
}
for (const forbidden of [
  "0.0.0.0:",
  "network_mode: host",
  "restart: always",
  ":8025",
  "MAIL_CAPTURE_PORT",
]) {
  if (compose.includes(forbidden))
    throw new Error(
      `DISCOURSE_SYNTHETIC_LAB_FORBIDDEN_CONFIG token=${forbidden}`,
    );
}

process.stdout.write(
  `${JSON.stringify({
    status: "pass",
    lab_id: manifest.labId,
    discourse_commit: manifest.discourse.commit,
    discourse_image_digest: manifest.discourse.imageDigest,
    host_bind: manifest.hostBind,
    synthetic_only: manifest.syntheticOnly,
    real_health_data_allowed: manifest.realHealthDataAllowed,
    public_dns_allowed: manifest.publicDnsAllowed,
    public_indexing_allowed: manifest.publicIndexingAllowed,
    outbound_email_mode: manifest.outboundEmailMode,
    research_recruitment_allowed: manifest.researchRecruitmentAllowed,
    regulatory_automation_allowed: manifest.regulatoryAutomationAllowed,
  })}\n`,
);
