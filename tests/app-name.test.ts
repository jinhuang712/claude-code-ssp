/**
 * The move from the pre-0.4.0 folder names (claude-code-ssp) to the new ones: the old folder is
 * adopted once, a new one always wins, and a move that can't happen leaves the old folder in use
 * instead of starting the user over from defaults.
 */
import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { userConfigDir } from "../src/core/config.ts";
import { adoptLegacyDir, APP_NAME, LEGACY_APP_NAME } from "../src/data/app-name.ts";
import { getHudPluginDir } from "../src/data/claude-config-dir.ts";

const temps: string[] = [];
function temp(): string {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ssp-appname-")));
  temps.push(d);
  return d;
}
afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.chmodSync(d, 0o755);
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("adoptLegacyDir", () => {
  test("only the old folder exists: it is moved, contents and all", () => {
    const parent = temp();
    const [dir, legacy] = [path.join(parent, APP_NAME), path.join(parent, LEGACY_APP_NAME)];
    fs.mkdirSync(path.join(legacy, "resets"), { recursive: true });
    fs.writeFileSync(path.join(legacy, "resets", "s1.json"), "{}");
    expect(adoptLegacyDir(dir, legacy)).toBe(dir);
    expect(fs.existsSync(legacy)).toBe(false);
    expect(fs.readFileSync(path.join(dir, "resets", "s1.json"), "utf8")).toBe("{}");
  });

  test("both exist: the new one wins and the old one is left alone", () => {
    const parent = temp();
    const [dir, legacy] = [path.join(parent, APP_NAME), path.join(parent, LEGACY_APP_NAME)];
    fs.mkdirSync(dir);
    fs.mkdirSync(legacy);
    fs.writeFileSync(path.join(legacy, "config.json"), "old");
    expect(adoptLegacyDir(dir, legacy)).toBe(dir);
    expect(fs.readFileSync(path.join(legacy, "config.json"), "utf8")).toBe("old");
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  test("neither exists: the new path, and nothing is created", () => {
    const parent = temp();
    expect(adoptLegacyDir(path.join(parent, APP_NAME), path.join(parent, LEGACY_APP_NAME))).toBe(path.join(parent, APP_NAME));
    expect(fs.readdirSync(parent)).toEqual([]);
  });

  // A read-only parent makes the rename fail with EACCES. Root ignores the mode bits, so the case
  // can't be staged there.
  test.skipIf(process.getuid?.() === 0)("a move that fails keeps the old folder in use", () => {
    const parent = temp();
    const [dir, legacy] = [path.join(parent, APP_NAME), path.join(parent, LEGACY_APP_NAME)];
    fs.mkdirSync(legacy);
    fs.chmodSync(parent, 0o555);
    expect(adoptLegacyDir(dir, legacy)).toBe(legacy);
    expect(fs.existsSync(legacy)).toBe(true);
  });
});

describe("the folders we own adopt their old names", () => {
  const saved = process.env.CLAUDE_CONFIG_DIR;
  afterEach(() => {
    process.env.CLAUDE_CONFIG_DIR = saved;
  });

  test("data folder: $CLAUDE_CONFIG_DIR/plugins/claude-code-ssp → claude-code-super-statusline", () => {
    const claude = temp();
    fs.mkdirSync(path.join(claude, "plugins", LEGACY_APP_NAME, "samples"), { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = claude;
    expect(getHudPluginDir(os.homedir())).toBe(path.join(claude, "plugins", APP_NAME));
    expect(fs.existsSync(path.join(claude, "plugins", APP_NAME, "samples"))).toBe(true);
    expect(fs.existsSync(path.join(claude, "plugins", LEGACY_APP_NAME))).toBe(false);
  });

  test("user folder: ~/.config/claude-code-ssp → claude-code-super-statusline", () => {
    const xdg = temp();
    fs.mkdirSync(path.join(xdg, LEGACY_APP_NAME, "widgets"), { recursive: true });
    fs.writeFileSync(path.join(xdg, LEGACY_APP_NAME, "config.json"), '{"separator":" | "}');
    expect(userConfigDir({ XDG_CONFIG_HOME: xdg })).toBe(path.join(xdg, APP_NAME));
    expect(fs.readFileSync(path.join(xdg, APP_NAME, "config.json"), "utf8")).toBe('{"separator":" | "}');
    expect(fs.existsSync(path.join(xdg, APP_NAME, "widgets"))).toBe(true);
  });
});
