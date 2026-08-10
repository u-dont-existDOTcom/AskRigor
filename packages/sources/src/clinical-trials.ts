import {
  errorEnvelope,
  okEnvelope,
  type AccessStatus,
  type ProvenanceEnvelope
} from "@askrigor/contracts";
import { z } from "zod";

import { fetchJson } from "./http.js";

const STUDIES_URL = "https://clinicaltrials.gov/api/v2/studies";
const VERSION_URL = "https://clinicaltrials.gov/api/v2/version";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const VERSION_CACHE_MS = 15 * 60 * 1_000;
const FRESHNESS_LIMITATION =
  "ClinicalTrials.gov provider freshness metadata was unavailable; study data was retrieved without a data timestamp.";

const nctIdSchema = z.string().regex(/^NCT\d{8}$/);
const searchInputSchema = z.object({
  query: z.string().trim().min(1).max(5_000),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  pageToken: z.string().min(1).max(4_096).optional()
}).strict();
const dateStructSchema = z.object({ date: z.string().min(1) }).passthrough();
const sponsorSchema = z.object({ name: z.string().min(1) }).passthrough();
const interventionSchema = z.object({
  type: z.string().min(1).optional(),
  name: z.string().min(1).optional()
}).passthrough();
const referenceSchema = z.object({
  pmid: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  citation: z.string().min(1).optional()
}).passthrough();
const studySchema = z.object({
  protocolSection: z.object({
    identificationModule: z.object({
      nctId: nctIdSchema,
      briefTitle: z.string().min(1).optional(),
      officialTitle: z.string().min(1).optional()
    }).passthrough(),
    statusModule: z.object({
      overallStatus: z.string().min(1).optional(),
      startDateStruct: dateStructSchema.optional(),
      completionDateStruct: dateStructSchema.optional(),
      lastUpdatePostDateStruct: dateStructSchema.optional(),
      lastUpdateSubmitDate: z.string().min(1).optional()
    }).passthrough().optional(),
    sponsorCollaboratorsModule: z.object({
      leadSponsor: sponsorSchema.optional(),
      collaborators: z.array(sponsorSchema).optional()
    }).passthrough().optional(),
    conditionsModule: z.object({ conditions: z.array(z.string().min(1)).optional() }).passthrough().optional(),
    designModule: z.object({
      studyType: z.string().min(1).optional(),
      phases: z.array(z.string().min(1)).optional(),
      enrollmentInfo: z.object({
        count: z.number().int().nonnegative(),
        type: z.string().min(1).optional()
      }).passthrough().optional()
    }).passthrough().optional(),
    armsInterventionsModule: z.object({ interventions: z.array(interventionSchema).optional() }).passthrough().optional(),
    referencesModule: z.object({ references: z.array(referenceSchema).optional() }).passthrough().optional()
  }).passthrough(),
  resultsSection: z.object({}).passthrough().optional()
}).passthrough();
const searchResponseSchema = z.object({
  studies: z.array(studySchema),
  nextPageToken: z.string().min(1).optional()
}).passthrough();
const versionResponseSchema = z.object({
  dataTimestamp: z.string().min(1).refine((value) => !Number.isNaN(Date.parse(value)))
}).passthrough();

export interface SearchClinicalTrialsInput {
  query: string;
  pageSize?: number;
  pageToken?: string;
}

export interface ClinicalTrialIntervention {
  type?: string;
  name?: string;
}

export interface ClinicalTrialReference {
  pmid?: string;
  type?: string;
  citation?: string;
}

export interface ClinicalTrialEnrollment {
  count: number;
  type?: string;
}

export interface ClinicalTrial {
  nct_id: string;
  title?: string;
  status?: string;
  study_type?: string;
  phases?: string[];
  conditions?: string[];
  interventions?: ClinicalTrialIntervention[];
  sponsors?: string[];
  enrollment?: ClinicalTrialEnrollment;
  start_date?: string;
  completion_date?: string;
  has_results: boolean;
  references?: ClinicalTrialReference[];
  last_update?: string;
}

interface VersionCache {
  fetchedAt: number;
  fetchImplementation: typeof fetch;
  dataTimestamp?: string;
}

let versionCache: VersionCache | undefined;

