import { execFile } from "node:child_process";
import { createConnection } from "node:net";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  createAskRigorHttpServer,
  type ActionRoute
} from "../apps/research-mcp/src/server.js";

const execFileAsync = promisify(execFile);

const routes: ActionRoute[] = [{
  method: "POST",
  path: "/actions/test",
  operationId: "test_action",
  summary: "Test",
  description: "Test-only Action route.",
  consequential: true,
  public: false,
  requestSchema: { type: "object", additionalProperties: false },
  responseSchemas: { 200: { type: "object" } },
  async handle({ body }) {
    return { status: 200, body: { body } };
  }
}];

describe("isolated Action HTTP routing", () => {
  it("rejects missing or wrong bearer credentials before reaching a private Action", async () => {
    let handlerCalls = 0;
    const privateRoute = {
      ...routes[0],
      async handle() {
        handlerCalls += 1;
        return { status: 200, body: {} };
      }
    };

    await withHttpServer({ actionRoutes: [privateRoute] }, async (baseUrl) => {
      for (const authorization of [undefined, "Bearer wrong-action-secret"]) {
        const response = await fetch(new URL("/actions/test", baseUrl), {
          method: "POST",
          headers: authorization === undefined ? {} : { authorization },
          body: "{}"
        });

        expect(response.status).toBe(401);
        expect(await response.text()).toBe(
          '{"error":{"code":"action_auth_required","retryable":false}}'
        );
      }
    });

    expect(handlerCalls).toBe(0);
  });

  it("passes an authenticated JSON body to the exact matching Action route", async () => {
    await withHttpServer({}, async (baseUrl) => {
      const response = await fetch(new URL("/actions/test", baseUrl), {
        method: "POST",
        headers: {
          authorization: "Bearer test-action-secret",
          "content-type": "application/json"
        },
        body: '{"lesson":"private"}'
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ body: { lesson: "private" } });
    });
  });

  it("allows an ordinary query only when the raw origin-form Action path is exact", async () => {
    let handlerCalls = 0;
    const exactRoute: ActionRoute = {
      ...routes[0],
      async handle({ body }) {
        handlerCalls += 1;
        return { status: 200, body: { body } };
      }
    };

    await withHttpServer({ actionRoutes: [exactRoute] }, async (baseUrl) => {
      const response = await rawHttpRequest(baseUrl, "/actions/test?trace=ordinary", {
        method: "POST",
        headers: {
          authorization: "Bearer test-action-secret",
          "content-type": "application/json"
        },
        body: "{}"
      });

      expect(response.status).toBe(200);
      expect(response.body).toBe('{"body":{}}');
    });
    expect(handlerCalls).toBe(1);
  });

  it.each([
    "/actions/foo/../test",
    "/actions/foo/%2e%2e/test",
    "/actions/%2e/test",
    "/actions\\test",
    "/actions/%74est",
    "//evil.example/actions/test",
    "http://evil.example/actions/test"
  ])("returns 404 without authentication or handler dispatch for noncanonical target %s", async (target) => {
    let handlerCalls = 0;
    const exactRoute: ActionRoute = {
      ...routes[0],
      async handle() {
        handlerCalls += 1;
        return { status: 200, body: {} };
      }
    };

    await withHttpServer({ actionRoutes: [exactRoute] }, async (baseUrl) => {
      const response = await rawHttpRequest(baseUrl, target, {
        method: "POST",
        headers: {
          authorization: "Bearer test-action-secret",
          "content-type": "application/json"
        },
        body: "{}"
      });

      expect(response.status).toBe(404);
      expect(response.body).toBe("");
    });
    expect(handlerCalls).toBe(0);
  });

  it("contains a malformed raw request target and keeps the isolated server healthy", async () => {
    const childSource = String.raw`
      import { createConnection } from "node:net";
      import { createAskRigorHttpServer } from "./apps/research-mcp/src/server.ts";

      const server = createAskRigorHttpServer({
        publicServerEnabled: true,
        actionsEnabled: false
      });
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const { port } = server.address();

      const rawResponse = await new Promise((resolve, reject) => {
        const socket = createConnection({ host: "127.0.0.1", port }, () => {
          socket.write("GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
        });
        let value = "";
        socket.setEncoding("utf8");
        socket.on("data", (chunk) => { value += chunk; });
        socket.once("error", reject);
        socket.once("end", () => resolve(value));
      });
      const health = await fetch("http://127.0.0.1:" + port + "/healthz");
      console.log(JSON.stringify({
        malformed_status: Number(/^HTTP\/1\.1 (\d{3})/u.exec(rawResponse)?.[1]),
        health_status: health.status,
        health_body: await health.json()
      }));
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    `;

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", childSource],
      { cwd: process.cwd(), timeout: 15_000 }
    );

    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      malformed_status: 404,
      health_status: 200,
      health_body: { status: "ok", service: "askrigor-research", version: "0.1.0" }
    });
  }, 20_000);

  it("rejects Action bodies above 8,192 bytes before reaching the handler", async () => {
    let handlerCalls = 0;
    const privateRoute = {
      ...routes[0],
      async handle() {
        handlerCalls += 1;
        return { status: 200, body: {} };
      }
    };

    await withHttpServer({ actionRoutes: [privateRoute] }, async (baseUrl) => {
      const response = await fetch(new URL("/actions/test", baseUrl), {
        method: "POST",
        headers: { authorization: "Bearer test-action-secret" },
        body: "x".repeat(8_193)
      });

      expect(response.status).toBe(413);
    });

    expect(handlerCalls).toBe(0);
  });

  it("rejects malformed Action JSON without reaching the handler", async () => {
    let handlerCalls = 0;
    const privateRoute = {
      ...routes[0],
      async handle() {
        handlerCalls += 1;
        return { status: 200, body: {} };
      }
    };

    await withHttpServer({ actionRoutes: [privateRoute] }, async (baseUrl) => {
      const response = await fetch(new URL("/actions/test", baseUrl), {
        method: "POST",
        headers: { authorization: "Bearer test-action-secret" },
        body: "not-json"
      });

      expect(response.status).toBe(400);
    });

    expect(handlerCalls).toBe(0);
  });

  it("keeps MCP responses byte-identical whether Actions are enabled or disabled", async () => {
    const disabled = await requestMcp(false);
    const enabled = await requestMcp(true);

    expect(enabled).toEqual(disabled);
  });

  it("serves unauthenticated OpenAPI only while Actions are enabled", async () => {
    await withHttpServer({}, async (baseUrl) => {
      const response = await fetch(new URL("/actions/openapi.json", baseUrl));

      expect(response.status).toBe(200);
      expect((await response.json()).openapi).toBe("3.1.0");
    });

    await withHttpServer({ actionsEnabled: false }, async (baseUrl) => {
      expect((await fetch(new URL("/actions/openapi.json", baseUrl))).status).toBe(404);
    });
  });

  it("leaves unknown paths as 404", async () => {
    await withHttpServer({}, async (baseUrl) => {
      expect((await fetch(new URL("/actions/unknown", baseUrl))).status).toBe(404);
      expect((await fetch(new URL("/not-an-action", baseUrl))).status).toBe(404);
    });
  });

  it.each([
    "/mcp",
    "/healthz",
    "/actions/openapi.json"
  ])("rejects an Action route that shadows %s", (path) => {
    expect(() => createAskRigorHttpServer({
      actionRoutes: [{ ...routes[0], path: path as "/actions/test" }]
    })).toThrow();
  });

  it("rejects duplicate Action method and path pairs", () => {
    expect(() => createAskRigorHttpServer({ actionRoutes: [routes[0], routes[0]] })).toThrow();
  });
});

