import { afterEach, describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import {
  formatModelName,
  getBufferedPercent,
  getContextPercent,
  getModelName,
  getProviderLabel,
  getUsageFromStdin,
  parseScopedWindows,
  readStdin,
  stripContextSuffix,
} from "../src/data/stdin.ts";
import type { StdinData } from "../src/data/types.ts";

/*
  Claude Code pipes one JSON object per statusline tick. The reader must cope with the object
  arriving in pieces, with nothing arriving (TTY / no pipe), and with garbage — always quickly and
  without throwing, because a hung or crashed render blanks the statusline.
*/

/** Minimal stand-in for process.stdin: emits whatever the test feeds it. */
class FakeStdin extends EventEmitter {
  isTTY?: boolean;
  paused = false;
  setEncoding(): this {
    return this;
  }
  pause(): this {
    this.paused = true;
    return this;
  }
  feed(...chunks: string[]): void {
    for (const c of chunks) this.emit("data", c);
  }
}

const read = (s: FakeStdin, opts = {}) => readStdin(s as unknown as NodeJS.ReadStream, { firstByteTimeoutMs: 40, idleTimeoutMs: 15, ...opts });

describe("readStdin", () => {
  test("a TTY means no pipe: returns null immediately", async () => {
    const s = new FakeStdin();
    s.isTTY = true;
    expect(await read(s)).toBeNull();
  });

  test("parses a complete object from one chunk and stops listening", async () => {
    const s = new FakeStdin();
    const p = read(s);
    s.feed('{"session_id":"a","model":{"display_name":"Opus 5.5"}}');
    expect(await p).toEqual({ session_id: "a", model: { display_name: "Opus 5.5" } });
    expect(s.paused).toBe(true);
    expect(s.listenerCount("data")).toBe(0);
  });

  test("an object split across chunks is parsed once it is complete", async () => {
    const s = new FakeStdin();
    const p = read(s);
    s.feed('{"session_id":"split","cost":{"total_co', 'st_usd":1.5}}');
    expect(await p).toEqual({ session_id: "split", cost: { total_cost_usd: 1.5 } });
  });

  test("multi-byte text (CJK, emoji) survives", async () => {
    const s = new FakeStdin();
    const p = read(s);
    s.feed('{"session_name":"重构 ✨"}');
    expect(await p).toEqual({ session_name: "重构 ✨" } as never);
  });

  test("nothing arrives: gives up after the first-byte timeout", async () => {
    const s = new FakeStdin();
    const started = performance.now();
    expect(await read(s)).toBeNull();
    expect(performance.now() - started).toBeLessThan(500);
  });

  test("garbage followed by end of stream returns null", async () => {
    const s = new FakeStdin();
    const p = read(s);
    s.feed("{not json");
    s.emit("end");
    expect(await p).toBeNull();
  });

  test("an incomplete object that stops arriving returns null after the idle timeout", async () => {
    const s = new FakeStdin();
    const p = read(s);
    s.feed('{"session_id":"never finished"');
    expect(await p).toBeNull();
  });

  test("oversized input is rejected instead of buffered forever", async () => {
    const s = new FakeStdin();
    const p = read(s, { maxBytes: 64 });
    s.feed(`{"pad":"${"x".repeat(100)}"}`);
    expect(await p).toBeNull();
  });

  test("a stream error returns null", async () => {
    const s = new FakeStdin();
    const p = read(s);
    s.emit("error", new Error("EPIPE"));
    expect(await p).toBeNull();
  });
});

describe("context percentage", () => {
  const base = (cw: StdinData["context_window"]): StdinData => ({ context_window: cw });

  test("prefers Claude Code's own used_percentage (rounded, clamped)", () => {
    expect(getContextPercent(base({ used_percentage: 41.6, context_window_size: 200_000 }))).toBe(42);
    expect(getContextPercent(base({ used_percentage: 130 }))).toBe(100);
  });

  test("used_percentage 0 on a fresh session falls back to the token count", () => {
    const s = base({ used_percentage: 0, context_window_size: 200_000, current_usage: { input_tokens: 10_000, cache_read_input_tokens: 10_000, cache_creation_input_tokens: 0 } });
    expect(getContextPercent(s)).toBe(10);
  });

  test("no window size and no percentage → 0, never NaN", () => {
    expect(getContextPercent(base({}))).toBe(0);
    expect(getContextPercent({})).toBe(0);
    expect(getBufferedPercent({})).toBe(0);
  });

  test("an explicit auto-compact window overrides the native percentage", () => {
    const s = base({ used_percentage: 90, context_window_size: 1_000_000, current_usage: { input_tokens: 80_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } });
    expect(getContextPercent(s, 160_000)).toBe(50);
  });

  test("the buffered estimate adds no buffer at very low usage", () => {
    const s = base({ context_window_size: 200_000, current_usage: { input_tokens: 4_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } });
    expect(getBufferedPercent(s)).toBe(getContextPercent(s));
  });
});

describe("model name", () => {
  test("display_name wins, then id, then 'Unknown'", () => {
    expect(getModelName({ model: { id: "claude-opus-5-5", display_name: " Opus 5.5 " } })).toBe("Opus 5.5");
    expect(getModelName({ model: { id: "claude-opus-5-5" } })).toBe("claude-opus-5-5");
    expect(getModelName({})).toBe("Unknown");
  });

  test("enterprise plan aliases get readable names", () => {
    expect(getModelName({ model: { id: "opusplan" } })).toBe("Claude Opus");
  });

  test("format: full keeps the suffix, compact strips it, short also drops 'Claude '", () => {
    expect(formatModelName("Claude Opus 5.5 (1M context)", "full")).toBe("Claude Opus 5.5 (1M context)");
    expect(formatModelName("Claude Opus 5.5 (1M context)", "compact")).toBe("Claude Opus 5.5");
    expect(formatModelName("Claude Opus 5.5 (1M context)", "short")).toBe("Opus 5.5");
    expect(stripContextSuffix("Sonnet 5 (200k context window)")).toBe("Sonnet 5");
    expect(stripContextSuffix("Sonnet 5 (beta)")).toBe("Sonnet 5 (beta)");
  });
});

describe("provider label", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of ["CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "ANTHROPIC_BASE_URL"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test("none by default; Bedrock / Vertex from Claude Code's env switches", () => {
    delete process.env.CLAUDE_CODE_USE_BEDROCK;
    delete process.env.CLAUDE_CODE_USE_VERTEX;
    delete process.env.ANTHROPIC_BASE_URL;
    expect(getProviderLabel({ model: { id: "claude-sonnet-5" } })).toBeNull();
    process.env.CLAUDE_CODE_USE_BEDROCK = "1";
    expect(getProviderLabel({})).toBe("Bedrock");
    delete process.env.CLAUDE_CODE_USE_BEDROCK;
    process.env.CLAUDE_CODE_USE_VERTEX = "1";
    expect(getProviderLabel({})).toBe("Vertex");
  });
});