export const searchClinicalTrials = async (
  input: SearchClinicalTrialsInput
): Promise<ProvenanceEnvelope<ClinicalTrial[]>> => {
  const parsedInput = searchInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new Error("Invalid ClinicalTrials.gov search input");
  }

  const { query, pageToken } = parsedInput.data;
  const pageSize = parsedInput.data.pageSize ?? DEFAULT_PAGE_SIZE;
  const queryEnvelope = { query };
  const pagination = {
    ...(pageToken === undefined ? {} : { cursor: pageToken }),
    page_size: pageSize
  };

  try {
    const url = new URL(STUDIES_URL);
    url.searchParams.set("query.term", query);
    url.searchParams.set("pageSize", String(pageSize));
    if (pageToken !== undefined) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetchClinicalTrialsJson(url.toString());
    const parsedResponse = searchResponseSchema.safeParse(response);
    if (!parsedResponse.success) {
      throw new ClinicalTrialsResponseError();
    }
    const { studies, nextPageToken } = parsedResponse.data;
    if (
      studies.length > pageSize ||
      (nextPageToken !== undefined && nextPageToken === pageToken)
    ) {
      throw new ClinicalTrialsResponseError();
    }

    const freshness = await providerFreshness();
    return okEnvelope({
      provider: "clinicaltrials_gov",
      recordType: "clinical_trial_search_result",
      query: queryEnvelope,
      accessStatus: "complete",
      limitations: freshness.dataTimestamp === undefined ? [FRESHNESS_LIMITATION] : [],
      ...(freshness.dataTimestamp === undefined
        ? {}
        : { rawMetadata: { data_timestamp: freshness.dataTimestamp } }),
      pagination: {
        ...pagination,
        ...(nextPageToken === undefined ? {} : { next_cursor: nextPageToken }),
        exhausted: nextPageToken === undefined
      },
      data: studies.map(normalizeStudy)
    });
  } catch (error) {
    return clinicalTrialsErrorEnvelope<ClinicalTrial[]>(error, {
      recordType: "clinical_trial_search_result",
      query: queryEnvelope,
      pagination: { ...pagination, exhausted: false },
      data: []
    });
  }
};

export const fetchClinicalTrial = async (
  nctId: string
): Promise<ProvenanceEnvelope<ClinicalTrial>> => {
  if (!nctIdSchema.safeParse(nctId).success) {
    throw new Error("Invalid ClinicalTrials.gov NCT ID");
  }

  const context = {
    recordType: "clinical_trial",
    primaryIdentifier: nctId,
    pagination: { exhausted: false },
    data: {}
  };
  try {
    const response = await fetchClinicalTrialsJson(`${STUDIES_URL}/${nctId}`);
    const parsedStudy = studySchema.safeParse(response);
    if (!parsedStudy.success || parsedStudy.data.protocolSection.identificationModule.nctId !== nctId) {
      throw new ClinicalTrialsResponseError();
    }

    const trial = normalizeStudy(parsedStudy.data);
    const freshness = await providerFreshness();
    return okEnvelope({
      provider: "clinicaltrials_gov",
      recordType: "clinical_trial",
      primaryIdentifier: nctId,
      sourceIdentity: trial.title === undefined ? {} : { title: trial.title },
      pagination: { exhausted: true },
      returned: 1,
      accessStatus: "api_visible_complete",
      limitations: freshness.dataTimestamp === undefined ? [FRESHNESS_LIMITATION] : [],
      ...(freshness.dataTimestamp === undefined
        ? {}
        : { rawMetadata: { data_timestamp: freshness.dataTimestamp } }),
      data: trial
    });
  } catch (error) {
    if (httpStatus(error) === 404) {
      return errorEnvelope({
        provider: "clinicaltrials_gov",
        recordType: "clinical_trial",
        primaryIdentifier: nctId,
        pagination: { exhausted: true },
        returned: 0,
        accessStatus: "not_found",
        code: "clinical_trial_not_found",
        message: "ClinicalTrials.gov study not found",
        httpStatus: 404,
        retryable: false,
        data: {}
      }) as ProvenanceEnvelope<ClinicalTrial>;
    }
    return clinicalTrialsErrorEnvelope<ClinicalTrial>(error, context);
  }
};

const fetchClinicalTrialsJson = async (url: string): Promise<unknown> => {
  try {
    return await fetchJson(url);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid upstream JSON response") {
      throw new ClinicalTrialsResponseError();
    }
    throw error;
  }
};

const providerFreshness = async (): Promise<{ dataTimestamp?: string }> => {
  const now = Date.now();
  const currentFetch = globalThis.fetch;
  if (
    versionCache !== undefined &&
    versionCache.fetchImplementation === currentFetch &&
    now - versionCache.fetchedAt < VERSION_CACHE_MS
  ) {
    return { ...(versionCache.dataTimestamp === undefined ? {} : { dataTimestamp: versionCache.dataTimestamp }) };
  }

  let dataTimestamp: string | undefined;
  try {
    const response = versionResponseSchema.safeParse(await fetchClinicalTrialsJson(VERSION_URL));
    if (response.success) {
      dataTimestamp = response.data.dataTimestamp;
    }
  } catch {
    // Freshness metadata is supplementary and must not discard retrieved study data.
  }
  versionCache = { fetchedAt: now, fetchImplementation: currentFetch, ...(dataTimestamp === undefined ? {} : { dataTimestamp }) };
  return dataTimestamp === undefined ? {} : { dataTimestamp };
};

