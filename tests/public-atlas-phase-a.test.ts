import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  amendResearchQuestion,
  claimResearchWorkPackage,
  completeResearchWorkPackage,
  createLeaveOneOutInfluence,
  lockPredictionForSubmission,
  patientStorySchema,
  patientStorySha256,
  predictionConsentSchema,
  predictionForecastSchema,
  predictionQuestionSchema,
  predictionSubmissionSchema,
  publicPredictionRecordSchema,
  researchMissionSchema,
  resolvePrediction,
  sealPatientStory,
  sealResearchMission,
  sourceFamilyManifestSchema,
  sourceFamilyObservationSchema,
  storyConsentLedgerSchema,
  storyIsEligibleForAggregateResearch,
  storyIsEligibleForPublicRelease,
  studyAuditProfileSchema,
  studyInformationContributionProfileSchema,
  transitionResearchMission,
  verifyPredictionLock,
  type PatientStory,
  type PredictionConsent,
  type PredictionQuestion,
  type PredictionSubmission,
  type ResearchMission,
  type StoryConsentLedger,
} from "../packages/contracts/src/index.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8")) as unknown;
}

function predictionQuestion(
  primaryMetric: "BRIER" | "LOG" | "INTERVAL" | "RANK" | "CALIBRATION_ONLY" = "BRIER",
): PredictionQuestion {
  return predictionQuestionSchema.parse({
    question_id: "ARQ-RESULTS01",
    question_version: 1,
    prediction_type: "STUDY_OUTCOME",
    prompt: "Will the prespecified primary outcome favor the intervention?",
    scope: {
      population: "Adults with the target condition",
      intervention_or_exposure: "Intervention A",
      comparator: "Placebo",
      outcome: "Prespecified primary outcome",
      horizon: "Twelve weeks",
      setting: "Randomized trial",
    },
    hidden_source_ref: "study:synthetic-001",
    hidden_source_commitment_sha256: SHA_A,
    opens_at: "2026-01-01T00:00:00Z",
    closes_at: "2026-01-02T00:00:00Z",
    scheduled_reveal_at: "2026-01-03T00:00:00Z",
    answer_visibility: "HIDDEN_UNTIL_CLOSE",
    eligible_cohorts: ["PUBLIC", "RESEARCHER", "MODEL", "ASKRIGOR"],
    resolution_rule: {
      rule_version: "resolution-v1",
      authoritative_source_type: "PUBLICATION",
      authoritative_source_identifier: "doi:10.0000/synthetic",
      outcome_mapping: "Resolve true when the prespecified primary estimate favors intervention A.",
      ambiguity_policy: "INVALIDATE",
    },
    scoring_rule: {
      rule_version: "scoring-v1",
      primary_metric: primaryMetric,
      secondary_metrics: primaryMetric === "BRIER" ? ["LOG", "CALIBRATION"] : [],
    },
    question_payload_sha256: null,
  });
}

function predictionSubmission(
  forecast: PredictionSubmission["forecast"] = {
    forecast_format: "BINARY_PROBABILITY",
    binary_probability_true: 0.8,
  },
  exposure: PredictionSubmission["result_exposure_declaration"] = "CONFIDENT_NOT_SEEN",
): PredictionSubmission {
  return predictionSubmissionSchema.parse({
    predictor_id: "ARPRED-PERSON01",
    predictor_cohort: "PUBLIC",
    expertise_self_rating: 2,
    familiarity_with_topic: 2,
    submitted_at: "2026-01-01T12:00:00Z",
    result_exposure_declaration: exposure,
    evidence_consulted_summary: "Only the hidden abstract-free question prompt.",
    rationale: "The intervention seems plausible, but uncertainty remains substantial.",
    forecast,
    supersedes_prediction_id: null,
    counts_for_scoring: exposure !== "SEEN_RESULT_INELIGIBLE_FOR_PRIMARY_SCORE",
  });
}

function predictionConsent(): PredictionConsent {
  return predictionConsentSchema.parse({
    aggregate_scoring: true,
    public_pseudonymous_display: false,
    research_use: true,
    recontact: false,
    notice_version: "prediction-notice-v1",
    consented_at: "2026-01-01T11:59:00Z",
  });
}

function consentDecision(
  decision: "YES" | "NO" | "WITHDRAWN" | "NOT_ASKED",
  suffix: string,
): StoryConsentLedger["private_service_storage"] {
  return {
    decision,
    notice_version: "story-notice-v1",
    consent_text_sha256: suffix.repeat(64).slice(0, 64),
    decided_at: "2026-02-01T00:00:00Z",
    channel: "SECURE_PORTAL",
    withdrawn_at: decision === "WITHDRAWN" ? "2026-02-02T00:00:00Z" : null,
  };
}

function storyConsents(overrides: Partial<StoryConsentLedger> = {}): StoryConsentLedger {
  const ledger = storyConsentLedgerSchema.parse({
    private_service_storage: consentDecision("YES", "1"),
    deidentified_aggregate_research: consentDecision("YES", "2"),
    human_reviewer_access: consentDecision("YES", "3"),
    recontact: consentDecision("NO", "4"),
    public_redacted_story: consentDecision("NO", "5"),
    direct_quotation: consentDecision("NO", "6"),
    document_or_media_publication: consentDecision("NO", "7"),
    external_record_linkage: consentDecision("NO", "8"),
    future_related_research: consentDecision("NO", "9"),
    generalized_product_improvement: consentDecision("NO", "a"),
    model_training: consentDecision("NO", "b"),
  });
  return storyConsentLedgerSchema.parse({ ...ledger, ...overrides });
}

