/**
 * web/dist is committed (marketplace installs run it as-is), so it must match web/src. This fails
 * as soon as someone changes the UI sources without rebuilding: run `bun run build:web` and commit
 * web/dist together with the source change.
 */
import { expect, test } from "bun:test";
import { recordedHash, webSourceHash } from "../scripts/web-hash";

test("committed web/dist was built from the current web sources", () => {
  const recorded = recordedHash();
  expect(recorded, "web/dist/.source-hash is missing — run `bun run build:web`").not.toBeNull();
  expect(recorded, "web/dist is stale — run `bun run build:web` and commit web/dist").toBe(webSourceHash());
});
