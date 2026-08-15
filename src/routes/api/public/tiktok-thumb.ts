import { createFileRoute } from "@tanstack/react-router";

/**
 * Public image proxy for TikTok post covers.
 *
 * TikTok cover URLs are signed and expire within hours, so we resolve a fresh
 * one through the public oEmbed endpoint on every (cached) request and stream
 * the bytes back. Only tiktok.com post URLs are accepted.
 */
export const Route = createFileRoute("/api/public/tiktok-thumb")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const target = url.searchParams.get("url");
        if (!target) return new Response("Missing url", { status: 400 });

        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          return new Response("Invalid url", { status: 400 });
        }
        const host = parsed.hostname.replace(/^www\./, "");
        if (host !== "tiktok.com" && !host.endsWith(".tiktok.com")) {
          return new Response("Unsupported host", { status: 400 });
        }

        try {
          const oembed = await fetch(
            `https://www.tiktok.com/oembed?url=${encodeURIComponent(parsed.toString())}`,
            { headers: { "User-Agent": "Mozilla/5.0 (compatible; ViraBot/1.0)" } },
          );
          if (!oembed.ok) {
            return new Response("Preview unavailable", { status: 404 });
          }
          const data = (await oembed.json()) as { thumbnail_url?: string };
          if (!data.thumbnail_url) {
            return new Response("Preview unavailable", { status: 404 });
          }
          const image = await fetch(data.thumbnail_url, {
            headers: { Referer: "https://www.tiktok.com/" },
          });
          if (!image.ok || !image.body) {
            return new Response("Preview unavailable", { status: 404 });
          }
          return new Response(image.body, {
            headers: {
              "Content-Type": image.headers.get("content-type") ?? "image/jpeg",
              "Cache-Control": "public, max-age=3600, s-maxage=21600",
            },
          });
        } catch {
          return new Response("Preview unavailable", { status: 502 });
        }
      },
    },
  },
});
