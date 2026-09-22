/**
 * Labels never run into their value: symbol labels hug it ("⟳2"), words get a space ("Compacted 2").
 * Regression cover for "Compacted2" (context.compactions) and "H/Users/me" (custom.env).
 */
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { labelPrefix } from "../src/widgets/_shared";
import { renderWidget } from "./helpers";

describe("labelPrefix", () => {
  test("symbols and NAME= hug the value; words get a space", () => {
    expect(labelPrefix("⟳")).toBe("⟳");
    expect(labelPrefix("⏱")).toBe("⏱");
    expect(labelPrefix("AWS_PROFILE=")).toBe("AWS_PROFILE=");
    expect(labelPrefix("Compacted")).toBe("Compacted ");
    expect(labelPrefix("A")).toBe("A "); // a single letter is a word, not a glyph
    expect(labelPrefix("cost:")).toBe("cost: ");
    expect(labelPrefix(null)).toBe("");
    expect(labelPrefix("")).toBe("");
  });
});

describe("context.compactions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ssp-labels-"));
  const transcript = path.join(dir, "t.jsonl");
  const boundary = (s: number) => JSON.stringify({ type: "system", subtype: "compact_boundary", timestamp: new Date(Date.parse("2026-09-23T10:00:00Z") + s * 1000).toISOString(), compactMetadata: { trigger: "manual", preTokens: 150000 } });
  fs.writeFileSync(transcript, `${boundary(1)}\n${boundary(2)}\n`);
  const payload = { session_id: "labels", transcript_path: transcript, model: { id: "claude-opus-5-5", display_name: "Opus 5.5" } };

  test("default glyph label stays attached", async () => {
    expect(await renderWidget(payload, { widget: "context.compactions" })).toBe("⟳2");
  });
  test("a word label is separated from the count", async () => {
    expect(await renderWidget(payload, { widget: "context.compactions", options: { label: "Compacted" } })).toBe("Compacted 2");
  });
});

describe("custom.env", () => {
  process.env.SSP_LABEL_TEST = "prod";
  const payload = { session_id: "labels" };
  test("NAME= prefix by default, value only when turned off", async () => {
    expect(await renderWidget(payload, { widget: "custom.env", options: { name: "SSP_LABEL_TEST" } })).toBe("SSP_LABEL_TEST=prod");
    expect(await renderWidget(payload, { widget: "custom.env", options: { name: "SSP_LABEL_TEST", showName: false } })).toBe("prod");
  });
  test("a custom label (panel Label row) is separated from the value", async () => {
    expect(await renderWidget(payload, { widget: "custom.env", options: { name: "SSP_LABEL_TEST", showName: false }, label: "Env" })).toBe("Env prod");
  });
  test("older configs that kept the label in options still work, with a space", async () => {
    expect(await renderWidget(payload, { widget: "custom.env", options: { name: "SSP_LABEL_TEST", label: "H" } })).toBe("H prod");
  });
  test("no variable name → nothing", async () => {
    expect(await renderWidget(payload, { widget: "custom.env" })).toBe("");
  });
});
