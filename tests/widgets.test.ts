import { describe, expect, test } from "bun:test";
import { renderWidget } from "./helpers.ts";

/** A 1M-context session whose display name already spells out the window, as Claude Code sends it. */
const oneMillion = {
  session_id: "t-1m",
  model: { id: "claude-opus-5-5[1m]", display_name: "Opus 5.5 (1M context)" },
  context_window: { context_window_size: 1_000_000, used_percentage: 12 },
};

describe("model.badge showWindow", () => {
  const badge = (options: Record<string, unknown>) => ({ widget: "model.badge", options: { showEffort: false, ...options } });

  test("full format keeps Claude Code's own suffix and does not repeat it", async () => {
    // Regression: printed "[Opus 5.5 (1M context) (1M)]".
    expect(await renderWidget(oneMillion, badge({ showWindow: true }))).toBe("[Opus 5.5 (1M context)]");
  });

  test("compact format strips the suffix, so the short window label is appended", async () => {
    expect(await renderWidget(oneMillion, badge({ showWindow: true, format: "compact" }))).toBe("[Opus 5.5 (1M)]");
  });

  test("names without a suffix still get the window when asked", async () => {
    const payload = { ...oneMillion, model: { id: "claude-sonnet-5", display_name: "Sonnet 5" }, context_window: { context_window_size: 200_000 } };
    expect(await renderWidget(payload, badge({ showWindow: true }))).toBe("[Sonnet 5 (200k)]");
    expect(await renderWidget(payload, badge({ showWindow: false }))).toBe("[Sonnet 5]");
  });
});
