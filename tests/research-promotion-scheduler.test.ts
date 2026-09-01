import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

describe("accepted-contribution promotion scheduler", () => {
  it("runs only the exact one-shot promoter without a shell or pull", async () => {
    const service = await readFile(
      rootFile("deploy/systemd/askrigor-research-promotion.service"),
      "utf8",
    );

    expect(service).toContain("Type=oneshot");
    expect(service).toContain(
      "EnvironmentFile=/opt/askrigor/living-evidence-image.env",
    );
    expect(service).toContain(
      "ExecStart=/usr/bin/docker compose --project-name askrigor --file /opt/askrigor/compose.yaml --file /opt/askrigor/compose.living-evidence.yaml --profile living-evidence-admin run --rm --no-deps --pull never --name askrigor-research-promotion-runner living-evidence-admin promote-accepted",
    );
    expect(service).toContain(
      "ExecStartPre=-/usr/bin/docker rm -f askrigor-research-promotion-runner",
    );
    expect(service).toContain(
      "ExecStopPost=-/usr/bin/docker rm -f askrigor-research-promotion-runner",
    );
    expect(service).not.toMatch(/(?:\/bin\/(?:ba)?sh|sh -c|runtime\.env|living-evidence-writer\.env|ASKRIGOR_LIVING_EVIDENCE_DATABASE_URL)/u);
    expect(service.match(/^ExecStart=/gmu)).toHaveLength(1);
  });

  it("is hardened and leaves failure visible for the next durable retry", async () => {
    const service = await readFile(
      rootFile("deploy/systemd/askrigor-research-promotion.service"),
      "utf8",
    );

    for (const expected of [
      "Restart=no",
      "TimeoutStartSec=5min",
      "NoNewPrivileges=yes",
      "PrivateDevices=yes",
      "PrivateNetwork=yes",
      "PrivateTmp=yes",
      "ProtectHome=yes",
      "ProtectSystem=strict",
      "RestrictAddressFamilies=AF_UNIX",
      "UMask=0077",
    ]) {
      expect(service).toContain(expected);
    }
    expect(service).not.toContain("SuccessExitStatus=");
  });

  it("uses a persistent serialized five-minute timer", async () => {
    const timer = await readFile(
      rootFile("deploy/systemd/askrigor-research-promotion.timer"),
      "utf8",
    );

    expect(timer).toContain("OnCalendar=*-*-* *:00/5:00 UTC");
    expect(timer).toContain("RandomizedDelaySec=15s");
    expect(timer).toContain("AccuracySec=1s");
    expect(timer).toContain("Persistent=true");
    expect(timer).toContain("Unit=askrigor-research-promotion.service");
    expect(timer).toContain("WantedBy=timers.target");
  });

  it("documents exact activation, evidence, and non-destructive rollback", async () => {
    const runbook = await readFile(
      rootFile("docs/research-contribution-promotion-scheduler.md"),
      "utf8",
    );

    for (const expected of [
      "/opt/askrigor/living-evidence-image.env",
      "root:root",
      "mode `0600`",
      "systemd-analyze verify",
      "no_pending_promotion",
      "systemctl list-timers",
      "journalctl",
      "stop and disable",
      "Do not delete",
      "one accepted intent per activation",
      "no scientific decision",
    ]) {
      expect(runbook).toContain(expected);
    }
  });
});
