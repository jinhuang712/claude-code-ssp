import { describe, expect, test } from "bun:test";
import * as os from "node:os";
import { samplesDir } from "../src/core/capture.ts";
import { userConfigDir, userConfigPath } from "../src/core/config.ts";
import { resetsDir } from "../src/core/reset.ts";
import { getHudPluginDir } from "../src/data/claude-config-dir.ts";

/*
  Guard for tests/setup.ts: if any of these ever resolves outside the temp root, a test could
  overwrite the developer's real statusline data. Fail loudly instead.
*/
describe("test isolation", () => {
  const root = process.env.SSP_TEST_ROOT!;

  test("preload ran", () => {
    expect(root).toBeTruthy();
  });

  test("every writable path resolves inside the temp root", () => {
    for (const p of [samplesDir(), resetsDir(), getHudPluginDir(os.homedir()), userConfigDir(), userConfigPath()]) {
      expect(p.startsWith(root)).toBe(true);
    }
  });
});
