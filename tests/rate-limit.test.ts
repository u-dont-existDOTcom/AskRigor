import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import {
  externalEvidenceReceiptKeyIdFromEnv,
  externalEvidenceReceiptSecretFromEnv,
  mcpHandshakeDiagnosticsAreEnabled,
  parseTrustedClientIpHeader,
  PUBLIC_MCP_CONCURRENCY_LIMIT,
  PUBLIC_RATE_LIMIT,
  publicServerIsEnabled
} from "../apps/research-mcp/src/config.js";
import {
  createConcurrencyLimiter,
  createTokenBucketLimiter,
  resolveClientIp
} from "../apps/research-mcp/src/rate-limit.js";
import {
  createAskRigorHttpServer,
  createAskRigorServer
} from "../apps/research-mcp/src/server.js";

describe("bounded token-bucket limiter", () => {
  it("exhausts at the configured burst and refills deterministically", () => {
    let now = 0;
    const limiter = createTokenBucketLimiter({
      capacity: 2,
      refillTokensPerMinute: 60,
      maxKeys: 10,
      idleTtlMs: 60_000,
      now: () => now
    });

    expect(limiter.consume("client-a")).toBe(true);
    expect(limiter.consume("client-a")).toBe(true);
    expect(limiter.consume("client-a")).toBe(false);

    now = 999;
    expect(limiter.consume("client-a")).toBe(false);
    now = 1_000;
    expect(limiter.consume("client-a")).toBe(true);
    expect(limiter.consume("client-a")).toBe(false);
  });

  it("resets idle keys after TTL without timers", () => {
    let now = 0;
    const limiter = createTokenBucketLimiter({
      capacity: 1,
      refillTokensPerMinute: 0,
      maxKeys: 10,
      idleTtlMs: 1_000,
      now: () => now
    });

    expect(limiter.consume("client-a")).toBe(true);
    expect(limiter.consume("client-a")).toBe(false);
    now = 1_001;
    expect(limiter.consume("client-a")).toBe(true);
  });

  it("uses the public 60-request-per-minute defaults", () => {
    let now = 0;
    const limiter = createTokenBucketLimiter({ ...PUBLIC_RATE_LIMIT, now: () => now });

    for (let index = 0; index < 60; index += 1) {
      expect(limiter.consume("client-a")).toBe(true);
    }
    expect(limiter.consume("client-a")).toBe(false);
    expect(PUBLIC_RATE_LIMIT.maxKeys).toBe(10_000);

    now = 1_000;
    expect(limiter.consume("client-a")).toBe(true);
  });

  it("never exceeds its key cap and evicts the least-recently-used key", () => {
    let now = 0;
    const limiter = createTokenBucketLimiter({
      capacity: 1,
      refillTokensPerMinute: 0,
      maxKeys: 2,
      idleTtlMs: 60_000,
      now: () => now
    });

    expect(limiter.consume("client-a")).toBe(true);
    now += 1;
    expect(limiter.consume("client-b")).toBe(true);
    now += 1;
    expect(limiter.consume("client-a")).toBe(false);
    now += 1;
    expect(limiter.consume("client-c")).toBe(true);

    expect(limiter.size).toBe(2);
    expect(limiter.consume("client-a")).toBe(false);
    expect(limiter.consume("client-b")).toBe(true);
  });
});

describe("bounded MCP concurrency limiter", () => {
  it("rejects saturation and releases idempotently", () => {
    const limiter = createConcurrencyLimiter(2);
    const releaseFirst = limiter.tryAcquire();
    const releaseSecond = limiter.tryAcquire();

    expect(PUBLIC_MCP_CONCURRENCY_LIMIT).toBe(16);
    expect(releaseFirst).toBeTypeOf("function");
    expect(releaseSecond).toBeTypeOf("function");
    expect(limiter.inFlight).toBe(2);
    expect(limiter.tryAcquire()).toBeUndefined();

    releaseFirst!();
    releaseFirst!();
    expect(limiter.inFlight).toBe(1);
    expect(limiter.tryAcquire()).toBeTypeOf("function");
  });
});

