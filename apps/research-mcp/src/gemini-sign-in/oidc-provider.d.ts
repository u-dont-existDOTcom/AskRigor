/**
 * The part of oidc-provider 9.15.0 that Gemini's sign-in uses. The package ships no type declarations (DefinitelyTyped
 * stops at 9.13.1), so these are written from its source (lib/provider.js, lib/models/*.js) for exactly the calls made
 * here; anything not declared is not used.
 */
declare module "oidc-provider" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  export type AdapterPayload = Record<string, unknown> & {
    jti?: string;
    grantId?: string;
    uid?: string;
    accountId?: string;
    clientId?: string;
    consumed?: number;
    exp?: number;
    iat?: number;
  };

  export interface Adapter {
    upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void>;
    find(id: string): Promise<AdapterPayload | undefined>;
    findByUserCode(userCode: string): Promise<AdapterPayload | undefined>;
    findByUid(uid: string): Promise<AdapterPayload | undefined>;
    consume(id: string): Promise<void>;
    destroy(id: string): Promise<void>;
    revokeByGrantId(grantId: string): Promise<void>;
  }

  export interface Client {
    readonly clientId: string;
    readonly redirectUris?: readonly string[];
    readonly grantTypes?: readonly string[];
    readonly responseTypes?: readonly string[];
    readonly tokenEndpointAuthMethod?: string;
    readonly tokenEndpointAuthSigningAlg?: string;
    readonly jwksUri?: string;
    readonly jwks?: unknown;
    readonly sectorIdentifierUri?: string;
    readonly requestUris?: readonly string[];
    readonly clientIdMetadataDocument?: boolean;
    grantTypeAllowed(type: string): boolean;
  }

  export interface KoaContextWithOIDC {
    readonly method: string;
    readonly path: string;
    status: number;
    body: unknown;
    readonly oidc: {
      readonly route: string;
      readonly issuer: string;
      readonly client?: Client;
      readonly params?: Record<string, unknown>;
      readonly entities: Record<string, unknown>;
    };
    set(field: string, value: string): void;
  }

  export interface InteractionDetails {
    readonly uid: string;
    readonly prompt: { readonly name: string; readonly reasons: readonly string[]; readonly details: Record<string, unknown> };
    readonly params: Record<string, unknown>;
    readonly session?: { readonly accountId: string; readonly uid: string };
    readonly grantId?: string;
    readonly exp: number;
  }

  export interface InteractionResults {
    login?: { accountId: string; remember?: boolean };
    consent?: { grantId: string };
    error?: string;
    error_description?: string;
  }

  export class Grant {
    constructor(properties: { accountId: string; clientId: string });
    readonly jti: string;
    readonly accountId?: string;
    readonly clientId?: string;
    readonly exp?: number;
    addResourceScope(resource: string, scope: string): void;
    rejectOIDCScope(scope: string): void;
    rejectResourceScope(resource: string, scope: string): void;
    save(ttl?: number): Promise<string>;
    destroy(): Promise<void>;
    static find(id: string): Promise<Grant | undefined>;
  }

  export interface AccessTokenInstance {
    readonly jti: string;
    readonly accountId?: string;
    readonly clientId?: string;
    readonly grantId?: string;
    readonly aud?: string | readonly string[];
    readonly scope?: string;
    readonly exp?: number;
    readonly iat?: number;
    readonly isExpired: boolean;
    readonly kind: string;
  }

  export interface Configuration {
    [key: string]: unknown;
  }

  export class Provider {
    constructor(issuer: string, configuration?: Configuration);
    proxy: boolean;
    readonly issuer: string;
    readonly Grant: typeof Grant;
    readonly AccessToken: { find(value: string): Promise<AccessTokenInstance | undefined> };
    callback(): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
    use(middleware: (ctx: KoaContextWithOIDC, next: () => Promise<void>) => Promise<void>): this;
    interactionDetails(request: IncomingMessage, response: ServerResponse): Promise<InteractionDetails>;
    interactionFinished(
      request: IncomingMessage,
      response: ServerResponse,
      result: InteractionResults,
      options?: { mergeWithLastSubmission?: boolean },
    ): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export const errors: {
    InvalidClientAuth: new (description?: string) => Error;
    InvalidClient: new (description?: string) => Error;
    InvalidTarget: new (description?: string) => Error;
  };

  export default Provider;
}
