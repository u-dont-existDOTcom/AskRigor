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

export class ActionResponseTooLargeError extends Error {
  constructor(message = "Valid Action output cannot fit the response byte limit") {
    super(message);
    this.name = "ActionResponseTooLargeError";
  }
}

export interface ActionRequiredResponseHeader {
  required: true;
  description: string;
  schema: {
    type: "integer";
    minimum: number;
  };
}

export interface ActionRoute {
  method: "GET" | "POST";
  path: `/actions/${string}`;
  operationId: string;
  summary: string;
  description: string;
  consequential: boolean;
  public: boolean;
  publicResearch?: true;
  maximumRequestBytes?: number;
  maximumResponseBytes?: number;
  requestSchema?: Record<string, unknown>;
  responseSchemas: Readonly<Record<number, Record<string, unknown>>>;
  responseHeaders?: Readonly<Record<
    number,
    Readonly<Record<string, ActionRequiredResponseHeader>>
  >>;
  handle(context: ActionRequestContext): Promise<ActionResult>;
}