describe("trusted client IP resolution", () => {
  it("ignores forwarding headers by default and normalizes the socket peer", () => {
    expect(resolveClientIp({
      headers: {
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.2"
      },
      socket: { remoteAddress: "::ffff:192.0.2.44" }
    })).toBe("192.0.2.44");
  });

  it("accepts one valid configured Cloudflare address and canonicalizes IPv6", () => {
    expect(resolveClientIp({
      headers: { "cf-connecting-ip": "2001:0db8:0:0:0:0:0:1" },
      socket: { remoteAddress: "192.0.2.44" }
    }, "cf-connecting-ip")).toBe("2001:db8::1");

    expect(resolveClientIp({
      headers: { "cf-connecting-ip": "::ffff:203.0.113.7" },
      socket: { remoteAddress: "192.0.2.44" }
    }, "cf-connecting-ip")).toBe("203.0.113.7");
  });

  it("handles a scoped IPv6 socket address without throwing", () => {
    expect(resolveClientIp({
      headers: {},
      socket: { remoteAddress: "fe80::1%lo" }
    })).toBe("fe80::1");
  });

  it.each([
    ["blank", ""],
    ["whitespace", "   "],
    ["comma chain", "203.0.113.7, 198.51.100.2"],
    ["malformed", "999.2.3.4"],
    ["scoped header", "fe80::1%lo"],
    ["array", ["203.0.113.7", "198.51.100.2"]]
  ])("falls back to the socket for a %s trusted header", (_label, header) => {
    expect(resolveClientIp({
      headers: { "cf-connecting-ip": header },
      socket: { remoteAddress: "::ffff:192.0.2.44" }
    }, "cf-connecting-ip")).toBe("192.0.2.44");
  });

  it("enables trust and public serving only for exact supported values", () => {
    expect(parseTrustedClientIpHeader("cf-connecting-ip")).toBe("cf-connecting-ip");
    expect(parseTrustedClientIpHeader("x-forwarded-for")).toBeUndefined();
    expect(parseTrustedClientIpHeader("CF-Connecting-IP")).toBeUndefined();
    expect(publicServerIsEnabled("true")).toBe(true);
    expect(publicServerIsEnabled("TRUE")).toBe(false);
    expect(publicServerIsEnabled(undefined)).toBe(false);
    expect(mcpHandshakeDiagnosticsAreEnabled("true")).toBe(true);
    expect(mcpHandshakeDiagnosticsAreEnabled("TRUE")).toBe(false);
    expect(mcpHandshakeDiagnosticsAreEnabled(undefined)).toBe(false);
  });

  it("reads internal external-evidence receipt placeholders without exposing or normalizing the secret", () => {
    const secret = "  exact server-held secret bytes must stay exact  ";
    expect(externalEvidenceReceiptSecretFromEnv(secret)).toBe(secret);
    expect(externalEvidenceReceiptSecretFromEnv(undefined)).toBeUndefined();
    expect(externalEvidenceReceiptKeyIdFromEnv(" external-evidence-v1 "))
      .toBe("external-evidence-v1");
    expect(externalEvidenceReceiptKeyIdFromEnv("   ")).toBeUndefined();
    expect(externalEvidenceReceiptKeyIdFromEnv(undefined)).toBeUndefined();
  });
});

