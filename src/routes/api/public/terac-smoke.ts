import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/terac-smoke")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { getReviewResults } = await import("@/lib/terac.server");
        const { synthesizeSession } = await import("@/lib/terac-synthesis.server");
        const userId = "55968844-ae05-429f-808f-7fd57d023853";
        const { data } = await supabaseAdmin
          .from("review_sessions")
          .select("id")
          .eq("public_token", "rs_smoke_test_2")
          .single();
        const sessionId = data!.id;
        const { applyRevision } = await import("@/lib/terac.server");
        const results0 = await getReviewResults(supabaseAdmin, userId, sessionId);
        const target = results0.synthesis!.revisionDirectives[0]!.videoId;
        const synthesis = await applyRevision(supabaseAdmin, userId, sessionId, target);
        const results = await getReviewResults(supabaseAdmin, userId, sessionId);
        return Response.json({
          synthesis,
          topVideo: results.videos[0],
          themes: results.themes,
          judges: results.judges.map((j) => j.status),
        });
      },
    },
  },
});
