import { afterEach, describe, expect, it } from "vitest";

import { createLocalLessonGeneralizer } from
  "../apps/research-mcp/src/lessons/local-generalizer.js";
import { createLessonRuntimeFromEnv } from
  "../apps/research-mcp/src/lessons/runtime.js";

const runtimeEnvironmentKeys = [
  "ASKRIGOR_ACTIONS_ENABLED",
  "ASKRIGOR_ACTIONS_API_KEY",
  "OPENAI_API_KEY",
  "ASKRIGOR_AI_BUDGET_LEDGER",
  "ASKRIGOR_AI_MONTHLY_BUDGET_USD",
  "ASKRIGOR_GITHUB_APP_ID",
  "ASKRIGOR_GITHUB_INSTALLATION_ID",
  "ASKRIGOR_GITHUB_PRIVATE_KEY_BASE64",
  "ASKRIGOR_LESSONS_REPOSITORY",
] as const;

const originalEnvironment = Object.fromEntries(
  runtimeEnvironmentKeys.map((key) => [key, process.env[key]]),
);

const safeGeneralizedCandidate = {
  category: "missing_sources" as const,
  general_lesson: "When material factual claims are made, AskRigor should attach traceable supporting sources.",
  expected_behavior: "Cite each material claim near the sentence it supports and state any source-access boundary.",
  failure_reason: "The answer asserted a conclusion without giving the user a way to inspect supporting evidence.",
  synthetic_regression_example: "A synthetic answer ranks two interventions but supplies no citations for either ranking.",
  evidence_basis: "assistant_self_check" as const,
  consent_scope: "once" as const,
};

afterEach(() => {
  for (const key of runtimeEnvironmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("ChatGPT-native lesson generalization", () => {
  it("constructs the production lesson runtime without OpenAI/API-budget settings", () => {
    process.env.ASKRIGOR_ACTIONS_ENABLED = "true";
    process.env.ASKRIGOR_ACTIONS_API_KEY = "test-action-key";
    delete process.env.OPENAI_API_KEY;
    delete process.env.ASKRIGOR_AI_BUDGET_LEDGER;
    delete process.env.ASKRIGOR_AI_MONTHLY_BUDGET_USD;
    process.env.ASKRIGOR_GITHUB_APP_ID = "123456";
    process.env.ASKRIGOR_GITHUB_INSTALLATION_ID = "987654";
    process.env.ASKRIGOR_GITHUB_PRIVATE_KEY_BASE64 = Buffer.from("test-private-key").toString("base64");
    process.env.ASKRIGOR_LESSONS_REPOSITORY = "u-dont-existDOTcom/AskRigor-lessons";

    expect(createLessonRuntimeFromEnv()).toBeDefined();
  });

  it("accepts an already-generalized safe candidate without a model call", async () => {
    const generalizer = createLocalLessonGeneralizer();
    await expect(generalizer.generalize(safeGeneralizedCandidate)).resolves.toEqual({
      status: "generalized",
      candidate: safeGeneralizedCandidate,
    });
  });
});
