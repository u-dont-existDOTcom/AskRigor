import type {
  CallToolResult,
  ToolAnnotations
} from "@modelcontextprotocol/sdk/types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

export interface ResearchOperationExtra {
  authInfo?: AuthInfo;
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
