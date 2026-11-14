import {
  InMemoryResearchContributorAccessStore, RESEARCH_USE_NOTICE_VERSION, ResearchContributorAccessService,
  researchAccountReference,
} from "@askrigor/evidence-repository";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

import {
  HELD_NEXT_STEP, OWNER_POINTER_HOW, heldFor, heldText, heldVariants, ownerPointerText, shownOwnerPointer,
  type AskRigorHoldsOptions,
} from "../apps/research-mcp/src/askrigor-holds.js";
import { MCP_RESULT_MAX_BYTES } from "../apps/research-mcp/src/config.js";
import { clientResultBytes } from "../apps/research-mcp/src/tool-result.js";
import type { SharedAnswers } from "../apps/research-mcp/src/shared-answers.js";
import { withLaterInputs } from "../apps/research-mcp/src/later-inputs.js";
import { OWNER_POINTERS } from "../apps/research-mcp/src/owner-pointers.js";
import {
  createManageResearchAccessHandler, manageResearchAccessInputSchema, manageResearchAccessRuntimeOutputSchema,
  type ResearchContributorToolOptions,
} from "../apps/research-mcp/src/research-contributor-access-tool.js";
import { FINALIZE_REMINDER } from "../apps/research-mcp/src/research-finalization-gate.js";
import type { ResearchPlanner } from "../apps/research-mcp/src/research-planner.js";
import { issueResearchReceipt, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { asideGuidance, asideNextStep, framingGuidance, framingNextStep }
  from "../apps/research-mcp/src/research-steering.js";
import { heldFinding } from "./helpers/askrigor-holds-fixture.js";

const SECRET = "askrigor-holds-tool-synthetic-secret-0123456789";
const SUBJECT = "auth0|holds-person";
const PLAIN = { researchTarget: "How do I peel sweet potatoes and get into a flow state?",
  text: "Peel the sweet potatoes with a peeler.", claims: ["Peel the sweet potatoes with a peeler."] };
const FINDING = heldFinding();
const expectedHeld = () => heldFor({ atlas: async () => [FINDING], pointers: () => OWNER_POINTERS }, PLAIN.researchTarget);
const data = (result: CallToolResult) => result.structuredContent as z.output<typeof manageResearchAccessRuntimeOutputSchema>;
const texts = (result: CallToolResult) => result.content.flatMap((block) => block.type === "text" ? [block.text] : []);

async function fixture(askrigorHolds?: AskRigorHoldsOptions, planner?: ResearchPlanner,
  options: Pick<ResearchContributorToolOptions, "sharedAnswers" | "callRecord"> = {}) {
  const store = new InMemoryResearchContributorAccessStore();
  const service = new ResearchContributorAccessService({ store, identitySecret: Buffer.alloc(32, 19) });
  await service.acceptFreeContributor(SUBJECT, {
    noticeVersion: RESEARCH_USE_NOTICE_VERSION, eligibleDeidentifiedResearchContributionRequired: true,
    prohibitedPrivateAndRawContentExcluded: true, proposalReviewAndNoAuthorityAcknowledged: true,
    paidPrivateAlternativeAcknowledged: true,
  });
  const account = await service.activeAccount(SUBJECT);
  const receiptOptions = { secret: SECRET, now: () => new Date("2026-11-14T12:00:00.000Z") };
  const handler = createManageResearchAccessHandler({ service, ...options,
    plainAnswer: { sign: (claims) => issueResearchReceipt("plain_answer", claims, receiptOptions) },
    devAccountKeys: () => new Set(planner === undefined ? [] : [researchAccountReference(service.accountKeyForSubject(SUBJECT))]),
    ...(planner === undefined ? {} : { researchPlanner: () => planner }),
    ...(askrigorHolds === undefined ? {} : { askrigorHolds }),
  });
  const { execute } = withLaterInputs("manage_research_access", manageResearchAccessInputSchema, handler);
  const call = (input: Record<string, unknown>) => execute(input, { authInfo: {
    token: "synthetic-token", clientId: "synthetic-client", scopes: ["research:use"],
    expiresAt: Math.floor(Date.now() / 1_000) + 300, extra: { subject: SUBJECT },
  } });
  return { call, account, receiptOptions };
}

describe("what registration hands over from AskRigor", () => {
  it("gives an ordinary account held text immediately after the receipt and appends HELD_NEXT_STEP", async () => {
    const held = (await expectedHeld())!;
    const atlas = vi.fn(async () => [FINDING]);
    const { call, account, receiptOptions } = await fixture({ atlas, pointers: () => OWNER_POINTERS });
    const result = await call({ action: "register_plain_answer", plainAnswer: PLAIN });
    expect(result.isError).not.toBe(true);
    const structured = data(result);
    expect(structured).toMatchObject({ ok: true, askrigor_holds: held });
    expect(structured).not.toHaveProperty("research_plan");
    const receiptText = `research_receipt: ${structured.research_receipt}`;
    const blocks = texts(result);
    const at = blocks.indexOf(receiptText);
    expect(at).toBe(2);
    expect(blocks[at + 1]).toBe(heldText(held));
    expect(blocks[at + 2]).toBe(FINALIZE_REMINDER);
    expect(structured.next_step).toBe(`${framingNextStep(account.steering, undefined)} ${HELD_NEXT_STEP}`);
    expect(verifyResearchReceipt(structured.research_receipt!, receiptOptions)).toMatchObject({ ok: true, kind: "plain_answer" });
  });

  it("leaves next_step unchanged when only other pointers are listed", async () => {
    const { call, account } = await fixture({ atlas: async () => [], pointers: () => OWNER_POINTERS });
    const result = await call({ action: "register_plain_answer", plainAnswer: { ...PLAIN,
      researchTarget: "How long do I boil an egg?" } });
    expect(result.isError).not.toBe(true);
    const others = (await heldFor({ pointers: () => OWNER_POINTERS }, "How long do I boil an egg?"))!;
    expect(data(result).askrigor_holds).toEqual(others);
    expect(texts(result)[3]).toBe(heldText(others));
    expect(data(result).next_step).toBe(framingNextStep(account.steering, undefined));
    expect(data(result).next_step).not.toContain(HELD_NEXT_STEP);
  });

  it("preserves the previous registration texts and shape when askrigorHolds is absent", async () => {
    const { call, account } = await fixture();
    const result = await call({ action: "register_plain_answer", plainAnswer: PLAIN });
    expect(result.isError).not.toBe(true);
    expect(data(result)).not.toHaveProperty("askrigor_holds");
    expect(texts(result)).toEqual([
      framingGuidance(account.steering, undefined),
      expect.stringContaining("Plain answer registered: 1 claim, signed with the time."),
      `research_receipt: ${data(result).research_receipt}`,
      FINALIZE_REMINDER,
    ]);
    expect(data(result).next_step).toBe(framingNextStep(account.steering, undefined));
    const empty = await fixture({ atlas: async () => [], pointers: () => [] });
    const withoutMatches = await empty.call({ action: "register_plain_answer", plainAnswer: PLAIN });
    expect(withoutMatches).toEqual(result);
  });

  it("keeps the registration and pointers when the Atlas rejects", async () => {
    const held = (await expectedHeld())!;
    const atlas = vi.fn(async () => { throw new Error("synthetic private atlas failure"); });
    const { call, receiptOptions } = await fixture({ atlas, pointers: () => OWNER_POINTERS });
    const result = await call({ action: "register_plain_answer", plainAnswer: PLAIN });
    expect(result.isError).not.toBe(true);
    expect(data(result)).toMatchObject({ ok: true, askrigor_holds: {
      owner_pointers: held.owner_pointers, other_owner_pointers: held.other_owner_pointers,
    } });
    expect(data(result).askrigor_holds).not.toHaveProperty("atlas_findings");
    expect(data(result).next_step?.endsWith(HELD_NEXT_STEP)).toBe(true);
    expect(verifyResearchReceipt(data(result).research_receipt!, receiptOptions).ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("synthetic private atlas failure");
  });

  it("puts held text between the dev account's step-aside text and receipt", async () => {
    const held = (await expectedHeld())!;
    const about = "An invented simple lookup.";
    const planner: ResearchPlanner = {
      enabled: true,
      plan: vi.fn(async () => ({ planning: { status: "planned" as const,
        plan: { about, steering_choice: "none", tasks: [], lane: "aside" as const, searches: 1, goOn: false } },
        cached: false, costUsd: 0, milliseconds: 0 })),
      lane: async () => "aside",
    };
    const { call } = await fixture({ atlas: async () => [FINDING], pointers: () => OWNER_POINTERS }, planner);
    const result = await call({ action: "register_plain_answer", plainAnswer: PLAIN,
      later_inputs: { asked: PLAIN.researchTarget } });
    expect(result.isError).not.toBe(true);
    expect(texts(result)).toEqual([
      // With something held, the step aside itself says where it goes, in place of "Nothing in this answer is checked".
      asideGuidance({ about, searches: 1 }, true),
      heldText(held),
      `research_receipt: ${data(result).research_receipt} Keep it only in case the person asks for the research after all.`,
    ]);
    expect(data(result)).toMatchObject({ ok: true, askrigor_holds: held,
      research_plan: { lane: "aside", source: "askrigor_planning_call" },
      next_step: asideNextStep(true) });
    expect(planner.plan).toHaveBeenCalledTimes(1);
  });

  it("keeps the step aside of before when only other pointers are listed, and says where a matched pointer goes", async () => {
    const about = "An invented simple lookup.";
    const planner: ResearchPlanner = {
      enabled: true,
      plan: vi.fn(async () => ({ planning: { status: "planned" as const,
        plan: { about, steering_choice: "none", tasks: [], lane: "aside" as const, searches: 1, goOn: false } },
        cached: false, costUsd: 0, milliseconds: 0 })),
      lane: async () => "aside",
    };
    // Nothing near in the Atlas and no pointer matched: the list of other pointers alone is no reason to change it.
    const listed = await fixture({ atlas: async () => [], pointers: () => OWNER_POINTERS }, planner);
    const egg = "How long do I boil an egg?";
    const plain = await listed.call({ action: "register_plain_answer",
      plainAnswer: { ...PLAIN, researchTarget: egg }, later_inputs: { asked: egg } });
    expect(data(plain).askrigor_holds?.owner_pointers).toBeUndefined();
    expect(data(plain).askrigor_holds?.other_owner_pointers).toHaveLength(OWNER_POINTERS.length);
    expect(data(plain).next_step).toBe(asideNextStep());
    expect(texts(plain)[0]).toBe(asideGuidance({ about, searches: 1 }));
    // A matched pointer and no finding: the step aside says where it goes.
    const target = "What is fibromyalgia?";
    const matched = await fixture({ atlas: async () => [], pointers: () => OWNER_POINTERS }, planner);
    const pointed = await matched.call({ action: "register_plain_answer",
      plainAnswer: { ...PLAIN, researchTarget: target }, later_inputs: { asked: target } });
    expect(data(pointed).askrigor_holds?.owner_pointers).toHaveLength(OWNER_POINTERS.length);
    expect(data(pointed).next_step).toBe(asideNextStep(true));
    expect(texts(pointed)[0]).toBe(asideGuidance({ about, searches: 1 }, true));
  });

  it("reads the research target once, never the answer, claims or person's other words", async () => {
    const atlas = vi.fn(async () => []);
    const { call } = await fixture({ atlas, pointers: () => OWNER_POINTERS });
    const plainAnswer = { researchTarget: "How long do I boil an egg?",
      text: "Fibromyalgia and flow state are words in this invented answer.",
      claims: ["Fibromyalgia and flow state are words in this invented answer."] };
    const result = await call({ action: "register_plain_answer", plainAnswer,
      later_inputs: { asked: "central sensitisation syndrome" } });
    expect(result.isError).not.toBe(true);
    expect(atlas).toHaveBeenCalledExactlyOnceWith(plainAnswer.researchTarget);
    expect(data(result).askrigor_holds).toEqual(
      await heldFor({ pointers: () => OWNER_POINTERS }, plainAnswer.researchTarget));
  });

  it.each([5_000, 23])("fits a %i-character target in the client byte limit, keeping the first variant that fits", async (length) => {
    // Count UTF-8 bytes, including a target whose characters need more than one byte.
    const target = "fibromyalgia flow state ".slice(0, length).padEnd(length, "é");
    expect(target).toHaveLength(length);
    const findings = [1, 2, 3].map((i) => heldFinding({ publication_number: `P-${88000 + i}`,
      wording: `Finding ${i}.`.padEnd(500, "w"), applies_to: "Adults".padEnd(300, "a"),
      question: "What helps?".padEnd(300, "q") }));
    const atlas = vi.fn(async () => findings);
    const options = { atlas, pointers: () => OWNER_POINTERS };
    const full = (await heldFor(options, target))!;
    atlas.mockClear();
    const planner: ResearchPlanner = { enabled: true,
      plan: vi.fn(async () => ({ planning: { status: "planned" as const, plan: {
        about: "An invented research question.", steering_choice: "none", lane: "research" as const, searches: 1,
        goOn: false, tasks: [{ task: "Search invented studies", kind: "study_search" as const, could_change: "conclusion" as const }],
      } }, cached: false, costUsd: 0, milliseconds: 0 })),
      lane: async () => "research",
    };
    const { call } = await fixture(options, planner);
    const result = await call({ action: "register_plain_answer", plainAnswer: { ...PLAIN, researchTarget: target } });
    expect(result.isError).not.toBe(true);
    expect(data(result).ok).toBe(true);
    expect(clientResultBytes(result)).toBeLessThanOrEqual(MCP_RESULT_MAX_BYTES);
    expect(atlas).toHaveBeenCalledExactlyOnceWith(target);
    expect(full.owner_pointers).toEqual(OWNER_POINTERS.map(shownOwnerPointer));
    const variants = heldVariants(full);
    const held = data(result).askrigor_holds;
    if (length === 5_000) {
      expect(held, `Client bytes: ${clientResultBytes(result)}`).not.toEqual(full);
      expect(variants.slice(1)).toContainEqual(held);
      // Only the held text, its next-step sentence and the structured field differ between candidates.
      const candidateBytes = variants.map((variant) => {
        const structured = { ...data(result), askrigor_holds: variant,
          next_step: `${data(result).next_step!.replace(` ${HELD_NEXT_STEP}`, "")}${
            variant?.atlas_findings?.length || variant?.owner_pointers?.length ? ` ${HELD_NEXT_STEP}` : ""}` };
        return clientResultBytes({ ...result, content: [
          ...result.content.filter((block) => block.type !== "text" || !block.text.startsWith("What AskRigor already holds")),
          ...(variant === undefined ? [] : [{ type: "text" as const, text: heldText(variant) }]),
        ], structuredContent: structured });
      });
      expect(held).toEqual(variants[candidateBytes.findIndex((bytes) => bytes <= MCP_RESULT_MAX_BYTES)]);
    } else {
      expect(held).toEqual(full);
      expect(held?.atlas_findings).toEqual(findings);
      expect(held?.owner_pointers).toHaveLength(2);
    }
  });
});

describe("owner_pointer through manage_research_access", () => {
  it.each(["systema-breathing", "SYSTEMA-BREATHING"])("returns %s through later_inputs with the owner's guidance", async (id) => {
    const { call } = await fixture({ pointers: () => OWNER_POINTERS });
    const result = await call({ action: "owner_pointer", later_inputs: { ownerPointer: id } });
    const pointer = shownOwnerPointer(OWNER_POINTERS[1]!);
    expect(result.isError).not.toBe(true);
    expect(data(result)).toEqual({ ok: true, owner_pointer: pointer, next_step: OWNER_POINTER_HOW });
    expect(texts(result)).toEqual([`${ownerPointerText(pointer)} ${OWNER_POINTER_HOW}`]);
  });

  it("refuses an unknown id as invalid_request and names all available ids", async () => {
    const { call } = await fixture({ pointers: () => OWNER_POINTERS });
    const result = await call({ action: "owner_pointer", later_inputs: { ownerPointer: "unknown" } });
    expect(result.isError).toBe(true);
    expect(data(result)).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    for (const { id } of OWNER_POINTERS) expect(texts(result).join(" ")).toContain(id);
  });

  it.each([undefined, {} , { pointers: () => [] }])("refuses retrieval when no pointers are configured: %j", async (options) => {
    const { call } = await fixture(options);
    const result = await call({ action: "owner_pointer", later_inputs: { ownerPointer: "systema-breathing" } });
    expect(result.isError).toBe(true);
    expect(data(result)).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(texts(result).join(" ")).toContain("keeps no owner's pointers");
  });

  it("refuses ownerPointer with inspect", async () => {
    const { call } = await fixture({ pointers: () => OWNER_POINTERS });
    const result = await call({ action: "inspect", later_inputs: { ownerPointer: "systema-breathing" } });
    expect(result.isError).toBe(true);
    expect(data(result)).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(texts(result).join(" ")).toContain("later_inputs.ownerPointer goes only with action owner_pointer");
  });

  it("refuses ownerPointer with list_calls before reading the call record", async () => {
    const list = vi.fn(async () => []);
    const { call } = await fixture({ pointers: () => OWNER_POINTERS }, undefined,
      { callRecord: { list, record: vi.fn(async () => {}), sweep: vi.fn(async () => 0) } });
    const result = await call({ action: "list_calls", later_inputs: { ownerPointer: "systema-breathing" } });
    expect(result.isError).toBe(true);
    expect(data(result)).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(list).not.toHaveBeenCalled();
  });

  it.each(["delete_shared_answer", "share_answer"])("refuses ownerPointer with %s before any sharing action", async (action) => {
    const deleteByCode = vi.fn(() => true);
    const share = vi.fn();
    const allow = vi.fn(() => true);
    const versions = vi.fn(async () => ({}));
    const vault = { deleteByCode, share } as unknown as SharedAnswers["vault"];
    const { call } = await fixture({ pointers: () => OWNER_POINTERS }, undefined,
      { sharedAnswers: { vault, allow, versions } });
    const result = await call({ action, later_inputs: { ownerPointer: "systema-breathing",
      ...(action === "delete_shared_answer" ? { shareCode: `sa1-${"a".repeat(22)}` }
        : { sharedAnswer: { question: "An invented question.", answer: "An invented answer.", confirmed: true } }),
    } });
    expect(result.isError).toBe(true);
    expect(data(result)).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(deleteByCode).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
    expect(allow).not.toHaveBeenCalled();
    expect(versions).not.toHaveBeenCalled();
  });

  it.each([
    ["plainAnswer", PLAIN, false],
    ["agreement", { noticeVersion: RESEARCH_USE_NOTICE_VERSION, eligibleDeidentifiedResearchContributionRequired: true,
      prohibitedPrivateAndRawContentExcluded: true, proposalReviewAndNoAuthorityAcknowledged: true,
      paidPrivateAlternativeAcknowledged: true }, false],
    ["plainAnswerNote", false, false],
    ["detailedLessonReports", true, false],
    ["findingsSave", false, false],
    ["callsPage", { limit: 1 }, true],
    ["framing", { likely_question: "An invented question." }, true],
    ["asked", "An invented question.", true],
    ["researchMenu", { research_target: PLAIN.researchTarget,
      tasks: [{ task: "Search invented studies", kind: "study_search", could_change: "conclusion" }] }, true],
    ["researchSteering", { style: "balanced" }, true],
  ] as const)("refuses owner_pointer combined with %s", async (key, value, later) => {
    const pointers = vi.fn(() => OWNER_POINTERS);
    const { call } = await fixture({ pointers });
    const result = await call({ action: "owner_pointer", ...(later ? {} : { [key]: value }),
      later_inputs: { ownerPointer: "systema-breathing", ...(later ? { [key]: value } : {}) } });
    expect(result.isError).toBe(true);
    expect(data(result)).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(pointers).not.toHaveBeenCalled();
    expect(data(result)).not.toHaveProperty("owner_pointer");
    expect(texts(result).join(" ")).toContain(key === "agreement" ? "agreement" : key);
  });

  it("refuses owner_pointer without ownerPointer", async () => {
    const { call } = await fixture({ pointers: () => OWNER_POINTERS });
    const result = await call({ action: "owner_pointer" });
    expect(result.isError).toBe(true);
    expect(data(result)).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(texts(result).join(" ")).toContain("owner_pointer, which needs it");
  });
});
