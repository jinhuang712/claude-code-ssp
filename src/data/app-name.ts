/**
 * The product's name on disk, and the one it had before 0.4.0.
 *
 * Folders and files are named after the product (claude-code-super-statusline). Installs from 0.3.x
 * and earlier keep them under claude-code-ssp, so every folder we own is resolved through
 * adoptLegacyDir, which moves the old one over the first time the new version looks for it.
 */
import * as fs from "node:fs";

export const APP_NAME = "claude-code-super-statusline";
/** The name before 0.4.0 — still found on disk in configs, caches and settings.json. */
export const LEGACY_APP_NAME = "claude-code-ssp";

/**
 * For the files a *project* keeps under `.claude/` (its config overlay, its widgets folder), which
 * are never moved: they may be committed to someone's repo, and renaming them is that team's call.
 * The old path when only it exists — so reads and saves both go to the file the project already
 * has — otherwise the new one (it wins when both exist).
 */
export function newOrLegacy(p: string, legacyP: string): string {
  return !fs.existsSync(p) && fs.existsSync(legacyP) ? legacyP : p;
}

let movesAllowed = true;

/**
 * Stop adoptLegacyDir from moving anything in this process; it then just points at the old folder.
 * For `serve --sandbox`, which must only ever *read* the real folders: moving them would pull the
 * config out from under an older install that is still the live statusline.
 */
export function freezeLegacyDirs(): void {
  movesAllowed = false;
}

/**
 * `dir`, after moving the pre-0.4.0 `legacyDir` there when only the old one exists. Callers pass
 * two siblings (same parent, only the last segment differs), so a rename is enough — no copy,
 * nothing half-moved.
 *
 * Returns `legacyDir` when the move failed and the old folder is still there (a permission problem,
 * a Windows lock): reading it where it is beats starting from defaults and leaving the user's
 * layout, counter resets and snapshots behind. Likewise after freezeLegacyDirs. Cheap enough for the
 * render path: after the first run it is a single existsSync.
 */
export function adoptLegacyDir(dir: string, legacyDir: string): string {
  if (fs.existsSync(dir) || !fs.existsSync(legacyDir)) return dir;
  if (!movesAllowed) return legacyDir;
  try {
    fs.renameSync(legacyDir, dir);
    return dir;
  } catch {
    // Two renders can race here: the loser's rename fails because the winner already moved the
    // folder, and `dir` exists now. Anything else means the move is impossible; keep the old one.
    return fs.existsSync(dir) ? dir : legacyDir;
  }
}
