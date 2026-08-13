import { createSign } from "node:crypto";

export const GITHUB_API_ROOT = "https://api.github.com" as const;
export const GITHUB_API_VERSION = "2022-11-28" as const;
export const GITHUB_USER_AGENT = "AskRigor-Lesson-Queue/0.1" as const;
export const LESSON_REPOSITORY_OWNER = "u-dont-existDOTcom" as const;
export const LESSON_REPOSITORY_NAME = "AskRigor-lessons" as const;
export const LESSON_REPOSITORY_FULL_NAME = `${LESSON_REPOSITORY_OWNER}/${LESSON_REPOSITORY_NAME}` as const;

export type GitHubErrorCode =
  | "github_auth_unavailable"
  | "github_service_unavailable"
  | "github_scope_invalid";

/** A deliberately bounded error that never carries upstream bodies or credentials. */
export class GitHubApiError extends Error {
  readonly code: GitHubErrorCode;
  readonly retryable: boolean;

  constructor(code: GitHubErrorCode, retryable: boolean) {
    super(code);
    this.name = "GitHubApiError";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface GitHubTokenProvider {
  getToken(): Promise<string>;
}

export interface GitHubInstallationTokenProviderOptions {
  appId: string;
  installationId: string;
  privateKeyBase64: string;
  fetch: typeof fetch;
  now?: () => Date;
}

interface CachedToken {
  value: string;
  usableUntilMilliseconds: number;
}

const REQUIRED_PERMISSIONS = { issues: "write", metadata: "read" } as const;
const TOKEN_EXPIRY_SKEW_MILLISECONDS = 60_000;

/** Exchanges a short-lived App JWT for one verified, selected-repository token. */
export class GitHubInstallationTokenProvider implements GitHubTokenProvider {
  private readonly now: () => Date;
  private cachedToken?: CachedToken;

  constructor(private readonly options: GitHubInstallationTokenProviderOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async getToken(): Promise<string> {
    const nowMilliseconds = this.now().getTime();
    if (this.cachedToken && nowMilliseconds < this.cachedToken.usableUntilMilliseconds) {
      return this.cachedToken.value;
    }

    const jwt = this.createAppJwt(nowMilliseconds);
    const response = await githubRequestJson(
      this.options.fetch,
      `${GITHUB_API_ROOT}/app/installations/${encodeURIComponent(this.options.installationId)}/access_tokens`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          repositories: [LESSON_REPOSITORY_NAME],
          permissions: REQUIRED_PERMISSIONS,
        }),
      },
    );

    const token = parseVerifiedToken(response, nowMilliseconds);
    await this.verifyRepositorySelection(token.value);
    this.cachedToken = token;
    return token.value;
  }

  private createAppJwt(nowMilliseconds: number): string {
    try {
      if (!Number.isFinite(nowMilliseconds)) throw new Error("invalid clock");
      const nowSeconds = Math.floor(nowMilliseconds / 1_000);
      const encodedHeader = encodeJson({ alg: "RS256", typ: "JWT" });
      const encodedPayload = encodeJson({
        iat: nowSeconds - 60,
        exp: nowSeconds + 540,
        iss: this.options.appId,
      });
      const unsigned = `${encodedHeader}.${encodedPayload}`;
      const privateKey = Buffer.from(this.options.privateKeyBase64, "base64").toString("utf8");
      const signer = createSign("RSA-SHA256");
      signer.update(unsigned, "ascii");
      signer.end();
      const signature = signer.sign(privateKey).toString("base64url");
      return `${unsigned}.${signature}`;
    } catch {
      throw new GitHubApiError("github_auth_unavailable", false);
    }
  }

  private async verifyRepositorySelection(token: string): Promise<void> {
    const fullNames: string[] = [];
    for (let page = 1; ; page += 1) {
      const response = await githubRequestJson(
        this.options.fetch,
        `${GITHUB_API_ROOT}/installation/repositories?per_page=100&page=${page}`,
        {
          method: "GET",
          headers: { authorization: `Bearer ${token}` },
        },
      );
      if (!isRecord(response) || !Array.isArray(response.repositories)) {
        throw new GitHubApiError("github_scope_invalid", false);
      }
      for (const repository of response.repositories) {
        if (!isRecord(repository) || typeof repository.full_name !== "string") {
          throw new GitHubApiError("github_scope_invalid", false);
        }
        fullNames.push(repository.full_name);
      }
      if (response.repositories.length < 100) break;
    }

    if (fullNames.length !== 1 || fullNames[0] !== LESSON_REPOSITORY_FULL_NAME) {
      throw new GitHubApiError("github_scope_invalid", false);
    }
  }
}

/** Makes one GitHub REST request with the repository client's fixed headers. */
export async function githubRequestJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/vnd.github+json");
    headers.set("x-github-api-version", GITHUB_API_VERSION);
    headers.set("user-agent", GITHUB_USER_AGENT);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    response = await fetchImpl(url, { ...init, headers });
  } catch {
    throw new GitHubApiError("github_service_unavailable", true);
  }

  if (!response.ok) throw errorForResponse(response);
  try {
    return await response.json();
  } catch {
    throw new GitHubApiError("github_service_unavailable", true);
  }
}

function parseVerifiedToken(value: unknown, nowMilliseconds: number): CachedToken {
  if (!isRecord(value) || typeof value.token !== "string" || value.token.length === 0) {
    throw new GitHubApiError("github_auth_unavailable", false);
  }
  if (value.repository_selection !== "selected" || !hasExactPermissions(value.permissions)) {
    throw new GitHubApiError("github_scope_invalid", false);
  }
  if (typeof value.expires_at !== "string") {
    throw new GitHubApiError("github_auth_unavailable", false);
  }
  const expiresAtMilliseconds = Date.parse(value.expires_at);
  if (!Number.isFinite(expiresAtMilliseconds) || expiresAtMilliseconds <= nowMilliseconds) {
    throw new GitHubApiError("github_auth_unavailable", false);
  }
  return {
    value: value.token,
    usableUntilMilliseconds: expiresAtMilliseconds - TOKEN_EXPIRY_SKEW_MILLISECONDS,
  };
}

function hasExactPermissions(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 2 &&
    keys[0] === "issues" &&
    keys[1] === "metadata" &&
    value.issues === "write" &&
    value.metadata === "read";
}

function errorForResponse(response: Response): GitHubApiError {
  const status = response.status;
  if (status === 403 && (
    response.headers.has("retry-after") ||
    response.headers.get("x-ratelimit-remaining") === "0"
  )) {
    return new GitHubApiError("github_service_unavailable", true);
  }
  if (status === 401 || status === 403 || status === 404) {
    return new GitHubApiError("github_auth_unavailable", false);
  }
  if (status === 429 || status >= 500) {
    return new GitHubApiError("github_service_unavailable", true);
  }
  return new GitHubApiError("github_service_unavailable", false);
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
