import { readFile } from "node:fs/promises";

import {
  scoutGeminiYoutubeCandidates,
  validateGeminiYoutubeCandidateHandoff,
  type GeminiYoutubeScoutConfig,
  type GeminiYoutubeScoutInput
} from "@askrigor/sources";

import { surveyYoutubeCommunity } from "../youtube-community-survey.js";
import { nativeSurveyInputFromCandidateDiscovery } from
  "./research-candidate-frontier.js";
import {
  recordAutomatedScoutBoundary,
  recordAutomatedScoutCompletion,
  recordNativeYoutubeDiscovery,
  type ResearchSessionState
} from "./research-session-controller.js";

export interface CreateResearchSessionDiscoveryExecutorsOptions {
  scout?: typeof scoutGeminiYoutubeCandidates;
  validateCandidates?: typeof validateGeminiYoutubeCandidateHandoff;
  surveyNativeCandidates?: typeof surveyYoutubeCommunity;
  loadScoutInstructions?: () => Promise<string>;
  geminiConfig?: GeminiYoutubeScoutConfig;
  youtubeApiKey?: string;
}

export interface ResearchSessionDiscoveryExecutors {
  automatedScout(state: ResearchSessionState): Promise<ResearchSessionState>;
  nativeDiscovery(state: ResearchSessionState): Promise<ResearchSessionState>;
  resolveCandidateIdentities(
    state: ResearchSessionState
  ): Promise<ResearchSessionState>;
}

/** Shared discovery execution for prototype, private, and controlled routes. */
export function createResearchSessionDiscoveryExecutors(
  options: CreateResearchSessionDiscoveryExecutorsOptions = {}
): ResearchSessionDiscoveryExecutors {
  const scout = options.scout ?? scoutGeminiYoutubeCandidates;
  const validate = options.validateCandidates ??
    validateGeminiYoutubeCandidateHandoff;
  const surveyNativeCandidates = options.surveyNativeCandidates ??
    surveyYoutubeCommunity;
  const loadScoutInstructions = options.loadScoutInstructions ??
    defaultScoutInstructions;

  const automatedScout = async (
    state: ResearchSessionState
  ): Promise<ResearchSessionState> => {
    const config = options.geminiConfig;
    const youtubeApiKey = options.youtubeApiKey;
    if (
      config === undefined || config.apiKey.trim().length === 0 ||
      config.model.trim().length === 0 || youtubeApiKey === undefined ||
      youtubeApiKey.trim().length === 0
    ) {
      return recordAutomatedScoutBoundary(state, {
        classification: "RETRYABLE",
        code: "AUTOMATED_SCOUT_NOT_CONFIGURED",
        summary: "Automated candidate discovery is not configured; no manual packet was substituted."
      });
    }
    const scoutInput: GeminiYoutubeScoutInput = {
      researchTarget: state.research_target,
      diagnosisStatus: state.diagnosis_status,
      scoutInstructions: await loadScoutInstructions()
    };
    const frontier = await scout(scoutInput, config);
    if (frontier.access_status !== "complete" || !("packet" in frontier.data)) {
      return recordAutomatedScoutBoundary(
        state,
        scoutBoundary(frontier.access_status)
      );
    }
    const receipt = await validate(
      JSON.stringify(frontier.data.packet),
      { apiKey: youtubeApiKey }
    );
    return recordAutomatedScoutCompletion(state, {
      providerResponseId: frontier.data.response_id,
      packet: frontier.data.packet,
      receipt
    });
  };
  const nativeDiscovery = async (
    state: ResearchSessionState
  ): Promise<ResearchSessionState> => {
    const youtubeApiKey = options.youtubeApiKey;
    if (youtubeApiKey === undefined || youtubeApiKey.trim().length === 0) {
      throw new Error(
        "Native discovery requires the configured YouTube identity provider"
      );
    }
    const input = nativeSurveyInputFromCandidateDiscovery(
      state.candidate_discovery,
      state.research_target
    );
    const survey = await surveyNativeCandidates(input, {
      apiKey: youtubeApiKey
    });
    return recordNativeYoutubeDiscovery(state, survey);
  };
  return Object.freeze({
    automatedScout,
    nativeDiscovery,
    resolveCandidateIdentities: nativeDiscovery
  });
}

function scoutBoundary(accessStatus: string) {
  if (accessStatus === "rate_limited") {
    return {
      classification: "RETRYABLE" as const,
      code: "AUTOMATED_SCOUT_RATE_LIMITED",
      summary: "Automated candidate discovery was temporarily rate limited; no manual packet was substituted."
    };
  }
  if (accessStatus === "inaccessible") {
    return {
      classification: "RETRYABLE" as const,
      code: "AUTOMATED_SCOUT_ACCOUNT_INACCESSIBLE",
      summary: "Automated candidate discovery could not be accessed with the configured provider account; no manual packet was substituted."
    };
  }
  return {
    classification: "RETRYABLE" as const,
    code: "AUTOMATED_SCOUT_INVALID_FRONTIER",
    summary: "Automated candidate discovery did not return a valid grounded frontier; no manual packet was substituted."
  };
}

async function defaultScoutInstructions(): Promise<string> {
  return readFile(new URL(
    "../../../../integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md",
    import.meta.url
  ), "utf8");
}
