import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

type Control =
  | "no_partial_escape"
  | "required_work_status"
  | "youtube_work_continues"
  | "program_decomposition"
  | "program_unspecified"
  | "no_classwide_inference"
  | "program_diverse_discovery"
  | "required_spark_frontier"
  | "installed_action_preflight"
  | "availability_conditioned_minimum"
  | "linked_audited_titles"
  | "plain_language_statuses"
  | "machine_audit_opt_in";

interface RegressionCase {
  id: string;
  prompt: string;
  required_controls: Control[];
}

interface RegressionFixture {
  schema_version: number;
  purpose: string;
  cases: RegressionCase[];
}

async function loadFixture(): Promise<RegressionFixture> {
  return JSON.parse(await readFile(
    rootFile("docs/custom-gpt-partial-answer-regression-v0.1.0.json"),
    "utf8",
  )) as RegressionFixture;
}

describe("Custom GPT partial-answer regressions", () => {
  it("keeps the observed failure sanitized and includes a held-out umbrella class", async () => {
    const fixture = await loadFixture();

    expect(fixture.schema_version).toBe(1);
    expect(fixture.purpose).toContain("does not contain private research output");
    expect(fixture.cases).toHaveLength(5);
    expect(new Set(fixture.cases.map(({ id }) => id)).size).toBe(5);
    expect(fixture.cases.find(({ id }) => id === "held-out-umbrella-intervention")?.prompt)
      .toContain("shoulder");
    expect(JSON.stringify(fixture)).not.toContain("api_visible_complete");
  });

  it("makes a partial label unable to waive executable required work", async () => {
    const [project, forum, skill, generated] = await Promise.all([
      readFile(rootFile("project/PROJECT_INSTRUCTIONS.md"), "utf8"),
      readFile(rootFile("project/FORUM_SIGNAL_MODULE.md"), "utf8"),
      readFile(rootFile("skills/askrigor/SKILL.md"), "utf8"),
      readFile(rootFile("docs/custom-gpt-instructions.md"), "utf8"),
    ]);

    for (const surface of [project, forum, skill]) {
      expect(surface).toContain("A partial or bounded answer does not waive executable required work");
      expect(surface).toContain("one unavailable full text or inaccessible private community");
    }
    expect(generated).toContain("If it is denied, follow its required next work");
    expect(generated).toContain("do not draft a substitute answer");
  });

  it("requires program-specific inference and discovery on every instruction surface", async () => {
    const [project, forum, skill, generated] = await Promise.all([
      readFile(rootFile("project/PROJECT_INSTRUCTIONS.md"), "utf8"),
      readFile(rootFile("project/FORUM_SIGNAL_MODULE.md"), "utf8"),
      readFile(rootFile("skills/askrigor/SKILL.md"), "utf8"),
      readFile(rootFile("docs/custom-gpt-instructions.md"), "utf8"),
    ]);

    for (const surface of [project, forum, skill]) {
      expect(surface).toContain("program not described");
    }
    expect(project).toContain("Fingerprint components");
    expect(forum).toContain("cannot support a class-wide benefit, failure, comparison, or ranking");
    expect(forum).toContain("materially distinct program hypotheses");

    for (const compactSurface of [skill]) {
      expect(compactSurface).toContain("Fingerprint components");
      expect(compactSurface).toContain("no class-wide benefit/failure/ranking follows");
      expect(compactSurface).toContain("Mismatched comparators narrow inference");
      expect(compactSurface).toContain("materially distinct program hypotheses");
      expect(compactSurface).toContain(
        "general/exact/contrarian/benefit/failure/harm/discriminator queries",
      );
      expect(compactSurface).toContain("what finally worked");
    }
    for (const fullSurface of [project, forum]) {
      expect(fullSurface).toContain("weak or mismatched comparator narrows inference");
    }
    expect(generated).toContain("Keep distinct treatments and distinct implementations separate");
    expect(generated).toContain("never turn all exercise");
  });

  it("keeps machine enums out of ordinary user-facing prose", async () => {
    const [project, forum, skill, generated] = await Promise.all([
      readFile(rootFile("project/PROJECT_INSTRUCTIONS.md"), "utf8"),
      readFile(rootFile("project/FORUM_SIGNAL_MODULE.md"), "utf8"),
      readFile(rootFile("skills/askrigor/SKILL.md"), "utf8"),
      readFile(rootFile("docs/custom-gpt-instructions.md"), "utf8"),
    ]);

    for (const surface of [project, forum, skill]) {
      expect(surface).toContain("Translate internal status codes into plain language");
      expect(surface).toContain("only when the user explicitly asks for a technical audit or debug export");
    }
    expect(generated).toContain("Do not expose internal status codes");
    expect(generated).toContain("unless the user explicitly requests a technical audit");

    const userFacingStart = forum.indexOf("## Required user-facing output");
    const internalStart = forum.indexOf("## Internal completion record");
    expect(userFacingStart).toBeGreaterThan(-1);
    expect(internalStart).toBeGreaterThan(userFacingStart);
    const userFacingSection = forum.slice(userFacingStart, internalStart);
    expect(userFacingSection).toContain("Keep the answer concise");
    expect(userFacingSection).toContain("Name each materially different program in ordinary terms");
    expect(userFacingSection).not.toContain("youtube_expansion_report:");
    expect(userFacingSection).not.toContain("forum_signal_receipt:");
    expect(forum.slice(internalStart)).toContain("youtube_expansion_report:");
    expect(forum.slice(internalStart)).toContain("forum_signal_receipt:");
  });

  it("turns the failed broad-treatment replay into explicit Custom GPT gates", async () => {
    const generated = await readFile(
      rootFile("docs/custom-gpt-instructions.md"), "utf8"
    );

    for (const required of [
      "Never ask the user to copy a Gemini packet",
      "server owns protocol loading, research state, required work, completion",
      "perform only the exact bounded work",
      "render only `finalization.reader_facing.report`",
      "Do not expose internal status codes"
    ]) {
      expect(generated).toContain(required);
    }
  });

  it("maps every declared control to at least one case", async () => {
    const fixture = await loadFixture();
    const observed = new Set(fixture.cases.flatMap(({ required_controls }) => required_controls));
    const expected = new Set<Control>([
      "no_partial_escape",
      "required_work_status",
      "youtube_work_continues",
      "program_decomposition",
      "program_unspecified",
      "no_classwide_inference",
      "program_diverse_discovery",
      "required_spark_frontier",
      "installed_action_preflight",
      "availability_conditioned_minimum",
      "linked_audited_titles",
      "plain_language_statuses",
      "machine_audit_opt_in",
    ]);

    expect(observed).toEqual(expected);
  });
});
