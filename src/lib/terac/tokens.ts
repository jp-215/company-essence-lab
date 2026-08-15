/**
 * Terac — invite and session tokens.
 *
 * Web Crypto rather than node:crypto: the nitro build in this project targets
 * Cloudflare by default (see vite.config.ts), where node:crypto is not a safe
 * assumption.
 */

/** 32 random bytes, hex-encoded — 64 chars. Matches the spec's "random 32-byte values". */
export function mintToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** terac_resolve_token rejects anything shorter than 20 chars; mirror that client-side. */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{20,128}$/i.test(value);
}

export function judgeUrl(origin: string, inviteToken: string): string {
  return `${origin.replace(/\/$/, "")}/terac/r/${inviteToken}`;
}

export function sessionClaimUrl(origin: string, publicToken: string): string {
  return `${origin.replace(/\/$/, "")}/terac/r/${publicToken}`;
}
