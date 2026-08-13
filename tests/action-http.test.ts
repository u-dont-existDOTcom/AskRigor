import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import {
  createAskRigorHttpServer,
  type ActionRoute
} from "../apps/research-mcp/src/server.js";

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
