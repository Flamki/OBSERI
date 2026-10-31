import { expect, it } from "vitest";
import { importPdf } from "./server/pdf-import";

// A real PDF with a correct cross-reference table, not a mocked parser response.
function pdf(lines: string[]) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${lines.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${lines.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  lines.forEach((line, i) => {
    const stream = `BT /F1 12 Tf 50 750 Td (${line}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

it("extracts PDF pages into searchable chunks with page-specific citations", async () => {
  const knowledge = await importPdf(
    pdf(["Returns accepted within thirty days.", "Support is available on weekdays."]),
    "Guide.pdf",
    10,
  );
  expect(knowledge.pages).toHaveLength(2);
  expect(knowledge.pages[0].content).toContain("thirty days");
  expect(knowledge.pages[1].chunks[0].pageTitle).toBe("Guide.pdf · Page 2");
  expect(knowledge.pages[1].chunks[0].pageUrl).toMatch(/^document:.*\/page\/2$/);
  expect(knowledge.sources?.[0].cadence).toBe("manual");
});

it("rejects PDFs exceeding the remaining plan capacity", async () => {
  await expect(importPdf(pdf(["One", "Two"]), "Guide.pdf", 1)).rejects.toMatchObject({
    status: 402,
  });
});

it("explains scanned or blank PDFs instead of adding empty knowledge", async () => {
  await expect(importPdf(pdf([""]), "Scan.pdf", 10)).rejects.toThrow("OCR");
});

it("rejects invalid and oversized uploads", async () => {
  await expect(importPdf(new TextEncoder().encode("not a PDF"), "fake.pdf", 10)).rejects.toThrow(
    "valid PDF",
  );
  await expect(importPdf(new Uint8Array(3_000_001), "large.pdf", 10)).rejects.toMatchObject({
    status: 413,
  });
});
