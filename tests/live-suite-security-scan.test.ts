import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { scanLiveSuiteLog } from "../scripts/scan-live-suite-log.mts";

describe("live-suite output secret scan", () => {
  it("accepts a clean provider summary without configured runtime values", () => {
    expect(() => scanLiveSuiteLog({
      output: "Test Files 1 passed (1)\\nTests 5 passed (5)\\n",
      environment: {
        NCBI_EMAIL: "validation@example.test",
        CROSSREF_MAILTO: "validation@example.test",
        YOUTUBE_API_KEY: "test-youtube-api-key-not-a-secret",
        ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID: "4x1fl67d_Ag"
      }
    })).not.toThrow();
  });

  it("fails closed without echoing a configured sensitive value found in the log", () => {
    const sensitiveValue = "test-youtube-api-key-not-a-secret";

    try {
      scanLiveSuiteLog({
        output: `provider response accidentally contained ${sensitiveValue}`,
        environment: { YOUTUBE_API_KEY: sensitiveValue }
      });
      throw new Error("Expected scanLiveSuiteLog to reject leaked sensitive output");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Live-suite output contains configured sensitive value");
      expect((error as Error).message).not.toContain(sensitiveValue);
    }
  });

  it("fails closed on an unconfigured generic Google API-key-shaped value", () => {
    const leakedKey = `AIza${"a".repeat(35)}`;

    expect(() => scanLiveSuiteLog({
      output: `provider response included ${leakedKey}`,
      environment: {}
    })).toThrow("Live-suite output contains configured sensitive value");
  });

  it("fails closed on an API-key assignment label even when the value is unknown", () => {
    expect(() => scanLiveSuiteLog({
      output: "debug YOUTUBE_API_KEY=redacted",
      environment: {}
    })).toThrow("Live-suite output contains configured sensitive value");
  });

  it("requires the validation Dockerfile to build workspace dist artifacts", async () => {
    const dockerfile = await readFile(new URL("../Dockerfile.live-validation", import.meta.url), "utf8");

    expect(dockerfile).toContain("RUN npm run build");
  });

  it("marks the post-build packet as v4 and rejects reuse of the failed v3 stage", async () => {
    const packet = await readFile(new URL("../docs/live-validation-v3.md", import.meta.url), "utf8");

    expect(packet).toContain("live-suite-v4-${source_short}");
    expect(packet).toContain("Do not reuse the failed v3 archive or remote stage");
  });

  it("copies every npm workspace before installing dependencies", async () => {
    const dockerfile = await readFile(new URL("../Dockerfile.live-validation", import.meta.url), "utf8");
    const installIndex = dockerfile.indexOf("RUN npm ci --no-audit --no-fund");

    expect(dockerfile.indexOf("COPY apps ./apps")).toBeGreaterThan(-1);
    expect(dockerfile.indexOf("COPY packages ./packages")).toBeGreaterThan(-1);
    expect(dockerfile.indexOf("COPY apps ./apps")).toBeLessThan(installIndex);
    expect(dockerfile.indexOf("COPY packages ./packages")).toBeLessThan(installIndex);
  });

  it("refuses to invoke live providers when required configuration is absent", () => {
    const runner = fileURLToPath(new URL("../scripts/run-live-suite-v3.sh", import.meta.url));
    const result = spawnSync("bash", [runner], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { PATH: process.env.PATH },
      encoding: "utf8"
    });

    expect(result.status).toBe(64);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("required runtime configuration is absent");
  });

  it("writes post-scan evidence through the supplied evidence mount only", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "askrigor-live-suite-v3-test-"));
    const fakeBin = join(temporaryDirectory, "bin");
    const evidenceDirectory = join(temporaryDirectory, "evidence");
    const fakeNpm = join(fakeBin, "npm");

    try {
      await mkdir(fakeBin, { recursive: true });
      await mkdir(evidenceDirectory);
      await writeFile(fakeNpm, "#!/usr/bin/env bash\nprintf 'Test Files 1 passed (1)\\nTests 5 passed (5)\\n'\n", { mode: 0o755 });

      const runner = fileURLToPath(new URL("../scripts/run-live-suite-v3.sh", import.meta.url));
      const result = spawnSync("bash", [runner], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: {
          PATH: `${fakeBin}:${process.env.PATH}`,
          HOME: temporaryDirectory,
          npm_config_cache: join(temporaryDirectory, "npm-cache"),
          NCBI_EMAIL: "validation@example.test",
          CROSSREF_MAILTO: "validation@example.test",
          YOUTUBE_API_KEY: "test-youtube-api-key-not-a-secret",
          ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID: "4x1fl67d_Ag",
          ASKRIGOR_LIVE_EVIDENCE_DIR: evidenceDirectory
        },
        encoding: "utf8"
      });

      expect(result.status, result.stderr).toBe(0);
      expect(await readFile(join(evidenceDirectory, "provider-test.log"), "utf8"))
        .toBe("Test Files 1 passed (1)\nTests 5 passed (5)\n");
      expect(await readFile(join(evidenceDirectory, "status.txt"), "utf8"))
        .toContain("Live suite v4 accepted");
      expect(await readFile(join(evidenceDirectory, "provider-test.log.sha256"), "utf8"))
        .toContain("provider-test.log");
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it("creates an archive checksum that remains valid after upload to a new path", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "askrigor-live-suite-v3-archive-test-"));
    const uploadDirectory = join(temporaryDirectory, "uploaded");
    const archive = join(temporaryDirectory, "packet.tar.gz");
    const archiveScript = fileURLToPath(new URL("../scripts/create-live-suite-v3-archive.sh", import.meta.url));

    try {
      const create = spawnSync("bash", [archiveScript, "HEAD", archive], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        encoding: "utf8"
      });
      expect(create.status, create.stderr).toBe(0);

      await mkdir(uploadDirectory);
      await rename(archive, join(uploadDirectory, "packet.tar.gz"));
      await rename(`${archive}.sha256`, join(uploadDirectory, "packet.tar.gz.sha256"));
      const verify = spawnSync("sha256sum", ["-c", "packet.tar.gz.sha256"], {
        cwd: uploadDirectory,
        encoding: "utf8"
      });

      expect(verify.status, verify.stderr).toBe(0);
      expect(verify.stdout).toContain("packet.tar.gz: OK");
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
