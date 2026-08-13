import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GitHubApiError,
  GitHubInstallationTokenProvider,
} from "../apps/research-mcp/src/lessons/github-app.js";

const API_HEADERS = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "AskRigor-Lesson-Queue/0.1",
};

function keyFixture() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    privateKeyBase64: Buffer.from(pem, "utf8").toString("base64"),
    publicKey,
  };
}

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    token: "installation-token-fixture",
    expires_at: "2026-08-13T12:30:00.000Z",
    permissions: { issues: "write", metadata: "read" },
    repository_selection: "selected",
    ...overrides,
  }), { status: 201, headers: { "content-type": "application/json" } });
}

function repositoryResponse(repositories: unknown[] = [{
  id: 42,
  name: "AskRigor-lessons",
  full_name: "u-dont-existDOTcom/AskRigor-lessons",
  private: true,
}]) {
  return new Response(JSON.stringify({ total_count: repositories.length, repositories }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function createProvider(fetchImpl: typeof fetch, privateKeyBase64: string, now: () => Date) {
  return new GitHubInstallationTokenProvider({
    appId: "123456",
    installationId: "987654",
    privateKeyBase64,
    fetch: fetchImpl,
    now,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("least-privilege GitHub App installation token", () => {
  it("signs the exact short-lived JWT and scopes the token request to one repository", async () => {
    const { privateKeyBase64, publicKey } = keyFixture();
    const now = new Date("2026-08-13T12:00:00.000Z");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(repositoryResponse());
    const provider = createProvider(fetchMock, privateKeyBase64, () => now);

    await expect(provider.getToken()).resolves.toBe("installation-token-fixture");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [exchangeUrl, exchangeInit] = fetchMock.mock.calls[0]!;
    expect(exchangeUrl).toBe("https://api.github.com/app/installations/987654/access_tokens");
    expect(exchangeInit?.method).toBe("POST");
    expect(JSON.parse(String(exchangeInit?.body))).toEqual({
      repositories: ["AskRigor-lessons"],
      permissions: { issues: "write", metadata: "read" },
    });
    const exchangeHeaders = new Headers(exchangeInit?.headers);
    expect(Object.fromEntries(API_HEADERS_ENTRIES(exchangeHeaders))).toEqual(API_HEADERS);
    const authorization = exchangeHeaders.get("authorization");
    expect(authorization).toMatch(/^Bearer [A-Za-z0-9._-]+$/);
    const jwt = authorization!.slice("Bearer ".length);
    const [encodedHeader, encodedPayload, encodedSignature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(encodedHeader!, "base64url").toString("utf8"))).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(encodedPayload!, "base64url").toString("utf8"))).toEqual({
      iat: 1_786_622_340,
      exp: 1_786_622_940,
      iss: "123456",
    });
    expect(verify(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`, "ascii"),
      publicKey,
      Buffer.from(encodedSignature!, "base64url"),
    )).toBe(true);

    const [repositoryUrl, repositoryInit] = fetchMock.mock.calls[1]!;
    expect(repositoryUrl).toBe("https://api.github.com/installation/repositories?per_page=100&page=1");
    expect(repositoryInit?.method).toBe("GET");
    const repositoryHeaders = new Headers(repositoryInit?.headers);
    expect(repositoryHeaders.get("authorization")).toBe("Bearer installation-token-fixture");
    expect(Object.fromEntries(API_HEADERS_ENTRIES(repositoryHeaders))).toEqual(API_HEADERS);
  });

  it("caches only until sixty seconds before token expiry", async () => {
    const { privateKeyBase64 } = keyFixture();
    let now = new Date("2026-08-13T12:00:00.000Z");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(repositoryResponse())
      .mockResolvedValueOnce(tokenResponse({ token: "replacement-token" }))
      .mockResolvedValueOnce(repositoryResponse());
    const provider = createProvider(fetchMock, privateKeyBase64, () => now);

    await expect(provider.getToken()).resolves.toBe("installation-token-fixture");
    now = new Date("2026-08-13T12:28:59.999Z");
    await expect(provider.getToken()).resolves.toBe("installation-token-fixture");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    now = new Date("2026-08-13T12:29:00.000Z");
    await expect(provider.getToken()).resolves.toBe("replacement-token");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["contents", { issues: "write", metadata: "read", contents: "read" }],
    ["pull requests", { issues: "write", metadata: "read", pull_requests: "read" }],
    ["actions", { issues: "write", metadata: "read", actions: "read" }],
    ["administration", { issues: "write", metadata: "read", administration: "read" }],
    ["unexpected permission", { issues: "write", metadata: "read", discussions: "read" }],
  ])("rejects a token response containing %s without disclosing response data", async (_name, permissions) => {
    const { privateKeyBase64 } = keyFixture();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(tokenResponse({ permissions }));
    const provider = createProvider(fetchMock, privateKeyBase64, () => new Date("2026-08-13T12:00:00.000Z"));

    const error = await provider.getToken().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error).toMatchObject({ code: "github_scope_invalid", retryable: false });
    expect(String(error)).not.toContain("installation-token-fixture");
    expect(String(error)).not.toContain(String(Object.keys(permissions).at(-1)));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["all repository selection", { repository_selection: "all" }, repositoryResponse()],
    ["another repository", {}, repositoryResponse([
      { id: 42, name: "AskRigor-lessons", full_name: "u-dont-existDOTcom/AskRigor-lessons", private: true },
      { id: 43, name: "other-private", full_name: "u-dont-existDOTcom/other-private", private: true },
    ])],
    ["wrong repository", {}, repositoryResponse([
      { id: 43, name: "other-private", full_name: "u-dont-existDOTcom/other-private", private: true },
    ])],
  ])("rejects %s installation scope", async (_name, tokenOverrides, repositories) => {
    const { privateKeyBase64 } = keyFixture();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse(tokenOverrides))
      .mockResolvedValueOnce(repositories);
    const provider = createProvider(fetchMock, privateKeyBase64, () => new Date("2026-08-13T12:00:00.000Z"));

    await expect(provider.getToken()).rejects.toMatchObject({
      code: "github_scope_invalid",
      retryable: false,
    });
  });

  it("rejects the fixed repository when GitHub enumerates it as public", async () => {
    const { privateKeyBase64 } = keyFixture();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(repositoryResponse([{
        id: 42,
        name: "AskRigor-lessons",
        full_name: "u-dont-existDOTcom/AskRigor-lessons",
        private: false,
      }]));
    const provider = createProvider(fetchMock, privateKeyBase64, () => new Date("2026-08-13T12:00:00.000Z"));

    await expect(provider.getToken()).rejects.toMatchObject({
      code: "github_scope_invalid",
      retryable: false,
    });
  });

  it.each([
    [401, false, "github_auth_unavailable"],
    [403, false, "github_auth_unavailable"],
    [404, false, "github_auth_unavailable"],
    [429, true, "github_service_unavailable"],
    [500, true, "github_service_unavailable"],
    [503, true, "github_service_unavailable"],
  ])("maps GitHub %i to one sanitized typed error", async (status, retryable, code) => {
    const { privateKeyBase64 } = keyFixture();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ message: "private upstream body with token-fixture" }),
      { status },
    ));
    const provider = createProvider(fetchMock, privateKeyBase64, () => new Date("2026-08-13T12:00:00.000Z"));

    const error = await provider.getToken().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error).toMatchObject({ code, retryable });
    expect(String(error)).not.toContain("private upstream body");
    expect(String(error)).not.toContain("token-fixture");
    expect(String(error)).not.toContain("987654");
  });

  it.each([
    [{ "retry-after": "60" }],
    [{ "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1786622460" }],
  ])("maps a rate-limited GitHub 403 to a retryable sanitized service error", async (headers) => {
    const { privateKeyBase64 } = keyFixture();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ message: "private rate-limit response" }),
      { status: 403, headers },
    ));
    const provider = createProvider(fetchMock, privateKeyBase64, () => new Date("2026-08-13T12:00:00.000Z"));

    const error = await provider.getToken().catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "github_service_unavailable", retryable: true });
    expect(String(error)).not.toContain("private rate-limit response");
  });

  it("fully paginates repository enumeration before rejecting any additional repository", async () => {
    const { privateKeyBase64 } = keyFixture();
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: "AskRigor-lessons",
      full_name: "u-dont-existDOTcom/AskRigor-lessons",
      private: true,
    }));
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(repositoryResponse(firstPage))
      .mockResolvedValueOnce(repositoryResponse([{
        id: 101,
        name: "other-private",
        full_name: "u-dont-existDOTcom/other-private",
        private: true,
      }]));
    const provider = createProvider(fetchMock, privateKeyBase64, () => new Date("2026-08-13T12:00:00.000Z"));

    await expect(provider.getToken()).rejects.toMatchObject({ code: "github_scope_invalid" });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/app/installations/987654/access_tokens",
      "https://api.github.com/installation/repositories?per_page=100&page=1",
      "https://api.github.com/installation/repositories?per_page=100&page=2",
    ]);
  });

  it("rejects an invalid base64 private key without echoing credentials", async () => {
    const provider = createProvider(vi.fn<typeof fetch>(), "dG9rZW4tc2VjcmV0", () => new Date("2026-08-13T12:00:00.000Z"));

    const error = await provider.getToken().catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "github_auth_unavailable", retryable: false });
    expect(String(error)).not.toContain("dG9rZW4tc2VjcmV0");
    expect(String(error)).not.toContain("token-secret");
  });

  it("sanitizes an injected clock failure", async () => {
    const { privateKeyBase64 } = keyFixture();
    const provider = createProvider(vi.fn<typeof fetch>(), privateKeyBase64, () => {
      throw new Error("private clock details");
    });

    const error = await provider.getToken().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error).toMatchObject({ code: "github_auth_unavailable", retryable: false });
    expect(String(error)).not.toContain("private clock details");
  });

  it("aborts a hung installation-token exchange at the application deadline", async () => {
    vi.useFakeTimers();
    const { privateKeyBase64 } = keyFixture();
    let requestSignal: AbortSignal | null | undefined;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      requestSignal = init?.signal;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("private hung token exchange")));
      });
    });
    const provider = createProvider(fetchMock, privateKeyBase64, () => new Date("2026-08-13T12:00:00.000Z"));
    const outcome = provider.getToken().catch((value: unknown) => value);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(requestSignal).toBeDefined();
    await vi.advanceTimersByTimeAsync(20_000);
    const error = await outcome;
    expect(error).toMatchObject({ code: "github_service_unavailable", retryable: true });
    expect(String(error)).not.toContain("private hung token exchange");
  });
});

function API_HEADERS_ENTRIES(headers: Headers): Array<[string, string]> {
  return Object.keys(API_HEADERS).map((name) => [name, headers.get(name)!]);
}
