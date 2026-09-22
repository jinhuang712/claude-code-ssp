/**
 * Shared test helpers: render one widget (or a whole config) against a stdin payload the same way
 * the `render` CLI does, but with git disabled and colours off so assertions compare plain text.
 */
import { DEFAULT_CONFIG } from "../src/core/config.ts";
import { buildContext } from "../src/core/context.ts";
import { render } from "../src/core/layout.ts";
import { getWidget, registerWidget } from "../src/core/registry.ts";
import type { FooterConfig, WidgetInstance } from "../src/core/types.ts";
import * as activity from "../src/widgets/activity.ts";
import * as context from "../src/widgets/context.ts";
import * as cost from "../src/widgets/cost.ts";
import * as environment from "../src/widgets/environment.ts";
import * as git from "../src/widgets/git.ts";
import * as misc from "../src/widgets/misc.ts";
import * as model from "../src/widgets/model.ts";
import * as project from "../src/widgets/project.ts";
import * as session from "../src/widgets/session.ts";
import * as tokens from "../src/widgets/tokens.ts";
import * as usage from "../src/widgets/usage.ts";

/**
 * Make sure the builtin widgets are registered. Test files share one process and one registry,
 * and layout.test.ts clears it (`_resetRegistry`) to test unknown widgets — while
 * `registerBuiltinWidgets()` refuses to run twice. So re-register straight from the modules
 * whenever something is missing.
 */
export function ensureBuiltins(): void {
  if (getWidget("model.badge")) return;
  for (const mod of [model, project, git, context, usage, tokens, session, cost, activity, environment, misc]) {
    for (const def of Object.values(mod)) {
      // Same filter as registerBuiltinWidgets: helpers exported next to widgets aren't widgets.
      if (typeof def === "object" && def !== null && "id" in def && "render" in def) registerWidget(def as never, "builtin");
    }
  }
}

/** Run git with a fixed identity; HOME is the temp home (tests/setup.ts), so no global config applies. */
export function runGit(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync({
    cmd: ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "init.defaultBranch=main", "-c", "commit.gpgsign=false", ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString();
}

/** Plain-text config: no colour, no git subprocesses, single separator space. */
export function plainConfig(lines: FooterConfig["lines"]): FooterConfig {
  return { ...DEFAULT_CONFIG, colorLevel: "none", separator: " ", git: { enabled: false, cacheMs: 0 }, lines };
}

/** Render a single widget instance on its own line and return that line (or "" when it renders nothing). */
export async function renderWidget(payload: unknown, inst: WidgetInstance, columns = 0): Promise<string> {
  ensureBuiltins();
  const config = plainConfig([{ left: [inst] }]);
  const ctx = await buildContext(structuredClone(payload) as never, config, { columns, now: Date.now() });
  const out = render(config, ctx);
  if (out.errors.length) throw new Error(out.errors.map((e) => `${e.widget}: ${e.message}`).join("; "));
  return out.lines[0] ?? "";
}
