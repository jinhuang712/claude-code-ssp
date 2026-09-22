/**
 * Human-readable summary of a settings.json `statusLine` entry, for the "replace it?" and "restore
 * previous" prompts. People recognise their statusline by its command (claude-hud, a script path),
 * so show that — shortened, with the full value available as a tooltip.
 */
export function describeStatusLine(v: unknown): { short: string; full: string } {
  const full = typeof v === "object" && v !== null && typeof (v as { command?: unknown }).command === "string" ? (v as { command: string }).command : JSON.stringify(v);
  const short = full.length > 96 ? `${full.slice(0, 93)}…` : full;
  return { short, full };
}
