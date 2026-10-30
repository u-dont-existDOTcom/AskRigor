import { createHash, createHmac } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { verifyCarriedState } from "../apps/research-mcp/src/carried-state.js";
import {
  TOOL_LIST_REFRESH_HINT, finalizeResearch, uncheckedLine, type FinalizeResearchInput, type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

import { assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

// AskRigor#354: an answer delivered while the final check said not_ready, with no sign that it was unchecked, and a
// "continue" turn that did not know. The server never sees the delivered answer, so each step says what kind of gap it
// is, a not_ready result gives the line such an answer ends with, the finalization receipt signs the checked draft's
// SHA-256, and the carried state tells the next check that the last one did not pass.
const issueLegacyCarriedState = (state: Record<string, unknown>, { secret }: { secret: string }): string => {
  const body = `cs1~${deflateRawSync(Buffer.from(JSON.stringify(state))).toString("base64url")}`;
  const key = createHmac("sha256", secret).update("askrigor carried state v1").digest();
  return `${body}~${createHmac("sha256", key).update(body).digest().subarray(0, 16).toString("base64url")}`;
};
const SECRET = "unchecked-answer-fixture-secret-0123456789abcdef";
const NOW = () => new Date("2026-10-21T21:00:00.000Z");
const PASSING_DRAFT = "No study's methods were checked in full text for this answer.";
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [], research_target: "Synthetic unchecked-answer fixture", research_depth: "deep",
  treatment_choice: "not_compared", community_evidence: "not_relevant", not_relevant_basis: "emergency_before_triage",
  not_relevant_reason: "Synthetic emergency fixture", key_sources: [], answer_draft: PASSING_DRAFT, absence_claims: [],
  scale_results: [], binary_results: [], safety_question: false, safety_claims: [], key_terms: [], mechanism_claims: [],
  recommendations: [], user_observations: [], proposed_tests: [], ...overrides
});
const check = (input: unknown) => assertNextStepsContract(finalizeResearch(input, { secret: SECRET, now: NOW }));
const kindsOf = (result: FinalizeResearchOutput) => result.next_steps.map((step, index) => [result.next_step_kinds[index], step]);
const STUDY = "10.1000/unchecked";
// Owner 195: use an actual read-depth mismatch to exercise unchecked state and continuation.
const DEPTH_GAP: Partial<FinalizeResearchInput> = {
  receipts: [issueResearchReceipt("pubmed_record", { pmid: "12345", doi: STUDY }, { secret: SECRET, now: NOW })],
  key_sources: [{ id: STUDY, status: "validated", read_depth: "full_text_audited", answer_marker: "Study" }],
  answer_draft: `[Study](https://doi.org/${STUDY}) is available as a record.`
};

