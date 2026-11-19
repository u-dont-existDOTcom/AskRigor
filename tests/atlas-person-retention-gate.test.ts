import { describe, expect, it, vi } from "vitest";

// Codex's second review of B: the 90-day deletion of dispute texts stopped when the Atlas pages were switched off. It
// and the owner's notices now start before the pages' own switch is read, whatever the pages and the mark say.
const started = vi.hoisted(() => [] as Array<{ pages: string | undefined; mark: string | undefined }>);
vi.mock("../apps/research-mcp/src/atlas/person-reading.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../apps/research-mcp/src/atlas/person-reading.js")>(),
  startAtlasPersonRetentionFromEnv: (env: NodeJS.ProcessEnv) => {
    started.push({ pages: env.ASKRIGOR_ATLAS_PAGES, mark: env.ASKRIGOR_ATLAS_PERSON_MARK });
    return { stop: () => undefined };
  },
}));

const { createAtlasPagesHandlerFromEnv } = await import("../apps/research-mcp/src/atlas/pages-http.js");

describe("retention and the owner's notices with the Atlas pages off", () => {
  it("start whatever the pages' and the mark's switches say", () => {
    createAtlasPagesHandlerFromEnv({});
    createAtlasPagesHandlerFromEnv({ ASKRIGOR_ATLAS_PAGES: "disabled" });
    expect(started).toEqual([{ pages: undefined, mark: undefined }, { pages: "disabled", mark: undefined }]);
  });
});
