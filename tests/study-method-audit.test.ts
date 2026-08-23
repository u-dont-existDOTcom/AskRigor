import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  STUDY_METHOD_AUDIT_DOMAINS,
  studyMethodAuditSubmissionSchema,
  validateStudyMethodAudit,
  type StudyMethodAuditSubmission
} from "../apps/research-mcp/src/index.js";
import {
  indexJatsStudyDocument,
  type EuropePmcFullTextArticle
} from "../packages/sources/src/index.js";

async function sourceIndex() {
  const xml = await readFile(
    new URL("fixtures/europe-pmc/full-text.xml", import.meta.url),
    "utf8"
  );
  const article: EuropePmcFullTextArticle = {
    pmcid: "PMC1234567",
    pmid: "40123456",
    doi: "10.1234/recorded.example",
    title: "Recorded full-text study",
    format: "jats_xml",
    document_completeness: "full_text_with_body",
    content_sha256: createHash("sha256").update(xml, "utf8").digest("hex"),
    content_bytes: Buffer.byteLength(xml, "utf8"),
    xml
  };
  return indexJatsStudyDocument(article);
}

async function submission(): Promise<StudyMethodAuditSubmission> {
  const index = await sourceIndex();
  const methodsBlock = index.blocks.find(({ section_path }) =>
    section_path.includes("Methods")
  )!.block_id;
  const resultsBlock = index.blocks.find(({ section_path }) =>
    section_path.includes("Results")
  )!.block_id;
  return {
    source_primary_identifier: index.source.pmcid,
    source_content_sha256: index.source.content_sha256,
    design_label: "randomized parallel-group comparison",
    design_capability_statement: "Random assignment can support the assigned contrast if implementation, follow-up, analysis, and reporting are adequate; it is not a reliability verdict.",
    population_and_stage: "Adults meeting the study eligibility criteria; transport beyond that population remains limited.",
    intervention_program: {
      name: "supervised progressive resistance program",
      components: ["progressive lower-body resistance exercises", "supervised sessions"],
      dose_or_intensity: "program intensity recorded in the methods",
      frequency: "session frequency recorded in the methods",
      duration: "twelve weeks",
      supervision: "supervised",
      adherence: "attendance measured",
      co_interventions: [],
      care_stage: "nonsurgical"
    },
    comparator_program: {
      name: "specified comparator program",
      components: ["comparator components recorded in the methods"],
      dose_or_intensity: "recorded in the methods",
      frequency: "recorded in the methods",
      duration: "twelve weeks",
      supervision: "recorded in the methods",
      adherence: "recorded separately",
      co_interventions: [],
      care_stage: "nonsurgical"
    },
    outcome_and_horizon: "Function at twelve weeks; longer-term durability remains outside this fixture.",
    domain_findings: STUDY_METHOD_AUDIT_DOMAINS.map((domain, index) => ({
      domain,
      status: index === 12 ? "unclear" as const : "limitation_identified" as const,
      plain_language_finding: index === 12
        ? "Independent replication was not described in the indexed fixture."
        : `The ${domain.replaceAll("_", " ")} domain was inspected and retains a stated limitation.`,
      evidence_block_ids: index === 12 ? [] : [index % 2 === 0 ? methodsBlock : resultsBlock],
      unresolved_fields: index === 12 ? ["independent replication"] : []
    })),
    claim_capabilities: [
      {
        claim: "The exact assigned programs can be compared for the recorded functional outcome at twelve weeks.",
        capability: "can_support",
        reason: "The methods and results blocks record the assigned programs and outcome horizon.",
        evidence_block_ids: [methodsBlock, resultsBlock]
      },
      {
        claim: "Every form of exercise has been compared with every alternative treatment.",
        capability: "cannot_support",
        reason: "Only the exact programs and population in this study were inspected.",
        evidence_block_ids: []
      }
    ]
  };
}

describe("study-method audit receipts", () => {
  it("binds every audit domain and claim capability to one exact full-text index", async () => {
    const index = await sourceIndex();
    const audit = await submission();

    const receipt = validateStudyMethodAudit(index, audit);

    expect(receipt).toMatchObject({
      receipt_name: "askrigor_study_method_audit",
      receipt_version: "1.0",
      audit_status: "complete_with_unresolved_fields",
      source_primary_identifier: "PMC1234567",
      source_content_sha256: index.source.content_sha256,
      design_label_is_not_reliability_verdict: true,
      source_block_count: index.blocks.length,
      cited_source_block_count: 2
    });
    expect(receipt.domain_findings.map(({ domain }) => domain))
      .toEqual(STUDY_METHOD_AUDIT_DOMAINS);
    expect(receipt.claim_capabilities.map(({ capability }) => capability))
      .toEqual(["can_support", "cannot_support"]);
    expect(receipt.limitations.join(" ")).toContain(
      "not accepted as reliability verdicts"
    );
  });

  it("rejects missing or duplicated method domains", async () => {
    const audit = await submission();
    audit.domain_findings[12] = {
      ...audit.domain_findings[11]!,
      plain_language_finding: "Duplicate domain fixture."
    };

    expect(studyMethodAuditSubmissionSchema.safeParse(audit).success).toBe(false);
  });

  it("rejects source block identifiers not present in the acquired document", async () => {
    const index = await sourceIndex();
    const audit = await submission();
    audit.claim_capabilities[0]!.evidence_block_ids = [
      "jats_999999_aaaaaaaaaaaa"
    ];

    expect(() => validateStudyMethodAudit(index, audit)).toThrow(
      "Study audit cited an unknown source block"
    );
  });

  it("rejects an umbrella treatment label without an exact program", async () => {
    const audit = await submission();
    audit.intervention_program = {
      ...audit.intervention_program,
      name: "exercise",
      components: ["general movement"]
    };

    const parsed = studyMethodAuditSubmissionSchema.safeParse(audit);

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map(({ message }) => message)).toContain(
        "generic program names require exact components or the literal program not described"
      );
    }
  });

  it("requires separate statements of what a study can and cannot support", async () => {
    const audit = await submission();
    audit.claim_capabilities = audit.claim_capabilities.filter(({ capability }) =>
      capability !== "cannot_support"
    );

    const parsed = studyMethodAuditSubmissionSchema.safeParse(audit);

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map(({ message }) => message)).toContain(
        "must state at least one explicit non-capability"
      );
    }
  });
});
