import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createPluginPackageReceipt } from "../scripts/plugin-package-receipt.mjs";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

describe("deployment, plugin, and Custom GPT completion continuity", () => {
  it("treats source merge as intermediate and requires plugin synchronization", async () => {
    const [agents, setup] = await Promise.all([
      readFile(rootFile("AGENTS.md"), "utf8"),
      readFile(rootFile("docs/custom-gpt-actions-setup.md"), "utf8"),
    ]);
    const normalizedAgents = agents.replace(/\s+/gu, " ");
    const normalizedSetup = setup.replace(/\s+/gu, " ");

    for (const required of [
      "source merge is an intermediate state",
      "Custom GPT editor installation",
      "fresh product-interface acceptance",
      "exact 21-tool MCP catalog",
      "live HRP/Universal manifests",
      "exact installed-package receipt",
      "skills/askrigor/SKILL.md",
      "packaged asset/inventory set",
      "read-only connector probe",
      "mark package currency unverified",
      "explicit rollback path",
    ]) {
      expect(normalizedAgents).toContain(required);
    }

    for (const required of [
      "Plugin-package currency, backend currency, Custom GPT installation, and fresh",
      "UI behavior are separate receipts",
      "exactly four authenticated",
      "plus the authenticated consequential lesson write",
      "a matching tool catalog or working connector is not a package receipt",
      "reinstall the exact reviewed package",
      "keep Knowledge empty",
      "record only observed results",
    ]) {
      expect(normalizedSetup).toContain(required);
    }
  });

  it("routes a reversible exact-release plan with explicit stop conditions", async () => {
    const [index, plan] = await Promise.all([
      readFile(rootFile("docs/INDEX.md"), "utf8"),
      readFile(
        rootFile(
          "docs/superpowers/plans/2026-08-22-treatment-landscape-deployment-installation.md",
        ),
        "utf8",
      ),
    ]);
    const normalizedPlan = plan.replace(/\s+/gu, " ");

    expect(index).toContain(
      "superpowers/plans/2026-08-22-treatment-landscape-deployment-installation.md",
    );
    for (const required of [
      "6d8ae92943fb2ae875b055221d85b146713e2aed",
      "secret-free Git archive",
      "concrete rollback points",
      "recreate only the research service",
      "exactly 17 MCP tools",
      "installed-package receipt covering `plugin.json`, `SKILL.md`, and packaged assets/inventory",
      "7,946-character Instructions",
      "21-operation OpenAPI",
      "no authenticated editor-control capability exists",
    ]) {
      expect(normalizedPlan).toContain(required);
    }
  });

  it("records deployed runtime and plugin currency without inventing editor acceptance", async () => {
    const [state, acceptance, release, checklist] = await Promise.all([
      readFile(rootFile("project/CODEX-CURRENT-STATE.md"), "utf8"),
      readFile(rootFile("docs/custom-gpt-action-live-acceptance.md"), "utf8"),
      readFile(rootFile("docs/release-evidence-v0.1.0.md"), "utf8"),
      readFile(rootFile("docs/public-review-checklist.md"), "utf8"),
    ]);
    const documents = [state, acceptance, release];
    for (const document of documents) {
      expect(document).toContain("6d8ae92943fb2ae875b055221d85b146713e2aed");
      expect(document).toContain(
        "a0e98726a32b81d8e0de4c0171f06c2460f2fe2303bc03d0942c70306d98f17a",
      );
      expect(document).toContain(
        "a61a8ba9e1d4675a29e09a5010ab33b1119c388b7cf166669400cac554bbe535",
      );
      expect(document).toContain("21");
      expect(document).toContain("17");
    }
    for (const document of [state, release]) {
      expect(document).toContain("0.1.0+codex.20260822072920");
      expect(document).toContain(
        "d196d783895e3ed093e33f6779b91ae9bb4bdafb3550de327c5f91a9643876c6",
      );
    }
    expect(checklist).toMatch(/runtime and 21-operation Action\s+schema are deployed/u);
    expect(checklist).toMatch(/repaired Instructions are not yet installed/u);
    expect(acceptance).toMatch(/does not establish installation or review/u);
  });

  it("produces a byte-derived plugin package receipt and fails closed on drift", async () => {
    const parsed = await createPluginPackageReceipt(
      fileURLToPath(new URL("..", import.meta.url)),
    );
    expect(parsed.package_name).toBe("askrigor");
    expect(parsed.package_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(parsed.inventory.map(({ path }: { path: string }) => path)).toEqual([
      ".codex-plugin/plugin.json",
      "assets/askrigor-composer-icon.svg",
      "assets/askrigor-logo.svg",
      "skills/askrigor/SKILL.md",
      "skills/browser-archive-downloading/GVSU-REFERENCE.md",
      "skills/browser-archive-downloading/SCENARIOS.md",
      "skills/browser-archive-downloading/SKILL.md",
      "skills/browser-archive-downloading/SUCCESS-PROFILE.json",
    ]);

    const temporary = await mkdtemp(join(tmpdir(), "askrigor-plugin-receipt-"));
    try {
      for (const path of [".codex-plugin", "assets", "skills"]) {
        await cp(new URL(`../${path}`, import.meta.url), join(temporary, path), {
          recursive: true,
        });
      }
      await writeFile(join(temporary, "assets/unreviewed.svg"), "<svg/>", "utf8");
      await expect(createPluginPackageReceipt(temporary)).rejects.toThrow(
        "Plugin package inventory mismatch",
      );

      await rm(join(temporary, "assets/unreviewed.svg"));
      const baseline = await createPluginPackageReceipt(temporary);
      const browserSkillPath = join(
        temporary,
        "skills/browser-archive-downloading/SKILL.md",
      );
      const browserSkill = await readFile(browserSkillPath, "utf8");
      await writeFile(browserSkillPath, `${browserSkill}\n`, "utf8");
      const changed = await createPluginPackageReceipt(temporary);
      expect(changed.package_sha256).not.toBe(baseline.package_sha256);
      expect(changed.inventory.find(({ path }: { path: string }) =>
        path === "skills/browser-archive-downloading/SKILL.md"
      )?.sha256).not.toBe(baseline.inventory.find(({ path }: { path: string }) =>
        path === "skills/browser-archive-downloading/SKILL.md"
      )?.sha256);
      await writeFile(browserSkillPath, browserSkill, "utf8");

      await rm(browserSkillPath);
      await expect(createPluginPackageReceipt(temporary)).rejects.toThrow(
        "Plugin package inventory mismatch",
      );
      await writeFile(browserSkillPath, browserSkill, "utf8");

      await writeFile(
        join(temporary, "skills/browser-archive-downloading/UNREVIEWED.md"),
        "unreviewed",
        "utf8",
      );
      await expect(createPluginPackageReceipt(temporary)).rejects.toThrow(
        "Plugin package inventory mismatch",
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
