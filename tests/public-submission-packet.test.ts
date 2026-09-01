import { readFile, stat } from "node:fs/promises";

import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

interface ExternalGate {
  status: "pending" | "in_progress" | "complete" | "blocked";
  evidence: string | null;
  completedAt: string | null;
  note: string;
}

interface SubmissionPacket {
  schemaVersion: "1.0";
  release: "0.1.0";
  reviewedAt: "2026-08-31";
  officialSources: string[];
  listing: {
    displayName: string;
    shortDescription: string;
    longDescription: string;
    developerName: string;
    category: string;
    capabilities: string[];
    websiteURL: string;
    supportURL: string;
    privacyPolicyURL: string;
    termsOfServiceURL: string;
    brandColor: string;
    logo: string;
    composerIcon: string;
    starterPrompts: string[];
  };
  mcp: {
    submissionMode: "with_mcp";
    serverURL: string;
    expectedToolCount: number;
  };
  portalReadback: {
    observedAt: "2026-08-30";
    individualVerificationLabel: "Approved";
    businessVerificationLabel: "Start";
    organizationNotice: "Organization could not be verified";
    createPluginAvailable: true;
    draftsObserved: 0;
    draftCreated: false;
    evidence: string;
  };
  testCases: {
    extendedSuite: string;
    positiveCaseIds: string[];
    negativeCaseIds: string[];
  };
  releaseNotes: string[];
  demoRecording: {
    status: "pending" | "complete";
    url: string | null;
    scriptPath: string;
  };
  externalGates: Record<string, ExternalGate>;
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(rootFile(path), "utf8")) as T;
}

