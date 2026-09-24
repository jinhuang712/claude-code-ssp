import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { APP_NAME } from "../src/data/app-name.ts";
import { handleRequest, parseColumns } from "../src/server/serve.ts";
import { enterSandbox, writeSample, type Sandbox } from "./server-sandbox.ts";

const PORT = 4877;
const call = (pathname: string, init: RequestInit = {}) =>
  handleRequest(new Request(`http://127.0.0.1:${PORT}${pathname}`, { ...init, headers: { host: `127.0.0.1:${PORT}`, "content-type": "application/json", ...(init.headers ?? {}) } }), PORT);

let sb: Sandbox;
let project: string;
beforeAll(() => {
  sb = enterSandbox();
  project = path.join(sb.root, "some-project");
  fs.mkdirSync(project, { recursive: true });
  writeSample(sb.claudeDir, "sess-1", { workspace: { current_dir: project }, model: { display_name: "Opus 5.5" } });
});
afterAll(() => sb.restore());

describe("parseColumns", () => {
  test("0 is the unbounded probe, missing is 120, the rest is clamped to 20..500", () => {
    expect(parseColumns(0)).toBe(0);
    expect(parseColumns(undefined)).toBe(120);
    expect(parseColumns(5)).toBe(20);
    expect(parseColumns(1e7)).toBe(500);
    expect(parseColumns(88.7)).toBe(88);
  });
  test("nonsense is a 400, not a render", () => {
    expect(() => parseColumns(-1)).toThrow();
    expect(() => parseColumns("wide")).toThrow();
  });
});

describe("?cwd= allowlist", () => {
  test("a captured session's project is accepted", async () => {
    const res = await call(`/api/config?cwd=${encodeURIComponent(project)}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { paths: { project: string } };
    expect(body.paths.project).toBe(path.join(project, ".claude", `${APP_NAME}.json`));
  });
  test("any other directory is refused, so a project-scope save can't write elsewhere", async () => {
    const elsewhere = path.join(sb.root, "not-a-session");
    fs.mkdirSync(elsewhere);
    const read = await call(`/api/config?cwd=${encodeURIComponent(elsewhere)}`);
    expect(read.status).toBe(400);
    const write = await call(`/api/config?cwd=${encodeURIComponent(elsewhere)}`, { method: "PUT", body: JSON.stringify({ scope: "project", config: { separator: " x " } }) });
    expect(write.status).toBe(400);
    expect(fs.existsSync(path.join(elsewhere, ".claude"))).toBe(false);
  });
});

describe("render ignores client-supplied stdin", () => {
  test("a payload in the body can't choose what gets rendered", async () => {
    const res = await call("/api/render", {
      method: "POST",
      body: JSON.stringify({
        payload: { model: { display_name: "INJECTED" }, transcript_path: "/etc/passwd", workspace: { current_dir: "/" } },
        config: { colorLevel: "none", lines: [{ left: [{ widget: "model.badge" }] }] },
        columns: 0,
      }),
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { lines: string[] };
    expect(out.lines.join("\n")).not.toContain("INJECTED");
  });
  test("a huge width is clamped instead of producing a huge response", async () => {
    const res = await call("/api/render", { method: "POST", body: JSON.stringify({ config: { colorLevel: "none", lines: [{ right: [{ widget: "custom.text", options: { text: "x" } }] }] }, columns: 1e7 }) });
    const out = (await res.json()) as { lines: string[] };
    expect(Math.max(...out.lines.map((l) => l.length))).toBeLessThanOrEqual(500);
  });
});
