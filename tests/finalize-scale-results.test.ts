import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  finalizeResearch,
  finalizeResearchInputSchema,
  type FinalizeResearchInput,
  type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

const SECRET = "scale-results-test-secret-01234567890123456789";
// These are the owner's regression sentences, used as synthetic gate fixtures,
// not as evidence about insomnia treatment or its clinical benchmarks.
const BAD = "Treatment improved insomnia by 2.9 ISI points.";
const GOOD = "ISI runs from 0–28, with lower scores meaning less insomnia. The treatment average was 6.8 versus " +
  "9.7 with placebo—a 2.9-point advantage. That is a modest difference: it moved the group average from the " +
  "subthreshold-insomnia range to just below the clinical cutoff, but it is smaller than the roughly 6-point " +
  "within-person change commonly used as a benchmark for clearly meaningful improvement.";
type ScaleResult = NonNullable<FinalizeResearchInput["scale_results"]>[number];
const declaration = (overrides: Partial<ScaleResult> = {}): ScaleResult => ({
  quote: GOOD, scale: "ISI", range: { min: 0, max: 28 }, better: "lower", values: [6.8, 9.7, 2.9],
  benchmark: { value: 6, kind: "minimal_important_difference" }, ...overrides
});
const packageFor = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [issueResearchReceipt("study_audit", {
    id: "PMC10518852", doi: "10.1002/art.41142", status: "complete_no_unresolved_fields"
  }, { secret: SECRET })],
  research_target: "Synthetic scale interpretation gate fixture", research_depth: "deep",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
  not_relevant_reason: "Isolates exact declaration checks with synthetic receipts and text.",
  treatment_choice: "not_compared", key_sources: [{ id: "10.1002/art.41142", status: "validated" }],
  answer_draft: GOOD, absence_claims: [], scale_results: [declaration()], ...overrides
});