function completeness(tier: "MINIMAL" | "MODERATE" | "HIGH_DETAIL" | "PROSPECTIVE" = "MINIMAL") {
  return {
    overall_tier: tier,
    fields: {
      diagnosis_detail: tier === "MINIMAL" ? "PARTIAL" : "PRESENT",
      baseline: tier === "MINIMAL" ? "MISSING" : "PRESENT",
      intervention_specificity: tier === "MINIMAL" ? "PARTIAL" : "PRESENT",
      timeline_resolution: tier === "MINIMAL" ? "PARTIAL" : "PRESENT",
      cointervention_coverage: tier === "MINIMAL" ? "MISSING" : "PRESENT",
      outcome_measurement: tier === "MINIMAL" ? "PARTIAL" : "PRESENT",
      follow_up_duration: tier === "MINIMAL" ? "MISSING" : "PRESENT",
      adverse_event_coverage: tier === "MINIMAL" ? "MISSING" : "PRESENT",
      dechallenge_rechallenge: "NOT_APPLICABLE",
      objective_corroboration: tier === "PROSPECTIVE" ? "PRESENT" : "MISSING",
      prospective_collection: tier === "PROSPECTIVE" ? "PRESENT" : "MISSING",
    },
    highest_value_missing_questions:
      tier === "MINIMAL"
        ? ["What changed first, and on what approximate date?", "What else changed during the same period?"]
        : [],
  } as const;
}

function minimalStory(): PatientStory {
  return patientStorySchema.parse({
    schema_version: "0.1.0",
    story_id: "ARS-MINIMAL01",
    story_version: 1,
    intake_channel: "DEIDENTIFIED_APP_INTAKE",
    record_state: "PARTIAL",
    reporter_role: "SELF",
    subject_private_ref: null,
    subject_summary: {
      age_range: "45_59",
      sex_at_birth: "UNKNOWN",
      gender_identity: null,
      country_or_broad_region: "Broad region withheld",
      public_demographic_detail_allowed: false,
    },
    minimal_report: {
      what_happened: "A treatment seemed to help, but the exact timing and dose are not yet available.",
      reported_direction: "HELPED",
      approximate_timing: "Within several weeks",
      incomplete_submission_acknowledged: true,
    },
    condition_episodes: [
      {
        condition_episode_id: "ARC-COND01",
        condition_id: null,
        condition_name: "Synthetic chronic condition",
        diagnostic_certainty: "SELF_IDENTIFIED",
        diagnosis_source_summary: null,
        baseline_severity: null,
        baseline_function_summary: null,
        natural_history_summary: null,
        major_comorbidities_summary: null,
      },
    ],
    intervention_episodes: [
      {
        intervention_episode_id: "ARI-INT001",
        parent_combination_id: null,
        name: "Synthetic intervention",
        normalized_intervention_id: null,
        episode_role: "PRIMARY_REPORTED",
        formulation: null,
        route: null,
        dose_known: false,
        dose_value: null,
        dose_unit: null,
        frequency: null,
        start: { value: null, precision: "RELATIVE_ONLY", relative_description: "Several weeks before improvement" },
        end: null,
        dose_or_schedule_changes: [],
        adherence_known: false,
        adherence_summary: null,
        stopped_and_restarted: null,
        dechallenge_summary: null,
        rechallenge_summary: null,
        prescribed_or_supervised: "UNKNOWN",
      },
    ],
    outcomes: [
      {
        outcome_id: "ARO-OUT001",
        name: "Overall symptoms",
        normalized_outcome_id: null,
        reported_direction: "IMPROVED",
        measurement_type: "SUBJECTIVE_GLOBAL",
        baseline_value: null,
        follow_up_value: null,
        unit_or_scale: null,
        onset_after_intervention: "Within several weeks",
        peak_change_timing: null,
        duration_or_persistence: null,
        current_status: "ONGOING_UNKNOWN",
        clinically_meaningful_to_reporter: true,
        notes: null,
      },
    ],
    adverse_events: [],
    measurements: [],
    timeline_events: [],
    cointerventions_and_changes: [],
    reporter_attribution: {
      what_reporter_believes_helped_or_harmed: "The synthetic intervention may have helped.",
      confidence: 55,
      reasoning: "The change followed treatment, but other explanations remain possible.",
    },
    alternative_explanations: ["Natural fluctuation", "Unrecorded co-intervention"],
    clinician_involvement: null,
    source_documents: [],
    narrative: null,
    completeness: completeness(),
    askrigor_capability: "TEMPORAL_ASSOCIATION_ONLY",
    duplicate_or_linked_story_ids: [],
    consents: storyConsents(),
    public_story: null,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: null,
    record_payload_sha256: null,
  });
}

