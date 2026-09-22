import { getWidget, registerWidget } from "../core/registry.js";
import * as activity from "./activity.js";
import * as context from "./context.js";
import * as cost from "./cost.js";
import * as environment from "./environment.js";
import * as git from "./git.js";
import * as misc from "./misc.js";
import * as model from "./model.js";
import * as project from "./project.js";
import * as session from "./session.js";
import * as tokens from "./tokens.js";
import * as usage from "./usage.js";

let registered = false;

export function registerBuiltinWidgets(): void {
  // The flag alone isn't enough: tests call _resetRegistry(), after which a stale `true` would leave
  // the registry empty for every later caller in the same process.
  if (registered && getWidget("model.badge")) return;
  registered = true;
  for (const mod of [model, project, git, context, usage, tokens, session, cost, activity, environment, misc]) {
    for (const def of Object.values(mod)) registerWidget(def, "builtin");
  }
}