describe.each(["gate", "MCP endpoint"] as const)("finalize_research scale_results through the %s", (surface) => {
  let server: Server | undefined;
  let client: Client | undefined;
  beforeAll(async () => {
    if (surface === "gate") return;
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
    server = createAskRigorHttpServer({
      publicServerEnabled: true, actionsEnabled: false, researchActionsEnabled: false,
      privateOrchestrationEnabled: false
    });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;
    client = new Client({ name: "scale-results-test", version: "0.1.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  });
  afterAll(async () => {
    await client?.close();
    if (server !== undefined) await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
    vi.unstubAllEnvs();
  });
  const call = async (overrides: Partial<FinalizeResearchInput> = {}): Promise<FinalizeResearchOutput> => {
    const input = packageFor(overrides);
    if (surface === "gate") return finalizeResearch(input, { secret: SECRET });
    const result = await client!.callTool({ name: "finalize_research", arguments: { ...input } });
    expect(result.isError).not.toBe(true);
    return result.structuredContent as FinalizeResearchOutput;
  };
  const ready = (result: FinalizeResearchOutput) => {
    expect(result.status).toBe("ready");
    expect(result.next_steps).toEqual([]);
    expect(verifyResearchReceipt(result.finalization_receipt!, { secret: SECRET })).toMatchObject({
      ok: true, kind: "finalization", claims: { status: "ready" }
    });
  };
  const blocked = (result: FinalizeResearchOutput, steps: string[]) => {
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toEqual(steps);
    expect(result.finalization_receipt).toBeUndefined();
  };

  it("blocks GPT's unexplained ISI sentence and accepts its explained paragraph", async () => {
    blocked(await call({ answer_draft: BAD, scale_results: [declaration({ quote: BAD })] }), [
      "scale_results[0] quotes no range: the quote does not contain 0 and 28.",
      "scale_results[0] quotes no declared values: the quote does not contain 6.8 and 9.7.",
      "scale_results[0] quotes no benchmark: the quote does not contain 6."
    ]);
    ready(await call());
  });

  it("requires scale_results with answer_draft, while accepting an explicit empty list", async () => {
    blocked(await call({ scale_results: undefined }), [
      "scale_results is missing: with answer_draft, the declaration lists each scale or questionnaire result " +
        "reported in the answer (an empty list means none)."
    ]);
    ready(await call({ answer_draft: "This answer reports no scale scores.", scale_results: [] }));
  });

  it("does not require the declaration without answer_draft", async () => {
    const result = await call({ answer_draft: undefined, scale_results: undefined });
    expect(result.status).toBe("not_ready");
    expect(result.answer_checked).toBe(false);
    expect(result.next_steps.join(" ")).not.toContain("scale_results");
  });

  it("rejects a quote absent from the answer", async () => {
    blocked(await call({ scale_results: [declaration({ quote: `${GOOD} This extra sentence was never shown.` })] }), [
      "scale_results[0] gives text the answer does not show: the quote does not occur in answer_draft."
    ]);
  });

  it.each(["fenced code", "blockquote", "HTML comment"])("rejects a quote hidden in %s", async (location) => {
    const hidden = location === "fenced code" ? `\n\n\`\`\`\n${GOOD}\n\`\`\``
      : location === "blockquote" ? `\n\n> ${GOOD}` : `\n\n<!-- ${GOOD} -->`;
    blocked(await call({ answer_draft: `The explanation is missing.${hidden}` }), [
      "scale_results[0] gives text the answer does not show: the quote does not occur in answer_draft."
    ]);
  });

  it("uses absence_claims quote matching for link text, typography and wrapped quotes", async () => {
    const answer = GOOD.replace("ISI", "[ISI](https://example.test/scale)");
    ready(await call({ answer_draft: answer, scale_results: [declaration({ quote: `“${GOOD}”` })] }));
  });

  it("requires the scale name in the quote", async () => {
    blocked(await call({ scale_results: [declaration({ scale: "PSQI" })] }), [
      "scale_results[0] quotes no scale name: the quote does not contain the declared scale name."
    ]);
  });

  it.each(["0–28", "0-28", "0 to 28"])("accepts the range written %s", async (range) => {
    const quote = GOOD.replace("0–28", range);
    ready(await call({ answer_draft: quote, scale_results: [declaration({ quote })] }));
  });

  it.each([
    { min: 1, max: 28, missing: "1" }, { min: 0, max: 29, missing: "29" }
  ])("checks each range endpoint ($missing missing)", async ({ min, max, missing }) => {
    blocked(await call({ scale_results: [declaration({ range: { min, max } })] }), [
      `scale_results[0] quotes no range: the quote does not contain ${missing}.`
    ]);
  });

  it("checks every declared value, including the fourth, as a whole number", async () => {
    blocked(await call({ scale_results: [declaration({ values: [6.8, 9.7, 2.9, 9] })] }), [
      "scale_results[0] quotes no declared values: the quote does not contain 9."
    ]);
  });

  it("checks numbers in the quote rather than elsewhere in the answer", async () => {
    blocked(await call({ scale_results: [declaration({ quote: BAD })] }), [
      "scale_results[0] gives text the answer does not show: the quote does not occur in answer_draft.",
      "scale_results[0] quotes no range: the quote does not contain 0 and 28.",
      "scale_results[0] quotes no declared values: the quote does not contain 6.8 and 9.7.",
      "scale_results[0] quotes no benchmark: the quote does not contain 6."
    ]);
  });

  it.each(["minimal_important_difference", "clinical_cutoff", "other"] as const)(
    "checks the benchmark number for kind %s", async (kind) => {
      ready(await call({ scale_results: [declaration({ benchmark: { value: 6, kind } })] }));
      blocked(await call({ scale_results: [declaration({ benchmark: { value: 7, kind } })] }), [
        "scale_results[0] quotes no benchmark: the quote does not contain 7."
      ]);
    }
  );

  it("accepts none_established without a benchmark number", async () => {
    const quote = "ISI runs from 0–28, with lower scores meaning less insomnia. The average was 6.8 versus 9.7, " +
      "a 2.9-point difference. No benchmark is established.";
    ready(await call({ answer_draft: quote, scale_results: [declaration({ quote, benchmark: "none_established" })] }));
  });

  it("compares range, values and benchmark by absolute value within 1e-9", async () => {
    ready(await call({ scale_results: [declaration({
      range: { min: 0, max: -28 }, values: [-6.8, -9.7, -2.9 - 0.5e-9],
      benchmark: { value: -6 - 0.5e-9, kind: "other" }
    })] }));
    blocked(await call({ scale_results: [declaration({ values: [2.9 + 2e-9] })] }), [
      `scale_results[0] quotes no declared values: the quote does not contain ${2.9 + 2e-9}.`
    ]);
  });

  it("accepts a French explanation with decimal commas", async () => {
    const quote = "L’ISI va de 0 à 28 ; un score plus bas signifie moins d’insomnie. Les moyennes sont de 6,8 " +
      "contre 9,7, soit un avantage modeste de 2,9 points, inférieur au repère de 6 points.";
    ready(await call({ answer_draft: quote, scale_results: [declaration({ quote })] }));
  });

  it("accepts an Arabic explanation with Arabic-Indic digits", async () => {
    const quote = "يتراوح ISI من ٠–٢٨، والدرجات الأقل تعني أرقًا أقل. المتوسط ٦,٨ مقابل ٩,٧؛ فرق ٢,٩ نقطة، " +
      "أقل من معيار ٦ نقاط.";
    ready(await call({ answer_draft: quote, scale_results: [declaration({ quote })] }));
  });

  it("leaves direction and magnitude interpretation to the model declaration", async () => {
    ready(await call({ scale_results: [declaration({ better: "higher" })] }));
  });

  it("reports each failed entry by its index", async () => {
    blocked(await call({ scale_results: [declaration(), declaration({ scale: "PSQI" })] }), [
      "scale_results[1] quotes no scale name: the quote does not contain the declared scale name."
    ]);
  });

  it.each([
    { values: [] }, { values: [1, 2, 3, 4, 5] }, { better: "unknown" }, { range: { min: 0 } },
    { benchmark: { value: 6, kind: "unknown" } }, { benchmark: undefined }, { extra: "unexpected" }
  ])("rejects malformed declarations (%j)", async (invalid) => {
    const input = { ...packageFor(), scale_results: [{ ...declaration(), ...invalid }] };
    expect(finalizeResearchInputSchema.safeParse(input).success).toBe(false);
    if (surface === "MCP endpoint") {
      const result = await client!.callTool({ name: "finalize_research", arguments: input });
      expect(result.isError).toBe(true);
    }
  });

  if (surface === "MCP endpoint") it("retains 33 tools and pins the descriptive finalize_research catalog text", async () => {
    const { tools } = await client!.listTools();
    expect(tools).toHaveLength(33);
    expect(tools.find(({ name }) => name === "finalize_research")?.description).toBe(
      "Final check of a research answer before it is given. Input: the research_receipt values that AskRigor's " +
      "tools returned in this session; the research_target as given to the scout, search_youtube and the coverage " +
      "check, and as research_question to surveys and community audits (discovery for another target does not " +
      "count); whether community evidence was researched and whether the answer compares treatment options; where " +
      "the topic is discussed and what each community searched outside YouTube showed (principal_communities, " +
      "community_searches); what the YouTube comments read showed (community_findings); the studies the " +
      "conclusions rest on (key_sources); after a first pass, the focuses for going deeper (open_leads, " +
      "another_pass_estimate); and the answer draft (answer_draft), which is checked for internal labels, bare " +
      "video IDs, a pasted long prompt, its quoted sentences (answer_quotes), its statements that something was " +
      "not found, not studied or has no effect (absence_claims), its reported scale or questionnaire results " +
      "(scale_results: quoted explanations with the scale name, range, values and benchmark), and the caveats, " +
      "and is not stored. Result: not_ready with the remaining steps; ready_with_limits with the limits, the caveat " +
      "sentences for the answer (each as its own sentence and as written, in the answer's language when " +
      "answer_language and caveat_renderings are given) and must_report, what the answer reports from each lane " +
      "researched; or receipts_unavailable when this server cannot verify receipts. In free contributor mode a " +
      "checked findings_card is saved to AskRigor's private findings library for the owner's review; in paid " +
      "private mode the caveats offer its save."
    );
  });
});
