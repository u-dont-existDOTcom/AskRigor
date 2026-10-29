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
  finalizeResearch, TOOL_LIST_REFRESH_HINT, type FinalizeResearchInput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { indexJatsStudyDocument, type EuropePmcFullTextArticle } from "../packages/sources/src/index.js";

import { communitySkipCaveat } from "./helpers/community-skip.js";
import { assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

// Owner questions 87 to 89 (issues #329 to #331): a study audit's headline figures, recomputed from the paper's own
// tables, with a plausibility call and each program's route; the final check turns them into the answer's caveats.
async function sourceIndex(cells = "<td>100</td>") {
  const xml = (await readFile(new URL("fixtures/europe-pmc/full-text.xml", import.meta.url), "utf8"))
    .replace("<td>100</td>", cells);
  const article: EuropePmcFullTextArticle = {
    pmcid: "PMC1234567", pmid: "40123456", doi: "10.1234/recorded.example", title: "Recorded full-text study",
    format: "jats_xml", document_completeness: "full_text_with_body",
    content_sha256: createHash("sha256").update(xml, "utf8").digest("hex"),
    content_bytes: Buffer.byteLength(xml, "utf8"), xml
  };
  return indexJatsStudyDocument(article);
}

const program = (name: string) => ({
  name, components: ["components recorded in the methods"], dose_or_intensity: "recorded in the methods",
  frequency: "recorded in the methods", duration: "twelve weeks", supervision: "recorded in the methods",
  adherence: "recorded separately", co_interventions: [], care_stage: "nonsurgical" as const
});

async function submission(overrides: Partial<StudyMethodAuditSubmission> = {}, cells?: string) {
  const index = await sourceIndex(cells);
  const block = (section: string) => index.blocks.find(({ section_path }) => section_path.includes(section))!.block_id;
  const table = index.blocks.find(({ text }) => /Assigned\D*\d/u.test(text))!.block_id;
  const audit: StudyMethodAuditSubmission = {
    source_primary_identifier: index.source.pmcid,
    source_content_sha256: index.source.content_sha256,
    design_label: "randomized parallel-group comparison",
    design_capability_statement: "Random assignment can support the assigned contrast if implementation is adequate; it is not a reliability verdict.",
    population_and_stage: "Adults meeting the study eligibility criteria.",
    intervention_program: { ...program("supervised progressive resistance program"), route: "oral" },
    comparator_program: program("specified comparator program"),
    outcome_and_horizon: "Function at twelve weeks.",
    domain_findings: STUDY_METHOD_AUDIT_DOMAINS.map((domain) => ({
      domain, status: "limitation_identified" as const,
      plain_language_finding: `The ${domain.replaceAll("_", " ")} domain was inspected and retains a stated limitation.`,
      evidence_block_ids: [block("Methods")], unresolved_fields: []
    })),
    claim_capabilities: [
      { claim: "The assigned programs can be compared at twelve weeks.", capability: "can_support",
        reason: "The methods record them.", evidence_block_ids: [block("Methods")] },
      { claim: "Every program works for everyone.", capability: "cannot_support",
        reason: "One study bounds it.", evidence_block_ids: [] }
    ],
    reported_figures: [{
      label: "participants assigned", evidence_block_id: table, reported: "100", recomputed: 100.4,
      recomputation: "Sum of the arms in Table 1.", plausibility: "consistent"
    }],
    ...overrides
  };
  return { index, table, audit };
}

describe("study audit reported_figures", () => {
  it("records consistent figures, and a recomputation within rounding, with their printed values", async () => {
    const { index, audit } = await submission();
    expect(validateStudyMethodAudit(index, audit).reported_figures_check).toEqual({
      status: "consistent", mismatched: [], impossible_as_printed: [], values: []
    });
  });

  it("reads a number whose separators can group thousands both ways", async () => {
    const { index, table, audit } = await submission({}, "<td>1,234</td><td>1.234.567,8</td>");
    const figure = (reported: string, recomputed: number) => ({
      label: "participants assigned", evidence_block_id: table, reported, recomputed,
      recomputation: "Sum of the arms in Table 1.", plausibility: "consistent" as const
    });
    const status = (reported: string, recomputed: number) =>
      validateStudyMethodAudit(index, { ...audit, reported_figures: [figure(reported, recomputed)] })
        .reported_figures_check?.status;
    expect(status("1,234", 1234)).toBe("consistent");
    expect(status("1,234", 1.234)).toBe("consistent");
    expect(status("1,234", 2000)).toBe("internally_inconsistent");
    expect(status("1.234.567,8", 1234567.8)).toBe("consistent");
  });

  it("keeps only non-integer values for spotting identical results across papers", async () => {
    const { index, table, audit } = await submission({}, "<td>100</td><td>74.25</td><td>1,500</td>");
    const figure = (reported: string) => ({
      label: `figure ${reported}`, evidence_block_id: table, reported,
      recomputation: "Printed in Table 1.", plausibility: "consistent" as const
    });
    expect(validateStudyMethodAudit(index, {
      ...audit, reported_figures: ["100", "74.25", "1,500"].map(figure)
    }).reported_figures_check?.values).toEqual([74.25]);
  });

  it("marks the audit internally inconsistent when a recomputation differs beyond rounding or the auditor says so", async () => {
    const { index, table, audit } = await submission();
    const figure = audit.reported_figures![0]!;
    expect(validateStudyMethodAudit(index, { ...audit, reported_figures: [{ ...figure, recomputed: 90 }] })
      .reported_figures_check).toMatchObject({ status: "internally_inconsistent", mismatched: ["participants assigned"] });
    expect(validateStudyMethodAudit(index, { ...audit, reported_figures: [{
      label: "abstract's treated group", evidence_block_id: table, reported: "100",
      recomputation: "The table gives this value under the control label.",
      plausibility: "inconsistent_with_own_data", plausibility_reason: "The abstract and Table 1 swap the labels."
    }] }).reported_figures_check?.status).toBe("internally_inconsistent");
  });

  it("recomputes a printed percentage from its structured counts even when the auditor repeats the printed error", async () => {
    const { index, table, audit } = await submission({}, "<td>2 (0.002%)</td><td>768 visits</td><td>0.26%</td><td>0.3%</td>");
    const checked = (printed: number, decimal_places?: number) => validateStudyMethodAudit(index, {
      ...audit,
      reported_figures: [{
        label: "serious adverse events per visit", evidence_block_id: table, reported: `${printed}%`,
        recomputed: printed, recomputation: "The auditor repeated the source's printed rate.", plausibility: "consistent",
        percentage: { count: 2, denominator: 768, printed, ...(decimal_places === undefined ? {} : { decimal_places }) }
      }]
    }).reported_figures_check;
    expect(checked(0.002)).toMatchObject({ status: "internally_inconsistent", mismatched: ["serious adverse events per visit"] });
    expect(checked(0.002, 0)).toMatchObject({ status: "internally_inconsistent" });
    expect(checked(0.26)).toMatchObject({ status: "consistent", mismatched: [] });
    expect(checked(0.3)).toMatchObject({ status: "consistent", mismatched: [] });
    expect(checked(0.3, 2)).toMatchObject({ status: "internally_inconsistent" });
    // Structured roles still cite the source: a made-up count cannot supply the server's arithmetic.
    expect(() => validateStudyMethodAudit(index, { ...audit, reported_figures: [{
      ...audit.reported_figures![0]!, evidence_block_id: table, reported: "0.002%",
      percentage: { count: 999, denominator: 768, printed: 0.002 }
    }] })).toThrow("percentage count is not in its cited source block");
  });

  it("keeps an impossible value exactly as printed", async () => {
    const { index, table, audit } = await submission();
    expect(validateStudyMethodAudit(index, { ...audit, reported_figures: [{
      label: "thiol content", evidence_block_id: table, reported: "100 mmol/g",
      recomputation: "At one sulfur atom per thiol, 100 mmol/g is over 300% sulfur by mass.",
      plausibility: "impossible_as_printed", plausibility_reason: "More sulfur than the polymer's own mass."
    }] }).reported_figures_check).toMatchObject({ status: "consistent", impossible_as_printed: ["100 mmol/g"] });
  });

  it("refuses a value that is not in its cited block, or an unknown block", async () => {
    const { index, table, audit } = await submission();
    const figure = audit.reported_figures![0]!;
    expect(() => validateStudyMethodAudit(index, { ...audit, reported_figures: [{ ...figure, reported: "250" }] }))
      .toThrow("Study audit reported figure \"participants assigned\" is not in its cited source block. " +
        "A figure worked out from printed numbers goes in worked_out: give operation and inputs, each with " +
        "printed and evidence_block_id; reported is the worked-out value.");
    expect(() => validateStudyMethodAudit(index, { ...audit, reported_figures: [{
      ...figure, evidence_block_id: table.replace(/[0-9a-f]{12}$/u, "0".repeat(12))
    }] })).toThrow("Study audit cited an unknown source block");
  });

  // Owner answer 166a (2026-10-23): a figure worked out from printed numbers is checked, not refused.
  it("checks a worked-out figure's printed inputs and redoes its arithmetic, recording a mismatch instead of refusing", async () => {
    const { index, table, audit } = await submission({}, "<td>40</td><td>60</td><td>1,500</td><td>0</td>");
    const worked = (label: string, reported: string, operation: "sum" | "difference" | "ratio" | "percentage",
      printed: string[], block = table) => ({
      label, evidence_block_id: table, reported, recomputation: `The ${operation} of the printed numbers.`,
      plausibility: "consistent" as const,
      worked_out: { operation, inputs: printed.map((value) => ({ evidence_block_id: block, printed: value })) }
    });
    const checkOf = (...figures: ReturnType<typeof worked>[]) =>
      validateStudyMethodAudit(index, { ...audit, reported_figures: figures }).reported_figures_check;
    // Not printed in the block, so a printed figure of 100 would be refused; worked out, it is checked.
    expect(checkOf(
      worked("analyzed participants", "100", "sum", ["40", "60"]),
      worked("difference between arms", "20", "difference", ["40", "60"]),
      worked("treated share", "4%", "percentage", ["60", "1,500"]),
      worked("responder share", "66.7%", "percentage", ["40", "60"]),
      worked("rate ratio", "0.67", "ratio", ["40", "60"]),
      worked("grouped total", "1,540", "sum", ["1,500", "40"])
    )).toEqual({
      status: "consistent", mismatched: [], impossible_as_printed: [], values: [],
      worked_out: ["analyzed participants", "difference between arms", "treated share", "responder share", "rate ratio",
        "grouped total"]
    });
    // Arithmetic that gives another value is recorded as not matching; the paper's own status does not change.
    expect(checkOf(
      worked("analyzed participants", "110", "sum", ["40", "60"]),
      worked("responder share", "66.6%", "percentage", ["40", "60"]),
      worked("per zero", "5", "ratio", ["40", "0"])
    )).toEqual({
      status: "consistent", mismatched: [], impossible_as_printed: [], values: [],
      worked_out_mismatched: [
        { label: "analyzed participants", computed: 100 },
        { label: "responder share", computed: 66.6667 },
        { label: "per zero", computed: null }
      ]
    });
    // An input must be printed in its block, as a printed figure must.
    expect(() => checkOf(worked("analyzed participants", "100", "sum", ["40", "70"])))
      .toThrow("Study audit reported figure \"analyzed participants\" has an input that is not in its cited source block");
    // A difference, ratio or percentage has exactly two inputs, each with a printed number.
    expect(studyMethodAuditSubmissionSchema.safeParse({
      ...audit, reported_figures: [worked("three-way difference", "10", "difference", ["40", "60", "1,500"])]
    }).success).toBe(false);
    expect(studyMethodAuditSubmissionSchema.safeParse({
      ...audit, reported_figures: [worked("unnumbered", "100", "sum", ["forty", "60"])]
    }).success).toBe(false);
  });

  it("separates an audit that lists no figures from one that never declared them", async () => {
    const { index, audit } = await submission();
    const { reported_figures: _figures, ...undeclared } = audit;
    expect(validateStudyMethodAudit(index, undeclared).reported_figures_check?.status).toBe("not_declared");
    expect(validateStudyMethodAudit(index, {
      ...audit, reported_figures: [], reported_figures_none_reason: "The study reports only qualitative findings."
    }).reported_figures_check?.status).toBe("none_reported");
    expect(studyMethodAuditSubmissionSchema.safeParse({ ...audit, reported_figures: [] }).success).toBe(false);
    expect(studyMethodAuditSubmissionSchema.safeParse({
      ...audit, reported_figures_none_reason: "No numeric result."
    }).success).toBe(false);
  });

  it("needs a reason for an inconsistent or impossible figure, a printed number, and a route from the list", async () => {
    const { audit } = await submission();
    const figure = audit.reported_figures![0]!;
    expect(studyMethodAuditSubmissionSchema.safeParse({
      ...audit, reported_figures: [{ ...figure, plausibility: "impossible_as_printed" }]
    }).success).toBe(false);
    expect(studyMethodAuditSubmissionSchema.safeParse({
      ...audit, reported_figures: [{ ...figure, reported: "about a hundred" }]
    }).success).toBe(false);
    expect(studyMethodAuditSubmissionSchema.safeParse({
      ...audit, intervention_program: { ...audit.intervention_program, route: "by mouth" }
    }).success).toBe(false);
  });
});

describe("finalize_research reads each key study's figures check", () => {
  const SECRET = "reported-figures-finalize-secret-0123456789012";
  const A = "10.1000/paper-2017";
  const B = "10.1000/paper-2018";
  const sign = (claims: Parameters<typeof issueResearchReceipt>[1]) =>
    issueResearchReceipt("study_audit", { status: "complete_no_unresolved_fields", ...claims }, { secret: SECRET });
  const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates figure checks." };
  const LINKS = `[Paper 2017](https://doi.org/${A}) and [Paper 2018](https://doi.org/${B}) were read.`;
  // The answer states the community search its no_real_world_outcome declaration skipped (owner question 125); it
  // is the first caveat.
  const SKIP = communitySkipCaveat("Synthetic fixture isolates structural checks.");
  const check = (receipts: string[], draft = LINKS) => assertNextStepsContract(finalizeResearch({
    receipts, research_target: "Synthetic reported-figure checks", research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
    not_relevant_reason: "Synthetic fixture isolates structural checks.",
    commercial_review_applicability: declaration, intervention_identity: declaration, lab_preparation: declaration,
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates figure checks." },
    key_sources: [
      { id: A, status: "validated", read_depth: "full_text_audited", answer_marker: "Paper 2017" },
      { id: B, status: "validated", read_depth: "full_text_audited", answer_marker: "Paper 2018" }
    ],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [], answer_draft: `${draft}\n\n${SKIP}`
  } satisfies FinalizeResearchInput, { secret: SECRET }));
  const IDENTICAL = "Two studies that report identical results: Paper 2017; Paper 2018. They are counted once, not as " +
    "independent replication.";

  it("asks a new audit without figures to declare them, and leaves audits signed before the check alone", () => {
    const missing = check([sign({ id: A, fig: "not_declared" }), sign({ id: B, fig: "none_reported" })]);
    expect(missing.status).toBe("not_ready");
    expect(missing.next_steps).toEqual([
      `The study audit of ${A} lists no reported_figures: validate it again with reported_figures, each headline ` +
        "result (not a dose or group size) as the paper prints it with its source block, recomputed from the " +
        "paper's own tables or with why that isn't possible, or with an empty list and reported_figures_none_reason " +
        "when it reports no numeric result; a figure worked out from printed numbers, such as the analyzed group " +
        "behind a rate, is listed with worked_out, its printed inputs and how; pass the research_receipt it returns.",
      TOOL_LIST_REFRESH_HINT
    ]);
    expect(check([sign({ id: A }), sign({ id: B })]).status).toBe("ready_with_limits");
    // The latest audit of a study is the one that counts.
    expect(check([sign({ id: A, fig: "not_declared", t: 1 }), sign({ id: A, fig: "consistent", figv: ["5"], t: 2 }),
      sign({ id: B })]).status).toBe("ready_with_limits");
  });

  it("carries a study's inconsistency and its impossible values into the answer as caveats", () => {
    const inconsistent = "A study whose reported figures don't match its own data: Paper 2017. Its results stay " +
      "unreliable until they are reconciled.";
    const impossible = "A value that is physically impossible as printed, so it is not used: 96 mmol/g. Study: Paper 2018.";
    const receipts = [sign({ id: A, fig: "internally_inconsistent", figv: ["64.51"] }),
      sign({ id: B, fig: "consistent", figv: ["96"], imp: ["96 mmol/g"] })];
    expect(check(receipts).caveats).toEqual([SKIP, inconsistent, impossible]);
    expect(check(receipts, `${LINKS}\n\n${inconsistent} ${impossible}`).status).toBe("ready_with_limits");
  });

  it("counts two key studies with two or more identical figures once", () => {
    const swapped = [sign({ id: A, fig: "consistent", figv: ["74.25", "65.25", "53.25"] }),
      sign({ id: B, fig: "consistent", figv: ["53.25", "74.25", "65.25"] })];
    expect(check(swapped).caveats).toEqual([SKIP, IDENTICAL]);
    expect(check(swapped, `${LINKS}\n\n${IDENTICAL}`).status).toBe("ready_with_limits");
    expect(check([sign({ id: A, fig: "consistent", figv: ["74.25", "12"] }),
      sign({ id: B, fig: "consistent", figv: ["74.25", "13"] })]).caveats).toEqual([SKIP]);
  });
});
