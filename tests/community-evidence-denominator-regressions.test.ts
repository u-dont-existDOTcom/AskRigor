import { describe, expect, it } from "vitest";

import {
  assessCommunityEvidenceDenominator,
  canonicalForumThreadIdentity,
  createForumCorpusPlanV2,
  normalizeLegacyForumCorpusV1,
  reviseForumCorpusPlanV2,
  communityEvidenceDenominatorReceiptSha256,
  type ForumCorpusPlanV2
} from "../apps/research-mcp/src/community-evidence-denominator.js";
import { assertReportIntegrityClaim } from
  "../apps/research-mcp/src/actions/research-report-synthesis.js";

const now = "2026-09-09T12:00:00.000Z";

function plan(
  purpose: "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION" | "DIRECTIONAL_SENSITIVITY" |
    "PHENOTYPE_DISCOVERY" | "FORMAL_DISCRIMINATOR" =
      "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION",
  neutrality: "NEUTRAL" | "DIRECTIONAL" | "UNCERTAIN" = "NEUTRAL"
): ForumCorpusPlanV2 {
  return createForumCorpusPlanV2({
    contract_version: "askrigor_forum_corpus_plan_v2",
    corpus_plan_id: "test-corpus",
    corpus_version: 1,
    corpus_purpose: purpose,
    research_question: "What outcomes are visibly reported for the subject?",
    subject_aliases: ["subject"],
    context_aliases: ["relevant context"],
    planned_at: now,
    frozen_before_outcome_classification: true,
    queries: [{
      query_id: "q1",
      query_text: neutrality === "NEUTRAL" ? "subject experience" : "subject worked",
      provider: "forum-search",
      requested_result_depth: 100,
      ranking_basis: "provider-ranked retrieved cards",
      neutrality: {
        status: neutrality,
        rationale: neutrality === "NEUTRAL"
          ? "The query does not prefer an outcome."
          : "The query preferentially retrieves benefit.",
        target_variable_term_exception: false
      }
    }],
    inclusion_rules: ["Material firsthand or landscape discussion"],
    exclusion_rules: ["Irrelevant subject"],
    sampling: { method: "FULL", threshold: 500, rule: "Retrieve all accessible records." }
  });
}

function thread(index: number, overrides: Record<string, unknown> = {}) {
  return {
    result_card_id: `card-${index}`,
    platform: "forum",
    canonical_post_id: `post-${index}`,
    canonical_url: `https://forum.example/posts/${index}`,
    query_ids: ["q1"],
    materiality: "CONFIRMED",
    retrieval_state: "FULL",
    excluded_from_user_prevalence: false,
    search_landscape_category: "POSITIVE_LEANING",
    promotional_source: false,
    ...overrides
  };
}

function episode(
  index: number,
  outcome: "BENEFIT" | "MIXED" | "NO_EFFECT" | "WORSENED" |
    "TOO_EARLY" | "UNCLEAR",
  overrides: Record<string, unknown> = {}
) {
  return {
    episode_id: `episode-${index}`,
    thread_identity: `forum:post-${index}`,
    identity: { identity_kind: "STABLE_AUTHOR_ID", identity_value: `user-${index}` },
    firsthand: true,
    outcome,
    chronological_index: 0,
    attribution: "A1_ISOLATED",
    duration: "ONE_TO_THREE_MONTHS",
    durability: "NOT_REPORTED",
    population_certainty: "STRONGLY_SELF_IDENTIFIED",
    source_role: "INDEPENDENT_USER",
    genuine_personal_outcome_from_promotional_role: false,
    reaction_information_present: true,
    benefit_information_present: true,
    marker_benefit_quadrant: outcome === "BENEFIT"
      ? "BENEFIT_LITTLE_OR_NO_MARKER"
      : outcome === "WORSENED"
        ? "NO_BENEFIT_STRONG_MARKER"
        : "UNCLASSIFIABLE",
    ...overrides
  };
}

function assess(
  corpusPlan: ForumCorpusPlanV2,
  threads: ReturnType<typeof thread>[],
  userEpisodes: ReturnType<typeof episode>[],
  overrides: Record<string, unknown> = {}
) {
  return assessCommunityEvidenceDenominator({
    plan: corpusPlan,
    denominatorType: "FIRSTHAND_FORUM_USER_DENOMINATOR",
    searchReceipts: [{
      query_id: "q1",
      plan_sha256: corpusPlan.plan_sha256,
      executed_at: now,
      actual_result_depth: threads.length,
      pagination_state: "EXHAUSTED",
      retrieved_result_card_ids: threads.map(({ result_card_id }) => result_card_id)
    }],
    threads,
    userEpisodes,
    sensitivityCasesOutsideDenominator: 0,
    sensitivityResultsSeparated: true,
    robustnessViews: [],
    ...overrides
  });
}

