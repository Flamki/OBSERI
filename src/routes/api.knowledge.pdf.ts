import { acquireImportLease, recordOperation, withinDeadline } from "@/lib/server/operation-guards";
import { createFileRoute } from "@tanstack/react-router";
import { requireWorkspaceUser as requireUser } from "@/lib/server/team-store";
import { readUserWorkspace } from "@/lib/user-workspace-store";
import { billingSummary } from "@/lib/billing-store";
import { consumeRateLimit } from "@/lib/integration-store";
import { UserAuthError } from "@/lib/user-auth";
import { importPdf, PdfImportError, PDF_MAX_BYTES } from "@/lib/server/pdf-import";

export const Route = createFileRoute("/api/knowledge/pdf")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let release: (() => Promise<void>) | undefined;
        let owner: string | undefined;
        try {
          const user = await requireUser(request);
          if (!(await consumeRateLimit(`pdf-import:${user.id}`, 10, 60)))
            return Response.json(
              { error: { message: "Please wait a minute before importing another PDF." } },
              { status: 429 },
            );
          owner = user.id;
          release = await acquireImportLease(owner);
          const uploadSignal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
          // Stream the raw file with a hard byte limit, including chunked requests.
          const reader = request.body?.getReader();
          if (!reader)
            return Response.json(
              { error: { message: "Choose a PDF to upload." } },
              { status: 400 },
            );
          const parts: Uint8Array[] = [];
          let size = 0;
          while (true) {
            const { done, value } = await withinDeadline(reader.read(), uploadSignal).catch(
              (error) => {
                void reader.cancel();
                throw error;
              },
            );
            if (done) break;
            size += value.length;
            if (size > PDF_MAX_BYTES) {
              await reader.cancel();
              return Response.json(
                { error: { message: "Choose a PDF smaller than 3 MB." } },
                { status: 413 },
              );
            }
            parts.push(value);
          }
          const data = new Uint8Array(size);
          let offset = 0;
          for (const part of parts) {
            data.set(part, offset);
            offset += part.length;
          }
          const [workspace, billing] = await Promise.all([
            readUserWorkspace(user.id),
            billingSummary(user.id),
          ]);
          const used = (workspace?.souls ?? []).reduce(
            (n, soul) => n + soul.knowledge.pages.length,
            0,
          );
          const allowance =
            billing.plan.limits.indexedPages === null
              ? 50
              : Math.max(0, billing.plan.limits.indexedPages - used);
          const filename = decodeURIComponent(request.headers.get("x-file-name") || "Document.pdf");
          const knowledge = await importPdf(data, filename, allowance, request.signal);
          await recordOperation(owner, "pdf", "ok", "completed");
          return Response.json({ knowledge }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          if (owner && release) await recordOperation(owner, "pdf", "failed", "import_failed");
          const expected = error instanceof UserAuthError || error instanceof PdfImportError;
          const status = expected ? error.status : 503;
          return Response.json(
            {
              error: {
                message: expected
                  ? error.message
                  : "PDF import is temporarily unavailable. Please try again.",
              },
            },
            { status, headers: { "cache-control": "no-store" } },
          );
        } finally {
          await release?.();
        }
      },
    },
  },
});
