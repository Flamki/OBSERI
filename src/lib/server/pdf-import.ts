import { createHash, randomUUID } from "node:crypto";
import { PDFParse } from "pdf-parse";
import { splitKnowledgeText } from "../knowledge-content";
import type { KnowledgeBase, KnowledgePage, KnowledgeSource } from "../soul";

export const PDF_MAX_BYTES = 3_000_000;
export class PdfImportError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
  }
}

export async function importPdf(
  data: Uint8Array,
  filename: string,
  pageAllowance: number,
  signal?: AbortSignal,
): Promise<KnowledgeBase> {
  if (data.byteLength > PDF_MAX_BYTES)
    throw new PdfImportError("Choose a PDF smaller than 3 MB.", 413);
  if (!new TextDecoder().decode(data.slice(0, 1024)).includes("%PDF-"))
    throw new PdfImportError("This file is not a valid PDF.");
  const id = randomUUID();
  const now = new Date().toISOString();
  const name = filename.replace(/[^\p{L}\p{N} ._()-]/gu, "").slice(0, 120) || "Document.pdf";
  const rootUrl = `document://${id}`;
  const source: KnowledgeSource = {
    id: `pdf-${id}`,
    type: "document",
    name,
    rootUrl,
    status: "ready",
    pageLimit: 50,
    crawlDepth: 0,
    cadence: "manual",
    includePatterns: [],
    excludePatterns: [],
    autoRemoveMissing: false,
    createdAt: now,
    lastCrawledAt: now,
  };
  const parser = new PDFParse({
    data,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  });
  const abort = () => {
    void parser.destroy().catch(() => undefined);
  };
  const deadline = AbortSignal.any([AbortSignal.timeout(25_000), ...(signal ? [signal] : [])]);
  deadline.addEventListener("abort", abort, { once: true });
  try {
    deadline.throwIfAborted();
    const info = await parser.getInfo();
    if (info.total > Math.min(50, pageAllowance))
      throw new PdfImportError(
        `This PDF has ${info.total} pages. You can import up to ${Math.min(50, pageAllowance)} pages with your remaining capacity. Split the document or free space first.`,
        402,
      );
    const result = await parser.getText({ pageJoiner: "", lineEnforce: true });
    deadline.throwIfAborted();
    if (result.text.length > 120_000)
      throw new PdfImportError(
        "This PDF contains too much text. Split it into smaller documents (up to 120,000 characters each).",
      );
    const pages: KnowledgePage[] = [];
    const errors: KnowledgeBase["errors"] = [];
    for (const item of result.pages) {
      const content = item.text.replace(/\u0000/g, "").trim();
      const url = `${rootUrl}/page/${item.num}`;
      if (!content) {
        errors.push({
          url,
          message: `Page ${item.num} has no extractable text. Scanned images need OCR before import.`,
        });
        continue;
      }
      const title = `${name} · Page ${item.num}`;
      pages.push({
        id: `pdf-${id}-${item.num}`,
        url,
        title,
        description: content.slice(0, 180),
        content,
        contentType: "application/pdf",
        hash: createHash("sha256").update(content).digest("hex"),
        wordCount: content.split(/\s+/).length,
        capturedAt: now,
        updatedAt: now,
        revision: 1,
        status: "ready",
        sourceId: source.id,
        enabled: true,
        chunks: splitKnowledgeText(content).map((text, order) => ({
          id: `pdf-${id}-${item.num}-${order}`,
          sourceId: source.id,
          pageUrl: url,
          pageTitle: title,
          text,
          order,
          tokenEstimate: Math.ceil(text.length / 4),
        })),
      });
    }
    if (!pages.length)
      throw new PdfImportError(
        "This PDF has no selectable text. Run OCR on scanned pages and upload it again.",
      );
    if (errors.length) source.status = "warning";
    return {
      schemaVersion: 2,
      rootUrl,
      status: "ready",
      sources: [source],
      pages,
      keywords: [],
      errors,
      lastCrawledAt: now,
    };
  } catch (error) {
    if (error instanceof PdfImportError) throw error;
    if (deadline.aborted)
      throw new PdfImportError("PDF extraction timed out. Try a smaller document.");
    throw new PdfImportError(
      "This PDF could not be read. Remove password protection or export a new PDF and try again.",
    );
  } finally {
    deadline.removeEventListener("abort", abort);
    await parser.destroy().catch(() => undefined);
  }
}
