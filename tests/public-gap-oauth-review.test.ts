import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from
  "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AuthInfo } from
  "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from "jose";
import {
  InMemoryPublicGapIntakeStore,
  PUBLIC_PROLACTINOMA_GAP_SLUG,
  PublicEvidenceGapIntakeService,
} from "@askrigor/evidence-repository";
import { afterEach, describe, expect, it } from "vitest";

import {
  CASE_REVIEW_SCOPE,
  createJwtOAuthResourceServer,
  oauthResourceServerFromEnv,
  type AskRigorOAuthResourceServer,
} from "../apps/research-mcp/src/oauth-resource-server.js";
import { createAskRigorHttpServer } from
  "../apps/research-mcp/src/server.js";

const resourceUrl = new URL("https://mcp.askrigor.example/mcp");
const issuerUrl = new URL("https://identity.askrigor.example/");
const clients: Client[] = [];
const servers: HttpServer[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => closeServer(server)));
});

describe("public plugin with OAuth-scoped evidence-gap review", () => {
  it("cryptographically enforces JWT issuer, audience, expiry, client, and scopes", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "askrigor-test-key";
    const config = createJwtOAuthResourceServer({
      resourceUrl,
      issuerUrl,
      jwks: createLocalJWKSet({ keys: [publicJwk] }),
      allowedClientIds: ["chatgpt-client"],
      allowedSubjects: ["owner"],
    });
    const sign = (claims: Record<string, unknown>) => new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
      .sign(privateKey);
    const valid = await sign({
      iss: issuerUrl.href,
      aud: resourceUrl.href,
      exp: Math.floor(Date.now() / 1_000) + 300,
      client_id: "chatgpt-client",
      scope: `${CASE_REVIEW_SCOPE} openid`,
      sub: "owner",
    });

    await expect(config.verifier.verifyAccessToken(valid)).resolves.toMatchObject({
      clientId: "chatgpt-client",
      scopes: [CASE_REVIEW_SCOPE, "openid"],
      resource: resourceUrl,
      extra: { subject: "owner" },
    });
    for (const claims of [
      {
        iss: "https://wrong-issuer.example/",
        aud: resourceUrl.href,
        exp: Math.floor(Date.now() / 1_000) + 300,
        client_id: "chatgpt-client",
      },
      {
        iss: issuerUrl.href,
        aud: "https://wrong-resource.example/mcp",
        exp: Math.floor(Date.now() / 1_000) + 300,
        client_id: "chatgpt-client",
      },
      {
        iss: issuerUrl.href,
        aud: resourceUrl.href,
        exp: Math.floor(Date.now() / 1_000) - 30,
        client_id: "chatgpt-client",
      },
      {
        iss: issuerUrl.href,
        aud: resourceUrl.href,
        client_id: "chatgpt-client",
      },
      {
        iss: issuerUrl.href,
        aud: resourceUrl.href,
        exp: Math.floor(Date.now() / 1_000) + 300,
      },
      {
        iss: issuerUrl.href,
        aud: resourceUrl.href,
        exp: Math.floor(Date.now() / 1_000) + 300,
        client_id: "other-client",
        sub: "owner",
      },
      {
        iss: issuerUrl.href,
        aud: resourceUrl.href,
        exp: Math.floor(Date.now() / 1_000) + 300,
        client_id: "chatgpt-client",
        sub: "other-user",
      },
      {
        iss: issuerUrl.href,
        aud: resourceUrl.href,
        exp: Math.floor(Date.now() / 1_000) + 300,
        client_id: "chatgpt-client",
      },
    ]) {
      await expect(config.verifier.verifyAccessToken(await sign(claims)))
        .rejects.toThrow();
    }
  });

  it("requires exact client and owner-subject bindings when OAuth is enabled from the environment", () => {
    const baseEnv = {
      ASKRIGOR_OAUTH_ENABLED: "true",
      ASKRIGOR_OAUTH_RESOURCE_URL: resourceUrl.href,
      ASKRIGOR_OAUTH_ISSUER_URL: issuerUrl.href,
      ASKRIGOR_OAUTH_JWKS_URL: "https://identity.askrigor.example/jwks.json",
      ASKRIGOR_OAUTH_ALLOWED_CLIENT_ID: "chatgpt-client",
      ASKRIGOR_OAUTH_ALLOWED_SUBJECT: "owner",
    } satisfies NodeJS.ProcessEnv;

    expect(oauthResourceServerFromEnv(baseEnv)).toBeDefined();
    for (const missing of [
      "ASKRIGOR_OAUTH_ALLOWED_CLIENT_ID",
      "ASKRIGOR_OAUTH_ALLOWED_SUBJECT",
    ] as const) {
      const invalid = { ...baseEnv };
      delete invalid[missing];
      expect(() => oauthResourceServerFromEnv(invalid)).toThrow(
        `${missing}_INVALID`,
      );
    }
  });

  it("keeps public tools anonymous and declares only case review as OAuth-protected", async () => {
    const { baseUrl } = await startServer(await seededService());
    const client = await connectClient(baseUrl);

    const { tools } = await client.listTools();
    const manifest = await client.callTool({
      name: "get_protocol_manifest",
      arguments: { protocol: "hrp" },
    });
    const review = tools.find(({ name }) =>
      name === "review_evidence_gap_submissions"
    );

    expect(manifest.isError).not.toBe(true);
    expect(tools).toHaveLength(23);
    expect(review?._meta).toEqual({
      securitySchemes: [{ type: "oauth2", scopes: [CASE_REVIEW_SCOPE] }],
    });
    expect(tools.filter(({ name }) =>
      name !== "review_evidence_gap_submissions"
    ).every(({ _meta }) => JSON.stringify(_meta) === JSON.stringify({
      securitySchemes: [{ type: "noauth" }],
    }))).toBe(true);
  });

  it("publishes resource metadata and emits the tool-level linking challenge", async () => {
    const { baseUrl } = await startServer(await seededService());
    const metadata = await fetch(
      new URL("/.well-known/oauth-protected-resource/mcp", baseUrl),
    );
    const client = await connectClient(baseUrl);
    const result = await client.callTool({
      name: "review_evidence_gap_submissions",
      arguments: { gap_slug: PUBLIC_PROLACTINOMA_GAP_SLUG },
    });

    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toEqual({
      resource: resourceUrl.href,
      authorization_servers: [issuerUrl.href],
      scopes_supported: [CASE_REVIEW_SCOPE],
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      ok: false,
      error: {
        code: "authorization_required",
        message: "Connect the reviewer account to inspect private evidence-gap submissions.",
      },
    });
    expect(result._meta?.["mcp/www_authenticate"]).toEqual([
      expect.stringContaining(
        'resource_metadata="https://mcp.askrigor.example/.well-known/oauth-protected-resource/mcp"',
      ),
    ]);
  });

  it("rejects stale, wrong-resource, and insufficient-scope tokens without breaking public tools", async () => {
    for (const token of ["expired", "wrong-resource", "unscoped", "invalid"]) {
      const { baseUrl } = await startServer(await seededService());
      const client = await connectClient(baseUrl, token);
      const manifest = await client.callTool({
        name: "get_protocol_manifest",
        arguments: { protocol: "universal" },
      });
      const review = await client.callTool({
        name: "review_evidence_gap_submissions",
        arguments: { gap_slug: PUBLIC_PROLACTINOMA_GAP_SLUG },
      });

      expect(manifest.isError, token).not.toBe(true);
      expect(review.isError, token).toBe(true);
      expect(review.structuredContent, token).toMatchObject({
        ok: false,
        error: {
          code: token === "unscoped"
            ? "insufficient_scope"
            : "authorization_required",
        },
      });
    }
  });

  it("returns only the existing redacted, partial-aware, noncausal review projection with cases:review", async () => {
    const { baseUrl } = await startServer(await seededService());
    const client = await connectClient(baseUrl, "reviewer");
    const result = await client.callTool({
      name: "review_evidence_gap_submissions",
      arguments: { gap_slug: PUBLIC_PROLACTINOMA_GAP_SLUG },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: true,
      counts: {
        total: 1,
        partial: 1,
        remissionOrRegression: 0,
        comparisonOrNonRemission: 1,
      },
      causalAnalysisPermitted: false,
      items: [{
        participantPseudonym: expect.stringMatching(/^ARCASE-/u),
        provenance: "SELF",
        evidenceLevel: "L1_STRUCTURED_CASE",
        verificationStatus: "PARTICIPANT_REPORTED_UNVERIFIED",
        completenessLabel: "PARTIAL",
        partial: true,
        narrativePrivacyTransform: "BASIC_CONTACT_REDACTION_APPLIED",
        narrativeForPrivateGptReview: expect.not.stringContaining(
          "participant@example.com",
        ),
      }],
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain("recoveryKey");
    expect(JSON.stringify(result.structuredContent)).not.toContain(
      "participant@example.com",
    );
  });
});

async function seededService(): Promise<PublicEvidenceGapIntakeService> {
  let timestamp = 0;
  const service = new PublicEvidenceGapIntakeService(
    new InMemoryPublicGapIntakeStore(),
    {
      encryptionKey: Buffer.alloc(32, 7),
      encryptionKeyId: "oauth-review-test",
      now: () => `2026-08-31T17:00:${String(timestamp++).padStart(2, "0")}.000Z`,
      random: (size) => new Uint8Array(size).fill(9),
      randomUuid: () => "00000000-0000-4000-8000-000000000150",
    },
  );
  const started = await service.start({
    gapSlug: PUBLIC_PROLACTINOMA_GAP_SLUG,
    provenance: "SELF",
  });
  await service.saveNarrative(
    started.submissionId,
    started.recoveryKey,
    "My prolactinoma did not remit. Contact participant@example.com for details.",
  );
  await service.saveDetails(started.submissionId, started.recoveryKey, {
    outcome: "STABLE",
    exposure: "PREGNANCY_POSTPARTUM",
    treatmentContext: "UNKNOWN",
    transitionTiming: "Pregnancy occurred during follow-up.",
  });
  await service.submit(started.submissionId, started.recoveryKey, {
    privateGptAnalysis: true,
    deidentifiedAggregateUse: true,
    futureFollowup: false,
    noticeVersion: "public-gap-intake-v1",
    observationalAcknowledgement: true,
  });
  return service;
}

function oauthConfig(): AskRigorOAuthResourceServer {
  return {
    resourceUrl,
    authorizationServerUrls: [issuerUrl],
    verifier: {
      async verifyAccessToken(token: string): Promise<AuthInfo> {
        if (token === "invalid") throw new Error("invalid token");
        return {
          token,
          clientId: "chatgpt-test-client",
          scopes: token === "unscoped" ? [] : [CASE_REVIEW_SCOPE],
          expiresAt: token === "expired"
            ? Math.floor(Date.now() / 1_000) - 60
            : Math.floor(Date.now() / 1_000) + 300,
          resource: token === "wrong-resource"
            ? new URL("https://other.example/mcp")
            : resourceUrl,
          extra: { subject: "owner-test" },
        };
      },
    },
  };
}

async function startServer(
  service: PublicEvidenceGapIntakeService,
): Promise<{ baseUrl: URL }> {
  const server = createAskRigorHttpServer({
    publicServerEnabled: true,
    publicEvidenceGapReviewService: service,
    oauthResourceServer: oauthConfig(),
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { baseUrl: new URL(`http://127.0.0.1:${address.port}`) };
}

async function connectClient(baseUrl: URL, token?: string): Promise<Client> {
  const client = new Client({ name: "oauth-review-test", version: "1.0.0" });
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(
    new URL("/mcp", baseUrl),
    token === undefined
      ? undefined
      : { requestInit: { headers: { authorization: `Bearer ${token}` } } },
  ));
  return client;
}

async function closeServer(server: HttpServer): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => {
    if (error === undefined) resolve();
    else reject(error);
  }));
}
