import { createFileRoute } from "@tanstack/react-router";

/**
 * Public image proxy for ImageBase stills.
 *
 * Instagram and Reddit CDNs block hot-linking by referer, so we stream the
 * bytes through the app instead. Only their CDN hosts are accepted.
 */
const ALLOWED = [
  "cdninstagram.com",
  "fbcdn.net",
  "instagram.com",
  "redd.it",
  "redditmedia.com",
  "redditstatic.com",
];

export const Route = createFileRoute("/api/public/image-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = new URL(request.url).searchParams.get("url");
        if (!target) return new Response("Missing url", { status: 400 });

        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          return new Response("Invalid url", { status: 400 });
        }
        if (parsed.protocol !== "https:") return new Response("Invalid url", { status: 400 });

        const host = parsed.hostname.replace(/^www\./, "");
        if (!ALLOWED.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
          return new Response("Unsupported host", { status: 400 });
        }

        try {
          const image = await fetch(parsed.toString(), {
            headers: {
              Referer: "https://www.instagram.com/",
              "User-Agent": "Mozilla/5.0 (compatible; ViraBot/1.0)",
            },
          });
          if (!image.ok || !image.body) {
            return new Response("Preview unavailable", { status: 404 });
          }
          return new Response(image.body, {
            headers: {
              "Content-Type": image.headers.get("content-type") ?? "image/jpeg",
              "Cache-Control": "public, max-age=86400, s-maxage=604800",
            },
          });
        } catch {
          return new Response("Preview unavailable", { status: 502 });
        }
      },
    },
  },
});
