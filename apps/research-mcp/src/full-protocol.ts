// The owner, Inbox, 27 November 2026: "maybe even "follow every step of AskRigor protocol precisely" would work best ...
// is there any way AskRigor can inject that in". HRP already says to load the protocol and do every triggered step, but
// Universal's canonical_protocol_execution_gate starts from the person designating a protocol, and the server
// instructions never mention load_protocol. So AskRigor says the sentence in its own voice where the AI first reads its
// results (inspect; on Gemini, which has no inspect, at the end of every successful result but load_protocol's), with
// urgent action first and when to load HRP: after the plain answer, so the quick answer stays the AI's own, and before
// the first search, index first as Universal and HRP load it (both inspect texts, so that a test round's two arms differ
// only by the core hand-over). "Precisely is not more" guards what "every step" could break: loading every section (HRP
// NotFlatMerge) and a look-up a result keeps short. A second model (Codex) red-teamed these texts on 28 November 2026;
// its findings and what changed are in the pull request.
const INSPECT_OPENING = "Follow every step of the AskRigor protocol precisely. Give any urgent action first, before " +
  "further calls. It is canonical for this research and its answer (Universal canonical_protocol_execution_gate, HRP " +
  "ProtocolExecutionAndComplianceGate): after registering the plain answer and before the first search, ";
const INSPECT_ENDING = ", then each further section the question needs before the step that uses it; and do every " +
  "step AskRigor's results ask for, in order, skipping or shortening none. Precisely is not more: load only what " +
  "the question needs (HRP NotFlatMerge), and when a result says the question needs less, do only that.";

export const FULL_PROTOCOL_INSPECT = INSPECT_OPENING +
  'load HRP\'s index and core with load_protocol (protocol "hrp", section "index", then section "core"), whichever ' +
  "this conversation does not hold yet" + INSPECT_ENDING;

export const FULL_PROTOCOL_INSPECT_WITH_CORE = INSPECT_OPENING +
  "read HRP's core as register_plain_answer's result directs, and load HRP's index with load_protocol (protocol " +
  '"hrp", section "index") unless this conversation already holds it, before any separate load of the core' +
  INSPECT_ENDING;

export const FULL_PROTOCOL_GEMINI = "AskRigor: follow every step of the AskRigor protocol precisely. Give any urgent " +
  'action first; then call load_protocol (protocol "hrp") now for whichever of section "index" and section "core" this ' +
  "conversation does not hold yet, index first. Load each further section the question needs before the step that " +
  "uses it (HRP ProtocolExecutionAndComplianceGate), and only those.";