describe("rate limits", () => {
  test("absent rate_limits (API key, Bedrock) → null, so usage widgets hide", () => {
    expect(getUsageFromStdin({})).toBeNull();
    expect(getUsageFromStdin({ rate_limits: { five_hour: null, seven_day: null } })).toBeNull();
  });

  test("percentages are clamped and rounded; resets_at is epoch seconds", () => {
    const u = getUsageFromStdin({ rate_limits: { five_hour: { used_percentage: 104.2, resets_at: 1_790_000_000 }, seven_day: { used_percentage: 12.4, resets_at: 0 } } })!;
    expect(u.fiveHour).toBe(100);
    expect(u.sevenDay).toBe(12);
    expect(u.fiveHourResetAt?.getTime()).toBe(1_790_000_000_000);
    expect(u.sevenDayResetAt).toBeNull(); // 0 means "not reported"
  });

  test("a missing window after a reset stays null instead of 0", () => {
    const u = getUsageFromStdin({ rate_limits: { seven_day: { used_percentage: 50 } } })!;
    expect(u.fiveHour).toBeNull();
    expect(u.sevenDay).toBe(50);
  });

  test("model-scoped windows: malformed entries dropped, labels sanitized and bounded", () => {
    const windows = parseScopedWindows([
      { display_name: "Fable weekly", utilization: 33.3, resets_at: "2026-09-30T00:00:00Z" },
      { display_name: "", utilization: 10 },
      { display_name: "bad", utilization: "lots" },
      { display_name: "\x1b[31mred\x1b[0m", utilization: null },
      null,
    ]);
    expect(windows).toHaveLength(2);
    expect(windows[0]).toMatchObject({ label: "Fable weekly", percent: 33 });
    expect(windows[0]!.resetAt?.toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(windows[1]!.label).not.toContain("\x1b");
    expect(windows[1]!.percent).toBeNull();
    expect(parseScopedWindows("nope")).toEqual([]);
  });
});