const normalizeStudy = (study: z.infer<typeof studySchema>): ClinicalTrial => {
  const { protocolSection, resultsSection } = study;
  const identification = protocolSection.identificationModule;
  const status = protocolSection.statusModule;
  const design = protocolSection.designModule;
  const sponsors = protocolSection.sponsorCollaboratorsModule;
  const sponsorNames = [
    ...(sponsors?.leadSponsor === undefined ? [] : [sponsors.leadSponsor.name]),
    ...(sponsors?.collaborators?.map(({ name }) => name) ?? [])
  ];
  const interventions = protocolSection.armsInterventionsModule?.interventions;
  const references = protocolSection.referencesModule?.references;

  return {
    nct_id: identification.nctId,
    ...definedString("title", identification.briefTitle ?? identification.officialTitle),
    ...definedString("status", status?.overallStatus),
    ...definedString("study_type", design?.studyType),
    ...definedArray("phases", design?.phases),
    ...definedArray("conditions", protocolSection.conditionsModule?.conditions),
    ...(interventions === undefined ? {} : { interventions: interventions.map(normalizeIntervention) }),
    ...(sponsorNames.length === 0 ? {} : { sponsors: sponsorNames }),
    ...(design?.enrollmentInfo === undefined
      ? {}
      : { enrollment: normalizeEnrollment(design.enrollmentInfo) }),
    ...definedString("start_date", status?.startDateStruct?.date),
    ...definedString("completion_date", status?.completionDateStruct?.date),
    has_results: resultsSection !== undefined,
    ...(references === undefined ? {} : { references: references.map(normalizeReference) }),
    ...definedString(
      "last_update",
      status?.lastUpdatePostDateStruct?.date ?? status?.lastUpdateSubmitDate
    )
  };
};

const normalizeIntervention = (
  intervention: z.infer<typeof interventionSchema>
): ClinicalTrialIntervention => ({
  ...definedString("type", intervention.type),
  ...definedString("name", intervention.name)
});

const normalizeReference = (
  reference: z.infer<typeof referenceSchema>
): ClinicalTrialReference => ({
  ...definedString("pmid", reference.pmid),
  ...definedString("type", reference.type),
  ...definedString("citation", reference.citation)
});

const normalizeEnrollment = (
  enrollment: NonNullable<z.infer<typeof studySchema>["protocolSection"]["designModule"]>["enrollmentInfo"]
): ClinicalTrialEnrollment => ({
  count: enrollment!.count,
  ...definedString("type", enrollment!.type)
});

const definedString = <T extends string>(
  key: T,
  value: string | undefined
): Partial<Record<T, string>> => value === undefined ? {} : { [key]: value } as Record<T, string>;

const definedArray = <T extends string>(
  key: T,
  value: string[] | undefined
): Partial<Record<T, string[]>> => value === undefined ? {} : { [key]: value } as Record<T, string[]>;

interface ClinicalTrialsErrorContext {
  recordType: string;
  primaryIdentifier?: string;
  query?: unknown;
  pagination: { cursor?: string; page_size?: number; exhausted: boolean };
  data: unknown;
}

const clinicalTrialsErrorEnvelope = <T>(
  error: unknown,
  context: ClinicalTrialsErrorContext
): ProvenanceEnvelope<T> => {
  const status = httpStatus(error);
  let accessStatus: AccessStatus = "error";
  let code = "clinical_trials_request_failed";
  let message = "ClinicalTrials.gov request failed";
  let retryable = false;

  if (error instanceof ClinicalTrialsResponseError) {
    code = "clinical_trials_response_invalid";
    message = "ClinicalTrials.gov response was invalid";
  } else if (status === 429) {
    accessStatus = "rate_limited";
    code = "clinical_trials_rate_limited";
    message = "ClinicalTrials.gov rate limit reached";
    retryable = true;
  } else if (status === 401 || status === 403) {
    accessStatus = "inaccessible";
    code = "clinical_trials_access_denied";
    message = "ClinicalTrials.gov access denied";
  } else if (status !== undefined && status >= 500) {
    code = "clinical_trials_upstream_unavailable";
    message = "ClinicalTrials.gov upstream service unavailable";
    retryable = true;
  }

  return errorEnvelope({
    provider: "clinicaltrials_gov",
    recordType: context.recordType,
    ...(context.primaryIdentifier === undefined ? {} : { primaryIdentifier: context.primaryIdentifier }),
    ...(context.query === undefined ? {} : { query: context.query }),
    pagination: context.pagination,
    returned: 0,
    accessStatus,
    code,
    message,
    ...(status === undefined ? {} : { httpStatus: status }),
    retryable,
    data: context.data as T
  }) as ProvenanceEnvelope<T>;
};

const httpStatus = (error: unknown): number | undefined => {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const match = /^Upstream request failed with status (\d{3})$/.exec(error.message);
  return match === null ? undefined : Number(match[1]);
};

class ClinicalTrialsResponseError extends Error {}
