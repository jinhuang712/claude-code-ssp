#!/usr/bin/env bun
/**
 * claude-code-ssp CLI. The `render` path must stay lean: no server or UI imports here.
 */
import { captureSample } from "../core/capture.js";
import { loadEffectiveConfig } from "../core/config.js";
import { buildContext } from "../core/context.js";
import { render } from "../core/layout.js";
import { loadPlugins } from "../core/plugins.js";
import { readStdin } from "../data/stdin.js";
import { registerBuiltinWidgets } from "../widgets/index.js";

function arg(name: string, argv: string[]): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0) return argv[i + 1] ?? "";
  const kv = argv.find((a) => a.startsWith(`--${name}=`));
  return kv ? kv.slice(name.length + 3) : undefined;
}

async function cmdRender(argv: string[]): Promise<void> {
  const started = performance.now();
  registerBuiltinWidgets();
  const fixture = arg("fixture", argv);
  let stdin = fixture ? (JSON.parse(await Bun.file(fixture).text()) as Awaited<ReturnType<typeof readStdin>>) : await readStdin();
  if (!stdin) {
    console.log("claude-code-ssp: waiting for Claude Code statusline JSON on stdin (or pass --fixture <file>)");
    return;
  }
  const cwd = stdin!.workspace?.current_dir ?? stdin!.cwd;
  const { config } = loadEffectiveConfig(cwd);
  if (config.captureSamples) captureSample(stdin);
  await loadPlugins(config, cwd);
  const columnsArg = arg("columns", argv);
  const ctx = await buildContext(stdin!, config, { columns: columnsArg ? Number(columnsArg) : undefined });
  const result = render(config, ctx);
  for (const line of result.lines) console.log(line);
  if (process.env.CLAUDE_CODE_SSP_DEBUG) {
    console.error(`[claude-code-ssp] render ${result.ms.toFixed(1)}ms total ${(performance.now() - started).toFixed(1)}ms`);
    for (const e of result.errors) console.error(`[claude-code-ssp] ${e.widget}: ${e.message}`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0] ?? "render";
  switch (cmd) {
    case "render":
      return cmdRender(argv);
    case "serve": {
      const { serve } = await import("../server/serve.js");
      return serve({ port: Number(arg("port", argv) ?? 4877), open: argv.includes("--open") });
    }
    case "install":
    case "uninstall": {
      const { install, uninstall } = await import("../server/install.js");
      if (cmd === "install") install({ dryRun: argv.includes("--dry-run") });
      else uninstall();
      return;
    }
    case "doctor": {
      const { doctor } = await import("../server/doctor.js");
      return doctor();
    }
    case "--help":
    case "-h":
    case "help":
      console.log(`claude-code-ssp <command>

  render            read Claude Code statusline JSON on stdin, print the status line (default)
  serve [--port N] [--open]   start the local web configurator (127.0.0.1:4877)
  install [--dry-run]         merge statusLine into ~/.claude/settings.json (with backup)
  uninstall                   remove the statusLine entry we installed
  doctor                      show effective config, layers, plugins, last sample, timing
`);
      return;
    default:
      console.error(`unknown command: ${cmd}`);
      process.exit(2);
  }
}

main().catch((err) => {
  // Never blank the statusline silently: print a one-line marker.
  console.log(`[claude-code-ssp] error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(0);
});
