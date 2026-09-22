/**
 * Saving from the panel writes one config *layer* (the user file or a project file), never the
 * merged result.
 *
 * The panel edits the *effective* config (defaults ← user ← project). Writing that whole object back
 * used to freeze every default into the user file (so later default changes never reached anyone who
 * had saved once) and copy a project's settings into the global user file. Instead we replay only
 * what the user actually changed since the last save onto the target layer.
 *
 * Pure functions, no DOM: unit-tested from tests/web-layers.test.ts.
 */

type Obj = Record<string, unknown>;

function isPlainObject(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Structural equality for JSON values (key order ignored). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => jsonEqual(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => jsonEqual(a[k], b[k]));
  }
  return false;
}

function diffInto(target: Obj, before: Obj, after: Obj): void {
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = before[k];
    const a = after[k];
    if (jsonEqual(a, b)) continue;
    if (isPlainObject(a) && isPlainObject(b)) {
      // Nested settings (git, plugins, bar…) merge key by key, like the config loader does.
      const sub: Obj = isPlainObject(target[k]) ? { ...(target[k] as Obj) } : {};
      diffInto(sub, b, a);
      target[k] = sub;
    } else if (a === undefined) {
      delete target[k];
    } else {
      // Arrays (notably `lines`) and scalars replace wholesale — again matching the loader.
      target[k] = structuredClone(a);
    }
  }
}

/**
 * The new content for a layer file: `layer` plus every change between `before` and `after`
 * (both effective configs). Untouched keys keep exactly what the layer had — including nothing.
 */
export function applyEdits(layer: Obj | null | undefined, before: unknown, after: unknown): Obj {
  const out: Obj = structuredClone(layer ?? {});
  if (isPlainObject(before) && isPlainObject(after)) diffInto(out, before, after);
  return out;
}
