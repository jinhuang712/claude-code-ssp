/**
 * Request gate for the local configurator.
 *
 * Binding to 127.0.0.1 is not enough on its own: any web page the user visits can still make the
 * browser send requests to http://127.0.0.1:<port>. Without a gate, a page could
 *   - fire a "simple" cross-origin POST (e.g. `text/plain`, no preflight) that rewrites
 *     ~/.claude/settings.json through /api/install, and
 *   - read session names, paths and transcript locations if we answered with a permissive CORS header.
 * DNS rebinding is the other route in: an attacker's hostname resolving to 127.0.0.1 makes the page
 * "same-origin" with us, which only a Host check stops. (Bun ≥ 1.4 happens to drop non-loopback Host
 * headers itself, but `engines` allows older Bun, so we don't rely on that.)
 *
 * The rules, applied before any routing:
 *   1. Host must be 127.0.0.1:<port> or localhost:<port>                     → otherwise 403
 *   2. an Origin header, when present, must be http://127.0.0.1|localhost:<port> → otherwise 403
 *   3. /api/*: a Sec-Fetch-Site other than same-origin/none is cross-site     → 403
 *   4. OPTIONS is never answered: the UI is same-origin and never preflights  → 405
 *   5. PUT/POST need `content-type: application/json` (forces a preflight for cross-origin callers,
 *      which rule 4 then refuses)                                              → otherwise 415
 *   6. request bodies are capped at MAX_BODY_BYTES                            → otherwise 413
 */

/** Largest request body we accept. A full config with every widget is ~10 KB; 1 MB is generous. */
export const MAX_BODY_BYTES = 1024 * 1024;

/** Hosts the configurator answers to. Anything else is DNS rebinding or a misrouted request. */
export function allowedHosts(port: number): Set<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}

/** Origins our own page can have. The vite dev proxy rewrites its Origin to one of these. */
export function allowedOrigins(port: number): Set<string> {
  return new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
}

function reject(status: number, error: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json", ...headers } });
}

/**
 * Returns a rejection Response when the request must not reach a handler, or null to let it through.
 * Only looks at headers, so it is cheap and safe to run on every request, static files included.
 */
export function guardRequest(req: Request, port: number): Response | null {
  const host = req.headers.get("host")?.toLowerCase() ?? "";
  if (!allowedHosts(port).has(host)) return reject(403, `forbidden host: ${host || "(none)"}`);

  const origin = req.headers.get("origin");
  // `null` is what sandboxed iframes and file:// pages send; it is never our own page.
  if (origin !== null && !allowedOrigins(port).has(origin)) return reject(403, `forbidden origin: ${origin}`);

  const pathname = new URL(req.url).pathname;
  const isApi = pathname.startsWith("/api/");
  // Browsers send Sec-Fetch-Site on every request; "none" is a typed URL / bookmark, "same-origin" is
  // our own page. Plain GETs from another site omit Origin, so this is what catches cross-site reads.
  // Static routes skip it so a link to the configurator from a README still opens.
  const site = req.headers.get("sec-fetch-site");
  if (isApi && site !== null && site !== "same-origin" && site !== "none") return reject(403, `cross-site request refused (${site})`);

  if (req.method === "OPTIONS") return reject(405, "OPTIONS not supported", { allow: "GET, PUT, POST" });

  if (req.method === "PUT" || req.method === "POST") {
    const type = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (type !== "application/json") return reject(415, "request body must be application/json");
    const length = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) return reject(413, `request body over ${MAX_BODY_BYTES} bytes`);
  }
  return null;
}

/** Thrown by readJson so the router can turn it into a 4xx instead of a 500. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Parse a JSON request body with the size cap enforced on the bytes actually read — Content-Length can
 * be absent (chunked) or lie, so the header check in guardRequest is only the fast path.
 * An empty body parses as `{}` so `POST` endpoints without parameters stay easy to call.
 */
export async function readJson<T>(req: Request): Promise<T> {
  const buf = await req.arrayBuffer();
  if (buf.byteLength > MAX_BODY_BYTES) throw new HttpError(413, `request body over ${MAX_BODY_BYTES} bytes`);
  if (buf.byteLength === 0) return {} as T;
  try {
    return JSON.parse(new TextDecoder().decode(buf)) as T;
  } catch {
    throw new HttpError(400, "request body is not valid JSON");
  }
}
