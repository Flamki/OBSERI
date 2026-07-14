import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ingestWebsite } from "@/lib/knowledge";
import { ScanError } from "@/lib/scanner";

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
        try {
          const length = Number(request.headers.get("content-length") ?? "0");
          if (length > 250_000)
            return errorResponse("Request is too large.", 413, "request_too_large");
          const parsed = schema.safeParse(await request.json());
          if (!parsed.success)
            return errorResponse("Invalid ingestion request.", 400, "invalid_request");
          const knowledge = await ingestWebsite(parsed.data);
          return Response.json(
            { knowledge },
            { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
          );
        } catch (error) {
          if (error instanceof ScanError)
            return errorResponse(error.message, error.status, error.code);
          if (error instanceof SyntaxError)
            return errorResponse("Request body must be JSON.", 400, "invalid_json");
          console.error("knowledge_ingestion_failed", error);
          return errorResponse(
            "Obseri could not build knowledge from this website.",
            500,
            "ingestion_failed",
          );
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
