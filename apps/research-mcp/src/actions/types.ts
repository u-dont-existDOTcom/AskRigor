import type { IncomingMessage } from "node:http";

export interface ActionRequestContext {
  request: IncomingMessage;
  clientIp: string;
  body: unknown;
}

export interface ActionResult {
  status: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
}

export interface ActionRoute {
  method: "GET" | "POST";
  path: `/actions/${string}`;
  operationId: string;
  summary: string;
  description: string;
  consequential: boolean;
  public: boolean;
  requestSchema?: Record<string, unknown>;
  responseSchemas: Readonly<Record<number, Record<string, unknown>>>;
  handle(context: ActionRequestContext): Promise<ActionResult>;
}
