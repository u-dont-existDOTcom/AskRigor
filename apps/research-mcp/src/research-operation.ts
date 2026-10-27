import type {
  CallToolResult,
  ToolAnnotations
} from "@modelcontextprotocol/sdk/types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { z } from "zod";

export interface ResearchOperationExtra {
  authInfo?: AuthInfo;
  /**
   * Set by the Custom GPT Action adapter. Views shaped for MCP clients (such
   * as the compact audit sample) are skipped for it.
   */
  surface?: "action";
}

export type ResearchOperationHandler = (
  input: Record<string, unknown>,
  extra?: ResearchOperationExtra,
) => Promise<CallToolResult>;

export interface ResearchOperation {
  readonly name: string;
  readonly actionPath: `/actions/research/${string}`;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly outputSchema: unknown;
  readonly annotations: ToolAnnotations;
  readonly actionEnabled?: boolean;
  readonly execute: ResearchOperationHandler;
  readonly mcpConfig: unknown;
}

/** Registered MCP operations retain their publication and runtime contracts separately. */
export interface RegisteredResearchOperation extends ResearchOperation {
  readonly publishedInputSchema: z.ZodObject;
  readonly runtimeInputSchema: z.ZodObject;
  readonly runtimeOutputSchema: z.ZodObject;
}
