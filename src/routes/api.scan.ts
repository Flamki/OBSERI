import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  ScanError,
  scanPublicPage,
  type MonitorCategory,
  type PreviousSnapshot,
} from "@/lib/scanner";

const categorySchema = z.enum([
  "pricing",
  "product",
  "messaging",
  "documentation",
  "hiring",
  "reviews",
  "other",
]);

const scanRequestSchema = z.object({
  url: z.string().trim().min(1).max(2_048),
  category: categorySchema.optional(),
  previous: z
    .object({
      hash: z.string().regex(/^[a-f0-9]{64}$/i),
      normalizedText: z.string().max(120_000),
      capturedAt: z.string().datetime(),
    })
    .optional(),
});

export const Route = createFileRoute("/api/scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const contentLength = Number(request.headers.get("content-length") ?? "0");
          if (contentLength > 180_000) {
            return apiError("The scan request is too large.", 413, "request_too_large");
          }

          const parsed = scanRequestSchema.safeParse(await request.json());
          if (!parsed.success) {
            return apiError(
              "The scan request is invalid.",
              400,
              "invalid_request",
              parsed.error.flatten(),
            );
          }

          const result = await scanPublicPage({
            url: parsed.data.url,
            category: parsed.data.category as MonitorCategory | undefined,
            previous: parsed.data.previous as PreviousSnapshot | undefined,
          });

          return Response.json(result, {
            status: 200,
            headers: {
              "cache-control": "no-store",
              "x-content-type-options": "nosniff",
            },
          });
        } catch (error) {
          if (error instanceof ScanError) {
            return apiError(error.message, error.status, error.code);
          }
          if (error instanceof SyntaxError) {
            return apiError("The request body must be valid JSON.", 400, "invalid_json");
          }
          if (error instanceof Error && error.name === "TimeoutError") {
            return apiError("The source took too long to respond.", 504, "source_timeout");
          }
          console.error("scan_failed", error);
          return apiError("Obseri could not scan this source.", 500, "scan_failed");
        }
      },
      GET: async () =>
        Response.json({
          service: "obseri-scanner",
          status: "ready",
          capabilities: [
            "public-http",
            "evidence-text",
            "meaningful-diff",
            "action-recommendations",
          ],
        }),
    },
  },
});

function apiError(message: string, status: number, code: string, details?: unknown) {
  return Response.json(
    { error: { message, code, ...(details ? { details } : {}) } },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
