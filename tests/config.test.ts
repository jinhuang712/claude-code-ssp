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
