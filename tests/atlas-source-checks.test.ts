import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATLAS_SOURCE_CHECK_REUSE_MS,
  AtlasSourceCheckCache,
  checkAtlasSources,
  parseAtlasSource,
  resetAtlasSourceCheckCacheForTests,
  type AtlasSourceCheckOptions
} from "../apps/research-mcp/src/findings/source-checks.js";
import { resetClinicalTrialsFreshnessCacheForTests } from "../packages/sources/src/clinical-trials.js";

// The Atlas phase 2 design's public-record and retraction checks (section 2), hermetic: every provider request goes to
// a stubbed fetch that answers from the recorded fixtures, and none reaches the network. Identifiers under 10.0000/ are
// synthetic.
const fixture = (path: string) => readFile(new URL(`fixtures/${path}`, import.meta.url), "utf8");
const NOW = new Date("2026-11-04T09:00:00.000Z");
const options = (overrides: Partial<AtlasSourceCheckOptions> = {}): AtlasSourceCheckOptions => ({
  crossref: { mailto: "maintainer@example.test" },
  pubmed: { tool: "askrigor-tests", email: "maintainer@example.test" },
  now: () => NOW,
  cache: new AtlasSourceCheckCache(),
  ...overrides
});

type Respond = () => Response | Promise<Response>;

/** Answers each provider request by what it asks for, and lists them; an unrouted request gets a 404. */
function stubProviders(routes: Record<string, Respond>): string[] {
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
    const key = routeKey(new URL(String(input)));
    requests.push(key);
    const respond = routes[key];
    return respond === undefined ? new Response("not routed", { status: 404 }) : respond();
  }));
  return requests;
}

function routeKey(url: URL): string {
  switch (url.hostname) {
    case "api.crossref.org": return `crossref ${decodeURIComponent(url.pathname.replace(/^\/works\//u, ""))}`;
    case "eutils.ncbi.nlm.nih.gov": return `pubmed ${url.searchParams.get("id")}`;
    case "www.ebi.ac.uk": return `europepmc ${url.searchParams.get("query")}`;
    case "clinicaltrials.gov": return `clinicaltrials ${url.pathname.split("/").at(-1)}`;
    default: return `unexpected ${url.hostname}`;
  }
}

const body = (text: string | Promise<string>, status = 200): Respond => async () =>
  new Response(await text, { status });

/** A Crossref work fixture recorded under another DOI: each work names its own DOI, and Crossref's adapter checks it. */
async function crossrefWork(doi: string, name = "work-no-marker.json"): Promise<string> {
  const work = JSON.parse(await fixture(`crossref/${name}`)) as { message: { DOI: string } };
  work.message.DOI = doi;
  return JSON.stringify(work);
}

/** A synthetic Crossref work with one inbound notice of the given type. */
const workWithNotice = (doi: string, type: string, label: string) => JSON.stringify({
  status: "ok",
  "message-type": "work",
  message: {
    DOI: doi,
    title: ["Synthetic work with one notice"],
    issued: { "date-parts": [[2021]] },
    "updated-by": [{ DOI: `${doi}.notice`, type, updated: { "date-parts": [[2025, 5, 6]] }, source: "publisher", label }]
  }
});

/** A Europe PMC search for one PMCID, answered with these records. */
const europePmcSearch = (pmcid: string, result: unknown[]) => JSON.stringify({
  hitCount: result.length,
  request: { queryString: `PMCID:${pmcid}`, cursorMark: "*", pageSize: 5 },
  resultList: { result }
});

const SHA256 = expect.stringMatching(/^[a-f0-9]{64}$/u);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetAtlasSourceCheckCacheForTests();
  resetClinicalTrialsFreshnessCacheForTests();
});

