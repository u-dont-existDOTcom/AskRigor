import { vi } from "vitest";

type FetchResponse = Response | (() => Response | Promise<Response>);

export const mockFetch = (...responses: FetchResponse[]) => {
  let nextResponse = 0;

  return vi.fn(async () => {
    const response = responses[nextResponse++];

    if (response === undefined) {
      throw new Error("Unexpected fetch call");
    }

    return typeof response === "function" ? response() : response;
  });
};