describe("AskRigor public submission packet", () => {
  it("separates the public MCP portal handoff from local app registration", async () => {
    const manifest = await loadJson<Record<string, unknown>>(
      ".codex-plugin/plugin.json"
    );
    const packet = await loadJson<SubmissionPacket>(
      "docs/public-submission-packet-v0.1.0.json"
    );

    expect(manifest).not.toHaveProperty("apps");
    expect(packet.schemaVersion).toBe("1.0");
    expect(packet.release).toBe("0.1.0");
    expect(packet.reviewedAt).toBe("2026-09-01");
    expect(packet.officialSources).toEqual([
      "https://developers.openai.com/plugins/build/plugins",
      "https://developers.openai.com/plugins/deploy/submission-errors",
      "https://developers.openai.com/plugins/deploy/app-review",
      "https://developers.openai.com/plugins/deploy/submission"
    ]);
    expect(packet.mcp).toEqual({
      submissionMode: "with_mcp",
      serverURL: "https://mcp.askrigor.com/mcp",
      expectedToolCount: 26
    });
  });

  it("binds submission claims to the committed MCP inventory", async () => {
    const packet = await loadJson<SubmissionPacket>(
      "docs/public-submission-packet-v0.1.0.json"
    );
    const inventory = await loadJson<{ tools: Array<{ name: string }> }>(
      "docs/tool-inventory-v0.1.0.json"
    );

    expect(packet.mcp.expectedToolCount).toBe(inventory.tools.length);
    expect(packet.releaseNotes.join(" ")).toContain(`${inventory.tools.length} OAuth-scoped tools`);
    expect(packet.releaseNotes.join(" ")).toContain("24 read-only operations");
    expect(packet.externalGates.scanTools?.note).toContain(
      `${inventory.tools.length}-tool inventory`
    );
  });

  it("records the non-secret portal readback without claiming a draft", async () => {
    const packet = await loadJson<SubmissionPacket>(
      "docs/public-submission-packet-v0.1.0.json"
    );

    expect(packet.portalReadback).toEqual({
      observedAt: "2026-08-30",
      individualVerificationLabel: "Approved",
      businessVerificationLabel: "Start",
      organizationNotice: "Organization could not be verified",
      createPluginAvailable: true,
      draftsObserved: 0,
      draftCreated: false,
      evidence: "docs/audits/2026-08-30-openai-plugin-portal-readback.md"
    });
    await expect(
      stat(rootFile(packet.portalReadback.evidence))
    ).resolves.toBeDefined();
  });

  it("contains directory-safe listing metadata and all four verified HTTPS URLs", async () => {
    const manifest = await loadJson<{
      interface: Record<string, unknown>;
    }>(".codex-plugin/plugin.json");
    const packet = await loadJson<SubmissionPacket>(
      "docs/public-submission-packet-v0.1.0.json"
    );

    expect(packet.listing).toMatchObject({
      displayName: "AskRigor",
      shortDescription: "Auditable research retrieval",
      developerName: "Mayan Roots LLC",
      category: "Productivity",
      capabilities: ["Read", "Write"],
      websiteURL: "https://askrigor.com",
      supportURL: "https://askrigor.com/support",
      privacyPolicyURL: "https://askrigor.com/privacy",
      termsOfServiceURL: "https://askrigor.com/terms",
      brandColor: "#145A8D",
      logo: "./assets/askrigor-logo.svg",
      composerIcon: "./assets/askrigor-composer-icon.svg"
    });
    expect(packet.listing.displayName.length).toBeLessThanOrEqual(30);
    expect(packet.listing.shortDescription.length).toBeLessThanOrEqual(30);
    expect(packet.listing.longDescription.length).toBeLessThanOrEqual(4_000);
    expect(packet.listing.developerName.length).toBeLessThanOrEqual(80);
    expect(packet.listing.starterPrompts).toHaveLength(1);
    expect(packet.listing.starterPrompts[0]?.length).toBeLessThanOrEqual(128);
    expect(manifest.interface).toMatchObject({
      displayName: packet.listing.displayName,
      shortDescription: packet.listing.shortDescription,
      longDescription: packet.listing.longDescription,
      developerName: packet.listing.developerName,
      category: packet.listing.category,
      capabilities: packet.listing.capabilities,
      websiteURL: packet.listing.websiteURL,
      privacyPolicyURL: packet.listing.privacyPolicyURL,
      termsOfServiceURL: packet.listing.termsOfServiceURL,
      brandColor: packet.listing.brandColor,
      logo: packet.listing.logo,
      composerIcon: packet.listing.composerIcon
    });
    expect(manifest).toMatchObject({ author: { name: "Mayan Roots LLC" } });
    expect(packet.listing.displayName).toBe("AskRigor");
    expect(packet.listing.developerName).toBe("Mayan Roots LLC");
  });

  it("selects exactly five positive and three negative portal cases without deleting extended evidence", async () => {
    const packet = await loadJson<SubmissionPacket>(
      "docs/public-submission-packet-v0.1.0.json"
    );
    const extended = await loadJson<{
      positive: Array<{ id: string }>;
      negative: Array<{ id: string }>;
    }>(packet.testCases.extendedSuite);

    expect(packet.testCases.positiveCaseIds).toEqual([
      "positive-1",
      "positive-2",
      "positive-3",
      "positive-4",
      "positive-5"
    ]);
    expect(packet.testCases.negativeCaseIds).toEqual([
      "negative-1",
      "negative-2",
      "negative-3"
    ]);
    expect(extended.positive.map(({ id }) => id)).toEqual([
      "positive-1",
      "positive-2",
      "positive-3",
      "positive-4",
      "positive-5",
      "positive-6"
    ]);
    expect(extended.negative.map(({ id }) => id)).toEqual([
      "negative-1",
      "negative-2",
      "negative-3"
    ]);

    const extendedIds = [
      ...extended.positive.map(({ id }) => id),
      ...extended.negative.map(({ id }) => id)
    ];
    const selectedIds = [
      ...packet.testCases.positiveCaseIds,
      ...packet.testCases.negativeCaseIds
    ];
    expect(new Set(selectedIds).size).toBe(8);
    for (const selectedId of selectedIds) {
      expect(extendedIds.filter((id) => id === selectedId)).toHaveLength(1);
    }
  });

  it("keeps every portal gate explicit and binds completion claims to evidence", async () => {
    const packet = await loadJson<SubmissionPacket>(
      "docs/public-submission-packet-v0.1.0.json"
    );

    expect(packet.releaseNotes.length).toBeGreaterThan(0);
    expect(packet.demoRecording.scriptPath).toBe(
      "docs/public-submission-demo-recording.md"
    );
    if (packet.demoRecording.status === "pending") {
      expect(packet.demoRecording.url).toBeNull();
    } else {
      expect(packet.demoRecording.url).toMatch(/^https:\/\//);
    }
    expect(Object.keys(packet.externalGates)).toEqual([
      "developerIdentity",
      "globalDataResidency",
      "domainVerification",
      "scanTools",
      "demoRecording",
      "finalPortalReview",
      "submission"
    ]);
    for (const gate of Object.values(packet.externalGates)) {
      expect(["pending", "in_progress", "complete", "blocked"]).toContain(
        gate.status
      );
      expect(gate.note.trim().length).toBeGreaterThan(0);
      if (gate.status === "complete") {
        expect(gate.evidence).toMatch(/^(?:https:\/\/|docs\/)/);
        expect(Number.isNaN(Date.parse(gate.completedAt ?? ""))).toBe(false);
      } else {
        expect(gate.evidence).toBeNull();
        expect(gate.completedAt).toBeNull();
      }
    }

    expect(packet.externalGates.developerIdentity).toMatchObject({
      status: "in_progress",
      evidence: null,
      completedAt: null
    });
    expect(packet.externalGates.developerIdentity?.note).toContain(
      "Mayan Roots LLC"
    );
    expect(packet.externalGates.developerIdentity?.note).toContain(
      "selected"
    );
    expect(packet.externalGates.developerIdentity?.note).toContain(
      "Business verification as Start"
    );
    expect(packet.externalGates.developerIdentity?.note).toContain(
      "must not be marked complete"
    );
  });

  it.each([
    "./assets/askrigor-logo.svg",
    "./assets/askrigor-composer-icon.svg"
  ])("ships a safe square SVG branding asset at %s", async (assetPath) => {
    const repositoryPath = assetPath.replace(/^\.\//, "");
    const contents = await readFile(rootFile(repositoryPath), "utf8");
    const metadata = await stat(rootFile(repositoryPath));
    const parsed = new XMLParser({
      ignoreAttributes: false,
      processEntities: false
    }).parse(contents) as {
      svg?: Record<string, unknown>;
    };

    expect(metadata.size).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(parsed.svg).toBeDefined();
    expect(parsed.svg?.["@_width"]).toBe("512");
    expect(parsed.svg?.["@_height"]).toBe("512");
    expect(parsed.svg?.["@_viewBox"]).toBe("0 0 512 512");
    expect(contents).not.toMatch(
      /<script\b|<foreignObject\b|<image\b|\bhref\s*=|@import|url\s*\(|data:/i
    );
  });
});
