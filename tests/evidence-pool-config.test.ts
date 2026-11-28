import { describe, expect, it } from "vitest";

import { evidencePoolConfig } from "../packages/evidence-repository/src/postgres.js";

// 24 Nov 2026: PostgreSQL compiled the stored-plans catalog on every call, and the first call after a quiet hour passed
// the statement limit (nine timeouts in two days).
describe("the evidence repository's connections", () => {
  it("run without just-in-time compilation, with the limits they were given", () => {
    expect(evidencePoolConfig({ connectionString: "postgres://reader@db/askrigor", schema: "living_evidence", ssl: false,
      connectionTimeoutMillis: 1_500, queryTimeoutMillis: 1_600, statementTimeoutMillis: 1_700 })).toEqual({
      connectionString: "postgres://reader@db/askrigor", ssl: false, connectionTimeoutMillis: 1_500,
      query_timeout: 1_600, statement_timeout: 1_700, options: "-c jit=off",
    });
  });
});
