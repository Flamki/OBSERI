import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ingestWebsite, type CrawlProgressEvent } from "@/lib/knowledge";
import { ScanError } from "@/lib/scanner";
import { requireUser } from "@/lib/user-auth";
import { readUserWorkspace } from "@/lib/user-workspace-store";
import { crawlPageAllowance } from "@/lib/billing-store";

const schema = z.object({
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

export const Route = createFileRoute("/api/ingest/stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let ownerUserId: string;
        try {
          ownerUserId = (await requireUser(request)).id;
        } catch (error) {
          const status =
            typeof error === "object" && error && "status" in error ? Number(error.status) : 401;
          return errorResponse(
            error instanceof Error ? error.message : "Sign in to continue.",
            status,
            "unauthorized",
          );
        }
        const length = Number(request.headers.get("content-length") ?? "0");
        if (length > 250_000)
          return errorResponse("Request is too large.", 413, "request_too_large");

        let input: z.infer<typeof schema>;
        try {
          const parsed = schema.safeParse(await request.json());
          if (!parsed.success)
            return errorResponse("Invalid ingestion request.", 400, "invalid_request");
          input = parsed.data;
        } catch (error) {
          if (error instanceof SyntaxError)
            return errorResponse("Request body must be JSON.", 400, "invalid_json");
          throw error;
        }

        const allowance = await crawlPageAllowance(
          ownerUserId,
          await readUserWorkspace(ownerUserId),
          input.url,
        );
        if (allowance < 1)
          return errorResponse(
            "Your plan's indexed-page capacity is full. Remove pages or upgrade before crawling another website.",
            402,
            "indexed_page_limit_reached",
          );
        input = { ...input, maxPages: Math.min(input.maxPages, allowance) };

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const write = (event: CrawlProgressEvent) => {
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            };

            void ingestWebsite(input, write)
              .catch((error) => {
                const event: CrawlProgressEvent = {
                  type: "error",
                  stage: "error",
                  message:
                    error instanceof ScanError
                      ? error.message
                      : "Obseri could not build knowledge from this website.",
                  progress: 100,
                  timestamp: new Date().toISOString(),
                  stats: {
                    discovered: 0,
                    queued: 0,
                    fetched: 0,
                    indexed: 0,
                    unchanged: 0,
                    skipped: 0,
                    duplicates: 0,
                    blocked: 0,
                    errors: 1,
                  },
                };
                write(event);
                console.error("streaming_knowledge_ingestion_failed", error);
              })
              .finally(() => controller.close());
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-cache, no-store, must-revalidate",
            connection: "keep-alive",
            "x-accel-buffering": "no",
            "x-content-type-options": "nosniff",
          },
        });
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