function syntheticCombinationStory(): PatientStory {
  const story = minimalStory();
  const comboId = "ARCOMBO-MCAS001";
  const component = (
    id: string,
    name: string,
    route: string,
    relativeStart: string,
  ) => ({
    intervention_episode_id: id,
    parent_combination_id: comboId,
    name,
    normalized_intervention_id: null,
    episode_role: "COMBINATION_COMPONENT" as const,
    formulation: "Low-dose formulation reported; exact dose not yet supplied",
    route,
    dose_known: false,
    dose_value: null,
    dose_unit: null,
    frequency: null,
    start: { value: null, precision: "RELATIVE_ONLY" as const, relative_description: relativeStart },
    end: null,
    dose_or_schedule_changes: [],
    adherence_known: false,
    adherence_summary: null,
    stopped_and_restarted: null,
    dechallenge_summary: null,
    rechallenge_summary: null,
    prescribed_or_supervised: "CLINICIAN" as const,
  });

  return patientStorySchema.parse({
    ...story,
    story_id: "ARS-SYNTHANDY01",
    record_state: "RESEARCH_LEAD",
    condition_episodes: [
      {
        ...story.condition_episodes[0],
        condition_episode_id: "ARC-MCAS01",
        condition_name: "Mast cell activation syndrome-like illness",
        diagnostic_certainty: "CLINICIAN_CONFIRMED",
        baseline_severity: 9,
        baseline_function_summary: "Severe reported symptoms and major functional limitation before the combination period.",
      },
    ],
    intervention_episodes: [
      component("ARI-LDN001", "Low-dose naltrexone", "oral", "Started first; exact date pending"),
      component("ARI-NAD001", "Low-dose NAD+", "injection", "Added after LDN; exact interval pending"),
      component("ARI-TIR001", "Low-dose tirzepatide", "injection", "Added later; exact interval pending"),
    ],
    outcomes: [
      {
        ...story.outcomes[0],
        outcome_id: "ARO-MCAS001",
        name: "Overall MCAS symptom burden and function",
        reported_direction: "IMPROVED",
        onset_after_intervention: "Reported after the combination sequence; component attribution unresolved",
        duration_or_persistence: "Reported as substantial and sustained at intake",
        current_status: "PERSISTED",
      },
    ],
    reporter_attribution: {
      what_reporter_believes_helped_or_harmed: "The combination of LDN, low-dose NAD+ injections, and low-dose tirzepatide helped tremendously.",
      confidence: 90,
      reasoning: "The improvement occurred during the sequence, but the individual contribution of each component is not separable from this report.",
    },
    alternative_explanations: [
      "Natural fluctuation or regression to the mean",
      "Concurrent lifestyle, environmental, or medical changes not yet captured",
      "One component rather than the full combination",
    ],
    completeness: completeness("MODERATE"),
    askrigor_capability: "COMBINATION_ASSOCIATION_ONLY",
    created_at: "2026-02-03T00:00:00Z",
  });
}

