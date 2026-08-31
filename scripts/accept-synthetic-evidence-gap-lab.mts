import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSyntheticEvidenceGapLabServer } from "./run-synthetic-evidence-gap-lab.mjs";

interface CdpResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

class CdpClient {
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }
  >();

  constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpResponse;
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (pending === undefined) return;
      this.pending.delete(message.id);
      if (message.error !== undefined) {
        pending.reject(new Error(message.error.message ?? "CDP_ERROR"));
      } else {
        pending.resolve(message.result ?? {});
      }
    });
  }

  static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolveOpen, reject) => {
      socket.addEventListener("open", () => resolveOpen(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("CDP_WEBSOCKET_CONNECTION_FAILED")),
        { once: true },
      );
    });
    return new CdpClient(socket);
  }

  async send(method: string, params: Record<string, unknown> = {}) {
    this.nextId += 1;
    const id = this.nextId;
    const result = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    const remote = response.result as
      | { value?: T; description?: string; subtype?: string }
      | undefined;
    if (remote?.subtype === "error") {
      throw new Error(remote.description ?? "CDP_EVALUATION_FAILED");
    }
    return remote?.value as T;
  }

  close(): void {
    this.socket.close();
  }
}

async function waitFor<T>(
  action: () => Promise<T | null | false | undefined>,
  description: string,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await action();
    if (value) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`SYNTHETIC_GAP_ACCEPTANCE_TIMEOUT ${description}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolveExit) => child.once("exit", () => resolveExit())),
    new Promise<void>((resolveTimeout) =>
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        resolveTimeout();
      }, 2_000),
    ),
  ]);
}

async function main(): Promise<void> {
  const server = createSyntheticEvidenceGapLabServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("SYNTHETIC_GAP_ACCEPTANCE_SERVER_ADDRESS_INVALID");
  const route = `http://127.0.0.1:${address.port}/evidence-gaps/prolactinoma-spontaneous-remission`;
  const profile = await mkdtemp(join(tmpdir(), "askrigor-gap-brave-"));
  const screenshotPath =
    process.env.ASKRIGOR_SYNTHETIC_GAP_SCREENSHOT ??
    join(tmpdir(), "askrigor-synthetic-gap-acceptance.png");
  let braveStderr = "";
  const brave = spawn(
    process.env.BRAVE_BIN ?? "/opt/brave.com/brave/brave",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--password-store=basic",
      "--window-size=1440,1200",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      route,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  brave.stderr?.setEncoding("utf8");
  brave.stderr?.on("data", (chunk: string) => {
    braveStderr = `${braveStderr}${chunk}`.slice(-8_000);
  });

  let client: CdpClient | null = null;
  try {
    const activePort = await waitFor(
      async () => {
        try {
          return await readFile(join(profile, "DevToolsActivePort"), "utf8");
        } catch {
          if (brave.exitCode !== null) {
            throw new Error(
              `SYNTHETIC_GAP_BRAVE_EXITED code=${brave.exitCode} stderr=${braveStderr}`,
            );
          }
          return null;
        }
      },
      "Brave DevTools endpoint",
    );
    const [debugPort] = activePort.trim().split("\n");
    const target = await waitFor(
      async () => {
        const targets = (await (
          await fetch(`http://127.0.0.1:${debugPort}/json/list`)
        ).json()) as Array<{
          type: string;
          url: string;
          webSocketDebuggerUrl: string;
        }>;
        return targets.find(
          (candidate) =>
            candidate.type === "page" && candidate.url.includes("/evidence-gaps/"),
        );
      },
      "evidence-gap page target",
    );
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await waitFor(
      () =>
        client!.evaluate<boolean>(
          "document.readyState === 'complete' && document.querySelectorAll('.lead-card').length === 1",
        ),
      "initial synthetic comparator",
    );

    const initial = await client.evaluate<{
      comparator: string;
      remission: string;
      cards: number;
    }>(`({
      comparator: document.querySelector('#comparator-count').textContent,
      remission: document.querySelector('#remission-count').textContent,
      cards: document.querySelectorAll('.lead-card').length
    })`);

    await client.evaluate(`document.querySelector('#provenance-form').requestSubmit()`);
    await waitFor(
      () => client!.evaluate<boolean>("!document.querySelector('#narrative-form').hidden"),
      "unprompted account step",
    );
    await client.evaluate(`(() => {
      const field = document.querySelector('#narrative');
      field.value = 'Synthetic acceptance account: pregnancy and delivery preceded a fictional treatment-free remission while baseline documentation remained missing.';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#narrative-form').requestSubmit();
    })()`);
    await waitFor(
      () => client!.evaluate<boolean>("!document.querySelector('#details-form').hidden"),
      "structured details step",
    );
    await client.evaluate(`(() => {
      document.querySelector('[name="outcome"]').value = 'REPORTED_REMISSION';
      document.querySelector('[name="exposure"]').value = 'PREGNANCY_POSTPARTUM';
      document.querySelector('[name="treatmentContext"]').value = 'NO_PRIOR_DOPAMINE_AGONIST';
      document.querySelector('[name="timingKnown"]').checked = true;
      document.querySelector('[name="persistenceKnown"]').checked = false;
      document.querySelector('[name="baselineDocumented"]').checked = false;
      document.querySelector('[name="followupDocumented"]').checked = false;
      document.querySelector('#details-form').requestSubmit();
    })()`);
    await waitFor(
      () =>
        client!.evaluate<boolean>(
          "!document.querySelector('#consent-form').hidden && document.querySelector('#preview-title').textContent.length > 0",
        ),
      "deidentified preview",
    );
    await client.evaluate(`(() => {
      document.querySelector('[name="syntheticOnly"]').checked = true;
      document.querySelector('[name="publicLead"]').checked = true;
      document.querySelector('#consent-form').requestSubmit();
    })()`);
    await waitFor(
      () =>
        client!.evaluate<boolean>(
          "document.querySelectorAll('.lead-card').length === 2 && document.querySelector('#remission-count').textContent === '1'",
        ),
      "bounded public lead projection",
    );

    await client.evaluate(
      `document.querySelector('button[data-action="challenge"]').click()`,
    );
    await waitFor(
      () =>
        client!.evaluate<boolean>(
          "[...document.querySelectorAll('.evidence-chip')].some((node) => node.textContent === '1 challenge')",
        ),
      "challenge propagation",
    );
    await client.evaluate(
      `document.querySelector('button[data-action="correct"]').click()`,
    );
    await waitFor(
      () =>
        client!.evaluate<boolean>(
          "[...document.querySelectorAll('.evidence-chip')].some((node) => node.textContent === 'lead v2')",
        ),
      "correction propagation",
    );

    const corrected = await client.evaluate<{
      cardCount: number;
      baselineStillMissing: boolean;
      reviewNotice: boolean;
    }>(`(() => {
      const ownedCard = document.querySelector('button[data-action="correct"]').closest('.lead-card');
      return {
        cardCount: document.querySelectorAll('.lead-card').length,
        baselineStillMissing: [...ownedCard.querySelectorAll('.missing-list li')].some((node) => node.textContent === 'baseline prolactin/MRI documentation'),
        reviewNotice: document.querySelector('#research-boundary').textContent.includes('Source change requires review')
      };
    })()`);

    if (
      corrected.cardCount !== 2 ||
      corrected.baselineStillMissing ||
      !corrected.reviewNotice
    ) {
      throw new Error(
        `SYNTHETIC_GAP_CORRECTION_ACCEPTANCE_FAILED ${JSON.stringify(corrected)}`,
      );
    }

    await client.evaluate(
      `document.querySelector('button[data-action="withdraw"]').click()`,
    );
    await waitFor(
      () =>
        client!.evaluate<boolean>(
          "document.querySelectorAll('.lead-card').length === 1 && document.querySelectorAll('.tombstone').length === 2",
        ),
      "withdrawal propagation",
    );
    const finalState = await client.evaluate<{
      cards: number;
      tombstones: number;
      comparator: string;
      remission: string;
      pageContainsTreatmentAdvice: boolean;
      recruitmentInactive: boolean;
    }>(`({
      cards: document.querySelectorAll('.lead-card').length,
      tombstones: document.querySelectorAll('.tombstone').length,
      comparator: document.querySelector('#comparator-count').textContent,
      remission: document.querySelector('#remission-count').textContent,
      pageContainsTreatmentAdvice: /stop cabergoline|pregnancy as treatment|explantation as treatment/i.test(document.body.innerText),
      recruitmentInactive: document.querySelector('#research-boundary').textContent.includes('recruitment inactive')
    })`);
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    if (
      finalState.cards !== 1 ||
      finalState.tombstones !== 2 ||
      finalState.comparator !== "1" ||
      finalState.remission !== "0" ||
      finalState.pageContainsTreatmentAdvice ||
      !finalState.recruitmentInactive
    ) {
      throw new Error(
        `SYNTHETIC_GAP_WITHDRAWAL_ACCEPTANCE_FAILED ${JSON.stringify(finalState)}`,
      );
    }
    await writeFile(screenshotPath, Buffer.from(String(screenshot.data), "base64"));

    process.stdout.write(
      `${JSON.stringify(
        {
          status: "PASS",
          browser: "Brave headless",
          route,
          initial,
          afterCorrection: corrected,
          afterWithdrawal: finalState,
          screenshotPath,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    try {
      await client?.send("Browser.close");
    } catch {
      // The browser may already have closed after the final capture.
    }
    client?.close();
    await stopChild(brave);
    await rm(profile, { recursive: true, force: true });
    server.closeIdleConnections();
    server.closeAllConnections();
    server.close();
  }
}

await main();