describe("an answer given before the final check passes (AskRigor#354)", () => {
  it("gives every next step its kind, in order", () => {
    const invalid = check({ research_target: 7 });
    expect(invalid.next_step_kinds).toEqual(["input_invalid"]);
    expect(new Set(invalid.next_step_kinds)).toEqual(new Set(["input_invalid"]));

    const undeclared = check(base({ ...DEPTH_GAP }));
    expect(kindsOf(undeclared)).toEqual([
      ["declaration", expect.stringContaining("cannot support read_depth")]
    ]);

    // A validated key study with no audit receipt is research still to do; with no visible link it is the draft's too.
    const unread = check(base({ key_sources: [{ id: STUDY, status: "validated", read_depth: "partial_text", answer_marker: "Study" }] }));
    expect(kindsOf(unread)).toEqual(expect.arrayContaining([
      ["research", expect.stringContaining(`Key source ${STUDY} has no receipt`)],
      ["answer_draft", expect.stringContaining(`Key study ${STUDY} has no link in the answer`)]
    ]));

    const rejected = check(base({ receipts: ["rr1~not-a-receipt~x"] }));
    expect(kindsOf(rejected)).toEqual([]);
    expect(rejected.notes).toEqual(expect.arrayContaining([expect.stringContaining("receipts[0]")]));

    const tampered = check(base({ carried_state: "cs1~AAAA~AAAAAAAAAAAAAAAAAAAAAA" }));
    expect(kindsOf(tampered)).toEqual([]);
    expect(tampered.notes).toEqual(expect.arrayContaining([expect.stringContaining("carried_state does not verify")]));
  });

  it("gives an unchecked line worded by the kinds of step still open, and a check line only after a pass", () => {
    expect(check({ research_target: 7 }).unchecked_line).toBe("AskRigor's final check has not passed: the check could not run.");
    expect(check(base({ ...DEPTH_GAP })).unchecked_line)
      .toBe("AskRigor's final check has not passed: some of its statements were not checked.");
    expect(check(base({ key_sources: [{ id: STUDY, status: "validated", read_depth: "partial_text", answer_marker: "Study" }] }))
      .unchecked_line).toBe("AskRigor's final check has not passed: research this answer needs is unfinished and some of " +
      "its statements were not checked.");
    expect(check(base({ receipts: ["rr1~not-a-receipt~x"] })).unchecked_line)
      .toBeUndefined();
    expect(uncheckedLine([])).toBe("AskRigor's final check has not passed.");

    const passed = check(base());
    expect(passed.status).toBe("ready_with_limits");
    expect(passed.unchecked_line).toBeUndefined();
    expect(passed.check_line).toBe("Checked with AskRigor's final check, with the limits above.");
    const blocked = check(base({ ...DEPTH_GAP }));
    expect(blocked.check_line).toBeUndefined();
    expect(blocked.finalization_receipt).toBeUndefined();
  });

  it("signs the checked draft's SHA-256 into the finalization receipt, so a one-word change shows", () => {
    const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
    const receiptFor = (draft: string) => {
      const result = check(base({ answer_draft: draft }));
      expect(result.status).toBe("ready_with_limits");
      return verifyResearchReceipt(result.finalization_receipt!, { secret: SECRET, now: NOW });
    };
    const first = receiptFor(PASSING_DRAFT);
    const second = receiptFor(`${PASSING_DRAFT} Nothing else changed.`);
    expect(first).toMatchObject({ ok: true, kind: "finalization", claims: { answer: sha256(PASSING_DRAFT) } });
    expect(second).toMatchObject({ ok: true, claims: { answer: sha256(`${PASSING_DRAFT} Nothing else changed.`) } });
    expect(first.ok && second.ok && first.claims.answer !== second.claims.answer).toBe(true);
  });

  it("carries a check that did not pass to the next one, and drops it once a check passes", () => {
    const blocked = check(base({ ...DEPTH_GAP }));
    expect(blocked.carried).toMatchObject({ last_status: "not_ready", open_kinds: ["declaration"] });
    expect(blocked.previous_check).toBeUndefined();

    const next = check(base({ carried_state: blocked.carry_forward }));
    expect(next.status).toBe("ready_with_limits");
    expect(next.previous_check).toEqual({ status: "not_ready", open: ["declaration"] });
    expect(next.carried).toMatchObject({ last_status: "ready_with_limits" });
    expect(next.carried).not.toHaveProperty("open_kinds");

    expect(check(base({ carried_state: next.carry_forward })).previous_check).toBeUndefined();

    // A token issued before these fields existed still verifies, and says nothing about an earlier check.
    const older = issueLegacyCarriedState({
      v: 1, issued_at: NOW().toISOString(), observations: [], retracted: [], rejected: [], named_communities: []
    }, { secret: SECRET })!;
    expect(verifyCarriedState(older, { secret: SECRET })).toMatchObject({ ok: true });
    const fromOlder = check(base({ carried_state: older }));
    expect(fromOlder.next_steps).toEqual([]);
    expect(fromOlder.previous_check).toBeUndefined();
  });

  it("does not report this turn's own unfinished check as an earlier turn's answer", () => {
    const first = check(base({ ...DEPTH_GAP }));
    const second = check(base({ carried_state: first.carry_forward, round_token: first.round_token,
      ...DEPTH_GAP }));
    expect(second.status).toBe("not_ready");
    expect(second.previous_check).toBeUndefined();
    expect(second.carried).toMatchObject({ turn: first.carried!.turn, first_turn: true });
    expect(second.carried).not.toHaveProperty("previous_open");
    // The turn is read even when this call passes and returns a round token.
    const passed = check(base({ carried_state: second.carry_forward, round_token: second.round_token }));
    expect(passed.status).toBe("ready_with_limits");
    expect(passed.previous_check).toBeUndefined();
    expect(passed.carried).toMatchObject({ turn: first.carried!.turn, first_turn: true });
    expect(passed.round_token).toMatch(/^cr2~/u);
  });

  it("keeps an earlier turn's unfinished check through each returned state in the new turn", () => {
    const earlier = check(base({ ...DEPTH_GAP }));
    const previous = { status: "not_ready", open: ["declaration"] };
    let result = check(base({ carried_state: earlier.carry_forward, scale_results: undefined }));
    expect(result.carried!.turn).not.toBe(earlier.carried!.turn);
    expect(result.carried!.first_turn).toBe(false);
    const turn = result.carried!.turn;
    for (let call = 1; call <= 3; call += 1) {
      expect(result.previous_check).toEqual(previous);
      expect(result.carried).toMatchObject({ turn, first_turn: false, previous_open: previous.open });
      expect(result.carried!.open_kinds).not.toEqual(previous.open);
      if (call < 3) result = check(base({
        carried_state: result.carry_forward, round_token: result.round_token,
        ...(call === 1 ? { binary_results: undefined } : {})
      }));
    }
    expect(result.status).toBe("ready_with_limits");
    expect(result.carried).not.toHaveProperty("open_kinds");
    expect(check(base({ carried_state: result.carry_forward })).previous_check).toBeUndefined();
  });

  it("reads a state without turn fields as an earlier turn's, including an empty list of open kinds", () => {
    for (const open of [["research" as const], []]) {
      const older = issueLegacyCarriedState({
        v: 1, issued_at: NOW().toISOString(), observations: [], retracted: [], rejected: [], named_communities: [],
        last_status: "not_ready", open_kinds: open
      }, { secret: SECRET })!;
      // A valid round token cannot make an unlabelled legacy state this turn's state.
      const first = check(base({ ...DEPTH_GAP }));
      const result = check(base({ carried_state: older, round_token: first.round_token }));
      expect(result.previous_check).toEqual({ status: "not_ready", open });
      expect(result.carried).toMatchObject({ first_turn: false, previous_open: open, turn: first.carried!.turn });
    }
  });
});

