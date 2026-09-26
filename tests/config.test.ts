import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_CONFIG, loadEffectiveConfig, mergeConfig, normalizeConfig, projectConfigPath, writeProjectConfig } from "../src/core/config.ts";
import { APP_NAME, LEGACY_APP_NAME } from "../src/data/app-name.ts";

describe("mergeConfig", () => {
  test("objects deep-merge, arrays replace", () => {
    const out = mergeConfig({ a: { x: 1, y: 2 }, list: [1, 2, 3] }, { a: { y: 9 }, list: [7] });
    expect(out).toEqual({ a: { x: 1, y: 9 }, list: [7] });
  });
  test("undefined never overwrites", () => {
    expect(mergeConfig({ a: 1 }, { a: undefined })).toEqual({ a: 1 });
  });
});

describe("normalizeConfig", () => {
  test("fills defaults and drops junk widgets", () => {
    const c = normalizeConfig({ lines: [{ left: [{ widget: "model.badge" }, { nope: 1 } as never, "str" as never] }] });
    expect(c.lines[0]!.left).toEqual([{ widget: "model.badge" }]);
    expect(c.lines[0]!.right).toEqual([]);
    expect(c.separator).toBe(DEFAULT_CONFIG.separator);
    expect(c.columnsOffset).toBe(4);
  });
  test("rejects bad enum values", () => {
    expect(normalizeConfig({ colorLevel: "rainbow" as never }).colorLevel).toBe("auto");
    expect(normalizeConfig({ columnsOffset: -5 }).columnsOffset).toBe(0);
    expect(normalizeConfig({ colorMode: "rainbow" as never }).colorMode).toBe("thresholds");
  });
});

// Up to 0.4.1 the colour mode was a per-widget option; it is now one config-wide setting.
describe("legacy per-widget colorMode", () => {
  const ctxGradient = { widget: "context.bar", options: { colorMode: "gradient", showTokens: true } };
  const usageThresholds = { widget: "usage.windows", options: { colorMode: "thresholds" } };

  test("a widget that asked for the gradient makes the whole config gradient", () => {
    expect(normalizeConfig({ lines: [{ left: [usageThresholds], right: [ctxGradient] }] }).colorMode).toBe("gradient");
  });
  test("only thresholds (or no colorMode at all) stays thresholds", () => {
    expect(normalizeConfig({ lines: [{ left: [usageThresholds] }] }).colorMode).toBe("thresholds");
    expect(normalizeConfig({ lines: [{ left: [{ widget: "context.bar" }] }] }).colorMode).toBe("thresholds");
  });
  test("an explicit top-level colorMode wins over the old widget options", () => {
    expect(normalizeConfig({ colorMode: "thresholds", lines: [{ right: [ctxGradient] }] }).colorMode).toBe("thresholds");
  });
  test("the old widget option is dropped, the widget's other options are kept", () => {
    const c = normalizeConfig({ lines: [{ right: [ctxGradient] }] });
    expect(c.lines[0]!.right).toEqual([{ widget: "context.bar", options: { showTokens: true } }]);
  });
  // The panel saves a diff onto the layer; if only the merged config were lifted, the first save
  // after editing the lines would write lines without the old option and no top-level key.
  test("the layer itself is lifted as it is read, so a panel save keeps the choice", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ssp-colormode-"));
    try {
      const file = path.join(dir, "config.json");
      fs.writeFileSync(file, JSON.stringify({ lines: [{ right: [ctxGradient] }] }));
      const eff = loadEffectiveConfig(undefined, { ...process.env, CLAUDE_CODE_SUPER_STATUSLINE_CONFIG: file });
      expect(eff.config.colorMode).toBe("gradient");
      expect(eff.layers.find((l) => l.name === "user")!.value!.colorMode).toBe("gradient");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Project files are never moved (they may be committed to the project's repo): a project that
// has the pre-0.4.0 claude-code-ssp.json keeps reading and saving that one.
describe("project overlay name", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ssp-project-")));
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = (name: string, files: string[]): string => {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(dir, ".claude", f), JSON.stringify({ separator: ` ${f} ` }));
    return dir;
  };

  test("the new name when there is none yet, or when both exist", () => {
    expect(projectConfigPath(project("fresh", []))).toBe(path.join(root, "fresh", ".claude", `${APP_NAME}.json`));
    const both = project("both", [`${APP_NAME}.json`, `${LEGACY_APP_NAME}.json`]);
    expect(loadEffectiveConfig(both).config.separator).toBe(` ${APP_NAME}.json `);
  });

  test("a project with only the old file reads it and saves into it", () => {
    const old = project("old", [`${LEGACY_APP_NAME}.json`]);
    expect(loadEffectiveConfig(old).config.separator).toBe(` ${LEGACY_APP_NAME}.json `);
    expect(writeProjectConfig(old, { separator: " saved " })).toBe(path.join(old, ".claude", `${LEGACY_APP_NAME}.json`));
    expect(fs.readdirSync(path.join(old, ".claude"))).toEqual([`${LEGACY_APP_NAME}.json`]);
    expect(loadEffectiveConfig(old).config.separator).toBe(" saved ");
  });
});
