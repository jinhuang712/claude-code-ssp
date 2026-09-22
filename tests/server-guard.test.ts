import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MAX_BODY_BYTES, readJson } from "../src/server/guard.ts";
import { handleRequest } from "../src/server/serve.ts";
import { enterSandbox, type Sandbox } from "./server-sandbox.ts";

const PORT = 4877;
const SELF = `http://127.0.0.1:${PORT}`;

/** A request as our own page would send it; override headers to play the attacker. */
function req(pathname: string, init: RequestInit & { headers?: Record<string, string> } = {}): Request {
  return new Request(`${SELF}${pathname}`, { ...init, headers: { host: `127.0.0.1:${PORT}`, ...init.headers } });
}

let sb: Sandbox;
beforeAll(() => {
  sb = enterSandbox();
});
afterAll(() => sb.restore());

describe("request guard", () => {
  test("our own page gets through, without any CORS header", async () => {
    const res = await handleRequest(req("/api/health", { headers: { "sec-fetch-site": "same-origin" } }), PORT);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("localhost is ours too", async () => {
    const res = await handleRequest(req("/api/health", { headers: { host: `localhost:${PORT}`, origin: `http://localhost:${PORT}` } }), PORT);
    expect(res.status).toBe(200);
  });

  test("a rebinding hostname is refused (Host check), on API and static routes alike", async () => {
    for (const p of ["/api/health", "/", "/assets/app.js"]) {
      const res = await handleRequest(req(p, { headers: { host: `evil.example:${PORT}` } }), PORT);
      expect(res.status).toBe(403);
    }
  });

  test("the right host on the wrong port is refused", async () => {
    const res = await handleRequest(req("/api/health", { headers: { host: "127.0.0.1:9999" } }), PORT);
    expect(res.status).toBe(403);
  });

  test("a foreign Origin is refused, including the `null` origin of sandboxed frames", async () => {
    for (const origin of ["https://evil.example", "http://127.0.0.1:5173", "null"]) {
      const res = await handleRequest(req("/api/samples", { headers: { origin } }), PORT);
      expect(res.status).toBe(403);
    }
  });

  test("cross-site reads without an Origin are caught by Sec-Fetch-Site", async () => {
    const res = await handleRequest(req("/api/doctor", { headers: { "sec-fetch-site": "cross-site" } }), PORT);
    expect(res.status).toBe(403);
  });

  test("a cross-site link to the page itself still opens (static routes skip Sec-Fetch-Site)", async () => {
    const res = await handleRequest(req("/", { headers: { "sec-fetch-site": "cross-site" } }), PORT);
    expect(res.status).not.toBe(403);
  });

  test("the classic drive-by install (text/plain POST, no preflight) is refused before it touches settings", async () => {
    const res = await handleRequest(
      req("/api/install", { method: "POST", body: "{}", headers: { "content-type": "text/plain;charset=UTF-8", origin: "https://evil.example" } }),
      PORT,
    );
    expect(res.status).toBe(403);
    const sameOriginButPlain = await handleRequest(req("/api/install", { method: "POST", body: "{}", headers: { "content-type": "text/plain" } }), PORT);
    expect(sameOriginButPlain.status).toBe(415);
  });

  test("OPTIONS is never answered", async () => {
    const res = await handleRequest(req("/api/config", { method: "OPTIONS" }), PORT);
    expect(res.status).toBe(405);
  });

  test("an oversized body is refused from Content-Length alone", async () => {
    const res = await handleRequest(
      req("/api/render", { method: "POST", body: "{}", headers: { "content-type": "application/json", "content-length": String(MAX_BODY_BYTES + 1) } }),
      PORT,
    );
    expect(res.status).toBe(413);
  });
});

describe("readJson", () => {
  test("caps the bytes actually read, whatever Content-Length says", async () => {
    const big = new Request(SELF, { method: "POST", body: JSON.stringify({ x: "a".repeat(MAX_BODY_BYTES) }) });
    await expect(readJson(big)).rejects.toMatchObject({ status: 413 });
  });
  test("an empty body is {} and junk is a 400", async () => {
    expect(await readJson<Record<string, unknown>>(new Request(SELF, { method: "POST" }))).toEqual({});
    await expect(readJson(new Request(SELF, { method: "POST", body: "{nope" }))).rejects.toMatchObject({ status: 400 });
  });
});
