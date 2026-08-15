/**
 * Guard for maintenance endpoints that spend service-role writes and embedding
 * credits (backfills, dedupe). When ADMIN_EMAILS is set (comma-separated), only
 * those users may run them; unset keeps the current any-authenticated behavior.
 */
export function assertMaintenanceAllowed(claims: Record<string, unknown> | null | undefined): void {
  const allowlist = (process.env["ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!allowlist.length) return;

  const email = typeof claims?.["email"] === "string" ? claims["email"].toLowerCase() : "";
  if (!email || !allowlist.includes(email)) {
    throw new Error("Maintenance actions are restricted on this project.");
  }
}