describe("source identifiers", () => {
  it("reads the forms a findings card accepts, as the providers take them", () => {
    const doi = { kind: "doi", id: "10.0000/synthetic-a" };
    for (const source of ["10.0000/Synthetic-A", "doi: 10.0000/synthetic-a", "https://doi.org/10.0000/synthetic-a",
      "http://dx.doi.org/10.0000/SYNTHETIC-A"]) {
      expect(parseAtlasSource(source), source).toEqual(doi);
    }
    expect(parseAtlasSource("PMID: 40123456")).toEqual({ kind: "pmid", id: "40123456" });
    expect(parseAtlasSource(" 40123456 ")).toEqual({ kind: "pmid", id: "40123456" });
    expect(parseAtlasSource("pmcid: pmc1234567")).toEqual({ kind: "pmcid", id: "PMC1234567" });
    expect(parseAtlasSource("nct01234567")).toEqual({ kind: "nct", id: "NCT01234567" });
    for (const source of ["0123", "PMID 0123", "PMC0", "NCT123", "aaaaaaaaaaa", "https://example.org/10.0000/x", "doi:"]) {
      expect(parseAtlasSource(source), source).toBeUndefined();
    }
  });
});

describe("a DOI: its Crossref work and its update markers", () => {
  it("passes a work with no marker, with its title and year", async () => {
    const requests = stubProviders({ "crossref 10.5555/no.marker": body(fixture("crossref/work-no-marker.json")) });
    expect(await checkAtlasSources(["doi:10.5555/NO.MARKER"], options())).toEqual({
      status: "passed",
      sources: [{
        source: "doi:10.5555/NO.MARKER",
        kind: "doi",
        identifier: "10.5555/no.marker",
        outcome: "checked",
        provider: "crossref",
        record: { doi: "10.5555/no.marker", title: "Recorded work without an update marker", year: "2022" },
        retraction: { status: "none_found", via: ["crossref"], doi: "10.5555/no.marker", notices: [] },
        needsConfirmation: false,
        binding: "supports",
        checkedAt: NOW.toISOString(),
        envelopeSha256: SHA256
      }]
    });
    // resolveDoi for the work, then checkRetractionStatus for its markers.
    expect(requests).toEqual(["crossref 10.5555/no.marker", "crossref 10.5555/no.marker"]);
  });

  it("asks the owner to confirm a retracted work, which can then be context only", async () => {
    stubProviders({ "crossref 10.1021/am300292v": body(fixture("crossref/work-retracted.json")) });
    const result = await checkAtlasSources(["https://doi.org/10.1021/AM300292V"], options());
    expect(result.status).toBe("needs_confirmation");
    expect(result.sources[0]).toMatchObject({
      outcome: "checked",
      record: { doi: "10.1021/am300292v", title: "Recorded work with a retraction notice", year: "2013" },
      retraction: {
        status: "retracted",
        via: ["crossref"],
        notices: [{ type: "retracted", date: "2024-03-04", doi: "10.1021/acsami.9b11759" }]
      },
      needsConfirmation: true,
      binding: "context_only"
    });
  });

  it("reads a work's whole update history as check_retraction_status does, each notice once", async () => {
    stubProviders({ "crossref 10.5555/integrity.history": body(fixture("crossref/work-integrity-history.json")) });
    const [checked] = (await checkAtlasSources(["10.5555/integrity.history"], options())).sources;
    // A retraction counts first, whatever came after it; the publisher's and Retraction Watch's assertions of the
    // retraction are one notice. The tool's reading files the editorial note and the reinstatement, both "updated-by"
    // markers, as updates.
    expect(checked).toMatchObject({
      record: { title: "Recorded work with a complete update history", year: "2019" },
      retraction: {
        status: "retracted",
        notices: [
          { type: "corrected_or_updated", date: "2020-01-02", doi: "10.5555/integrity.note" },
          { type: "corrected_or_updated", date: "2021-02-03", doi: "10.5555/integrity.correction" },
          { type: "expression_of_concern", date: "2022-03-04", doi: "10.5555/integrity.concern" },
          { type: "retracted", date: "2023-04-05", doi: "10.5555/integrity.retraction" },
          { type: "retracted", date: "2023-06-07", doi: "10.5555/integrity.withdrawal" },
          { type: "corrected_or_updated", date: "2024-07-08", doi: "10.5555/integrity.reinstatement" }
        ]
      },
      needsConfirmation: true,
      binding: "context_only"
    });
  });

  it("lists only the notices about the work itself", async () => {
    stubProviders({ "crossref 10.5555/mixed.markers": body(fixture("crossref/work-mixed-markers.json")) });
    const [checked] = (await checkAtlasSources(["10.5555/mixed.markers"], options())).sources;
    // Its own update-to marker is a correction of another work.
    expect(checked).toMatchObject({
      retraction: {
        status: "retracted",
        notices: [
          { type: "expression_of_concern", date: "2022-03-04", doi: "10.5555/mixed.concern" },
          { type: "retracted", date: "2023-04-05", doi: "10.5555/mixed.retraction" }
        ]
      },
      binding: "context_only"
    });
  });

  it("asks the owner to clear an expression of concern or a correction, and keeps the source as support", async () => {
    stubProviders({
      "crossref 10.0000/synthetic-concern":
        body(workWithNotice("10.0000/synthetic-concern", "expression-of-concern", "Expression of concern")),
      "crossref 10.0000/synthetic-corrected": body(workWithNotice("10.0000/synthetic-corrected", "correction", "Correction"))
    });
    const result = await checkAtlasSources(["10.0000/synthetic-concern", "10.0000/synthetic-corrected"], options());
    expect(result.status).toBe("needs_confirmation");
    expect(result.sources).toMatchObject([
      {
        record: { title: "Synthetic work with one notice", year: "2021" },
        retraction: {
          status: "expression_of_concern",
          notices: [{ type: "expression_of_concern", date: "2025-05-06", doi: "10.0000/synthetic-concern.notice" }]
        },
        needsConfirmation: true,
        binding: "supports"
      },
      {
        retraction: { status: "corrected_or_updated" },
        needsConfirmation: true,
        binding: "supports"
      }
    ]);
  });
});

