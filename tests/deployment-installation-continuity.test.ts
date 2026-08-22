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
      "exact 17-tool MCP catalog",
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
      "21-operation Action document",
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
      "d4f2af0f86844c743b3b5fbc6c70f66c72a4637d",
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
    ]);

    const temporary = await mkdtemp(join(tmpdir(), "askrigor-plugin-receipt-"));
    try {
      for (const path of [".codex-plugin", "assets", "skills/askrigor"]) {
        await cp(new URL(`../${path}`, import.meta.url), join(temporary, path), {
          recursive: true,
        });
      }
      await writeFile(join(temporary, "assets/unreviewed.svg"), "<svg/>", "utf8");
      await expect(createPluginPackageReceipt(temporary)).rejects.toThrow(
        "Plugin package inventory mismatch",
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
