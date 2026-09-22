import { beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getHudPluginDir } from "../src/data/claude-config-dir.ts";
import { _setCreateReadStreamForTests, parseTranscript } from "../src/data/transcript.ts";

/*
  Incremental transcript parsing must be invisible: however the file was appended to — in whole
  lines, or with a render landing in the middle of a line Claude Code is still writing — the result
  has to equal a fresh full parse of the final file.
*/

const dir = path.join(process.env.SSP_TEST_ROOT!, "transcripts");
const cacheDir = () => path.join(getHudPluginDir(os.homedir()), "transcript-cache");

let clock = Date.parse("2026-09-01T10:00:00Z");
const ts = () => new Date((clock += 1000)).toISOString();

/** A transcript that exercises every stateful branch of the parser. */
function syntheticLines(): string[] {
  const L: object[] = [];
  L.push({ type: "custom-title", customTitle: "incremental test" });
  for (let i = 0; i < 40; i++) {
    const msgId = `msg_${i}`;
    L.push({ type: "user", timestamp: ts(), message: { role: "user", content: `question ${i}` } });
    const usage = { input_tokens: 10 + i, output_tokens: 5 + i, cache_read_input_tokens: 1000 * i, cache_creation_input_tokens: i % 3 ? 0 : 50 };
    const assistant = {
      type: "assistant",
      timestamp: ts(),
      requestId: `req_${i}`,
      message: {
        id: msgId,
        model: i % 2 ? "claude-opus-5-5" : "claude-sonnet-5",
        usage,
        content: [
          { type: "tool_use", id: `tool_${i}`, name: i % 5 === 0 ? "mcp__serena__find_symbol" : "Read", input: { file_path: `/tmp/f${i}.ts` } },
          ...(i % 7 === 0 ? [{ type: "tool_use", id: `agent_${i}`, name: "Task", input: { subagent_type: "Explore", description: `look ${i}`, run_in_background: i % 14 === 0 } }] : []),
          ...(i % 9 === 0 ? [{ type: "tool_use", id: `todo_${i}`, name: "TodoWrite", input: { todos: [{ content: `step ${i}`, status: "in_progress" }, { content: "later", status: "pending" }] } }] : []),
        ],
      },
    };
    L.push(assistant);
    // Claude Code dual-logs some responses; the duplicate must not be counted twice.
    if (i % 4 === 0) L.push({ ...assistant, timestamp: ts() });
    L.push({ type: "user", timestamp: ts(), message: { role: "user", content: [{ type: "tool_result", tool_use_id: `tool_${i}`, is_error: i % 10 === 5 }] } });
    if (i % 7 === 0) L.push({ type: "user", timestamp: ts(), toolUseResult: { resolvedModel: "claude-haiku-4-5" }, message: { role: "user", content: [{ type: "tool_result", tool_use_id: `agent_${i}` }] } });
    if (i % 14 === 0) L.push({ type: "queue-operation", operation: "enqueue", timestamp: ts(), content: `<task-id>t${i}</task-id><tool-use-id>agent_${i}</tool-use-id>` });
    if (i === 20) L.push({ type: "system", subtype: "compact_boundary", timestamp: ts(), compactMetadata: { postTokens: 12345 } });
    if (i === 25) L.push({ type: "assistant", timestamp: ts(), message: { id: "msg_task", usage, content: [{ type: "tool_use", id: "tc1", name: "TaskCreate", input: { subject: "ship it", taskId: "7" } }] } });
    if (i === 30) L.push({ type: "assistant", timestamp: ts(), message: { id: "msg_task2", usage, content: [{ type: "tool_use", id: "tu1", name: "TaskUpdate", input: { taskId: "7", status: "completed" } }] } });
    if (i === 33) L.push({ type: "attachment", timestamp: ts(), attachment: { type: "ultra_effort_enter" } });
  }
  return L.map((o) => JSON.stringify(o) + "\n");
}

async function fullParse(file: string) {
  fs.rmSync(cacheDir(), { recursive: true, force: true });
  return parseTranscript(file);
}

