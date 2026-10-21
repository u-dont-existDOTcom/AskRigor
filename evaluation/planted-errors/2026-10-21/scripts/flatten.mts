// Renders a table exactly as AskRigor's JATS extraction gives it to the model (indexJatsStudyDocument's "table" block).
import { createHash } from "node:crypto";
import { indexJatsStudyDocument } from "/home/user/AskRigor/packages/sources/src/jats-study-index.ts";
const tables: Record<string, string> = {
  ember: `<table-wrap id="t2"><label>Table 2</label><caption><p>Fatigue score (0-33, higher = worse)</p></caption><table><thead><tr><th></th><th>Ember root (n = 45)</th><th>Placebo (n = 45)</th></tr></thead><tbody><tr><td>Baseline, mean</td><td>24.0</td><td>23.8</td></tr><tr><td>Week 8, mean</td><td>20.9</td><td>15.6</td></tr><tr><td>Change</td><td>-3.1</td><td>-8.2</td></tr></tbody></table></table-wrap>`,
  ironbark: `<table-wrap id="t3"><label>Table 3</label><caption><p>Adverse events</p></caption><table><thead><tr><th></th><th>Ironbark (n = 75)</th><th>Placebo (n = 75)</th></tr></thead><tbody><tr><td>Any adverse event</td><td>18</td><td>11</td></tr><tr><td>Dizziness</td><td>7</td><td>2</td></tr><tr><td>Admitted to hospital</td><td>2 (one for fainting, one for a fall)</td><td>0</td></tr></tbody></table></table-wrap>`
};
for (const [name, table] of Object.entries(tables)) {
  const xml = `<?xml version="1.0"?><article><front><article-meta><title-group><article-title>T</article-title></title-group></article-meta></front><body><sec><title>Results</title>${table}</sec></body></article>`;
  const index = indexJatsStudyDocument({ pmcid: "PMC1234567", format: "jats_xml", document_completeness: "full_text_with_body",
    content_sha256: createHash("sha256").update(xml, "utf8").digest("hex"), content_bytes: Buffer.byteLength(xml), xml });
  for (const b of index.blocks) if (b.kind === "table" || (b as any).block_type === "table" || JSON.stringify(b).includes("Baseline") || JSON.stringify(b).includes("Dizziness")) console.log(name, "=>", JSON.stringify(b));
}
