/**
 * Persist the most recent stdin payload per session so the web UI can preview against real data.
 * Throttled, atomic, 0600. Never throws.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getHudPluginDir } from "../data/claude-config-dir.js";

const THROTTLE_MS = 5_000;
const MAX_SAMPLES = 20;
const MAX_BYTES = 256 * 1024;

export function samplesDir(homeDir = os.homedir()): string {
  return path.join(getHudPluginDir(homeDir), "samples");
}

function safeName(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "unknown";
}

export function captureSample(raw: unknown, now = Date.now()): void {
  try {
    const sid = typeof (raw as { session_id?: unknown })?.session_id === "string" ? (raw as { session_id: string }).session_id : "unknown";
    const dir = samplesDir();
    const file = path.join(dir, `${safeName(sid)}.json`);
    try {
      const st = fs.statSync(file);
      if (now - st.mtimeMs < THROTTLE_MS) return;
    } catch {
      /* first write */
    }
    const body = JSON.stringify({ capturedAt: now, payload: raw }, null, 2);
    if (body.length > MAX_BYTES) return;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, body, { mode: 0o600 });
    fs.renameSync(tmp, file);
    // Keep the directory small: drop oldest beyond MAX_SAMPLES (cheap, only on write).
    const entries = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    for (const e of entries.slice(MAX_SAMPLES)) fs.rmSync(path.join(dir, e.f), { force: true });
  } catch {
    /* never break the statusline */
  }
}

export interface Sample {
  id: string;
  label: string;
  capturedAt: number | null;
  payload: unknown;
  source: "live" | "fixture";
}

export function listLiveSamples(): Sample[] {
  const dir = samplesDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const out: Sample[] = [];
  for (const f of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as { capturedAt?: number; payload?: unknown };
      const p = parsed.payload as { workspace?: { current_dir?: string }; model?: { display_name?: string } } | undefined;
      const dirName = p?.workspace?.current_dir ? path.basename(p.workspace.current_dir) : "?";
      out.push({
        id: f.replace(/\.json$/, ""),
        label: `${dirName} · ${p?.model?.display_name ?? "?"} · ${parsed.capturedAt ? new Date(parsed.capturedAt).toLocaleTimeString() : ""}`,
        capturedAt: parsed.capturedAt ?? null,
        payload: parsed.payload,
        source: "live",
      });
    } catch {
      /* skip corrupt sample */
    }
  }
  return out.sort((a, b) => (b.capturedAt ?? 0) - (a.capturedAt ?? 0));
}
