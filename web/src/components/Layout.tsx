import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CSS } from "@dnd-kit/utilities";
import type { LineConfig, WidgetInstance, Zone } from "../api";
import { CAT_COLOR } from "../colors";
import { useT, widgetName } from "../i18n";
import { effectiveLabel, emptyStateAt, hasCenter, useStore } from "../store";
import { Icon } from "./Icon";
import { Popover } from "./Popover";

/*
  Drag ids must survive a reorder. Positions do not, so a chip is identified by its widget id plus
  its occurrence number across the whole config (`git.branch#0`, `git.branch#1`). Zones get their own
  droppable id so a chip can be dropped into an empty zone.
*/
type Pos = { line: number; zone: Zone; index: number };
const ZONES: Zone[] = ["left", "center", "right"];
const CHIP_HELP_ID = "chip-help";

function zoneId(line: number, zone: Zone): string {
  return `zone:${line}:${zone}`;
}
function parseZoneId(id: string): { line: number; zone: Zone } | null {
  if (!id.startsWith("zone:")) return null;
  const [, l, z] = id.split(":");
  return { line: Number(l), zone: z as Zone };
}
function indexChips(lines: LineConfig[]): { ids: Map<string, Pos>; at: Map<string, string> } {
  const seen = new Map<string, number>();
  const ids = new Map<string, Pos>();
  const at = new Map<string, string>();
  lines.forEach((line, li) =>
    ZONES.forEach((zone) =>
      (line[zone] ?? []).forEach((w, index) => {
        const n = seen.get(w.widget) ?? 0;
        seen.set(w.widget, n + 1);
        const id = `${w.widget}#${n}`;
        ids.set(id, { line: li, zone, index });
        at.set(`${li}:${zone}:${index}`, id);
      }),
    ),
  );
  return { ids, at };
}

/* Prefer the chip under the pointer, then the zone under the pointer, then whatever is nearest. */
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const chips = within.filter((c) => !String(c.id).startsWith("zone:"));
  if (chips.length) return chips;
  if (within.length) return within;
  return closestCenter(args);
};

function ChipFace({ widget, ghost }: { widget: string; ghost?: boolean }) {
  const t = useT();
  const manifest = useStore((s) => s.widgets.find((w) => w.id === widget));
  const cat = CAT_COLOR[manifest?.category ?? "misc"];
  return (
    <span className="chip mono" data-ghost={ghost} style={{ ["--cat" as string]: cat }}>
      <span className="chip-name">{widgetName(t, manifest, widget)}</span>
    </span>
  );
}

const ARROWS: Record<string, "left" | "right" | "up" | "down"> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

function Chip({ id, line, zone, index, item }: { id: string; line: number; zone: Zone; index: number; item: WidgetInstance }) {
  // `attributes` from useSortable are deliberately not spread: they would make the wrapper a
  // focusable role="button" around two real buttons (nested interactive controls, which screen
  // readers flatten). Pointer dragging only needs the listeners; keyboard users move chips with
  // Alt+Arrow on the name button instead.
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const t = useT();
  const s = useStore();
  const nameBtn = useRef<HTMLButtonElement>(null);
  const manifest = s.widgets.find((w) => w.id === item.widget);
  const selected = s.selection?.line === line && s.selection.zone === zone && s.selection.index === index;
  const cat = CAT_COLOR[manifest?.category ?? "misc"];
  const label = effectiveLabel(item, manifest);
  const empty = emptyStateAt(s.preview, { line, zone, index });
  const name = widgetName(t, manifest, item.widget);

  // After a keyboard move the chip re-mounts at its new position; the one standing there takes focus.
  const focusHere = s.focusPos?.line === line && s.focusPos.zone === zone && s.focusPos.index === index;
  useEffect(() => {
    if (!focusHere) return;
    nameBtn.current?.focus();
    s.claimFocus();
  }, [focusHere, s]);

  return (
    <span
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1, ["--cat" as string]: cat }}
      className="chip mono"
      data-selected={selected}
      data-empty={empty ?? undefined}
      {...listeners}
    >
      <button
        ref={nameBtn}
        className="chip-name"
        onClick={() => s.select({ line, zone, index })}
        onKeyDown={(e) => {
          const dir = ARROWS[e.key];
          if (!dir || !e.altKey) return;
          e.preventDefault();
          s.nudge({ line, zone, index }, dir);
        }}
        title={empty === "filled" ? t.layout.filledTitle : empty === "hidden" ? t.layout.hiddenTitle : t.layout.editOptions}
        aria-describedby={CHIP_HELP_ID}
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
      >
        {label && <span className="chip-label">{label}</span>}
        {/* Its own span so a name too long for a phone-width zone truncates instead of wrapping. */}
        <span className="chip-text">{name}</span>
        {empty && <span className="chip-empty">{empty === "filled" ? t.layout.sampleTag : t.layout.noDataTag}</span>}
      </button>
      <button
        className="chip-x"
        onClick={(e) => {
          e.stopPropagation();
          s.removeAt({ line, zone, index });
        }}
        aria-label={`${t.layout.remove}: ${name}`}
        title={t.layout.remove}
      >
        <Icon name="x" size={12} />
      </button>
    </span>
  );
}

