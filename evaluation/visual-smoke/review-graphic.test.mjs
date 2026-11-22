import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewEvidenceGraphic} from "./review-graphic.mjs";
const cases=JSON.parse(readFileSync(new URL("./cases.json",import.meta.url),"utf8")).cases;
test("three cross-domain graphics satisfy manifest checks",()=>{
  for (const c of cases) {
    const r=reviewEvidenceGraphic(c);
    assert.equal(r.passed,true,c.id+": "+r.problems.join("; "));
  }
});
test("original colonoscopy prompt alone carries a meaningful complete-output contract",()=>{
  const c=cases[0];
  assert.equal(c.prompt,"do people who get colonoscopies regularly have lower or higher rates of colon cancer or other disease or mortality?");
  assert.deepEqual(c.requiredVisibleFacts,["crc_incidence","crc_death","total_death","pain_during","pain_next","bleeding","perforation","long_term"]);
});
test("rejects the original misrepresentation: mixed denominators and hidden labels",()=>{
  const c=structuredClone(cases[0]);
  c.graphic.panels[0].marks[0].visibleWithoutHover=false;
  c.graphic.panels[0].marks[0].denominator="completed procedures";
  const r=reviewEvidenceGraphic(c);
  assert.equal(r.passed,false);
  assert(r.problems.some(x=>x.includes("visible without hover")));
  assert(r.problems.some(x=>x.includes("Wrong denominator")));
});
test("rejects missing pain, sedation, and nonfatal long-term outcomes",()=>{
  const c=structuredClone(cases[0]);
  c.graphic.coveredOutcomes=["crc_incidence","crc_death","total_death"];
  c.graphic.panels=c.graphic.panels.slice(0,1);
  const r=reviewEvidenceGraphic(c);
  assert.equal(r.passed,false);
  assert(r.problems.some(x=>x.includes("pain_during")));
  assert(r.problems.some(x=>x.includes("sedation_risks")));
  assert(r.problems.some(x=>x.includes("long_term")));
});
test("rejects missing confidence intervals and invented causal fractions",()=>{
  const c=structuredClone(cases[0]);
  c.graphic.panels[0].marks[0].ciVisible=false;
  c.graphic.panels[0].marks[1].causalFraction=0.8;
  const r=reviewEvidenceGraphic(c);
  assert.equal(r.passed,false);
  assert(r.problems.some(x=>x.includes("95% CI")));
  assert(r.problems.some(x=>x.includes("invent a numeric portion")));
});
test("rejects direct comparisons that mix randomized invitation and completed-procedure harms",()=>{
  const c=structuredClone(cases[0]);
  c.graphic.panels[0].marks.push(c.graphic.panels[2].marks[0]);
  const r=reviewEvidenceGraphic(c);
  assert.equal(r.passed,false);
  assert(r.problems.some(x=>x.includes("Incompatible direct-comparison")));
});
test("rejects wrong null reference and bar charts with a truncated axis",()=>{
  const c=structuredClone(cases[0]);
  c.graphic.panels[0].nullReference=0;
  c.graphic.panels[1].axisMinimum=1;
  const r=reviewEvidenceGraphic(c);
  assert.equal(r.passed,false);
  assert(r.problems.some(x=>x.includes("null reference")));
  assert(r.problems.some(x=>x.includes("zero baseline")));
});
test("rejects fabricated confidence intervals for cost estimates",()=>{
  const c=structuredClone(cases[2]);
  c.graphic.panels[0].marks[0].ci=[800,880];
  c.graphic.panels[0].marks[0].ciVisible=true;
  const r=reviewEvidenceGraphic(c);
  assert.equal(r.passed,false);
  assert(r.problems.some(x=>x.includes("invent a confidence interval")));
});