function researchMission(): ResearchMission {
  return researchMissionSchema.parse({
    schema_version: "research-mission-v1",
    mission_id: "mission-synthetic-001",
    title: "Durable synthetic living-evidence mission",
    mode: "LONG_RANGE",
    state: "ACTIVE",
    owner_authorized: true,
    invariant_purpose: {
      purpose_id: "purpose-synthetic-001",
      epoch: 1,
      sha256: SHA_A,
      source_refs: ["owner-request:synthetic"],
      verbatim_owner_or_user_request: ["Determine the durable overall evidence picture without replacing the owner outcome with a subtask."],
      normalized_purpose: "Produce a durable, source-linked overall evidence picture and preserve unresolved work.",
      non_satisfying_proxies: ["One completed database search", "One green pull request", "One interim summary"],
      frozen: true,
    },
    research_questions: [
      {
        question_id: "question-synthetic-001",
        version: 1,
        status: "ACTIVE",
        question: "What does the current overall evidence show for the prespecified outcome?",
        scope: {
          population_or_domain: "Synthetic target population",
          intervention_or_exposure: "Intervention A",
          comparator: "Comparator B",
          outcomes: ["Primary outcome", "Serious harms"],
          time_horizon: "Twelve weeks and longer-term follow-up",
          setting_or_jurisdiction: "Any eligible setting",
          languages: ["English"],
          included_source_classes: ["bibliographic_database", "trial_registry"],
          excluded_source_classes: [],
        },
        derived_from_purpose_id: "purpose-synthetic-001",
        acceptance_requirements: ["Search both formal source classes", "Audit included studies", "Preserve contradictions"],
        created_at: "2026-03-01T00:00:00Z",
        supersedes_question_version: null,
        amendment_id: null,
      },
    ],
    question_amendments: [],
    source_frontier: {
      frontier_version: 1,
      source_classes: ["bibliographic_database", "trial_registry"],
      search_passes: [],
      requested_date_windows: ["inception through 2026-03-01"],
      confirmed_date_windows: [],
      query_fingerprints: [],
      pagination_or_cursor_state: [],
      candidate_counts: {
        discovered: 0,
        screened: 0,
        included: 0,
        excluded: 0,
        deferred: 0,
        duplicate: 0,
        unresolved_identity: 0,
      },
      full_text_coverage: {
        complete: 0,
        partial: 0,
        abstract_or_registry_only: 0,
        inaccessible: 0,
        unknown: 0,
      },
      audit_coverage: [],
      synthesis_coverage: [],
      unresolved_trails: [],
      blocked_sources: [],
      zero_result_receipts: [],
      freshness: {
        last_complete_pass_at: null,
        last_partial_pass_at: null,
        next_refresh_due_at: null,
        refresh_state: "NOT_SCHEDULED",
      },
      stopping_or_refresh_rule: "Complete the declared source classes and disclose any inaccessible or unresolved frontier.",
    },
    work_packages: [
      {
        work_package_id: "wp-discovery-001",
        question_id: "question-synthetic-001",
        question_version: 1,
        objective: "Complete the bibliographic database discovery lane.",
        epistemic_role: "DISCOVERY",
        status: "READY",
        read_set: ["mission:mission-synthetic-001"],
        write_set: ["frontier:bibliographic_database"],
        prerequisites: [],
        dependencies: [],
        independence_requirement: "INDEPENDENT",
        blinding_requirement: "BLINDED_TO_SYNTHESIS",
        worker_class: "EXTRA_HIGH",
        reasoning_tier: "EXTRA_HIGH",
        allowed_tools_and_providers: ["pubmed"],
        budget: {
          currency: "USD",
          hard_ceiling: 5,
          token_or_usage_ceiling: null,
          time_or_cycle_ceiling: 10,
        },
        lease: {
          lease_id: null,
          fence_token: null,
          claimed_by: null,
          claimed_at: null,
          expires_at: null,
        },
        structured_output_schema_ref: "research-frontier-v1",
        deterministic_acceptance_checks: ["All pages exhausted or explicit bounded access state recorded"],
        scientific_review_required: true,
        scientific_review_state: "NOT_REVIEWED",
        heartbeat_cadence: "At each completed source page or material block",
        last_heartbeat_at: null,
        checkpoint_ref: null,
        escalation_criteria: ["Material source identity conflict"],
        stop_conditions: ["Budget ceiling reached", "Owner cancellation"],
        completion_disposition: null,
      },
    ],
    maximum_concurrent_packages: 4,
    write_set_conflict_policy: "REJECT_OR_SERIALIZE",
    stale_commit_policy: "REJECT_BY_FENCE_TOKEN",
    false_consensus_prohibited: true,
    mission_wide_percent_complete: null,
    current_state_summary: "Mission active with one ready discovery package and no claim of frontier completion.",
    latest_interim_snapshot_ref: null,
    current_release_ref: null,
    next_executable_step: "Claim and execute the bibliographic discovery package.",
    owner_decision_needed: null,
    public_release_allowed: false,
    release_receipt_required: true,
    worker_may_publish_directly: false,
    supervisor_verdict_alone_may_publish: false,
    retention_policy_ref: "retention-policy-synthetic-v1",
    cancellation_policy_ref: "cancellation-policy-synthetic-v1",
    proposed_terminal_state: null,
    terminal_comparator: {
      result: null,
      evaluates_invariant_purpose: true,
      evaluated_purpose_epoch: null,
      evaluated_purpose_sha256: null,
      required_outcome_evidence_refs: [],
      unresolved_gaps_compatible_with_closure: null,
      no_active_leases_or_unreviewed_consequential_conflicts: null,
      release_handback_and_deletion_obligations_complete: null,
    },
    mission_payload_sha256: null,
  });
}

function contributionDimension(level: "NONE" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH" | "UNKNOWN") {
  return {
    level,
    rationale: `Synthetic ${level.toLowerCase()} contribution with inspectable reasons.`,
    calculation_or_method: "fixture-method-v1",
    uncertainty: "Synthetic uncertainty retained.",
    evidence_refs: ["fixture:evidence-001"],
  } as const;
}

describe("Discovery Atlas Phase A source-family contracts", () => {
  it("parses the current family manifest as discovery authority only", () => {
    const manifest = sourceFamilyManifestSchema.parse(
      readJson("../docs/ivmmeta-covidanalysis-family-manifest-v0.1.0.json"),
    );
    expect(manifest.canonical_current_corpus.family_member_id).toBe("c19early-org");
    expect(manifest.import_rules.default_record_class).toBe("THIRD_PARTY_CANDIDATE");
    expect(manifest.enumeration_acceptance.public_import_authorized).toBe(false);
  });

  it("rejects attempts to turn the discovery manifest into public import authority", () => {
    const manifest = clone(
      sourceFamilyManifestSchema.parse(
        readJson("../docs/ivmmeta-covidanalysis-family-manifest-v0.1.0.json"),
      ),
    );
    manifest.enumeration_acceptance.public_import_authorized = true;
    expect(() => sourceFamilyManifestSchema.parse(manifest)).toThrow(/cannot itself authorize public import/i);
  });

  it("rejects duplicate historical domains", () => {
    const manifest = clone(
      sourceFamilyManifestSchema.parse(
        readJson("../docs/ivmmeta-covidanalysis-family-manifest-v0.1.0.json"),
      ),
    );
    manifest.historical_discovery_leads.push(manifest.historical_discovery_leads[0]!);
    expect(() => sourceFamilyManifestSchema.parse(manifest)).toThrow(/domains must be unique/i);
  });

  it("requires a content hash for a complete observation and forbids unknown fields", () => {
    const observation = {
      observation_id: "observation-001",
      family_member_id: "c19early-org",
      requested_url: "https://c19early.org/",
      final_url: "https://c19early.org/",
      redirect_chain: [],
      retrieved_at: "2026-08-30T00:00:00Z",
      http_or_access_state: "complete",
      page_role: "family_home",
      topic_id: null,
      content_sha256: null,
      parser_version: "parser-v1",
      visible_license: "CC0 for site-owned work; third-party material excluded",
      third_party_content_boundary: "Do not import linked paper text, figures, or images by default.",
      candidate_record_ids: [],
      candidate_record_class: "THIRD_PARTY_CANDIDATE",
      supersedes_observation_id: null,
      unresolved_notes: [],
    };
    expect(() => sourceFamilyObservationSchema.parse(observation)).toThrow(/content hash/i);
    expect(() => sourceFamilyObservationSchema.parse({ ...observation, content_sha256: SHA_A, quality_score: 10 })).toThrow();
  });
});

