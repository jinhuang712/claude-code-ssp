/**
 * Widgets the tray no longer offers at all, because another widget does the same with its own
 * options. They stay registered, so a line that already uses one keeps rendering and its chip stays
 * editable; removing the widget would turn it into ⚠ on those lines.
 * - usage.single ("Single rate-limit window"): "Rate-limit windows" with 7d and spend off, the label
 *   and reset time hidden prints the same `5h 23%`.
 * - context.value ("Context value") and tokens.current ("Current context tokens"): Context usage
 *   (context.bar) with its bar off gives the percentage, and "Show used/total tokens" the tokens.
 *   Lost: the tokens alone without the window size or the percentage — not worth two more widgets.
 *
 * Its own module (not Tray.tsx) so tests/readme-widgets.test.ts can read it without JSX: the README
 * lists exactly the widgets the tray offers.
 */
export const RETIRED: ReadonlySet<string> = new Set(["usage.single", "context.value", "tokens.current"]);
