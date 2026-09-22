/**
 * Cost and the provider label agree on Bedrock/Vertex: either the CLAUDE_CODE_USE_* switch or a
 * routed model id marks the session as routed (src/data/stdin.ts routedProvider).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { renderWidget } from "./helpers";

const payload = (modelId: string) => ({ session_id: "routed", model: { id: modelId, display_name: "Opus 5.5" }, cost: { total_cost_usd: 12.34 } });

afterEach(() => {
  delete process.env.CLAUDE_CODE_USE_BEDROCK;
  delete process.env.CLAUDE_CODE_USE_VERTEX;
});

describe("routed providers", () => {
  test("direct API: cost shows, no provider label", async () => {
    expect(await renderWidget(payload("claude-opus-5-5"), { widget: "cost.session" })).toBe("Cost $12.34");
    expect(await renderWidget(payload("claude-opus-5-5"), { widget: "model.badge", options: { showProvider: true, showEffort: false } })).toBe("[Opus 5.5]");
  });

  test("env switch with an alias model id: routed for both widgets", async () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = "1";
    expect(await renderWidget(payload("claude-opus-5-5"), { widget: "model.badge", options: { showProvider: true, showEffort: false } })).toBe("[Bedrock Opus 5.5]");
    expect(await renderWidget(payload("claude-opus-5-5"), { widget: "cost.session" })).toBe("");
    expect(await renderWidget(payload("claude-opus-5-5"), { widget: "cost.session", options: { allowRoutedCost: true } })).toBe("Cost $12.34");
  });

  test("routed model id without the env switch: routed for both widgets", async () => {
    expect(await renderWidget(payload("claude-opus-5-5@20260101"), { widget: "model.badge", options: { showProvider: true, showEffort: false } })).toBe("[Vertex Opus 5.5]");
    expect(await renderWidget(payload("us.anthropic.claude-opus-5-5-v1:0"), { widget: "cost.session" })).toBe("");
  });
});