beforeEach(() => {
  fs.rmSync(cacheDir(), { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
});

describe("incremental transcript parsing", () => {
  test("parsing in appended chunks (including mid-line cuts) equals one full parse", async () => {
    const text = syntheticLines().join("");
    const file = path.join(dir, "chunks.jsonl");
    fs.writeFileSync(file, "");
    // Deterministic cut points, several of them in the middle of a JSON record.
    const cuts = [0, 137, 2048, 2049, 5000, 9001, 12_345, Math.floor(text.length * 0.7), text.length - 3, text.length];
    for (let k = 1; k < cuts.length; k++) {
      fs.appendFileSync(file, text.slice(cuts[k - 1], cuts[k]));
      await parseTranscript(file); // each render resumes from the previous snapshot
    }
    const incremental = await parseTranscript(file);
    const full = await fullParse(file);
    expect(incremental).toEqual(full);
    // Sanity: the fixture really exercised the interesting state.
    expect(full.sessionTokens?.apiCalls).toBeGreaterThan(40);
    expect(full.todos.length).toBeGreaterThan(0);
    expect(full.agents.length).toBeGreaterThan(0);
    expect(full.compactionCount).toBe(1);
    expect(full.sessionName).toBe("incremental test");
  });

  test("a half-written last line is not lost once it is finished", async () => {
    const lines = syntheticLines();
    const file = path.join(dir, "tail.jsonl");
    const head = lines.slice(0, 10).join("");
    const last = lines[10]!;
    fs.writeFileSync(file, head + last.slice(0, 20)); // render lands mid-record
    await parseTranscript(file);
    fs.appendFileSync(file, last.slice(20));
    const incremental = await parseTranscript(file);
    expect(incremental).toEqual(await fullParse(file));
  });

  test("a rewritten (shorter or different) file falls back to a full parse", async () => {
    const lines = syntheticLines();
    const file = path.join(dir, "rotate.jsonl");
    fs.writeFileSync(file, lines.join(""));
    await parseTranscript(file);
    // Same path, new content that is shorter than the saved offset.
    fs.writeFileSync(file, lines.slice(0, 5).join(""));
    const after = await parseTranscript(file);
    expect(after).toEqual(await fullParse(file));
  });

  test("replaced file of equal-or-greater length (new inode) is not resumed into", async () => {
    const lines = syntheticLines();
    const file = path.join(dir, "replace.jsonl");
    fs.writeFileSync(file, lines.slice(0, 30).join(""));
    await parseTranscript(file);
    const tmp = `${file}.new`;
    fs.writeFileSync(tmp, lines.slice(40).join("") + lines.slice(0, 30).join(""));
    fs.renameSync(tmp, file); // atomic replace → different inode
    const after = await parseTranscript(file);
    expect(after).toEqual(await fullParse(file));
  });

  test("an append only reads the new bytes, and a cut stops before the unfinished line", async () => {
    const starts: Array<number | undefined> = [];
    _setCreateReadStreamForTests(((p: fs.PathLike, opts?: { start?: number }) => {
      starts.push(opts?.start);
      return fs.createReadStream(p, opts as never);
    }) as typeof fs.createReadStream);
    try {
      const lines = syntheticLines();
      const file = path.join(dir, "spy.jsonl");
      const first = lines.slice(0, 20).join("");
      fs.writeFileSync(file, first);
      await parseTranscript(file);
      fs.appendFileSync(file, lines[20]!.slice(0, 15)); // half a record
      await parseTranscript(file);
      fs.appendFileSync(file, lines[20]!.slice(15) + lines[21]!);
      await parseTranscript(file);
      const firstBytes = Buffer.byteLength(first);
      // full parse, then twice resumed at the end of the last complete line (not mid-record)
      expect(starts).toEqual([0, firstBytes, firstBytes]);
    } finally {
      _setCreateReadStreamForTests(null);
    }
  });

  test("unchanged file is served from the cache", async () => {
    const file = path.join(dir, "same.jsonl");
    fs.writeFileSync(file, syntheticLines().join(""));
    const a = await parseTranscript(file);
    const b = await parseTranscript(file);
    expect(b).toEqual(a);
  });
});