describe("a PMID: its PubMed record", () => {
  it("reads the markers of the DOI PubMed lists, with PubMed's own types", async () => {
    const requests = stubProviders({
      "pubmed 40123456": body(fixture("pubmed/efetch-record.xml")),
      "crossref 10.1234/recorded.example": body(crossrefWork("10.1234/recorded.example"))
    });
    expect(await checkAtlasSources(["PMID: 40123456"], options())).toEqual({
      status: "passed",
      sources: [{
        source: "PMID: 40123456",
        kind: "pmid",
        identifier: "40123456",
        outcome: "checked",
        provider: "pubmed",
        record: {
          pmid: "40123456",
          title: "Recorded effects of an example intervention",
          year: "2025",
          doi: "10.1234/recorded.example",
          publicationTypes: ["Journal Article", "Randomized Controlled Trial"]
        },
        retraction: {
          status: "none_found",
          via: ["crossref", "pubmed_publication_type"],
          doi: "10.1234/recorded.example",
          notices: []
        },
        needsConfirmation: false,
        binding: "supports",
        checkedAt: NOW.toISOString(),
        envelopeSha256: SHA256
      }]
    });
    // PubMed gives the title and year, so Crossref is asked only for the markers.
    expect(requests).toEqual(["pubmed 40123456", "crossref 10.1234/recorded.example"]);
  });

  it("counts PubMed's Retracted Publication type even when Crossref has no marker", async () => {
    const retracted = (await fixture("pubmed/efetch-record.xml")).replace(
      "<PublicationType UI=\"D013485\">Randomized Controlled Trial</PublicationType>",
      "<PublicationType UI=\"D013485\">Randomized Controlled Trial</PublicationType>\n" +
        "          <PublicationType UI=\"D016441\">Retracted Publication</PublicationType>"
    );
    stubProviders({
      "pubmed 40123456": body(retracted),
      "crossref 10.1234/recorded.example": body(crossrefWork("10.1234/recorded.example"))
    });
    const [checked] = (await checkAtlasSources(["40123456"], options())).sources;
    expect(checked).toMatchObject({
      retraction: { status: "retracted", via: ["crossref", "pubmed_publication_type"], notices: [] },
      needsConfirmation: true,
      binding: "context_only"
    });
  });

  it("uses PubMed's own type for a PMID without a DOI (owner choice 3a)", async () => {
    const requests = stubProviders({
      "pubmed 52123456": body(fixture("pubmed/efetch-medline-date.xml")),
      "pubmed 53123456": body(fixture("pubmed/efetch-retracted-no-doi.xml"))
    });
    const result = await checkAtlasSources(["52123456", "PMID:53123456"], options());
    expect(result.status).toBe("needs_confirmation");
    expect(result.sources).toMatchObject([
      {
        record: { pmid: "52123456", title: "Recorded Medline date", year: "1998" },
        retraction: { status: "none_found", via: ["pubmed_publication_type"], notices: [] },
        needsConfirmation: false,
        binding: "supports"
      },
      {
        record: {
          pmid: "53123456",
          title: "Recorded retracted trial listed without a DOI",
          year: "2016",
          publicationTypes: ["Journal Article", "Retracted Publication"]
        },
        retraction: { status: "retracted", via: ["pubmed_publication_type"], notices: [] },
        needsConfirmation: true,
        binding: "context_only"
      }
    ]);
    expect(result.sources[0]).not.toHaveProperty("record.doi");
    expect(result.sources[0]).not.toHaveProperty("retraction.doi");
    // No DOI, so Crossref is not asked. Sources are checked concurrently, so the order is not asserted.
    expect([...requests].sort()).toEqual(["pubmed 52123456", "pubmed 53123456"]);
  });
});

