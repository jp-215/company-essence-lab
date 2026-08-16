import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * OCR worker endpoint for the ImageBase.
 *
 * POST /api/public/ocr-batch  { "limit": 50 }
 * Header: x-cron-secret: <OCR_WORKER_SECRET>
 *
 * Scans the next batch of unscanned images with Google Cloud Vision (or the
 * Gemini fallback) and stores the extracted text. Safe to call repeatedly from
 * a scheduler until coverage reaches 100%.
 */
const bodySchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  concurrency: z.number().int().min(1).max(8).optional(),
});

function unauthorized() {
  return new Response("Unauthorized", { status: 401 });
}

export const Route = createFileRoute("/api/public/ocr-batch")({
  server: {
    handlers: {
      GET: async () => {
        const { createPublicClient } = await import("@/lib/supabase-public.server");
        const { getOcrCoverage } = await import("@/lib/ocr.server");
        return Response.json(await getOcrCoverage(createPublicClient()), {
          headers: { "Cache-Control": "no-store" },
        });
      },
      POST: async ({ request }) => {
        const expected = process.env["OCR_WORKER_SECRET"];
        if (!expected) return new Response("Worker secret not configured", { status: 503 });

        const provided = request.headers.get("x-cron-secret") ?? "";
        if (provided.length !== expected.length || provided !== expected) return unauthorized();

        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json().catch(() => ({})));
        } catch {
          return new Response("Invalid body", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runOcrBatch } = await import("@/lib/ocr.server");

        try {
          const result = await runOcrBatch(
            supabaseAdmin,
            parsed.limit ?? 50,
            parsed.concurrency ?? 4,
          );
          return Response.json(result, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          console.error("OCR batch failed", error);
          return Response.json({ error: "OCR batch failed" }, { status: 500 });
        }
      },
    },
  },
});
