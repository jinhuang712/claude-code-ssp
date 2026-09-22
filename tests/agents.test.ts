/**
 * activity.agents: running agents render with a readable model name (forks report the full id
 * "claude-opus-5-5[1m]", which used to be printed verbatim).
 */
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { shortModelName } from "../src/widgets/_shared";
import { renderWidget } from "./helpers";

describe("shortModelName", () => {
  test("full ids shorten, aliases pass through", () => {
    expect(shortModelName("claude-opus-5-5[1m]")).toBe("opus 5.5");
    expect(shortModelName("claude-sonnet-5")).toBe("sonnet 5");
    expect(shortModelName("claude-haiku-4-5-20251001")).toBe("haiku 4.5");
    expect(shortModelName("claude-3-5-sonnet-20241022")).toBe("sonnet 3.5");
    expect(shortModelName("opus")).toBe("opus");
    expect(shortModelName("some-custom-model")).toBe("some-custom-model");
  });
});

describe("activity.agents", () => {
  test("a running background fork shows with its short model name", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ssp-agents-"));
    const t = path.join(dir, "t.jsonl");
    const now = Date.now();
    const entry = { type: "assistant", timestamp: new Date(now - 5000).toISOString(), message: { id: "m1", role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "Agent", input: { subagent_type: "fork", model: "claude-opus-5-5[1m]", description: "Render work", run_in_background: true } }] } };
    const launched = { type: "user", timestamp: new Date(now - 4000).toISOString(), message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "Async agent launched successfully." }] } };
    fs.writeFileSync(t, `${JSON.stringify(entry)}\n${JSON.stringify(launched)}\n`);
    expect(await renderWidget({ session_id: "agents", transcript_path: t }, { widget: "activity.agents" })).toBe("Agents ● fork (opus 5.5)");
  });
});
