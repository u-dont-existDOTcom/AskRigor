/** Synthetic article content only; no copied abstracts or paper bodies. */
export const syntheticBody = (label: string): string => Array.from({ length: 42 }, (_, n) =>
  `Synthetic ${label} block ${n}: generated measurements and procedures for fixture checks.`
).join("\n");
export function syntheticArticleText(front: string): string {
  return `${front}\nAbstract\nSynthetic abstract only.\nMethods\n${syntheticBody("methods")}\nResults\n${syntheticBody("results")}\nDiscussion\n${syntheticBody("discussion")}`;
}
export function syntheticPdf(text: string): Uint8Array {
  const lines = text.split("\n");
  const pages = Array.from({ length: Math.ceil(lines.length / 65) }, (_, n) => lines.slice(n * 65, (n + 1) * 65));
  const objects: string[] = ["", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const ids: number[] = [];
  for (const page of pages) {
    const pageId = objects.length + 1;
    ids.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    const commands = page.map((line, n) => `${n === 0 ? "72 720" : "0 -10"} Td (${line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")}) Tj`);
    const stream = `BT /F1 6 Tf\n${commands.join("\n")}\nET`;
    objects.push(`<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`);
  }
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${ids.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [n, object] of objects.entries()) { offsets.push(Buffer.byteLength(body, "ascii")); body += `${n + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(body, "ascii");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
