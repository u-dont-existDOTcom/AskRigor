import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeCursor,
  encodeCursor,
  fetchJson,
  fetchText,
} from "@askrigor/sources";
import { mockFetch } from "./helpers/mock-fetch.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("bounded upstream HTTP", () => {
  it("rejects an HTTPS URL whose host is not allowlisted", async () => {
    await expect(fetchJson("https://evil.example/data")).rejects.toThrow(
      "Upstream host is not allowlisted",
    );
  });

  it("rejects an allowlisted host over HTTP", async () => {
    await expect(
      fetchJson("http://api.crossref.org/works/10.1000/example"),
    ).rejects.toThrow("Upstream URL must use HTTPS");
  });

  it("rejects credentials embedded in an otherwise allowlisted URL", async () => {
    await expect(
      fetchJson("https://token:secret@api.crossref.org/works"),
    ).rejects.toThrow("Upstream URL must not include credentials");
  });

  it("returns decoded JSON after one retryable server response", async () => {
    const fetch = mockFetch(
      new Response("temporarily unavailable", { status: 503 }),
      new Response('{"items":["ok"]}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetch as typeof globalThis.fetch;

    await expect(fetchJson("https://api.crossref.org/works")).resolves.toEqual({
      items: ["ok"],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops after four retries for a retryable response", async () => {
    const fetch = mockFetch(
      new Response("unavailable", { status: 503 }),
      new Response("unavailable", { status: 503 }),
      new Response("unavailable", { status: 503 }),
      new Response("unavailable", { status: 503 }),
      new Response("unavailable", { status: 503 }),
    );
    globalThis.fetch = fetch as typeof globalThis.fetch;

    await expect(fetchText("https://api.crossref.org/works")).rejects.toThrow(
      "Upstream request failed with status 503",
    );
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("does not retry non-transient failures", async () => {
    const fetch = mockFetch(new Response("bad request", { status: 400 }));
    globalThis.fetch = fetch as typeof globalThis.fetch;

    await expect(fetchText("https://api.crossref.org/works")).rejects.toThrow(
      "Upstream request failed with status 400",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a declared response body above 10 MB before decoding it", async () => {
    const fetch = mockFetch(
      new Response("not decoded", {
        status: 200,
        headers: { "content-length": String(10 * 1024 * 1024 + 1) },
      }),
    );
    globalThis.fetch = fetch as typeof globalThis.fetch;

    await expect(fetchText("https://api.crossref.org/works")).rejects.toThrow(
      "Upstream response exceeds 10 MB limit",
    );
  });

  it("rejects an undeclared response body once it exceeds 10 MB", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10 * 1024 * 1024));
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });
    globalThis.fetch = mockFetch(new Response(body, { status: 200 })) as typeof globalThis.fetch;

    await expect(fetchText("https://api.crossref.org/works")).rejects.toThrow(
      "Upstream response exceeds 10 MB limit",
    );
  });

  it("cancels a request when its timeout elapses", async () => {
    globalThis.fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    ) as typeof globalThis.fetch;

    await expect(
      fetchText("https://api.crossref.org/works", { timeoutMs: 1 }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

describe("opaque cursors", () => {
  it("round-trips arbitrary JSON values through base64url", () => {
    const cursor = encodeCursor({ page: 3, next: "café/研究" });

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor<{ page: number; next: string }>(cursor)).toEqual({
      page: 3,
      next: "café/研究",
    });
  });

  it("rejects a cursor with non-base64url characters", () => {
    expect(() => decodeCursor("not+json")).toThrow("Invalid cursor encoding");
  });
});
