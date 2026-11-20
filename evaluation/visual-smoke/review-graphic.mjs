/**
 * Experimental evidence-graphic manifest checker.
 * Checks exact source-bound labels, denominators, figure values, uncertainty, and first-view coverage.
 * It does NOT validate whether the scientific interpretation is correct or whether pixels render legibly.
 */
export function reviewEvidenceGraphic(testCase, graphic = testCase.graphic) {
  const problems = [];
  const require = (condition, message) => { if (!condition) problems.push(message); };
  require(typeof testCase.prompt === "string" && testCase.prompt.trim().length > 0, "Original question must be retained.");
  require(Array.isArray(graphic.takeaways) && graphic.takeaways.length > 0 && graphic.takeaways.length <= 3,
    "First view needs 1–3 substantive takeaways.");
  require(Array.isArray(graphic.panels) && graphic.panels.length > 0,
    "Graphic requires source-bound visual panels.");
  require(typeof graphic.accessibleSummary === "string" && graphic.accessibleSummary.length >= 30,
    "Provide an accessible text summary with substantive content.");
  const facts = new Map(testCase.sourceFacts.map(f => [f.id, f]));
  const covered = new Set(graphic.coveredOutcomes || []);
  for (const required of testCase.requiredOutcomes) {
    require(covered.has(required), "Missing decision-relevant outcome: " + required);
  }
  const seen = new Set();
  for (const panel of graphic.panels || []) {
    require(typeof panel.title === "string" && panel.title.length >= 12,
      "Panel title must explain its outcome.");
    require(typeof panel.accessibleDescription === "string" && panel.accessibleDescription.length >= 25,
      "Panel needs a substantial accessible description: " + panel.title);
    require(Array.isArray(panel.marks) && panel.marks.length > 0,
      "Panel needs source-backed marks: " + panel.title);
    if (panel.type === "bar") {
      require(panel.axisMinimum === 0, "Bars must have a zero baseline: " + panel.title);
    }
    if (panel.type === "interval") {
      require(Number.isFinite(panel.nullReference),
        "Interval plot requires a stated null reference: " + panel.title);
      require(panel.interactiveExplainer === "keyboard-and-touch",
        "CI explainer must work without hover: " + panel.title);
    }
    const panelFacts = [];
    for (const mark of panel.marks || []) {
      const fact = facts.get(mark.factId);
      require(!!fact, "Unknown source fact: " + mark.factId);
      if (!fact) continue;
      panelFacts.push(fact);
      seen.add(fact.id);
      require(mark.label === fact.label,
        "Mark must show complete source outcome label: " + fact.id);
      require(mark.visibleWithoutHover === true,
        "Outcome label must be visible without hover: " + fact.id);
      require(mark.population === fact.population,
        "Wrong population: " + fact.id);
      require(mark.denominator === fact.denominator,
        "Wrong denominator: " + fact.id);
      require(mark.horizon === fact.horizon,
        "Wrong time horizon: " + fact.id);
      require(mark.evidenceClass === fact.evidenceClass,
        "Causal/evidence class differs from source: " + fact.id);
      require((panel.visibleEvidenceLegend || []).includes(fact.evidenceClass),
        "Evidence class must be visible in text legend: " + fact.id);
      require(mark.source === fact.source,
        "Unmatched source identifier: " + fact.id);
      require(mark.unit === fact.unit,
        "Incorrect unit: " + fact.id);
      if (fact.value === null) {
        require(mark.value === null && typeof mark.unknownExplanation === "string" && mark.unknownExplanation.length > 15,
          "Unknown effects must never be plotted as zero: " + fact.id);
      } else {
        require(typeof mark.value === "number" && Math.abs(mark.value - fact.value) < 1e-9,
          "Plotted estimate does not match source: " + fact.id);
      }
      if (fact.ci !== null) {
        require(mark.ciVisible === true,
          "95% CI must be visibly drawn/labeled, not hover-only: " + fact.id);
        require(Array.isArray(mark.ci) && mark.ci.length === 2 &&
          mark.ci.every((n,i) => Math.abs(n-fact.ci[i]) < 1e-9),
          "Confidence interval differs from source: " + fact.id);
        require(mark.ci[0] <= fact.value && fact.value <= mark.ci[1],
          "CI must contain the plotted point estimate: " + fact.id);
      } else {
        require(mark.ci === null && mark.ciVisible === false,
          "Do not invent a confidence interval for descriptive/unknown source: " + fact.id);
      }
      require(mark.causalFraction === undefined,
        "Do not invent a numeric portion of a bar that is causal: " + fact.id);
    }
    if (panel.directComparison && panelFacts.length > 1) {
      const keys = ["population","denominator","horizon","unit"];
      for (const key of keys) {
        if (panelFacts.some(f => f[key] !== panelFacts[0][key])) {
          problems.push("Incompatible direct-comparison " + key + " in panel: " + panel.title);
        }
      }
    }
    if (panel.type === "interval") {
      require(panelFacts.every(f => f.unit === "risk ratio" && panel.nullReference === 1 ||
        f.unit === "risk difference" && panel.nullReference === 0),
        "Interval plot null reference mismatches effect type: " + panel.title);
    }
  }
  for (const fact of testCase.sourceFacts) {
    if (testCase.requiredVisibleFacts.includes(fact.id)) {
      require(seen.has(fact.id), "Required fact missing from visible plot: " + fact.id);
    }
  }
  return {passed: problems.length === 0, problems};
}