describe("Study Lab validity and information-contribution contracts", () => {
  const audit = studyAuditProfileSchema.parse({
    audit_profile_id: "audit-synthetic-001",
    study_id: "study-synthetic-001",
    study_version_id: "study-version-001",
    design_class: "RANDOMIZED_TRIAL",
    rubric_name: "rob2-adapted",
    rubric_version: "2026-01",
    source_version_sha256: SHA_A,
    assessed_at: "2026-04-01T00:00:00Z",
    domain_findings: [
      {
        domain_id: "missing-outcomes",
        question_id: "missing-outcomes-q1",
        judgment: "HIGH_CONCERN",
        source_locators: ["results:participant-flow"],
        rationale: "A consequential share of randomized participants lacks the prespecified outcome.",
        unresolved_items: [],
        assessor_id: "assessor-001",
        assessor_type: "WORKER",
        independent_assessment_id: "assessment-independent-001",
        adjudication_id: null,
      },
    ],
    applicability_summary: "Direct population and intervention, but incomplete outcomes limit the result.",
    can_support: ["A randomized comparison among observed participants"],
    cannot_support: ["An unbiased intention-to-treat effect without resolving missing outcomes"],
    uncertain: ["Magnitude after plausible missing-data assumptions"],
    disagreements: [],
    supersedes_audit_profile_id: null,
  });

  const contribution = studyInformationContributionProfileSchema.parse({
    contribution_profile_id: "contribution-synthetic-001",
    study_id: "study-synthetic-001",
    study_version_id: "study-version-001",
    synthesis_id: "synthesis-synthetic-001",
    synthesis_version_id: "synthesis-version-001",
    scope: {
      population: "Synthetic target population",
      intervention_or_exposure: "Intervention A",
      comparator: "Comparator B",
      outcome: "Primary outcome",
      horizon: "Twelve weeks",
      setting: "Randomized trial settings",
    },
    precision_contribution: contributionDimension("VERY_HIGH"),
    scope_directness: contributionDimension("HIGH"),
    unique_coverage: contributionDimension("LOW"),
    independence: {
      status: "INDEPENDENT",
      related_study_ids: [],
      rationale: "No overlapping population was identified in the fixture.",
    },
    synthesis_weights: [
      {
        estimate_id: "estimate-primary-001",
        contribution_fraction: 0.62,
        weighting_method: "inverse-variance-fixture",
        is_quality_interpretation: false,
      },
    ],
    influence_analyses: [],
    bias_sensitivity: contributionDimension("VERY_HIGH"),
    replication_role: "ORIGINAL",
    decision_impact: contributionDimension("VERY_HIGH"),
    gap_resolution: contributionDimension("MODERATE"),
    reproducibility_contribution: contributionDimension("LOW"),
    future_information_value: contributionDimension("HIGH"),
    source_access_completeness: "COMPLETE",
    assessed_at: "2026-04-02T00:00:00Z",
    method_version: "study-contribution-v1",
    limitations: ["Contribution is synthesis-specific and not a quality score."],
    supersedes_contribution_profile_id: null,
  });

  it("keeps methodological validity and information contribution separate", () => {
    expect(audit.domain_findings[0]?.judgment).toBe("HIGH_CONCERN");
    expect(contribution.precision_contribution.level).toBe("VERY_HIGH");
    expect(contribution.synthesis_weights[0]?.is_quality_interpretation).toBe(false);
  });

  it("rejects a synthesis weight presented as quality and an unexplained universal score", () => {
    const invalidContribution = clone(contribution) as Record<string, unknown>;
    const weights = clone(contribution.synthesis_weights);
    weights[0]!.is_quality_interpretation = true as false;
    invalidContribution.synthesis_weights = weights;
    expect(() => studyInformationContributionProfileSchema.parse(invalidContribution)).toThrow();
    expect(() => studyAuditProfileSchema.parse({ ...audit, quality_score: 8.7 })).toThrow();
  });

  it("requires duplicate-population relationships to name the linked studies", () => {
    const invalid = clone(contribution);
    invalid.independence = {
      status: "DUPLICATE_POPULATION",
      related_study_ids: [],
      rationale: "Fixture intentionally omits the overlapping study identity.",
    };
    expect(() => studyInformationContributionProfileSchema.parse(invalid)).toThrow(/related study IDs/i);
  });

  it("records influence without mistaking interval width for heterogeneity", () => {
    const influence = createLeaveOneOutInfluence({
      analysis_id: "influence-001",
      estimate_id: "estimate-primary-001",
      baseline_effect: 0.72,
      counterfactual_effect: 0.98,
      baseline_interval: [0.61, 0.84],
      counterfactual_interval: [0.81, 1.19],
      baseline_conclusion: "benefit",
      counterfactual_conclusion: "uncertain",
      baseline_certainty: "moderate",
      counterfactual_certainty: "low",
      baseline_decision: "consider",
      counterfactual_decision: "do not conclude",
      heterogeneity_changed: false,
      assumptions: ["All other synthesis inputs fixed"],
    });
    expect(influence.conclusion_changed).toBe(true);
    expect(influence.certainty_changed).toBe(true);
    expect(influence.decision_changed).toBe(true);
    expect(influence.heterogeneity_changed).toBe(false);
  });
});