function ZoneBox({ line, zone, items, at, caret }: { line: number; zone: Zone; items: WidgetInstance[]; at: Map<string, string>; caret: number | null }) {
  const t = useT();
  const openPicker = useStore((s) => s.openPicker);
  const ids = items.map((_, i) => at.get(`${line}:${zone}:${i}`)!);
  const empty = items.length === 0;
  const { setNodeRef, isOver } = useDroppable({ id: zoneId(line, zone) });
  // Where a chip dragged in from another zone will land (same-zone drags show it by shifting chips).
  const Caret = () => <i className="drop-caret" aria-hidden="true" />;
  return (
    <SortableContext items={ids} strategy={rectSortingStrategy}>
      <div ref={setNodeRef} className="zone" data-zone={zone} data-empty={empty} data-over={isOver}>
        {/* Caption: always for the center zone (its position varies), for every zone once rows stack. */}
        <span className="zone-cap">{t.layout.zones[zone]}</span>
        {items.map((it, i) => (
          <Fragment key={ids[i]}>
            {caret === i && <Caret />}
            <Chip id={ids[i]!} line={line} zone={zone} index={i} item={it} />
          </Fragment>
        ))}
        {caret !== null && caret >= items.length && <Caret />}
        <button className="addchip" onClick={() => openPicker(line, zone)} aria-label={t.layout.addTo(line + 1, t.layout.zones[zone])} title={t.layout.addTo(line + 1, t.layout.zones[zone])}>
          <Icon name="plus" size={14} />
          {empty && zone !== "center" && <span>{t.layout.emptyZone[zone]}</span>}
        </button>
      </div>
    </SortableContext>
  );
}

/** Per-line actions and settings, behind the line number so rows stay uncluttered. */
function LineMenu({ line, index, total }: { line: LineConfig; index: number; total: number }) {
  const t = useT();
  const s = useStore();
  return (
    <Popover label={t.layout.lineMenu(index + 1)} buttonClassName="linerow-num mono" buttonContent={index + 1}>
      {(close) => (
        <div className="linemenu">
          <div className="linemenu-actions">
            <button
              className="btn"
              disabled={index === 0}
              onClick={() => {
                s.moveLine(index, -1);
                close();
              }}
            >
              ↑ {t.layout.moveUp}
            </button>
            <button
              className="btn"
              disabled={index === total - 1}
              onClick={() => {
                s.moveLine(index, 1);
                close();
              }}
            >
              ↓ {t.layout.moveDown}
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                s.removeLine(index);
                close();
              }}
            >
              × {t.layout.deleteLine}
            </button>
          </div>
          <label className="linemenu-field">
            <span>{t.layout.overflow}</span>
            <select
              className="field !w-auto"
              value={line.overflow ?? "wrap"}
              onChange={(e) =>
                s.setConfig((c) => {
                  c.lines[index]!.overflow = e.target.value as LineConfig["overflow"];
                })
              }
            >
              <option value="wrap">{t.layout.overflowWrap}</option>
              <option value="truncate">{t.layout.overflowTruncate}</option>
              <option value="drop-right">{t.layout.overflowDropRight}</option>
            </select>
          </label>
          <label className="linemenu-field">
            <span>
              {t.layout.hideBelow} <span className="hint">({t.layout.hideBelowHint})</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <input
                className="field !w-20"
                type="number"
                min={0}
                value={line.minColumns ?? 0}
                onChange={(e) =>
                  s.setConfig((c) => {
                    const v = Number(e.target.value);
                    if (v > 0) c.lines[index]!.minColumns = v;
                    else delete c.lines[index]!.minColumns;
                  })
                }
              />
              {t.layout.columnsUnit}
            </span>
          </label>
        </div>
      )}
    </Popover>
  );
}