describe("community evidence denominator regressions", () => {
  it("keeps twenty sensitivity harms outside a ten-user neutral denominator", () => {
    const threads = Array.from({ length: 10 }, (_, index) => thread(index));
    const outcomes = [
      ...Array.from({ length: 6 }, (_, index) => episode(index, "BENEFIT")),
      ...Array.from({ length: 2 }, (_, index) => episode(index + 6, "NO_EFFECT")),
      ...Array.from({ length: 2 }, (_, index) => episode(index + 8, "WORSENED"))
    ];
    const result = assess(plan(), threads, outcomes, {
      sensitivityCasesOutsideDenominator: 20
    });
    expect(result.ledger.interpretable_firsthand_users).toBe(10);
    expect(result.ledger.user_outcomes_inclusive).toMatchObject({
      BENEFIT: 6, NO_EFFECT: 2, WORSENED: 2
    });
    expect(result.ledger.sensitivity_cases_outside_denominator).toBe(20);
  });

  it("does not turn balanced benefit and harm searches into a fifty-fifty estimate", () => {
    const directional = plan("DIRECTIONAL_SENSITIVITY", "DIRECTIONAL");
    const result = assess(directional, [thread(1)], [episode(1, "BENEFIT")]);
    expect(result.receipt.forum_signal_prevalence).toBe("BLOCKED");
    expect(result.receipt.mandatory_wording).toContain("deliberately enriched");
  });

  it("counts the same stable author once across three threads", () => {
    const threads = [thread(1), thread(2), thread(3)];
    const episodes = threads.map((_, index) => episode(index + 1, "BENEFIT", {
      identity: { identity_kind: "STABLE_AUTHOR_ID", identity_value: "same-user" }
    }));
    expect(assess(plan(), threads, episodes).ledger.unique_firsthand_users).toBe(1);
  });

  it("reconciles one user's early benefit and later worsening as MIXED", () => {
    const episodes = [
      episode(1, "BENEFIT", {
        identity: { identity_kind: "STABLE_AUTHOR_ID", identity_value: "longitudinal-user" }
      }),
      episode(2, "WORSENED", {
        identity: { identity_kind: "STABLE_AUTHOR_ID", identity_value: "longitudinal-user" },
        chronological_index: 1
      })
    ];
    const result = assess(plan(), [thread(1), thread(2)], episodes);
    expect(result.ledger.unique_firsthand_users).toBe(1);
    expect(result.ledger.user_outcomes_inclusive.MIXED).toBe(1);
  });

  it("keeps concurrent new changes in inclusive analysis only", () => {
    const result = assess(plan(), [thread(1)], [episode(1, "BENEFIT", {
      attribution: "B_CONCURRENT_NEW_CHANGES"
    })]);
    expect(result.ledger.user_outcomes_inclusive.BENEFIT).toBe(1);
    expect(result.ledger.user_outcomes_strict.BENEFIT).toBe(0);
  });

  it("includes stable cointerventions in strict A2 analysis", () => {
    const result = assess(plan(), [thread(1)], [episode(1, "BENEFIT", {
      attribution: "A2_STABLE_COINTERVENTIONS"
    })]);
    expect(result.ledger.user_outcomes_strict.BENEFIT).toBe(1);
  });

  it("includes a within-person discriminator in strict A3 analysis", () => {
    const result = assess(plan(), [thread(1)], [episode(1, "NO_EFFECT", {
      attribution: "A3_WITHIN_PERSON_DISCRIMINATOR"
    })]);
    expect(result.ledger.user_outcomes_strict.NO_EFFECT).toBe(1);
  });

  it("reports anonymous identity uncertainty instead of assuming independence", () => {
    const anonymous = [1, 2].map((index) => episode(index, "WORSENED", {
      identity: { identity_kind: "ANONYMOUS_OR_DELETED" }
    }));
    const blocked = assess(plan(), [thread(1), thread(2)], anonymous);
    expect(blocked.receipt.gate_checks.USER_DEDUP_ACCEPTABLE).toBe(false);
    const bounded = assess(plan(), [thread(1), thread(2)], anonymous, {
      anonymousIdentityBounds: { lower: 1, upper: 2 }
    });
    expect(bounded.ledger.anonymous_identity_uncertainty).toMatchObject({
      present: true, lower_bound: 1, upper_bound: 2
    });
  });

  it("excludes an irrelevant source and permits a same-query replacement", () => {
    const rejected = thread(1, {
      materiality: "REJECTED",
      exclusion_reason: "IRRELEVANT_SUBJECT",
      search_landscape_category: "OTHER"
    });
    const replacement = thread(2);
    const result = assess(plan(), [rejected, replacement], [episode(2, "BENEFIT")]);
    expect(result.ledger.relevant_threads).toBe(1);
    expect(result.ledger.interpretable_firsthand_users).toBe(1);
  });

  it("locks prevalence on partial retrieval unless the source is excluded", () => {
    const partial = thread(1, {
      retrieval_state: "PARTIAL",
      excluded_from_user_prevalence: false
    });
    const blocked = assess(plan(), [partial], [episode(1, "BENEFIT")]);
    expect(blocked.receipt.gate_checks.RETRIEVAL_COMPLETENESS_ACCEPTABLE).toBe(false);
    expect(blocked.receipt.forum_signal_prevalence).toBe("BLOCKED");
    const excluded = assess(plan(), [{ ...partial, excluded_from_user_prevalence: true }], []);
    expect(excluded.receipt.gate_checks.RETRIEVAL_COMPLETENESS_ACCEPTABLE).toBe(true);
  });

  it("rejects a directionally biased primary query for denominator use", () => {
    const result = assess(plan("PRIMARY_NEUTRAL_SIGNAL_ESTIMATION", "DIRECTIONAL"),
      [thread(1)], [episode(1, "BENEFIT")]);
    expect(result.receipt.gate_checks.PRIMARY_SEARCHES_DIRECTIONALLY_NEUTRAL).toBe(false);
    expect(result.receipt.forum_signal_prevalence).toBe("BLOCKED");
  });

  it("requires a new corpus version and hash after a plan change", () => {
    const original = plan();
    const revised = reviseForumCorpusPlanV2(original, {
      research_question: "Revised question after inspection"
    });
    expect(revised.corpus_version).toBe(2);
    expect(revised.plan_sha256).not.toBe(original.plan_sha256);
  });

  it("rejects a counted thread that is absent from its frozen search receipt", () => {
    const corpusPlan = plan();
    expect(() => assessCommunityEvidenceDenominator({
      plan: corpusPlan,
      denominatorType: "SEARCH_LANDSCAPE_RESULT_CARD_DENOMINATOR",
      searchReceipts: [{
        query_id: "q1",
        plan_sha256: corpusPlan.plan_sha256,
        executed_at: now,
        actual_result_depth: 1,
        pagination_state: "EXHAUSTED",
        retrieved_result_card_ids: ["different-card"]
      }],
      threads: [thread(1)],
      userEpisodes: [],
      sensitivityCasesOutsideDenominator: 0,
      sensitivityResultsSeparated: true
    })).toThrow(/not linked to its frozen search receipt/u);
  });

  it("flags promotional selection and excludes unsupported vendor claims", () => {
    const result = assess(plan(), [thread(1, { promotional_source: true })], [
      episode(1, "BENEFIT", {
        source_role: "VENDOR_ACCOUNT",
        genuine_personal_outcome_from_promotional_role: false
      })
    ]);
    expect(result.ledger.unique_firsthand_users).toBe(0);
    expect(result.receipt.measurement_confidence).toBe("MODERATE");
  });

  it("classifies an immediate first-exposure benefit as TOO_EARLY", () => {
    const result = assess(plan(), [thread(1)], [episode(1, "BENEFIT", {
      duration: "FIRST_EXPOSURE"
    })]);
    expect(result.ledger.interpretable_firsthand_users).toBe(0);
  });

  it("keeps one primary user with multiple route or condition episodes", () => {
    const episodes = [
      episode(1, "BENEFIT", {
        identity: { identity_kind: "STABLE_USERNAME", identity_value: "one-person" }
      }),
      episode(2, "NO_EFFECT", {
        identity: { identity_kind: "STABLE_USERNAME", identity_value: "one-person" },
        chronological_index: 1
      })
    ];
    expect(assess(plan(), [thread(1), thread(2)], episodes).ledger.unique_firsthand_users)
      .toBe(1);
  });

  it("adds a severe sensitivity phenotype without changing the primary denominator", () => {
    const result = assess(plan(), [thread(1)], [episode(1, "BENEFIT")], {
      sensitivityCasesOutsideDenominator: 1
    });
    expect(result.ledger.interpretable_firsthand_users).toBe(1);
    expect(result.ledger.sensitivity_cases_outside_denominator).toBe(1);
    expect(normalizeLegacyForumCorpusV1({ benefit: 30, harm: 30 })).toMatchObject({
      corpus_purpose: "PHENOTYPE_DISCOVERY",
      prevalence_eligible: false,
      outside_primary_denominator: true
    });
    expect(canonicalForumThreadIdentity(thread(1))).toBe("forum:post-1");
  });

  it("blocks prevalence wording for directional case discovery at report synthesis", () => {
    expect(() => assertReportIntegrityClaim({
      claim_kind: "community_attributed",
      wording: "The directional searches were mostly positive.",
      community_claim_scope: "CASE_DISCOVERY"
    }, {})).toThrow(/cannot support prevalence-like wording/u);
  });

  it("permits firsthand-user frequency only with the exact passing receipt", () => {
    const result = assess(plan(), [thread(1)], [episode(1, "BENEFIT")]);
    const claim = {
      claim_kind: "community_attributed" as const,
      wording: "Within the predefined corpus, one of one users reported benefit.",
      community_claim_scope: "FIRSTHAND_USER_FREQUENCY" as const,
      community_denominator_receipt_sha256:
        communityEvidenceDenominatorReceiptSha256(result.receipt)
    };
    expect(() => assertReportIntegrityClaim(claim, {
      community_denominator_receipt: result.receipt
    })).not.toThrow();
    expect(() => assertReportIntegrityClaim({
      ...claim,
      community_denominator_receipt_sha256: "0".repeat(64)
    }, { community_denominator_receipt: result.receipt })).toThrow(/exact passing/u);
  });
});
