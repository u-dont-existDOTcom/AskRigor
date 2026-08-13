import type { IncomingMessage } from "node:http";

export class ActionBodyTooLargeError extends Error {}

export class InvalidActionJsonError extends Error {}

export async function readActionJsonBody(
  request: IncomingMessage,
  maxBytes: number
): Promise<unknown> {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    retainRequestErrorListenerUntilClose(request);
    request.pause();
    throw new ActionBodyTooLargeError();
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let settled = false;

    const cleanup = () => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("aborted", onAborted);
      request.off("error", onError);
      request.off("close", onClose);
    };
    const rejectOnce = (error: Error) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(error);
      }
    };
    const resolveOnce = (body: unknown) => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(body);
      }
    };
    const onData = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      receivedBytes += bytes.byteLength;
      if (receivedBytes > maxBytes) {
        retainRequestErrorListenerUntilClose(request);
        request.pause();
        rejectOnce(new ActionBodyTooLargeError());
        return;
      }
      chunks.push(bytes);
    };
    const onEnd = () => {
      try {
        resolveOnce(JSON.parse(Buffer.concat(chunks, receivedBytes).toString("utf8")));
      } catch {
        rejectOnce(new InvalidActionJsonError());
      }
    };
    const onAborted = () => rejectOnce(new Error("Action request aborted"));
    const onError = () => rejectOnce(new Error("Action request read failed"));
    const onClose = () => rejectOnce(new Error("Action request closed"));

    request.on("data", onData);
    request.once("end", onEnd);
    request.once("aborted", onAborted);
    request.once("error", onError);
    request.once("close", onClose);
  });
}

function retainRequestErrorListenerUntilClose(request: IncomingMessage): void {
  const onError = () => {};
  const onClose = () => request.off("error", onError);

  request.on("error", onError);
  request.once("close", onClose);
}
