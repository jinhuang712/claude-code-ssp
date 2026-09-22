/**
 * The HTTP contract the web panel is built against. Every test runs in a sandboxed HOME /
 * CLAUDE_CONFIG_DIR, through handleRequest (no socket).
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { PREVIOUS_KEY, settingsPath } from "../src/server/install.ts";
import { handleRequest } from "../src/server/serve.ts";
import { enterSandbox, type Sandbox } from "./server-sandbox.ts";

const PORT = 4877;
function call(pathname: string, method = "GET", body?: unknown): Promise<Response> {
  const init: RequestInit = { method, headers: { host: `127.0.0.1:${PORT}`, "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  return handleRequest(new Request(`http://127.0.0.1:${PORT}${pathname}`, init), PORT);
}

const HUD = { type: "command", command: "bash -c 'exec bun ~/.claude/plugins/cache/claude-hud/claude-hud/1.2.0/src/index.ts'" };
let sb: Sandbox;
beforeAll(() => {
  sb = enterSandbox();
});
afterEach(() => fs.rmSync(path.dirname(settingsPath()), { recursive: true, force: true }));
afterAll(() => sb.restore());

describe("install API", () => {
  test("GET /api/install describes current, planned and saved-previous", async () => {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify({ statusLine: HUD }));
    const plan = (await (await call("/api/install")).json()) as Record<string, unknown>;
    expect(plan).toMatchObject({ settingsFile: settingsPath(), current: HUD, previous: HUD, currentIsOurs: false, savedPrevious: null });
    expect((plan.planned as { command: string }).command).toContain("render");
  });

  test("POST /api/install over a foreign statusline is a 409 until confirmed", async () => {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify({ statusLine: HUD }));
    const first = await call("/api/install", "POST", {});
    expect(first.status).toBe(409);
    expect(await first.json()).toEqual({ error: "needs-confirm", current: HUD });
    const confirmed = await call("/api/install", "POST", { confirmReplace: true });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({ settingsFile: settingsPath(), replaced: HUD });
    expect(JSON.parse(fs.readFileSync(settingsPath(), "utf8"))[PREVIOUS_KEY]).toEqual(HUD);
  });

  test("POST /api/install on empty settings needs no confirmation", async () => {
    const r = await call("/api/install", "POST", {});
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ replaced: null });
  });

  test("POST /api/uninstall restores the parked statusline, and is a no-op when the entry isn't ours", async () => {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify({ statusLine: HUD }));
    expect(await (await call("/api/uninstall", "POST", {})).json()).toMatchObject({ removed: false, restored: null });
    await call("/api/install", "POST", { confirmReplace: true });
    expect(await (await call("/api/uninstall", "POST", {})).json()).toMatchObject({ removed: true, restored: HUD });
    expect(JSON.parse(fs.readFileSync(settingsPath(), "utf8"))).toEqual({ statusLine: HUD });
  });
});
