import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/lib/user-auth";
import { readUserWorkspace } from "@/lib/user-workspace-store";
import { billingSummary } from "@/lib/billing-store";
import { consumeRateLimit } from "@/lib/integration-store";
import { importPdf, PDF_MAX_BYTES } from "@/lib/server/pdf-import";

export const Route = createFileRoute("/api/knowledge/pdf")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          if (!(await consumeRateLimit(`pdf-import:${user.id}`, 10, 60)))
            return Response.json(
              { error: { message: "Please wait a minute before importing another PDF." } },
              { status: 429 },
            );
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
            const { done, value } = await reader.read();
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
          return Response.json({ knowledge }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          const status =
            typeof error === "object" && error && "status" in error ? Number(error.status) : 422;
          return Response.json(
            { error: { message: error instanceof Error ? error.message : "PDF import failed." } },
            { status, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
