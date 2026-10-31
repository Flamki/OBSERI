import {
  acquireImportLease,
  recordOperation,
  readBoundedJson,
} from "@/lib/server/operation-guards";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ingestWebsite } from "@/lib/knowledge";
import { ScanError } from "@/lib/scanner";
import { requireWorkspaceUser as requireUser } from "@/lib/server/team-store";
import { readUserWorkspace } from "@/lib/user-workspace-store";
import { crawlPageAllowance } from "@/lib/billing-store";

const schema = z.object({
  rendering: z.enum(["auto", "always", "never"]).default("auto"),
  url: z.string().trim().url().max(2_048),
  maxPages: z.number().int().min(1).max(50).default(20),
  maxDepth: z.number().int().min(0).max(4).default(3),
  includePatterns: z.array(z.string().trim().max(500)).max(20).default([]),
  excludePatterns: z.array(z.string().trim().max(500)).max(20).default([]),
  validators: z
    .array(
      z.object({
        url: z.string().trim().url().max(2_048),
        etag: z.string().max(500).optional(),
        lastModified: z.string().max(200).optional(),
      }),
    )
    .max(100)
    .default([]),
});

export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          service: "obseri-knowledge-ingestion",
          status: "ready",
          limits: { maxPages: 50, maxDepth: 4 },
        }),
      POST: async ({ request }) => {
        let release: (() => Promise<void>) | undefined;
        let owner: string | undefined;
        try {
          const user = await requireUser(request);
          const length = Number(request.headers.get("content-length") ?? "0");
          if (length > 250_000)
            return errorResponse("Request is too large.", 413, "request_too_large");
          const parsed = schema.safeParse(await readBoundedJson(request));
          if (!parsed.success)
            return errorResponse("Invalid ingestion request.", 400, "invalid_request");
          const allowance = await crawlPageAllowance(
            user.id,
            await readUserWorkspace(user.id),
            parsed.data.url,
          );
          if (allowance < 1)
            return errorResponse(
              "Your plan's indexed-page capacity is full. Remove pages or upgrade before crawling another website.",
              402,
              "indexed_page_limit_reached",
            );
          owner = user.id;
          release = await acquireImportLease(owner);
          const knowledge = await ingestWebsite({
            ...parsed.data,
            signal: AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]),
            maxPages: Math.min(parsed.data.maxPages, allowance),
          });
          await recordOperation(owner, "crawl", "ok", "completed");
          return Response.json(
            { knowledge },
            { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
          );
        } catch (error) {
          if (owner && release) await recordOperation(owner, "crawl", "failed", "import_failed");
          if (error instanceof ScanError)
            return errorResponse(error.message, error.status, error.code);
          if (error instanceof SyntaxError)
            return errorResponse("Request body must be JSON.", 400, "invalid_json");
          if (typeof error === "object" && error && "status" in error)
            return errorResponse(
              error instanceof Error ? error.message : "Sign in to continue.",
              Number(error.status),
              "ingestion_denied",
            );
          console.error("knowledge_ingestion_failed", error);
          return errorResponse(
            "Obseri could not build knowledge from this website.",
            500,
            "ingestion_failed",
          );
        } finally {
          await release?.();
        }
      },
    },
  },
});

function errorResponse(message: string, status: number, code: string) {
  return Response.json(
    { error: { message, code } },
    { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  );
}
