import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { laterInputShape } from "../apps/research-mcp/src/later-inputs.js";
import { getProtocolManifest } from "../packages/protocol/src/index.js";
import { undoSafetyLimitsDisclosure } from "./helpers/undo-safety-limits-disclosure.js";

// Owner answer 400a (22 Nov 2026; promise P69): HRP's LimitsNote carries question 400's sentence word for word, so every
// AI that loads HRP says when a model's or app's safety rules limited a research step and declares it to the final
// check (later_inputs.safety_limits).

const QUESTION_400 = "When a model's or app's safety rules, as you observed them or the person reported them, limited a " +
  "research step or what the answer can say, name the step and who observed it, and say what it could change. Say so " +
  "when a safety stop switched the model, even with no known loss, and whether the content was not examined or examined " +
  "but not reported. Don't guess at limits you didn't see, or claim there were none. Describe the gap only in general " +
  "terms: no withheld details, no directions to them and no prompts to get around the rule, under " +
  "IncompleteModuleContinuationHandoff too. Declare each to finalize_research as safety_limits when that input is " +
  "available.";

const hrp = () => readFile(new URL("../protocols/HRP_Full.xml", import.meta.url), "utf8");
const flat = (text: string) => text.replace(/\s+/gu, " ");

describe("HRP 20.6.44: the safety-limit sentence in LimitsNote (owner answer 400a)", () => {
  it("carries question 400's sentence word for word inside LimitsNote, with its revision", async () => {
    const text = await hrp();
    const rule = /<Rule name="LimitsNote" priority="Critical">([\s\S]*?)<\/Rule>/u.exec(text)?.[1];
    expect(rule).toBeDefined();
    expect(flat(rule!)).toContain(QUESTION_400);
    expect(flat(text).split(QUESTION_400)).toHaveLength(2);
    expect(text).toContain('<Revision version="20.6.44" priority="Critical">');
    await expect(getProtocolManifest("hrp")).resolves.toMatchObject({ version: "20.6.44", revisionDate: "2026-11-22" });
  });

  it("names an input finalize_research takes, and a rule HRP has", async () => {
    expect(Object.keys(laterInputShape("finalize_research"))).toContain("safety_limits");
    expect(await hrp()).toContain('<Rule name="IncompleteModuleContinuationHandoff"');
  });

  it("rewinds exactly to 20.6.43 for the older fixtures", async () => {
    const before = undoSafetyLimitsDisclosure(await hrp());
    expect(createHash("sha256").update(before).digest("hex"))
      .toBe("99f40aa2715dd60d16f49f435d5c14c027d02f985cf38aa4c1b6e41dae401f66");
    expect(flat(before)).not.toContain("safety_limits");
  });
});
