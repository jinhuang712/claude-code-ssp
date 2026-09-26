/**
 * The Bun and Node globals the render engine reaches for, in the browser. Imported before anything
 * from src/, so modules that read them at load or call time find them.
 *
 * - `process`: empty env; the demo sets the colour level explicitly (truecolor), like the real preview.
 * - `Bun.stringWidth`: src/core/ansi.ts measures cells with it. It implements the rules of the
 *   `string-width` package (the one Claude Code's own UI uses), so that package gives the browser the
 *   same widths — right-aligned zones land exactly where they do in a terminal.
 */
import stringWidth from "string-width";

const g = globalThis as { process?: unknown; Bun?: unknown };
if (!g.process) g.process = { env: {}, platform: "darwin", cwd: () => "/", stdout: {}, versions: {} };
// countAnsiEscapeCodes: false is Bun.stringWidth's default too — escapes (SGR, OSC 8) are 0 cells.
if (!g.Bun) g.Bun = { stringWidth: (s: string) => stringWidth(s, { countAnsiEscapeCodes: false }) };