async function requestMcp(actionsEnabled: boolean): Promise<{ status: number; body: string }> {
  return withHttpServer({ actionsEnabled }, async (baseUrl) => {
    const response = await fetch(new URL("/mcp", baseUrl));
    return { status: response.status, body: await response.text() };
  });
}

async function withHttpServer<T>(
  options: Parameters<typeof createAskRigorHttpServer>[0] = {
    publicServerEnabled: true,
    actionsEnabled: true,
    actionApiKey: "test-action-secret",
    actionRoutes: routes
  },
  callback: (baseUrl: URL) => Promise<T>
): Promise<T> {
  const server = createAskRigorHttpServer({
    publicServerEnabled: true,
    actionsEnabled: true,
    actionApiKey: "test-action-secret",
    actionRoutes: routes,
    ...options
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  try {
    return await callback(new URL(`http://127.0.0.1:${port}`));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function rawHttpRequest(
  baseUrl: URL,
  target: string,
  options: {
    method: string;
    headers?: Readonly<Record<string, string>>;
    body?: string;
  }
): Promise<{ status: number; body: string }> {
  const port = Number(baseUrl.port);
  const body = options.body ?? "";
  const headers = {
    host: "localhost",
    connection: "close",
    ...(body.length > 0 ? { "content-length": String(Buffer.byteLength(body)) } : {}),
    ...options.headers
  };
  const head = [
    `${options.method} ${target} HTTP/1.1`,
    ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
    "",
    body
  ].join("\r\n");

  const raw = await new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port }, () => socket.write(head));
    let response = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => { response += chunk; });
    socket.once("error", reject);
    socket.once("end", () => resolve(response));
  });
  const separator = raw.indexOf("\r\n\r\n");
  const status = Number(/^HTTP\/1\.1 (\d{3})/u.exec(raw)?.[1]);
  const responseHeaders = separator < 0 ? "" : raw.slice(0, separator);
  const rawBody = separator < 0 ? "" : raw.slice(separator + 4);
  return {
    status,
    body: /\r\ntransfer-encoding: chunked\r?$/imu.test(responseHeaders)
      ? decodeChunkedBody(rawBody)
      : rawBody
  };
}

function decodeChunkedBody(value: string): string {
  let remaining = value;
  let decoded = "";
  while (remaining.length > 0) {
    const lineEnd = remaining.indexOf("\r\n");
    if (lineEnd < 0) return decoded;
    const size = Number.parseInt(remaining.slice(0, lineEnd), 16);
    if (!Number.isFinite(size) || size === 0) return decoded;
    const chunkStart = lineEnd + 2;
    decoded += remaining.slice(chunkStart, chunkStart + size);
    remaining = remaining.slice(chunkStart + size + 2);
  }
  return decoded;
}
