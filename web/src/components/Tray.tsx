import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";
import { api, type LineConfig, type WidgetManifest } from "../api";
import { CAT_COLOR } from "../colors";
import { categoryName, useT, widgetDesc, widgetName } from "../i18n";
import { useStore } from "../store";

/** Reading order for categories: what a statusline is *about* first, bookkeeping last. */
const CATEGORY_ORDER = ["model", "project", "git", "context", "usage", "tokens", "cost", "session", "activity", "environment", "misc"];
const rank = (cat: string) => {
  const i = CATEGORY_ORDER.indexOf(cat);
  return i === -1 ? CATEGORY_ORDER.length : i;
};

/**
 * Widgets meant to be placed more than once, each with its own text / variable / URL. They stay in
 * the tray after use; every other widget leaves it once it is in the layout (a second project path
 * would only repeat the first).
 */
const REPEATABLE = (id: string) => id.startsWith("custom.");

/** How many items a phone shows before "Show all": about three rows at 390px. */
const COLLAPSED_COUNT = 8;
/** Same breakpoint as the stacked layout rows in index.css. */
const NARROW_QUERY = "(max-width: 720px)";

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia?.(NARROW_QUERY).matches === true);
  useEffect(() => {
    const mq = window.matchMedia?.(NARROW_QUERY);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

/** Drag ids for tray items are prefixed so the layout can tell "add this" from "move this chip". */
export const TRAY_PREFIX = "tray:";
/** The tray itself is a drop target: a chip dropped on it is removed from the statusline. */
export const TRAY_DROP_ID = "tray";

/** `lines` with `widget` appended to the last line's left zone: where a click on a tray item puts it. */
function appendToLast(lines: LineConfig[], widget: string): LineConfig[] {
  const next = structuredClone(lines);
  if (next.length === 0) next.push({ left: [], right: [] });
  const last = next[next.length - 1]!;
  last.left = [...(last.left ?? []), { widget }];
  return next;
}

function TrayItem({ w, repeatable }: { w: WidgetManifest; repeatable: boolean }) {
  const t = useT();
  const lines = useStore((s) => s.config!.lines);
  const addWidget = useStore((s) => s.addWidget);
  const setTryOn = useStore((s) => s.setTryOn);
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: `${TRAY_PREFIX}${w.id}` });
  const name = widgetName(t, w, w.id);
  // Hover or focus previews the statusline with this widget added; leaving goes back.
  const tryOn = () => setTryOn({ patch: { lines: appendToLast(lines, w.id) }, label: name });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className="tray-item mono"
      style={{ ["--cat" as string]: CAT_COLOR[w.category] ?? CAT_COLOR.misc, opacity: isDragging ? 0.4 : 1 }}
      title={widgetDesc(t, w, w.id)}
      aria-describedby="tray-help"
      {...listeners}
      onMouseEnter={tryOn}
      onMouseLeave={() => setTryOn(null)}
      onFocus={tryOn}
      onBlur={() => setTryOn(null)}
      onClick={() => {
        setTryOn(null);
        addWidget(Math.max(0, lines.length - 1), "left", w.id);
      }}
    >
      {name}
      {repeatable && <span className="chip-empty">{t.tray.repeatable}</span>}
      {w.source === "plugin" && <span className="chip-empty">{t.tray.plugin}</span>}
    </button>
  );
}

/** A skipped project widget folder `<root>/.claude/claude-code-ssp/widgets` → its project root. */
function projectRootOf(dir: string): string {
  return dir.replace(/[\\/]\.claude[\\/]claude-code-ssp[\\/]widgets[\\/]?$/, "");
}

/**
 * A project's own widgets that did not load because the project isn't trusted. Shown where people
 * look for widgets, so the reason a project widget is missing isn't buried in Diagnostics.
 */
