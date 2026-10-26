/**
 * A readable message from anything thrown. The Cloudinary SDK rejects with plain
 * objects ({ error: { message, http_code } }) rather than Error instances.
 */
export function errorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof Error && err.message) return err.message;
  const e = err as { message?: unknown; error?: { message?: unknown } } | null;
  const msg = e?.error?.message ?? e?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}
