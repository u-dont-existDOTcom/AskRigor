import { describe, expect, it } from "vitest";

import { researchContributorAccessConfigFromEnv } from
  "../apps/research-mcp/src/config.js";

const secret = Buffer.alloc(32, 23).toString("base64url");

describe("research contributor access configuration", () => {
  it("is disabled unless explicitly enabled", () => {
    expect(researchContributorAccessConfigFromEnv({})).toBeUndefined();
  });

  it("accepts one private PostgreSQL URL and an exact base64url identity secret", () => {
    expect(researchContributorAccessConfigFromEnv({
      ASKRIGOR_RESEARCH_ACCESS_ENABLED: "true",
      ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL:
        "postgresql://research-access:secret@living-evidence/askrigor",
      ASKRIGOR_RESEARCH_ACCESS_DATABASE_SCHEMA: "living_evidence",
      ASKRIGOR_RESEARCH_ACCESS_DATABASE_SSLMODE: "require",
      ASKRIGOR_RESEARCH_IDENTITY_SECRET_BASE64URL: secret,
    })).toEqual({
      connectionString:
        "postgresql://research-access:secret@living-evidence/askrigor",
      schema: "living_evidence",
      ssl: { rejectUnauthorized: false },
      identitySecret: Uint8Array.from(Buffer.alloc(32, 23)),
    });
  });

  it("fails closed on a missing, short, malformed, or non-database setting", () => {
    const valid = {
      ASKRIGOR_RESEARCH_ACCESS_ENABLED: "true",
      ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL:
        "postgresql://research-access:secret@living-evidence/askrigor",
      ASKRIGOR_RESEARCH_ACCESS_DATABASE_SCHEMA: "living_evidence",
      ASKRIGOR_RESEARCH_ACCESS_DATABASE_SSLMODE: "disable",
      ASKRIGOR_RESEARCH_IDENTITY_SECRET_BASE64URL: secret,
    } satisfies NodeJS.ProcessEnv;
    for (const override of [
      { ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL: "https://example.com" },
      { ASKRIGOR_RESEARCH_ACCESS_DATABASE_SCHEMA: "unsafe-schema" },
      { ASKRIGOR_RESEARCH_ACCESS_DATABASE_SSLMODE: "prefer" },
      { ASKRIGOR_RESEARCH_IDENTITY_SECRET_BASE64URL: Buffer.alloc(31).toString("base64url") },
      { ASKRIGOR_RESEARCH_IDENTITY_SECRET_BASE64URL: "not/base64url" },
    ]) {
      expect(() => researchContributorAccessConfigFromEnv({
        ...valid,
        ...override,
      })).toThrow("Research contributor access configuration unavailable");
    }
    const missing = { ...valid };
    delete missing.ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL;
    expect(() => researchContributorAccessConfigFromEnv(missing)).toThrow(
      "Research contributor access configuration unavailable",
    );
  });
});

