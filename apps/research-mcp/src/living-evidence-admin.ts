import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  PostgresEvidenceRepository,
  assertNoProhibitedPersistentKeys,
  researchFrontierContributionSchema,
  stableJson,
} from "@askrigor/evidence-repository";
import { getProtocolManifest } from "@askrigor/protocol";
import { auditableDocumentIndexSchema } from "@askrigor/sources";
import { z } from "zod";

import { createValidatedStudyAuditContribution } from "./actions/study-audit-reuse.js";
import { studyMethodAuditReceiptSchema } from "./actions/study-method-audit.js";

const MAX_IMPORT_BYTES = 64 * 1_024 * 1_024;

export const validatedStudyAuditImportSchema = z.object({
  document_index: auditableDocumentIndexSchema,
  audit_receipt: studyMethodAuditReceiptSchema,
  analysis_started_at: z.iso.datetime({ offset: true }),
  analysis_completed_at: z.iso.datetime({ offset: true }),
  freshness: z.object({
    checked_at: z.iso.datetime({ offset: true }),
    next_due_at: z.iso.datetime({ offset: true }),
    receipt_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.document_index.source.doi === undefined) {
    context.addIssue({ code: "custom", message: "a canonical DOI is required" });
  }
  if (Date.parse(value.analysis_started_at) > Date.parse(value.analysis_completed_at)) {
    context.addIssue({ code: "custom", message: "analysis completion precedes its start" });
  }
  if (Date.parse(value.freshness.checked_at) >= Date.parse(value.freshness.next_due_at)) {
    context.addIssue({ code: "custom", message: "freshness next-due time must be later" });
  }
});

export type ValidatedStudyAuditImport = z.output<typeof validatedStudyAuditImportSchema>;

export async function prepareValidatedStudyAuditImport(raw: unknown) {
  const input = validatedStudyAuditImportSchema.parse(raw);
  const protocolManifests = await Promise.all([
    getProtocolManifest("universal"),
    getProtocolManifest("hrp"),
  ]);
  const contribution = createValidatedStudyAuditContribution({
    index: input.document_index,
    auditReceipt: input.audit_receipt,
    protocolManifests,
    startedAt: input.analysis_started_at,
    completedAt: input.analysis_completed_at,
    freshness: {
      checkedAt: input.freshness.checked_at,
      nextDueAt: input.freshness.next_due_at,
      receiptSha256: input.freshness.receipt_sha256,
    },
  });
  assertNoProhibitedPersistentKeys(contribution);
  return contribution;
}

export async function prepareResearchFrontierImport(raw: unknown) {
  const contribution = researchFrontierContributionSchema.parse(raw);
  const current = await Promise.all([
    getProtocolManifest("universal"),
    getProtocolManifest("hrp"),
  ]);
  const expected = current
    .map(({ name, version, revisionDate, sha256 }) => ({ name, version, revisionDate, sha256 }))
    .sort((left, right) => left.sha256.localeCompare(right.sha256));
  const supplied = [...contribution.run.protocolManifests]
    .map(({ name, version, revisionDate, sha256 }) => ({ name, version, revisionDate, sha256 }))
    .sort((left, right) => left.sha256.localeCompare(right.sha256));
  if (stableJson(supplied) !== stableJson(expected)) {
    throw new Error("FRONTIER_PROTOCOL_MANIFEST_MISMATCH");
  }
  assertNoProhibitedPersistentKeys(contribution);
  return contribution;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== "migrate" && command !== "import-study-audit" && command !== "import-frontier") {
    throw new Error("usage: living-evidence-admin <migrate|import-study-audit|import-frontier>");
  }
  const config = adminConfig(process.env);
  const repository = new PostgresEvidenceRepository(config);
  try {
    if (command === "migrate") {
      await repository.migrate();
      writeReceipt({
        receipt_schema: "askrigor.living-evidence.admin-receipt.v1",
        operation: "migrate",
        status: "complete",
        schema: config.schema,
      });
      return;
    }
    const raw = JSON.parse(await readBoundedStdin());
    if (command === "import-frontier") {
      const contribution = await prepareResearchFrontierImport(raw);
      const receipt = await repository.contributeFrontier(contribution);
      writeReceipt({
        receipt_schema: "askrigor.living-evidence.admin-receipt.v1",
        operation: "import-frontier",
        status: "complete",
        schema: config.schema,
        contribution: receipt,
        source_content_persisted: false,
        community_data_persisted: false,
      });
      return;
    }
    const contribution = await prepareValidatedStudyAuditImport(raw);
    const receipt = await repository.contribute(contribution);
    writeReceipt({
      receipt_schema: "askrigor.living-evidence.admin-receipt.v1",
      operation: "import-study-audit",
      status: "complete",
      schema: config.schema,
      contribution: receipt,
      source_content_persisted: false,
    });
  } finally {
    await repository.close();
  }
}

function adminConfig(env: NodeJS.ProcessEnv) {
  const connectionString = env.ASKRIGOR_LIVING_EVIDENCE_WRITER_DATABASE_URL?.trim();
  const schema = env.ASKRIGOR_LIVING_EVIDENCE_SCHEMA?.trim() || "living_evidence";
  const sslMode = env.ASKRIGOR_LIVING_EVIDENCE_WRITER_SSLMODE?.trim() || "disable";
  if (
    connectionString === undefined || connectionString.length === 0 ||
    !/^[a-z][a-z0-9_]{0,62}$/u.test(schema) ||
    (sslMode !== "disable" && sslMode !== "require")
  ) {
    throw new Error("Living-evidence admin configuration unavailable");
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Living-evidence admin configuration unavailable");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Living-evidence admin configuration unavailable");
  }
  return {
    connectionString,
    schema,
    ssl: sslMode === "require" ? { rejectUnauthorized: false } as const : false as const,
    connectionTimeoutMillis: 5_000,
    queryTimeoutMillis: 30_000,
    statementTimeoutMillis: 30_000,
  };
}

async function readBoundedStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_IMPORT_BYTES) throw new Error("Living-evidence import exceeds 64 MiB");
    chunks.push(buffer);
  }
  if (bytes === 0) throw new Error("Living-evidence import is empty");
  return Buffer.concat(chunks).toString("utf8");
}

function writeReceipt(value: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

const invokedPath = process.argv[1] === undefined
  ? undefined
  : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  main().catch((error: unknown) => {
    const code = error instanceof z.ZodError
      ? "IMPORT_VALIDATION_FAILED"
      : error instanceof SyntaxError
        ? "IMPORT_JSON_INVALID"
        : "ADMIN_OPERATION_FAILED";
    process.stderr.write(`${JSON.stringify({
      receipt_schema: "askrigor.living-evidence.admin-error.v1",
      status: "failed",
      code,
    })}\n`);
    process.exitCode = 1;
  });
}