function Untrusted() {
  const t = useT();
  const cwd = useStore((s) => s.projectCwd);
  const trustProject = useStore((s) => s.trustProject);
  const [skipped, setSkipped] = useState<Array<{ dir: string }>>([]);
  const load = () =>
    api
      .doctor(cwd)
      .then((r) => setSkipped(r.plugins.skipped ?? []))
      // Only a hint: if the report can't load, the tray simply doesn't show it (Diagnostics reports the error).
      .catch(() => setSkipped([]));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);
  return (
    <>
      {skipped.map((sk) => (
        <div key={sk.dir} className="tray-notice">
          <span>{t.tray.untrusted}</span>
          <code className="mono hint">{sk.dir}</code>
          <button className="btn" onClick={() => void trustProject(projectRootOf(sk.dir)).then(load)} title={t.doctor.trustHint}>
            {t.doctor.trust}
          </button>
        </div>
      ))}
    </>
  );
}

/**
 * Every widget not in the layout, grouped by category, under the lines. It replaces the "+" slot
 * in every zone and the picker drawer: what can be added is always in view, a click appends to the
 * last line, and dragging puts it anywhere. Dropping a chip here takes it out of the statusline.
 */
export function Tray() {
  const t = useT();
  const widgets = useStore((s) => s.widgets);
  const config = useStore((s) => s.config!);
  const { setNodeRef, isOver, active } = useDroppable({ id: TRAY_DROP_ID });
  const inUse = useMemo(() => new Set(config.lines.flatMap((l) => [...(l.left ?? []), ...(l.center ?? []), ...(l.right ?? [])].map((w) => w.widget))), [config.lines]);
  const groups = useMemo(() => {
    const map = new Map<string, WidgetManifest[]>();
    for (const w of widgets) if (!inUse.has(w.id) || REPEATABLE(w.id)) map.set(w.category, [...(map.get(w.category) ?? []), w]);
    return [...map.entries()].sort(([a], [b]) => rank(a) - rank(b));
  }, [widgets, inUse]);
  const count = groups.reduce((n, [, ws]) => n + ws.length, 0);
  // Only a chip from the layout can be dropped here (a tray item dropped back on the tray is a no-op).
  const removing = isOver && active !== null && !String(active.id).startsWith(TRAY_PREFIX);
  // On a phone ~26 items wrap into a screen and a half of chips; show the first few until asked.
  const narrow = useNarrow();
  const [expanded, setExpanded] = useState(false);
  const limit = narrow && !expanded ? COLLAPSED_COUNT : Infinity;
  // Each group keeps what is left of the limit after the groups before it.
  const visible = groups
    .map(([cat, ws], gi) => {
      const before = groups.slice(0, gi).reduce((n, [, g]) => n + g.length, 0);
      return [cat, ws.slice(0, Math.max(0, limit - before))] as const;
    })
    .filter(([, ws]) => ws.length > 0);
  return (
    <div ref={setNodeRef} className="tray" data-over={removing} aria-labelledby="tray-title">
      <div className="tray-head">
        <h3 id="tray-title">{t.tray.title}</h3>
        <span className="hint" id="tray-help">
          {removing ? t.tray.dropToRemove : t.tray.hint}
        </span>
      </div>
      <Untrusted />
      {count === 0 ? (
        <p className="hint">{t.tray.empty}</p>
      ) : (
        <div className="tray-items">
          {visible.map(([cat, ws]) => (
            <span key={cat} className="tray-group" role="group" aria-label={categoryName(t, cat)}>
              <span className="tray-cat" aria-hidden="true">
                {categoryName(t, cat)}
              </span>
              {ws.map((w) => (
                <TrayItem key={w.id} w={w} repeatable={REPEATABLE(w.id)} />
              ))}
            </span>
          ))}
        </div>
      )}
      {narrow && count > COLLAPSED_COUNT && (
        <button className="btn btn-ghost self-start" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? t.tray.showFewer : t.tray.showAll(count)}
        </button>
      )}
    </div>
  );
}
