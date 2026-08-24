import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const SERVICE = new URL(
  "../deploy/systemd/askrigor-retraction-watch-sync.service",
  import.meta.url,
);
const TIMER = new URL(
  "../deploy/systemd/askrigor-retraction-watch-sync.timer",
  import.meta.url,
);
const RUNBOOK = new URL(
  "../docs/research-session-resumability-deployment.md",
  import.meta.url,
);

describe("Phase G deployment boundary", () => {
  it("runs the public snapshot sync without private runtime secrets", async () => {
    const service = await readFile(SERVICE, "utf8");
    expect(service).toContain("--read-only");
    expect(service).toContain("--cap-drop=ALL");
    expect(service).toContain("--security-opt=no-new-privileges");
    expect(service).toContain("--user 1000:1000");
    expect(service).toContain("/opt/askrigor/state/retraction-watch");
    expect(service).toContain("dst=/var/lib/askrigor-retraction-watch,rw");
    expect(service).toContain("retraction-watch-sync-cli.js");
    expect(service).not.toContain("runtime.env");
    expect(service).not.toContain("askrigor-actions");
    expect(service).not.toContain("research-sessions");
  });

  it("uses a persistent daily timer without turning the application into the writer", async () => {
    const timer = await readFile(TIMER, "utf8");
    expect(timer).toContain("OnCalendar=*-*-* 03:00:00 UTC");
    expect(timer).toContain("RandomizedDelaySec=1h");
    expect(timer).toContain("Persistent=true");
  });

  it("documents separate mounts, no backups, and restart-denial acceptance", async () => {
    const runbook = await readFile(RUNBOOK, "utf8");
    expect(runbook).toContain("/opt/askrigor/state/research-sessions");
    expect(runbook).toContain("/opt/askrigor/state/retraction-watch");
    expect(runbook).toContain("read-only mount");
    expect(runbook).toMatch(/exclude the private checkpoint directory from every configured backup/su);
    expect(runbook).toMatch(/finalization\s+remains denied/su);
    expect(runbook).toContain("never print the removed key");
  });
});
