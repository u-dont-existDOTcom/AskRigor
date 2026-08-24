import { z } from "zod";

import {
  finalizationDecisionSchema,
  type ResearchFinalizationDecision
} from "./actions/research-session-controller.js";
import {
  PRIVATE_RESEARCH_ORCHESTRATION_PREFIX,
  privateResearchOrchestrationViewSchema
} from "./private-research-orchestration.js";

const sessionIdSchema = z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const errorSchema = z.object({
  error: z.object({
    code: z.string().min(1).max(200),
    retryable: z.boolean()
  }).strict()
}).strict();

export type PrivateResearchView = z.output<
  typeof privateResearchOrchestrationViewSchema
>;

export interface PrivateResearchOrchestrationClient {
  start(input: {
    research_target: string;
    diagnosis_status: "diagnosis_not_specified" | "user_supplied_diagnosis";
  }): Promise<PrivateResearchView>;
  status(sessionId: string): Promise<PrivateResearchView>;
  resume(sessionId: string): Promise<PrivateResearchView>;
  advance(input: {
    session_id: string;
    state_digest: string;
  }): Promise<PrivateResearchView>;
  submit(input: {
    session_id: string;
    state_digest: string;
    work_type: "module_applicability" | "candidate_screening";
    submission: unknown;
  }): Promise<PrivateResearchView>;
  finalize(sessionId: string): Promise<ResearchFinalizationDecision>;
}

export function createHttpPrivateResearchOrchestrationClient(input: {
  baseUrl: URL;
  apiKey: string;
  fetch?: typeof fetch;
}): PrivateResearchOrchestrationClient {
  const baseUrl = new URL(input.baseUrl);
  const apiKey = input.apiKey.trim();
  const fetcher = input.fetch ?? fetch;
  if (!/^https?:$/u.test(baseUrl.protocol) || apiKey.length < 32) {
    throw new Error("Invalid private orchestration client configuration");
  }
  const post = async (suffix: string, body: unknown): Promise<unknown> => {
    const response = await fetcher(
      new URL(`${PRIVATE_RESEARCH_ORCHESTRATION_PREFIX}${suffix}`, baseUrl),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );
    const payload: unknown = await response.json();
    if (!response.ok) {
      const parsedError = errorSchema.safeParse(payload);
      throw new PrivateOrchestrationClientError(
        response.status,
        parsedError.success ? parsedError.data.error.code : "unknown_private_error",
        parsedError.success && parsedError.data.error.retryable
      );
    }
    return payload;
  };
  const client: PrivateResearchOrchestrationClient = {
    async start(body) {
      return privateResearchOrchestrationViewSchema.parse(await post("/start", body));
    },
    async status(id) {
      return privateResearchOrchestrationViewSchema.parse(
        await post("/status", { session_id: sessionIdSchema.parse(id) })
      );
    },
    async resume(id) {
      return privateResearchOrchestrationViewSchema.parse(
        await post("/resume", { session_id: sessionIdSchema.parse(id) })
      );
    },
    async advance(body) {
      return privateResearchOrchestrationViewSchema.parse(await post("/advance", {
        session_id: sessionIdSchema.parse(body.session_id),
        state_digest: digestSchema.parse(body.state_digest)
      }));
    },
    async submit(body) {
      return privateResearchOrchestrationViewSchema.parse(await post("/submit", body));
    },
    async finalize(id) {
      return finalizationDecisionSchema.parse(
        await post("/finalize", { session_id: sessionIdSchema.parse(id) })
      );
    }
  };
  return Object.freeze(client);
}

export class PrivateOrchestrationClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly retryable: boolean
  ) {
    super("Private AskRigor orchestration request failed");
    this.name = "PrivateOrchestrationClientError";
  }
}