describe("a PMCID: Europe PMC's record", () => {
  it("gives its PMID and DOI, and the DOI's markers", async () => {
    const requests = stubProviders({
      "europepmc PMCID:PMC1234567": body(fixture("europe-pmc/search-pmcid.json")),
      "crossref 10.1234/recorded.example": body(crossrefWork("10.1234/recorded.example"))
    });
    expect(await checkAtlasSources(["pmc1234567"], options())).toEqual({
      status: "passed",
      sources: [{
        source: "pmc1234567",
        kind: "pmcid",
        identifier: "PMC1234567",
        outcome: "checked",
        provider: "europe_pmc",
        record: {
          pmcid: "PMC1234567",
          pmid: "40123456",
          doi: "10.1234/recorded.example",
          title: "Recorded effects of an example intervention",
          year: "2025"
        },
        retraction: { status: "none_found", via: ["crossref"], doi: "10.1234/recorded.example", notices: [] },
        needsConfirmation: false,
        binding: "supports",
        checkedAt: NOW.toISOString(),
        envelopeSha256: SHA256
      }]
    });
    expect(requests).toEqual(["europepmc PMCID:PMC1234567", "crossref 10.1234/recorded.example"]);
  });

  it("reads PubMed's record of its PMID when it has no DOI, and asks the owner when it has neither", async () => {
    const requests = stubProviders({
      "europepmc PMCID:PMC2222222": body(europePmcSearch("PMC2222222", [
        { source: "MED", id: "52123456", pmid: "52123456", pmcid: "PMC2222222", title: "Recorded Medline date" }
      ])),
      "pubmed 52123456": body(fixture("pubmed/efetch-medline-date.xml")),
      "europepmc PMCID:PMC3333333": body(europePmcSearch("PMC3333333", [
        { source: "PMC", id: "PMC3333333", pmcid: "PMC3333333", title: "A record with no PMID or DOI", pubYear: 2020 }
      ]))
    });
    const result = await checkAtlasSources(["PMC2222222", "PMC3333333"], options());
    expect(result.status).toBe("needs_confirmation");
    expect(result.sources).toMatchObject([
      {
        provider: "europe_pmc",
        record: { pmcid: "PMC2222222", pmid: "52123456" },
        retraction: { status: "none_found", via: ["pubmed_publication_type"] },
        needsConfirmation: false
      },
      {
        record: { pmcid: "PMC3333333", title: "A record with no PMID or DOI", year: "2020" },
        retraction: { status: "unknown", via: [], notices: [] },
        needsConfirmation: true,
        binding: "supports"
      }
    ]);
    expect([...requests].sort()).toEqual(["europepmc PMCID:PMC2222222", "europepmc PMCID:PMC3333333", "pubmed 52123456"]);
  });
});

