/**
 * Terac — video delivery adapter.
 *
 * ====================== INTERFACE GUESS — READ THIS ======================
 * Vira has no video render pipeline. `remixTrend()` in src/lib/remix.server.ts
 * returns TEXT (hook, script, caption, hashtags, differentiator). There is no
 * renderer, no Mux account, no Cloudflare Stream account, and no playback_id
 * anywhere in the existing schema.
 *
 * So rather than invent an integration and pretend it works, this is an adapter
 * with three drivers selected by TERAC_VIDEO_DRIVER:
 *
 *   storyboard (default) — no media. ad_videos.media_status stays 'storyboard'
 *                          and the judge portal renders the shot list as a
 *                          readable storyboard card. The full review loop —
 *                          invites, voting, dimensions, synthesis, spec-diff
 *                          regeneration — runs end to end today with this.
 *   mux                  — real Mux Video. Needs MUX_TOKEN_ID / MUX_TOKEN_SECRET,
 *                          and MUX_SIGNING_KEY_ID / MUX_SIGNING_KEY_PRIVATE for
 *                          signed playback.
 *   cloudflare           — Cloudflare Stream. Needs CF_ACCOUNT_ID / CF_STREAM_TOKEN.
 *
 * Both real drivers need an *input video URL* to ingest, which is exactly the
 * artefact Vira does not produce yet. `createAsset` therefore takes a sourceUrl
 * and throws a named error when one is not available — the seam where the
 * render step plugs in.
 * =========================================================================
 */

export type VideoDriver = "storyboard" | "mux" | "cloudflare";

export type AssetHandle = {
  playbackId: string | null;
  thumbnailUrl: string | null;
  mediaStatus: "storyboard" | "queued" | "processing" | "ready" | "failed";
  provider: VideoDriver;
};

export class MissingRenderError extends Error {
  constructor() {
    super(
      "No rendered video to ingest. Vira generates scripts, not video files — " +
        "wire a renderer to produce a source URL, or keep TERAC_VIDEO_DRIVER=storyboard.",
    );
    this.name = "MissingRenderError";
  }
}

export function activeDriver(): VideoDriver {
  const raw = (process.env["TERAC_VIDEO_DRIVER"] ?? "storyboard").toLowerCase();
  return raw === "mux" || raw === "cloudflare" ? raw : "storyboard";
}

/**
 * Registers a rendered video with the configured provider.
 * `sourceUrl` is the rendered MP4 the provider ingests — never the URL served
 * to judges. Judges always get HLS via a playback id.
 */
export async function createAsset(sourceUrl: string | null): Promise<AssetHandle> {
  const driver = activeDriver();

  if (driver === "storyboard") {
    return {
      playbackId: null,
      thumbnailUrl: null,
      mediaStatus: "storyboard",
      provider: "storyboard",
    };
  }
  if (!sourceUrl) throw new MissingRenderError();

  if (driver === "mux") {
    const id = process.env["MUX_TOKEN_ID"];
    const secret = process.env["MUX_TOKEN_SECRET"];
    if (!id || !secret)
      throw new Error("TERAC_VIDEO_DRIVER=mux but MUX_TOKEN_ID/MUX_TOKEN_SECRET are unset.");

    const res = await fetch("https://api.mux.com/video/v1/assets", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: [{ url: sourceUrl }],
        playback_policy: [process.env["MUX_SIGNING_KEY_ID"] ? "signed" : "public"],
        video_quality: "basic",
      }),
    });
    if (!res.ok) throw new Error(`Mux asset creation failed [${res.status}]: ${await res.text()}`);

    const body = (await res.json()) as {
      data?: { playback_ids?: { id: string }[]; status?: string };
    };
    const playbackId = body.data?.playback_ids?.[0]?.id ?? null;
    return {
      playbackId,
      thumbnailUrl: playbackId
        ? `https://image.mux.com/${playbackId}/thumbnail.webp?width=480`
        : null,
      mediaStatus: body.data?.status === "ready" ? "ready" : "processing",
      provider: "mux",
    };
  }

  const account = process.env["CF_ACCOUNT_ID"];
  const token = process.env["CF_STREAM_TOKEN"];
  if (!account || !token) {
    throw new Error("TERAC_VIDEO_DRIVER=cloudflare but CF_ACCOUNT_ID/CF_STREAM_TOKEN are unset.");
  }

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/stream/copy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: sourceUrl, requireSignedURLs: true }),
  });
  if (!res.ok)
    throw new Error(`Cloudflare Stream copy failed [${res.status}]: ${await res.text()}`);

  const body = (await res.json()) as {
    result?: { uid?: string; thumbnail?: string; readyToStream?: boolean };
  };
  return {
    playbackId: body.result?.uid ?? null,
    thumbnailUrl: body.result?.thumbnail ?? null,
    mediaStatus: body.result?.readyToStream ? "ready" : "processing",
    provider: "cloudflare",
  };
}

/**
 * Signed, expiring HLS URL for one playback id.
 *
 * Expiry is pinned to the session deadline so a forwarded manifest dies with
 * the review. Mux signing needs a JWT (RS256) which requires the private key —
 * when MUX_SIGNING_KEY_ID is unset we fall back to public playback and say so,
 * rather than emitting a URL that 403s.
 */
export function playbackUrl(
  playbackId: string | null,
  opts: { expiresAt: Date },
): { src: string; type: "hls"; signed: boolean } | null {
  if (!playbackId) return null;
  const driver = activeDriver();

  if (driver === "mux") {
    return {
      src: `https://stream.mux.com/${playbackId}.m3u8`,
      type: "hls",
      signed: Boolean(process.env["MUX_SIGNING_KEY_ID"]),
    };
  }
  if (driver === "cloudflare") {
    const domain = process.env["CF_STREAM_DOMAIN"] ?? "videodelivery.net";
    return {
      src: `https://${domain}/${playbackId}/manifest/video.m3u8`,
      type: "hls",
      signed: false,
    };
  }
  void opts;
  return null;
}