describe("public MCP server gate", () => {
  it("is fail-closed end to end when the public environment switch is unset", async () => {
    const previous = process.env.ASKRIGOR_PUBLIC_SERVER_ENABLED;
    delete process.env.ASKRIGOR_PUBLIC_SERVER_ENABLED;

    try {
      await withHttpServer(undefined, async (baseUrl) => {
        const health = await fetch(new URL("/healthz", baseUrl));
        const disabled = await fetch(new URL("/mcp", baseUrl));

        expect(health.status).toBe(200);
        expect(disabled.status).toBe(503);
        expect(await disabled.text()).toContain("public_server_disabled");
      });
    } finally {
      restoreEnvironment("ASKRIGOR_PUBLIC_SERVER_ENABLED", previous);
    }
  });

  it("keeps health live but rejects MCP before limiting, parsing, or tool setup", async () => {
    let consumeCalls = 0;
    let serverCreations = 0;
    await withHttpServer({
      publicServerEnabled: false,
      rateLimiter: {
        get size() { return 0; },
        consume() {
          consumeCalls += 1;
          return true;
        }
      },
      createMcpServer() {
        serverCreations += 1;
        throw new Error("must not execute");
      }
    }, async (baseUrl) => {
      const health = await fetch(new URL("/healthz", baseUrl));
      expect(health.status).toBe(200);

      const disabled = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json"
        },
        body: "not-json"
      });

      expect(disabled.status).toBe(503);
      expect(await disabled.text()).toBe(
        '{"jsonrpc":"2.0","error":{"code":-32000,"message":"public_server_disabled"},"id":null}'
      );
      expect(consumeCalls).toBe(0);
      expect(serverCreations).toBe(0);
    });
  });

  it("rate-limits only MCP requests and ignores spoofed forwarding headers", async () => {
    const limiter = createTokenBucketLimiter({
      capacity: 1,
      refillTokensPerMinute: 0,
      maxKeys: 10,
      idleTtlMs: 60_000
    });

    await withHttpServer({ publicServerEnabled: true, rateLimiter: limiter }, async (baseUrl) => {
      for (let index = 0; index < 3; index += 1) {
        expect((await fetch(new URL("/healthz", baseUrl))).status).toBe(200);
      }

      const first = await fetch(new URL("/mcp", baseUrl), {
        headers: { "x-forwarded-for": "203.0.113.7" }
      });
      const second = await fetch(new URL("/mcp", baseUrl), {
        headers: { "x-forwarded-for": "198.51.100.2" }
      });

      expect(first.status).toBe(406);
      expect(second.status).toBe(429);
      expect(await second.text()).toBe(
        '{"jsonrpc":"2.0","error":{"code":-32000,"message":"rate_limit_exceeded"},"id":null}'
      );
    });
  });

  it("keys requests by one explicitly trusted Cloudflare IP only", async () => {
    const limiter = createTokenBucketLimiter({
      capacity: 1,
      refillTokensPerMinute: 0,
      maxKeys: 10,
      idleTtlMs: 60_000
    });

    await withHttpServer({
      publicServerEnabled: true,
      trustedClientIpHeader: "cf-connecting-ip",
      rateLimiter: limiter
    }, async (baseUrl) => {
      const first = await fetch(new URL("/mcp", baseUrl), {
        headers: { "cf-connecting-ip": "203.0.113.7" }
      });
      const second = await fetch(new URL("/mcp", baseUrl), {
        headers: { "cf-connecting-ip": "198.51.100.2" }
      });
      const malformed = await fetch(new URL("/mcp", baseUrl), {
        headers: { "cf-connecting-ip": "203.0.113.7, 198.51.100.2" }
      });
      const repeatedMalformed = await fetch(new URL("/mcp", baseUrl), {
        headers: { "cf-connecting-ip": "" }
      });

      expect(first.status).toBe(406);
      expect(second.status).toBe(406);
      expect(malformed.status).toBe(406);
      expect(repeatedMalformed.status).toBe(429);
    });
  });

  it("wires the exact trusted-header environment value into the server", async () => {
    const previous = process.env.ASKRIGOR_TRUSTED_CLIENT_IP_HEADER;
    process.env.ASKRIGOR_TRUSTED_CLIENT_IP_HEADER = "cf-connecting-ip";
    const limiter = createTokenBucketLimiter({
      capacity: 1,
      refillTokensPerMinute: 0,
      maxKeys: 10,
      idleTtlMs: 60_000
    });

    try {
      await withHttpServer({ publicServerEnabled: true, rateLimiter: limiter }, async (baseUrl) => {
        const first = await fetch(new URL("/mcp", baseUrl), {
          headers: { "cf-connecting-ip": "203.0.113.7" }
        });
        const second = await fetch(new URL("/mcp", baseUrl), {
          headers: { "cf-connecting-ip": "198.51.100.2" }
        });

        expect(first.status).toBe(406);
        expect(second.status).toBe(406);
      });
    } finally {
      restoreEnvironment("ASKRIGOR_TRUSTED_CLIENT_IP_HEADER", previous);
    }
  });

  it("bounds concurrent MCP work, bypasses health, and releases the permit", async () => {
    const concurrencyLimiter = createConcurrencyLimiter(1);
    let releaseConnect!: () => void;
    let signalEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseConnect = resolve;
    });
    let serverCreations = 0;

    await withHttpServer({
      publicServerEnabled: true,
      concurrencyLimiter,
      createMcpServer() {
        serverCreations += 1;
        const server = createAskRigorServer();
        if (serverCreations === 1) {
          server.connect = async () => {
            signalEntered();
            await blocked;
          };
        }
        return server;
      }
    }, async (baseUrl) => {
      const first = fetch(new URL("/mcp", baseUrl));
      await entered;

      expect((await fetch(new URL("/healthz", baseUrl))).status).toBe(200);
      const saturated = await fetch(new URL("/mcp", baseUrl));
      expect(saturated.status).toBe(503);
      expect(await saturated.text()).toBe(
        '{"jsonrpc":"2.0","error":{"code":-32000,"message":"concurrency_limit_exceeded"},"id":null}'
      );
      expect(serverCreations).toBe(1);

      releaseConnect();
      expect((await first).status).toBe(406);
      expect((await fetch(new URL("/mcp", baseUrl))).status).toBe(406);
      expect(serverCreations).toBe(2);
    });
  });

  it("releases a concurrency permit after parse and setup errors", async () => {
    let serverCreations = 0;
    await withHttpServer({
      publicServerEnabled: true,
      concurrencyLimiter: createConcurrencyLimiter(1),
      createMcpServer() {
        serverCreations += 1;
        if (serverCreations === 1) throw new Error("fixture setup failure");
        return createAskRigorServer();
      }
    }, async (baseUrl) => {
      const malformed = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json"
        },
        body: "not-json"
      });
      expect(malformed.status).toBe(400);

      const setupFailure = await fetch(new URL("/mcp", baseUrl));
      expect(setupFailure.status).toBe(500);
      const afterErrors = await fetch(new URL("/mcp", baseUrl));
      expect(afterErrors.status).toBe(406);
      expect(serverCreations).toBe(2);
    });
  });
});

async function withHttpServer(
  options: Parameters<typeof createAskRigorHttpServer>[0],
  callback: (baseUrl: URL) => Promise<void>
): Promise<void> {
  const server = createAskRigorHttpServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  try {
    await callback(new URL(`http://127.0.0.1:${port}`));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
