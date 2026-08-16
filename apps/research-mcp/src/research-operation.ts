import type {
  CallToolResult,
  ToolAnnotations
} from "@modelcontextprotocol/sdk/types.js";

export type ResearchOperationHandler = (
  input: Record<string, unknown>
) => Promise<CallToolResult>;

export interface ResearchOperation {
  readonly name: string;
  readonly actionPath: `/actions/research/${string}`;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly outputSchema: unknown;
  readonly annotations: ToolAnnotations;
  readonly execute: ResearchOperationHandler;
  readonly mcpConfig: unknown;
}