function Row({ line, index, total, withCenter, at, caret }: { line: LineConfig; index: number; total: number; withCenter: boolean; at: Map<string, string>; caret: Pos | null }) {
  const caretIn = (zone: Zone) => (caret && caret.line === index && caret.zone === zone ? caret.index : null);
  return (
    <div className="linerow">
      <div className="linerow-gutter">
        <LineMenu line={line} index={index} total={total} />
      </div>
      <div className={`linerow-body ${withCenter ? "with-center" : ""}`}>
        <ZoneBox line={index} zone="left" items={line.left ?? []} at={at} caret={caretIn("left")} />
        {withCenter && <ZoneBox line={index} zone="center" items={line.center ?? []} at={at} caret={caretIn("center")} />}
        <ZoneBox line={index} zone="right" items={line.right ?? []} at={at} caret={caretIn("right")} />
      </div>
    </div>
  );
}

export function Layout() {
  const t = useT();
  const config = useStore((s) => s.config)!;
  const reorder = useStore((s) => s.reorder);
  const moveWidget = useStore((s) => s.moveWidget);
  const addLine = useStore((s) => s.addLine);
  const live = useStore((s) => s.live);
  const withCenter = useStore(hasCenter);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [dragging, setDragging] = useState<string | null>(null);
  const [caret, setCaret] = useState<Pos | null>(null);
  const { ids, at } = useMemo(() => indexChips(config.lines), [config.lines]);

  function onDragStart(e: DragStartEvent) {
    setDragging(String(e.active.id));
  }
  function onDragOver(e: DragOverEvent) {
    const a = ids.get(String(e.active.id));
    if (!a || !e.over) return setCaret(null);
    const z = parseZoneId(String(e.over.id));
    const target = z ? { ...z, index: config.lines[z.line]?.[z.zone]?.length ?? 0 } : ids.get(String(e.over.id));
    // Same zone: the sortable strategy already shows the gap by shifting chips.
    setCaret(target && !(target.line === a.line && target.zone === a.zone) ? target : null);
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    setCaret(null);
    if (!e.over || e.active.id === e.over.id) return;
    const a = ids.get(String(e.active.id));
    if (!a) return;
    const z = parseZoneId(String(e.over.id));
    if (z) {
      // Dropped on a zone's empty space: append there (a no-op if it is already last in that zone).
      const len = config.lines[z.line]?.[z.zone]?.length ?? 0;
      if (a.line === z.line && a.zone === z.zone) {
        if (a.index !== len - 1) reorder(a.line, a.zone, a.index, len - 1);
      } else moveWidget(a, z.line, z.zone, len);
      return;
    }
    const b = ids.get(String(e.over.id));
    if (!b) return;
    if (a.line === b.line && a.zone === b.zone) reorder(a.line, a.zone, a.index, b.index);
    else moveWidget(a, b.line, b.zone, b.index);
  }

  return (
    <section className="section" aria-labelledby="layout-title">
      <div className="section-head">
        <h2 id="layout-title" className="h2">
          {t.layout.title}
        </h2>
        <p className="hint">{t.layout.hint}</p>
      </div>
      <p id={CHIP_HELP_ID} className="sr-only">
        {t.layout.chipHelp}
      </p>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      <div className="card layout-card">
      <div className="linehead">
        <span />
        <div className="linehead-zones">
          <span>{t.layout.zones.left}</span>
          {withCenter && <span>{t.layout.zones.center}</span>}
          <span>{t.layout.zones.right}</span>
        </div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragging(null);
          setCaret(null);
        }}
      >
        <div className="linelist">
          {config.lines.map((line, i) => (
            <Row key={i} line={line} index={i} total={config.lines.length} withCenter={withCenter} at={at} caret={caret} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{dragging ? <ChipFace widget={dragging.split("#")[0]!} ghost /> : null}</DragOverlay>
      </DndContext>
      {/* Sits in the rows' column, as the next row would: adding a line reads as extending the list. */}
      <div className="linerow">
        <span />
        <button className="addline" onClick={addLine}>
          <Icon name="plus" size={14} />
          {t.layout.addLine}
        </button>
      </div>
      </div>
    </section>
  );
}
