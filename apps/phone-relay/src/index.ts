// The phone relay's entry point. It reads PHONE_RELAY_PORT, PHONE_RELAY_HOST and PHONE_RELAY_LAPTOP_KEYS and nothing
// else, prints one startup line, and otherwise writes nothing to stdout or stderr, ever: a failure exits 1 silently.
process.on("uncaughtException", () => process.exit(1));
process.on("unhandledRejection", () => process.exit(1));
// Node's own warnings would otherwise go to stderr.
process.removeAllListeners("warning");

function port(value: string | undefined): number {
  if (value === undefined || value === "") return 8787;
  if (!/^\d{1,5}$/u.test(value) || Number(value) > 65_535) throw new Error("malformed port");
  return Number(value);
}

// Imported only now, so that a failure to load it also exits silently.
import("./relay.js").then(async ({ createRelay, parseLaptopKeys }) => {
  const keys = parseLaptopKeys(process.env.PHONE_RELAY_LAPTOP_KEYS);
  const relay = createRelay({ laptopKeys: keys });
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    relay.close().then(() => process.exit(0), () => process.exit(0));
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  const bound = await relay.listen(port(process.env.PHONE_RELAY_PORT), process.env.PHONE_RELAY_HOST || "0.0.0.0");
  process.stdout.write(`phone-relay v1 listening on ${bound} with ${keys.length} laptop key(s)\n`);
}).catch(() => process.exit(1));
