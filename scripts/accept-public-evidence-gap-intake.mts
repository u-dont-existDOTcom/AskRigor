import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  InMemoryPublicGapIntakeStore,
  PublicEvidenceGapIntakeService,
} from "../packages/evidence-repository/src/index.js";
import { createPublicEvidenceGapIntakeHandler } from
  "../apps/research-mcp/src/public-evidence-gap-http.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

const SLUG = "prolactinoma-spontaneous-remission";
const REVIEW_KEY = "headless-private-gpt-review-key-00000001";

interface CdpResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

class CdpClient {
  private nextId = 0;
  private readonly pending = new Map<number, {
    resolve: (value: Record<string, unknown>) => void;
    reject: (error: Error) => void;
  }>();

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
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
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
    const remote = response.result as {
      value?: T;
      description?: string;
      subtype?: string;
    } | undefined;
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PUBLIC_GAP_ACCEPTANCE_TIMEOUT ${description}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

async function main(): Promise<void> {
  const service = new PublicEvidenceGapIntakeService(
    new InMemoryPublicGapIntakeStore(),
    {
      encryptionKey: new Uint8Array(32).fill(29),
      encryptionKeyId: "headless-acceptance-v1",
    },
  );
  const server = createAskRigorHttpServer({
    publicServerEnabled: false,
    publicEvidenceGapIntakeHandler: createPublicEvidenceGapIntakeHandler({
      service,
      reviewApiKey: REVIEW_KEY,
    }),
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;
  const route = `${base}/evidence-gaps/${SLUG}`;
  const profile = await mkdtemp(join(tmpdir(), "askrigor-public-gap-brave-"));
  const screenshotPath = process.env.ASKRIGOR_PUBLIC_GAP_SCREENSHOT ??
    join(tmpdir(), "askrigor-public-gap-acceptance.png");
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
      "--window-size=1440,1400",
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
              `PUBLIC_GAP_BRAVE_EXITED code=${brave.exitCode} stderr=${braveStderr}`,
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
        const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
          .then((response) => response.json()) as Array<{
            type: string;
            url: string;
            webSocketDebuggerUrl: string;
          }>;
        return targets.find((candidate) =>
          candidate.type === "page" && candidate.url.includes("/evidence-gaps/"));
      },
      "public evidence-gap page",
    );
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await waitFor(
      () => client!.evaluate<boolean>(
        "document.readyState === 'complete' && !document.querySelector('#source-form').hidden",
      ),
      "public source step",
    );

    await client.evaluate("document.querySelector('#source-form').requestSubmit()");
    await waitFor(
      () => client!.evaluate<boolean>(
        "!document.querySelector('#narrative-form').hidden",
      ),
      "unprompted account step",
    );
    await client.evaluate(`(() => {
      document.querySelector('#narrative').value =
        'After pregnancy, delivery, and weaning my prolactinoma remained stable and did not remit. This is a comparison case.';
      document.querySelector('#narrative-form').requestSubmit();
    })()`);
    await waitFor(
      () => client!.evaluate<boolean>(
        "!document.querySelector('#details-form').hidden",
      ),
      "optional structured step",
    );
    await client.evaluate(`(() => {
      document.querySelector('[name="outcome"]').value = 'STABLE';
      document.querySelector('[name="exposure"]').value = 'PREGNANCY_POSTPARTUM';
      document.querySelector('[name="treatmentContext"]').value = 'NO_PRIOR_DOPAMINE_AGONIST';
      document.querySelector('#details-form').requestSubmit();
    })()`);
    await waitFor(
      () => client!.evaluate<boolean>(
        "!document.querySelector('#consent-form').hidden && document.querySelector('#partial-summary').textContent.includes('accepted as partial')",
      ),
      "partial label and consent step",
    );
    await client.evaluate(`(() => {
      document.querySelector('[name="privateGptAnalysis"]').checked = true;
      document.querySelector('[name="observationalAcknowledgement"]').checked = true;
      document.querySelector('#consent-form').requestSubmit();
    })()`);
    await waitFor(
      () => client!.evaluate<boolean>(
        "!document.querySelector('#complete').hidden && document.querySelector('#complete-copy').textContent.includes('partial case')",
      ),
      "submitted partial case",
    );

    const browserState = await client.evaluate<{
      submissionId: string;
      recoveryKey: string;
      pseudonym: string;
      completion: string;
    }>(`(() => {
      const submissionId = document.querySelector('#submission-id').textContent;
      const saved = JSON.parse(localStorage.getItem('askrigor-gap-' + submissionId));
      return {
        submissionId,
        recoveryKey: saved.recoveryKey,
        pseudonym: document.querySelector('#complete-title').textContent,
        completion: document.querySelector('#complete-copy').textContent
      };
    })()`);

    const publicMetadataText = await fetch(`${base}/api/evidence-gaps/${SLUG}`)
      .then((response) => response.text());
    if (publicMetadataText.includes("comparison case")) {
      throw new Error("PUBLIC_GAP_RAW_NARRATIVE_LEAKED_TO_PUBLIC_METADATA");
    }
    const review = await fetch(`${base}/internal/evidence-gaps/${SLUG}/review-queue`, {
      headers: { authorization: `Bearer ${REVIEW_KEY}` },
    }).then((response) => response.json()) as {
      counts: { total: number; partial: number; comparisonOrNonRemission: number };
      items: Array<{ participantPseudonym: string; verificationStatus: string }>;
      causalAnalysisPermitted: boolean;
    };
    if (
      review.counts.total !== 1 || review.counts.partial !== 1 ||
      review.counts.comparisonOrNonRemission !== 1 ||
      review.items[0]?.verificationStatus !== "PARTICIPANT_REPORTED_UNVERIFIED" ||
      review.causalAnalysisPermitted !== false
    ) {
      throw new Error("PUBLIC_GAP_PRIVATE_REVIEW_PROJECTION_INVALID");
    }

    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    await writeFile(screenshotPath, Buffer.from(String(screenshot.data), "base64"));
    await client.evaluate(`(() => {
      window.confirm = () => true;
      document.querySelector('#withdraw-current').click();
    })()`);
    await waitFor(
      () => client!.evaluate<boolean>(
        "document.querySelector('#status').textContent.includes('Case content removed')",
      ),
      "browser withdrawal",
    );

    const participant = await fetch(
      `${base}/api/evidence-gap-submissions/${browserState.submissionId}`,
      { headers: { authorization: `Bearer ${browserState.recoveryKey}` } },
    ).then((response) => response.json()) as {
      status: string;
      narrative: string | null;
      details: Record<string, unknown>;
    };
    const afterWithdrawal = await fetch(
      `${base}/internal/evidence-gaps/${SLUG}/review-queue`,
      { headers: { authorization: `Bearer ${REVIEW_KEY}` } },
    ).then((response) => response.json()) as { counts: { total: number } };
    if (
      participant.status !== "WITHDRAWN" || participant.narrative !== null ||
      Object.keys(participant.details).length !== 0 ||
      afterWithdrawal.counts.total !== 0
    ) {
      throw new Error("PUBLIC_GAP_WITHDRAWAL_DID_NOT_ERASE_ACTIVE_CONTENT");
    }

    process.stdout.write(`${JSON.stringify({
      ok: true,
      browser: "Brave headless",
      route,
      flow: "public partial non-remission comparison -> private GPT queue -> withdrawal",
      pseudonymShown: browserState.pseudonym.startsWith("ARCASE-"),
      partialLabelShown: browserState.completion.includes("partial case"),
      reviewCounts: review.counts,
      verificationStatus: review.items[0]?.verificationStatus,
      causalAnalysisPermitted: review.causalAnalysisPermitted,
      publicRawNarrativeAbsent: true,
      withdrawalClearedReviewQueue: true,
      screenshotPath,
    }, null, 2)}\n`);
  } finally {
    client?.close();
    await stopChild(brave);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(profile, { recursive: true, force: true });
  }
}

await main();