describe("an NCT number: its registration", () => {
  it("passes a registration, whose retraction status does not apply", async () => {
    const requests = stubProviders({
      "clinicaltrials NCT01234567": body(fixture("clinical-trials/study-NCT01234567.json")),
      "clinicaltrials version": body(fixture("clinical-trials/version.json"))
    });
    expect(await checkAtlasSources(["nct01234567"], options())).toEqual({
      status: "passed",
      sources: [{
        source: "nct01234567",
        kind: "nct",
        identifier: "NCT01234567",
        outcome: "checked",
        provider: "clinicaltrials_gov",
        record: { nctId: "NCT01234567", title: "Recorded trial of an example intervention" },
        retraction: { status: "not_applicable", via: [], notices: [] },
        needsConfirmation: false,
        binding: "supports",
        checkedAt: NOW.toISOString(),
        envelopeSha256: SHA256
      }]
    });
    expect(requests).toEqual(["clinicaltrials NCT01234567", "clinicaltrials version"]);
  });
});

describe("what is refused and what waits", () => {
  it("refuses a source no provider has a record of, and one that is not a study identifier", async () => {
    const requests = stubProviders({
      "crossref 10.0000/synthetic-missing": body("missing", 404),
      "pubmed 40999999": body(fixture("pubmed/efetch-empty.xml")),
      "europepmc PMCID:PMC7654321": body(europePmcSearch("PMC7654321", [])),
      "clinicaltrials NCT07654321": body("missing", 404)
    });
    const result = await checkAtlasSources(
      ["10.0000/synthetic-missing", "40999999", "PMC7654321", "NCT07654321", "PMID 0123"],
      options()
    );
    expect(result).toEqual({
      status: "refused",
      sources: [
        { source: "10.0000/synthetic-missing", kind: "doi", identifier: "10.0000/synthetic-missing",
          outcome: "not_found", provider: "crossref" },
        { source: "40999999", kind: "pmid", identifier: "40999999", outcome: "not_found", provider: "pubmed" },
        { source: "PMC7654321", kind: "pmcid", identifier: "PMC7654321", outcome: "not_found", provider: "europe_pmc" },
        { source: "NCT07654321", kind: "nct", identifier: "NCT07654321", outcome: "not_found",
          provider: "clinicaltrials_gov" },
        { source: "PMID 0123", outcome: "invalid_identifier" }
      ]
    });
    // A work Crossref does not have has no markers to read, and an identifier no provider takes is not sent.
    expect(requests.filter((request) => request.startsWith("crossref"))).toEqual(["crossref 10.0000/synthetic-missing"]);
    expect(requests).toHaveLength(4);
  });

  it("waits on a provider's 5xx with nothing recorded, and asks again next time", async () => {
    vi.useFakeTimers();
    const cache = new AtlasSourceCheckCache();
    const requests = stubProviders({ "crossref 10.5555/no.marker": body("upstream-secret", 503) });
    const pending = checkAtlasSources(["10.5555/no.marker"], options({ cache }));
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result).toEqual({
      status: "try_again_later",
      sources: [{
        source: "10.5555/no.marker", kind: "doi", identifier: "10.5555/no.marker", outcome: "unavailable",
        provider: "crossref", errorCode: "crossref_upstream_unavailable"
      }]
    });
    expect(JSON.stringify(result)).not.toContain("upstream-secret");
    // The first attempt and four retries; no markers are read without the work.
    expect(requests).toHaveLength(5);
    vi.useRealTimers();
    const again = stubProviders({ "crossref 10.5555/no.marker": body(fixture("crossref/work-no-marker.json")) });
    expect((await checkAtlasSources(["10.5555/no.marker"], options({ cache }))).status).toBe("passed");
    expect(again).toHaveLength(2);
  });

  it("waits when the markers cannot be read after the record was found", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const work = await fixture("crossref/work-no-marker.json");
    stubProviders({
      "crossref 10.5555/no.marker": () => (calls += 1) === 1 ? new Response(work) : new Response("busy", { status: 503 })
    });
    const pending = checkAtlasSources(["10.5555/no.marker"], options());
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({
      status: "try_again_later",
      sources: [{
        source: "10.5555/no.marker", kind: "doi", identifier: "10.5555/no.marker", outcome: "unavailable",
        provider: "crossref", errorCode: "crossref_upstream_unavailable"
      }]
    });
  });

  it("waits when a provider cannot be reached at all, and refuses before it waits", async () => {
    stubProviders({
      "pubmed 40123456": () => { throw new TypeError("fetch failed"); },
      "crossref 10.0000/synthetic-missing": body("missing", 404)
    });
    expect(await checkAtlasSources(["40123456"], options())).toEqual({
      status: "try_again_later",
      sources: [{
        source: "40123456", kind: "pmid", identifier: "40123456", outcome: "unavailable", provider: "pubmed",
        errorCode: "pubmed_request_failed"
      }]
    });
    expect((await checkAtlasSources(["40123456", "10.0000/synthetic-missing"], options())).status).toBe("refused");
    expect(await checkAtlasSources([], options())).toEqual({ status: "passed", sources: [] });
  });
});