describe("Durable Research Mission contracts", () => {
  it("preserves a nullable mission-wide percentage and seals the mission", () => {
    const mission = sealResearchMission(researchMission());
    expect(mission.mission_wide_percent_complete).toBeNull();
    expect(mission.mission_payload_sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("claims and completes a finite package with a fence token", () => {
    const claimed = claimResearchWorkPackage(researchMission(), {
      work_package_id: "wp-discovery-001",
      worker_id: "worker-001",
      lease_id: "lease-001",
      fence_token: "fence-001",
      claimed_at: "2026-03-01T01:00:00Z",
      expires_at: "2026-03-01T03:00:00Z",
    });
    expect(claimed.work_packages[0]?.status).toBe("ACTIVE");

    const complete = completeResearchWorkPackage(claimed, {
      work_package_id: "wp-discovery-001",
      fence_token: "fence-001",
      completed_at: "2026-03-01T02:00:00Z",
      checkpoint_ref: "checkpoint-discovery-001",
      disposition: "SUBTASK_COMPLETE_PARENT_OPEN",
      scientific_review_state: "PENDING",
    });
    expect(complete.work_packages[0]?.status).toBe("COMPLETE");
    expect(complete.work_packages[0]?.completion_disposition).toBe("SUBTASK_COMPLETE_PARENT_OPEN");
    expect(complete.state).toBe("ACTIVE");
  });

  it("rejects stale and expired work-package commits", () => {
    const claimed = claimResearchWorkPackage(researchMission(), {
      work_package_id: "wp-discovery-001",
      worker_id: "worker-001",
      lease_id: "lease-001",
      fence_token: "fence-current",
      claimed_at: "2026-03-01T01:00:00Z",
      expires_at: "2026-03-01T02:00:00Z",
    });
    expect(() =>
      completeResearchWorkPackage(claimed, {
        work_package_id: "wp-discovery-001",
        fence_token: "fence-stale",
        completed_at: "2026-03-01T01:30:00Z",
        checkpoint_ref: "checkpoint-stale",
        disposition: "SUBTASK_COMPLETE_PARENT_OPEN",
      }),
    ).toThrow(/stale or unauthorized/i);
    expect(() =>
      completeResearchWorkPackage(claimed, {
        work_package_id: "wp-discovery-001",
        fence_token: "fence-current",
        completed_at: "2026-03-01T02:01:00Z",
        checkpoint_ref: "checkpoint-expired",
        disposition: "SUBTASK_COMPLETE_PARENT_OPEN",
      }),
    ).toThrow(/lease expired/i);
  });

  it("pauses and resumes without pretending the mission is complete", () => {
    const paused = transitionResearchMission(
      researchMission(),
      "PAUSED_USER",
      "Paused by the user with frontier preserved.",
      "Resume when the user restarts the mission.",
    );
    expect(paused.state).toBe("PAUSED_USER");
    const resumed = transitionResearchMission(
      paused,
      "ACTIVE",
      "Mission resumed with the same invariant purpose and frontier.",
      "Claim the next ready package.",
    );
    expect(resumed.state).toBe("ACTIVE");
    expect(resumed.invariant_purpose.sha256).toBe(SHA_A);
  });

  it("cannot close without a passing comparator against the current purpose", () => {
    expect(() => researchMissionSchema.parse({ ...researchMission(), state: "CLOSED" })).toThrow(/passing comparator/i);
  });

  it("amends the research question while preserving the invariant purpose and old version", () => {
    const amended = amendResearchQuestion(researchMission(), {
      question_id: "question-synthetic-001",
      from_version: 1,
      change_type: "EXPANSION",
      rationale: "A newly identified harms signal makes explicit long-term harm analysis necessary.",
      evidence_refs: ["candidate:new-harm-signal"],
      owner_or_authority_ref: "owner-decision:synthetic-001",
      created_at: "2026-03-02T00:00:00Z",
      new_question: {
        question_id: "question-synthetic-001",
        status: "ACTIVE",
        question: "What do benefits and long-term harms show for the prespecified intervention?",
        scope: {
          population_or_domain: "Synthetic target population",
          intervention_or_exposure: "Intervention A",
          comparator: "Comparator B",
          outcomes: ["Primary outcome", "Serious harms", "Persistent harms after stopping"],
          time_horizon: "Twelve weeks through the longest eligible follow-up",
          setting_or_jurisdiction: "Any eligible setting",
          languages: ["English"],
          included_source_classes: ["bibliographic_database", "trial_registry"],
          excluded_source_classes: [],
        },
        derived_from_purpose_id: "purpose-synthetic-001",
        acceptance_requirements: ["Preserve benefits and harms separately", "Audit long-term follow-up"],
        created_at: "2026-03-02T00:00:00Z",
      },
    });
    expect(amended.invariant_purpose.sha256).toBe(SHA_A);
    expect(amended.research_questions).toHaveLength(2);
    expect(amended.research_questions[0]?.status).toBe("SUPERSEDED");
    expect(amended.research_questions[1]?.version).toBe(2);
  });
});

describe("Prediction Registry contracts", () => {
  it("locks, verifies, resolves, and scores a binary probability", () => {
    const locked = lockPredictionForSubmission({
      prediction_id: "ARP-PREDICT01",
      question: predictionQuestion("BRIER"),
      submission: predictionSubmission(),
      consent: predictionConsent(),
      locked_at: "2026-01-01T12:00:01Z",
    });
    expect(locked.lifecycle_state).toBe("LOCKED");
    expect(verifyPredictionLock(locked)).toBe(true);

    const resolved = resolvePrediction(locked, {
      resolved_at: "2026-01-03T00:00:00Z",
      source_identifier: "doi:10.0000/synthetic",
      source_version_sha256: SHA_B,
      resolved_outcome: true,
      resolver_type: "DETERMINISTIC",
    });
    expect(resolved.lifecycle_state).toBe("RESOLVED");
    expect(resolved.score?.primary_metric).toBe("BRIER");
    expect(resolved.score?.primary_value).toBeCloseTo(0.04, 12);
    expect(resolved.score?.secondary_values.LOG).toBeCloseTo(-Math.log(0.8), 12);
  });

  it("detects prediction tampering before reveal", () => {
    const locked = lockPredictionForSubmission({
      prediction_id: "ARP-PREDICT02",
      question: predictionQuestion("BRIER"),
      submission: predictionSubmission(),
      consent: predictionConsent(),
    });
    const tampered = clone(locked);
    tampered.submission.forecast.binary_probability_true = 0.2;
    expect(verifyPredictionLock(tampered)).toBe(false);
    expect(() =>
      resolvePrediction(tampered, {
        resolved_at: "2026-01-03T00:00:00Z",
        source_identifier: "doi:10.0000/synthetic",
        source_version_sha256: SHA_B,
        resolved_outcome: true,
        resolver_type: "DETERMINISTIC",
      }),
    ).toThrow(/lock verification failed/i);
  });

  it("automatically excludes result-seen predictions from primary scoring", () => {
    const seenSubmission = {
      ...predictionSubmission(),
      result_exposure_declaration: "SEEN_RESULT_INELIGIBLE_FOR_PRIMARY_SCORE" as const,
      counts_for_scoring: true,
    };
    const locked = lockPredictionForSubmission({
      prediction_id: "ARP-PREDICT03",
      question: predictionQuestion("BRIER"),
      submission: seenSubmission as PredictionSubmission,
      consent: predictionConsent(),
    });
    expect(locked.submission.counts_for_scoring).toBe(false);
    const resolved = resolvePrediction(locked, {
      resolved_at: "2026-01-03T00:00:00Z",
      source_identifier: "doi:10.0000/synthetic",
      source_version_sha256: SHA_B,
      resolved_outcome: true,
      resolver_type: "DETERMINISTIC",
    });
    expect(resolved.score?.eligible_for_primary_analysis).toBe(false);
    expect(resolved.score?.primary_value).toBeNull();
  });

  it("rejects categorical probabilities that do not sum to one", () => {
    expect(() =>
      predictionForecastSchema.parse({
        forecast_format: "CATEGORICAL_PROBABILITIES",
        categorical_probabilities: [
          { label: "benefit", probability: 0.6 },
          { label: "null", probability: 0.3 },
        ],
      }),
    ).toThrow(/sum to one/i);
  });

  it("calculates interval and rank scores deterministically", () => {
    const intervalQuestion = predictionQuestionSchema.parse({
      ...predictionQuestion("INTERVAL"),
      question_id: "ARQ-INTERVAL01",
    });
    const intervalLocked = lockPredictionForSubmission({
      prediction_id: "ARP-INTERVAL01",
      question: intervalQuestion,
      submission: predictionSubmission({
        forecast_format: "INTERVAL",
        lower_bound: 0,
        upper_bound: 10,
        interval_coverage_probability: 0.8,
        unit: "points",
      }),
      consent: predictionConsent(),
    });
    const intervalResolved = resolvePrediction(intervalLocked, {
      resolved_at: "2026-01-03T00:00:00Z",
      source_identifier: "study:interval",
      source_version_sha256: SHA_B,
      resolved_outcome: 12,
      resolver_type: "DETERMINISTIC",
    });
    expect(intervalResolved.score?.primary_value).toBeCloseTo(30, 12);

    const rankQuestion = predictionQuestionSchema.parse({
      ...predictionQuestion("RANK"),
      question_id: "ARQ-RANKING01",
      prediction_type: "TREATMENT_RANKING",
    });
    const rankLocked = lockPredictionForSubmission({
      prediction_id: "ARP-RANKING01",
      question: rankQuestion,
      submission: predictionSubmission({
        forecast_format: "RANKING",
        ranking: ["A", "B", "C"],
      }),
      consent: predictionConsent(),
    });
    const rankResolved = resolvePrediction(rankLocked, {
      resolved_at: "2026-01-03T00:00:00Z",
      source_identifier: "study:ranking",
      source_version_sha256: SHA_B,
      resolved_outcome: ["B", "A", "C"],
      resolver_type: "DETERMINISTIC",
    });
    expect(rankResolved.score?.primary_value).toBeCloseTo(2 / 3, 12);
  });

  it("fails closed when reveal is attempted before question close", () => {
    const locked = lockPredictionForSubmission({
      prediction_id: "ARP-PREDICT04",
      question: predictionQuestion("BRIER"),
      submission: predictionSubmission(),
      consent: predictionConsent(),
    });
    expect(() =>
      resolvePrediction(locked, {
        resolved_at: "2026-01-01T13:00:00Z",
        source_identifier: "doi:10.0000/synthetic",
        source_version_sha256: SHA_B,
        resolved_outcome: true,
        resolver_type: "DETERMINISTIC",
      }),
    ).toThrow(/before the question closes/i);
  });

  it("keeps resolved records structurally complete", () => {
    const locked = lockPredictionForSubmission({
      prediction_id: "ARP-PREDICT05",
      question: predictionQuestion("BRIER"),
      submission: predictionSubmission(),
      consent: predictionConsent(),
    });
    expect(() =>
      publicPredictionRecordSchema.parse({ ...locked, lifecycle_state: "RESOLVED" }),
    ).toThrow(/require resolution and score/i);
  });
});

describe("Patient Experience Observatory contracts", () => {
  it("accepts and seals an explicitly incomplete but useful story", () => {
    const story = minimalStory();
    expect(story.record_state).toBe("PARTIAL");
    expect(story.completeness.overall_tier).toBe("MINIMAL");
    expect(story.completeness.highest_value_missing_questions.length).toBeGreaterThan(0);
    const sealed = sealPatientStory(story);
    expect(sealed.record_payload_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(sealed.record_payload_sha256).toBe(
      patientStorySha256({ ...sealed, record_payload_sha256: null }),
    );
  });

  it("preserves the synthetic MCAS report as one combination episode", () => {
    const story = syntheticCombinationStory();
    expect(story.intervention_episodes).toHaveLength(3);
    expect(new Set(story.intervention_episodes.map((episode) => episode.parent_combination_id))).toEqual(
      new Set(["ARCOMBO-MCAS001"]),
    );
    expect(story.askrigor_capability).toBe("COMBINATION_ASSOCIATION_ONLY");
    expect(story.reporter_attribution?.what_reporter_believes_helped_or_harmed).toContain("combination");
  });

  it("rejects a one-component pseudo-combination", () => {
    const story = clone(syntheticCombinationStory());
    story.intervention_episodes = [story.intervention_episodes[0]!];
    expect(() => patientStorySchema.parse(story)).toThrow(/at least two linked components/i);
  });

  it("rejects identifiers, documents, and unreviewed narratives in app intake", () => {
    const story = clone(minimalStory());
    story.subject_private_ref = "private-person-001";
    expect(() => patientStorySchema.parse(story)).toThrow(/cannot contain a private subject reference/i);

    const withDocument = clone(minimalStory());
    withDocument.source_documents = [
      {
        source_document_id: "ARDOC-LAB001",
        document_type: "LAB",
        storage_state: "PRIVATE_ENCRYPTED",
        separate_consent_record_id: "consent-doc-001",
        content_sha256: SHA_C,
        public_use_allowed: false,
      },
    ];
    expect(() => patientStorySchema.parse(withDocument)).toThrow(/cannot contain source documents/i);

    const withNarrative = clone(minimalStory());
    withNarrative.narrative = {
      text: "Synthetic unreviewed narrative",
      contains_identifiers_reviewed: false,
      separate_consent_record_id: "consent-narrative-001",
      public_quote_allowed: false,
    };
    expect(() => patientStorySchema.parse(withNarrative)).toThrow(/reviewed for identifiers/i);
  });

  it("requires exact-version approval and specific consent before public publication", () => {
    const story = clone(minimalStory());
    story.intake_channel = "EXTERNAL_SECURE_PORTAL";
    story.public_story = {
      publication_state: "PUBLISHED",
      attribution_mode: "ANONYMOUS",
      display_name: null,
      redacted_version_id: "public-story-version-001",
      redacted_payload_sha256: SHA_C,
      exact_version_approved: true,
      approved_at: "2026-02-03T00:00:00Z",
      published_at: "2026-02-04T00:00:00Z",
      withdrawal_policy_version: "withdrawal-v1",
    };
    expect(() => patientStorySchema.parse(story)).toThrow(/requires specific public-story consent/i);

    story.consents.public_redacted_story = consentDecision("YES", "c");
    const publishable = patientStorySchema.parse(story);
    expect(storyIsEligibleForPublicRelease(publishable)).toBe(true);
  });

  it("excludes withdrawn aggregate-research consent without deleting the story record", () => {
    const story = clone(minimalStory());
    story.consents.deidentified_aggregate_research = consentDecision("WITHDRAWN", "d");
    const parsed = patientStorySchema.parse(story);
    expect(storyIsEligibleForAggregateResearch(parsed)).toBe(false);
    expect(parsed.record_state).toBe("PARTIAL");
  });

  it("forbids unknown fields that could silently weaken the evidence boundary", () => {
    expect(() => patientStorySchema.parse({ ...minimalStory(), causal_effect_established: true })).toThrow();
  });
});

describe("Machine-readable draft contracts", () => {
  it("keeps the prediction and story JSON contracts parseable", () => {
    expect(readJson("../docs/public-prediction-contract-v0.1.0.json")).toBeTypeOf("object");
    expect(readJson("../docs/patient-story-intake-contract-v0.1.0.json")).toBeTypeOf("object");
  });
});
