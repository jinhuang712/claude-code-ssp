/**
 * Live samples feed the panel's session picker. Only real Claude Code payloads (they always carry a
 * session_id) may be saved — anything else used to show up as an "unknown" session.
 * The suite runs against temp dirs (tests/setup.ts), so samplesDir() is sandboxed.
 */
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { captureSample, samplesDir } from "../src/core/capture";

const files = () => (fs.existsSync(samplesDir()) ? fs.readdirSync(samplesDir()).filter((f) => f.endsWith(".json")) : []);

describe("captureSample", () => {
  test("saves a payload that has a session_id, keyed by it", () => {
    captureSample({ session_id: "capture-test-1", model: { id: "m" } }, Date.now());
    expect(files()).toContain("capture-test-1.json");
    const saved = JSON.parse(fs.readFileSync(path.join(samplesDir(), "capture-test-1.json"), "utf8"));
    expect(saved.payload.session_id).toBe("capture-test-1");
  });

  test("ignores input without a usable session_id", () => {
    const before = files().length;
    captureSample({}, Date.now());
    captureSample({ session_id: "" }, Date.now());
    captureSample({ session_id: 42 }, Date.now());
    captureSample(null, Date.now());
    expect(files().length).toBe(before);
    expect(files()).not.toContain("unknown.json");
  });
});
