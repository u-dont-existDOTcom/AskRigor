import { parseArgs } from "node:util";
import {
  captureSyntheticTransportProbeFromFiles,
  initializeSyntheticTransportRecovery,
  prepareSyntheticTransportPreflight,
  SyntheticPreflightError,
  verifySyntheticTransportPreflight,
} from "./synthetic-consumer-transport-preflight.mts";

// No raw response, prompt, marker, comparison match, or UI text reaches stdout/stderr.
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "artifact-root": { type: "string" }, manifest: { type: "string" },
      "manifest-sha256": { type: "string" }, probe: { type: "string" },
      "raw-file": { type: "string" }, "metadata-file": { type: "string" },
      namespace: { type: "string" }, "recovery-directive": { type: "string" },
      "recovery-source": { type: "string" }, "prior-transport-event": { type: "string" },
      "prior-operational-return": { type: "string" },
    },
  });
  const need = (key: keyof typeof values) => {
    const value = values[key];
    if (!value) throw new SyntheticPreflightError("REQUIRED_ARGUMENT_MISSING");
    return value;
  };
  if (positionals.length !== 1) throw new SyntheticPreflightError("COMMAND_REQUIRED");
  const command = positionals[0];
  let output: unknown;
  if (command === "prepare") {
    output = await prepareSyntheticTransportPreflight(need("artifact-root"));
  } else if (command === "initialize-recovery") {
    output = await initializeSyntheticTransportRecovery({
      manifestPath: need("manifest"), manifestSha256: need("manifest-sha256"), recoveryDirectivePath: need("recovery-directive"),
      recoverySourcePath: need("recovery-source"), priorTransportEventPath: need("prior-transport-event"),
      priorOperationalReturnPath: need("prior-operational-return"),
    });
  } else if (command === "verify") {
    output = await verifySyntheticTransportPreflight(need("manifest"), need("manifest-sha256"), values.namespace);
  } else if (command === "capture" || command === "stop") {
    if (command === "stop" && values["raw-file"]) throw new SyntheticPreflightError("STOP_DOES_NOT_ACCEPT_RAW_FILE");
    output = await captureSyntheticTransportProbeFromFiles({
      manifestPath: need("manifest"), manifestSha256: need("manifest-sha256"), probeId: need("probe"),
      metadataPath: need("metadata-file"), rawPath: command === "capture" ? need("raw-file") : undefined,
      namespace: values.namespace,
    });
  } else throw new SyntheticPreflightError("COMMAND_INVALID");
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error instanceof SyntheticPreflightError ? error.code : "SYNTHETIC_PREFLIGHT_FAILED" })}\n`);
  process.exitCode = 1;
}