describe("reuse between inspect and accept", () => {
  it("reuses a complete check for 10 minutes, so the accept binds what the inspect showed", async () => {
    const cache = new AtlasSourceCheckCache();
    let now = NOW;
    const at = () => options({ cache, now: () => now });
    const requests = stubProviders({ "crossref 10.1021/am300292v": body(fixture("crossref/work-retracted.json")) });
    const inspected = await checkAtlasSources(["10.1021/am300292v"], at());
    expect(requests).toHaveLength(2);
    now = new Date(NOW.getTime() + ATLAS_SOURCE_CHECK_REUSE_MS - 1);
    const accepted = await checkAtlasSources(["https://doi.org/10.1021/AM300292V"], at());
    expect(requests).toHaveLength(2);
    expect(accepted).toEqual({
      status: "needs_confirmation",
      sources: [{ ...inspected.sources[0], source: "https://doi.org/10.1021/AM300292V" }]
    });
    now = new Date(NOW.getTime() + ATLAS_SOURCE_CHECK_REUSE_MS);
    const later = await checkAtlasSources(["10.1021/am300292v"], at());
    expect(requests).toHaveLength(4);
    expect(later.sources[0]).toMatchObject({ outcome: "checked", checkedAt: now.toISOString() });
  });

  it("keeps the process's checks until reset, and checks each identifier once per call", async () => {
    const requests = stubProviders({
      "pubmed 40123456": body(fixture("pubmed/efetch-record.xml")),
      "crossref 10.1234/recorded.example": body(crossrefWork("10.1234/recorded.example"))
    });
    const processWide = options({ cache: undefined });
    // Two forms of one DOI and the PMID whose record lists it: one work lookup, one markers lookup, one PubMed record.
    const result = await checkAtlasSources(["10.1234/recorded.example", "DOI:10.1234/RECORDED.EXAMPLE", "40123456"],
      processWide);
    expect(result.status).toBe("passed");
    expect(result.sources.map(({ source, outcome }) => `${source} ${outcome}`)).toEqual([
      "10.1234/recorded.example checked", "DOI:10.1234/RECORDED.EXAMPLE checked", "40123456 checked"
    ]);
    expect([...requests].sort()).toEqual([
      "crossref 10.1234/recorded.example", "crossref 10.1234/recorded.example", "pubmed 40123456"
    ]);
    await checkAtlasSources(["40123456"], processWide);
    expect(requests).toHaveLength(3);
    resetAtlasSourceCheckCacheForTests();
    await checkAtlasSources(["40123456"], processWide);
    expect(requests).toHaveLength(5);
  });

  it("asks providers about at most three sources at once", async () => {
    const work = await fixture("crossref/work-no-marker.json");
    let inFlight = 0;
    let most = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      const doi = decodeURIComponent(new URL(String(input)).pathname.replace(/^\/works\//u, ""));
      return new Response(work.replace("10.5555/no.marker", doi));
    }));
    const sources = ["1", "2", "3", "4", "5", "6", "7"].map((n) => `10.0000/synthetic-${n}`);
    const result = await checkAtlasSources(sources, options());
    expect(result.status).toBe("passed");
    expect(result.sources.map(({ source }) => source)).toEqual(sources);
    expect(most).toBe(3);
  });
});