describe("the unchecked line and the previous check in finalize_research's result text", () => {
  let server: Server | undefined;
  let client: Client | undefined;
  beforeAll(async () => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
    server = createAskRigorHttpServer({
      publicServerEnabled: true, actionsEnabled: false, researchActionsEnabled: false, privateOrchestrationEnabled: false
    });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;
    client = new Client({ name: "unchecked-answer-test", version: "0.1.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  });
  afterAll(async () => {
    await client?.close();
    if (server !== undefined) await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
    vi.unstubAllEnvs();
  });
  const call = async (input: FinalizeResearchInput) => {
    if (input.receipts === DEPTH_GAP.receipts) input = { ...input,
      receipts: [issueResearchReceipt("pubmed_record", { pmid: "12345", doi: STUDY }, { secret: SECRET })] };
    const result = await client!.callTool({ name: "finalize_research", arguments: { ...input } });
    expect(result.isError).not.toBe(true);
    const text = (result.content as Array<{ type: string; text?: string }>).map(({ text }) => text ?? "").join("\n");
    return { text, output: assertNextStepsContract(result.structuredContent as FinalizeResearchOutput) };
  };

  it("tells the model the line an unchecked answer ends with, and that an answer after a failed check went out unchecked", async () => {
    const blocked = await call(base({ ...DEPTH_GAP }));
    expect(blocked.output.status).toBe("not_ready");
    // AskRigor#359: an answer given while the check said not_ready opened with a confident verdict, so such an answer
    // also says at its start that it is partial, and gives no ranking or verdict that a step still open could change.
    // Owner answer 172a: and, before that line, why it did not pass: here, what the next turn can do.
    expect(blocked.text).toContain("An answer given before this check passes says at its start that it is partial, " +
      "gives no ranking or verdict that a step still open could change, says before its last line, in plain words, " +
      "what the next turn can do (the steps still open) and how to continue, such as \"Say “continue” and I'll read " +
      "the two studies I couldn't open yet.\"; and ends with this line, as written (in the answer's language when the " +
      "answer is not in English): AskRigor's final check has not passed: some of its statements were not checked.");
    expect(blocked.text).toContain("This was round 1 of 10 in this turn. Pass this as round_token in this turn's next " +
      "finalize_research call: cr2~");
    expect(blocked.text).toContain("Pass this as carried_state in this conversation's next finalize_research call, " +
      "in this turn or a later one: cs2~");
    expect(blocked.text).not.toContain("End the answer with this line");
    expect(blocked.text).not.toContain("word for word");

    const sameTurn = await call(base({
      carried_state: blocked.output.carry_forward, round_token: blocked.output.round_token
    }));
    expect(sameTurn.output.status).toBe("ready_with_limits");
    expect(sameTurn.text).not.toContain("The previous final check in this conversation did not pass");

    const next = await call(base({ carried_state: blocked.output.carry_forward }));
    expect(next.output.status).toBe("ready_with_limits");
    expect(next.text).toContain("The previous final check in this conversation did not pass (declaration), " +
      "so an answer given after it went out unchecked; if one did, this answer says what changed from it.");
    expect(next.text).toContain("End the answer with this line");
    // The 22 Oct regressions found answers reworded after the check in 57 of 64 runs: the passing result says the
    // answer is the checked draft, word for word, and that a change needs another check.
    expect(next.text).toContain("\nGive the user the checked answer_draft word for word, followed only by the lines " +
      "this result gives for its end; to change anything in it, call finalize_research again with the changed draft " +
      "first.");
    expect(next.text).not.toContain("An answer given before this check passes");
  });

  it("says the same where the result's unchecked_line is published", async () => {
    const tool = (await client!.listTools()).tools.find(({ name }) => name === "finalize_research")!;
    const output = tool.outputSchema as { properties: Record<string, { description?: string }> };
    expect(output.properties.unchecked_line!.description).toBe("When not_ready or stopped: the line an answer given before this " +
      "check passes ends with, saying why it is unchecked. Such an answer also says at its start that it is partial, " +
      "and gives no ranking or verdict that a step still open could change.");
  });
});
