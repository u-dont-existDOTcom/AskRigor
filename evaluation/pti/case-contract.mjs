// The PTI case-authoring contract (schema askrigor.pti.case.v1), shared by the
// tests and by the sealed validation authoring, which must check a case
// without showing it to anyone. Returns problems as short messages that name
// fields, never case content. Node built-ins only.

export const CASE_SCHEMA = "askrigor.pti.case.v1";
export const TIERS = new Set(["top", "acceptable", "low_value", "failed_or_low_value", "unsafe"]);
export const SCORING_KEYS = [
  "time_to_useful_test", "gold_action_capture", "action_rank", "unnecessary_action_burden", "constraint_fidelity",
  "matched_provocation_fidelity", "causal_calibration", "safety", "direct_usefulness"
];
const DATA_ROLES = new Set(["DEVELOPMENT", "DEVELOPMENT_PERMANENT_REGRESSION", "VALIDATION"]);

const isText = (value) => typeof value === "string" && value.trim().length > 0;
const isTextList = (value) => Array.isArray(value) && value.every(isText);

/** Every way the case breaks the contract; an empty list means it meets it. */
export function caseProblems(pti) {
  const problems = [];
  const need = (condition, message) => { if (!condition) problems.push(message); };
  if (pti === null || typeof pti !== "object" || Array.isArray(pti)) return ["case is not an object"];
  need(pti.schema === CASE_SCHEMA, "schema");
  for (const field of ["id", "title", "family", "provenance", "matched_endpoint"]) need(isText(pti[field]), field);
  need(DATA_ROLES.has(pti.data_role), "data_role");
  need(isTextList(pti.structures) && pti.structures.length > 0, "structures");

  const turns = Array.isArray(pti.turns) ? pti.turns : [];
  need(turns.length >= 3, "turns: at least three");
  const turnIds = turns.map((turn) => turn?.id);
  need(turns.every((turn) => isText(turn?.id) && isText(turn?.user)), "turns: id and user text");
  need(new Set(turnIds).size === turnIds.length, "turns: unique ids");
  const solutions = turns.filter((turn) => turn?.solution_revealed === true);
  need(solutions.length === 1, "turns: exactly one solution_revealed");
  // The decision window is every turn before the solution, in order; the rest are interpretation turns.
  const solution = turns.findIndex((turn) => turn?.solution_revealed === true);
  need(solution > 0, "turns: the solution comes after at least one turn");
  if (solution > 0) {
    need(JSON.stringify(pti.decision_window) === JSON.stringify(turnIds.slice(0, solution)), "decision_window");
    need(JSON.stringify(pti.interpretation_turns) === JSON.stringify(turnIds.slice(solution)), "interpretation_turns");
  }
  const window = Array.isArray(pti.decision_window) ? pti.decision_window : [];

  const constraints = Array.isArray(pti.constraints) ? pti.constraints : [];
  need(constraints.length >= 3, "constraints: at least three");
  need(constraints.every((item) => isText(item?.id) && isText(item?.text) && turnIds.includes(item?.source)),
    "constraints: id, text and a source turn");

  const actions = Array.isArray(pti.actions) ? pti.actions : [];
  const actionIds = actions.map((action) => action?.id);
  need(actions.length >= 6, "actions: at least six");
  need(new Set(actionIds).size === actionIds.length, "actions: unique ids");
  need(actions.every((action) => isText(action?.id) && /^a_[a-z0-9_]+$/u.test(action.id) && action.id !== "other"),
    "actions: ids like a_name");
  need(actions.every((action) => TIERS.has(action?.tier)), "actions: tier");
  need(actions.every((action) => isText(action?.description) && isText(action?.hidden_outcome)),
    "actions: description and hidden_outcome");
  for (const tier of ["top", "unsafe", "low_value"]) {
    need(actions.some((action) => action?.tier === tier), `actions: at least one ${tier}`);
  }
  need(actions.every((action) => action?.failed_after === undefined || window.includes(action.failed_after)),
    "actions: failed_after names a decision-window turn");
  need(actions.some((action) => action?.failed_after !== undefined), "actions: at least one failed attempt");

  const claims = pti.claims_after_solution ?? {};
  need(isTextList(claims.supported) && claims.supported.length > 0, "claims_after_solution.supported");
  need(isTextList(claims.unsupported_as_established) && claims.unsupported_as_established.length > 0,
    "claims_after_solution.unsupported_as_established");
  need(isTextList(pti.stop_escalation) && pti.stop_escalation.length > 0, "stop_escalation");
  need(isTextList(pti.severe_failure_flags) && pti.severe_failure_flags.length >= 5, "severe_failure_flags: at least five");
  const scoring = pti.scoring ?? {};
  need(SCORING_KEYS.every((key) => isText(scoring[key])), "scoring: every key");
  return problems;
}
