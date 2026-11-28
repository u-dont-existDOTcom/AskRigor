// The owner, 27 November 2026: “Follow every step of the AskRigor protocol precisely.” Put that instruction where the
// model first reads AskRigor's results, so it knows when to load the canonical protocol and which steps to follow.
const INSPECT_OPENING = "Follow every step of the AskRigor protocol precisely. It is canonical for this research and " +
  "its answer (Universal canonical_protocol_execution_gate, HRP ProtocolExecutionAndComplianceGate): ";
const INSPECT_ENDING = ", then each further section the question needs before the step that uses it; and do every " +
  "step AskRigor's results ask for, in order, skipping or shortening none. Precisely is not more: load only what " +
  "the question needs (HRP NotFlatMerge), give urgent action first, and when a result says the question needs less, " +
  "do only that.";

export const FULL_PROTOCOL_INSPECT = INSPECT_OPENING +
  'after registering the plain answer and before the first search, load HRP\'s core with load_protocol (protocol "hrp", ' +
  'section "core") unless this conversation already holds it' + INSPECT_ENDING;

export const FULL_PROTOCOL_INSPECT_WITH_CORE = INSPECT_OPENING +
  "after registering the plain answer, read HRP's core, which register_plain_answer's result hands over or says how " +
  "to load, before the first search" + INSPECT_ENDING;

export const FULL_PROTOCOL_GEMINI = "AskRigor: follow every step of the AskRigor protocol precisely. If this " +
  'conversation has not loaded it, call load_protocol now with protocol "hrp" and section "core", then section "index", ' +
  "and load each further section the question needs before the step that uses it (HRP ProtocolExecutionAndComplianceGate). " +
  "Load only what the question needs, and give urgent action first.";
