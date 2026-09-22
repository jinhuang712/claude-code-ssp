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
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { useMemo, useState } from "react";
import { CSS } from "@dnd-kit/utilities";
import type { LineConfig, WidgetInstance, Zone } from "../api";
import { CAT_COLOR } from "../colors";
import { useT, widgetName } from "../i18n";
import { effectiveLabel, emptyStateAt, useStore } from "../store";

/*
  Drag ids must survive a reorder. Positions do not, so a chip is identified by its widget id plus
  its occurrence number across the whole config (`git.branch#0`, `git.branch#1`). Zones get their own
  droppable id so a chip can be dropped into an empty zone.
*/
type Pos = { line: number; zone: Zone; index: number };
const ZONES: Zone[] = ["left", "center", "right"];

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

function Chip({ id, line, zone, index, item }: { id: string; line: number; zone: Zone; index: number; item: WidgetInstance }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const t = useT();
  const s = useStore();
  const manifest = s.widgets.find((w) => w.id === item.widget);
  const selected = s.selection?.line === line && s.selection.zone === zone && s.selection.index === index;
  const cat = CAT_COLOR[manifest?.category ?? "misc"];
  const label = effectiveLabel(item, manifest);
  const empty = emptyStateAt(s.preview, { line, zone, index });
  return (
    <span
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1, ["--cat" as string]: cat }}
      className="chip mono"
      data-selected={selected}
      data-empty={empty ?? undefined}
      title={empty === "filled" ? t.layout.filledTitle : empty === "hidden" ? t.layout.hiddenTitle : undefined}
      {...attributes}
      {...listeners}
    >
      <button className="chip-name" onClick={() => s.select({ line, zone, index })} title={t.layout.editOptions}>
        {label && <span className="chip-label">{label}</span>}
        {widgetName(t, manifest, item.widget)}
        {empty && <span className="chip-empty">{empty === "filled" ? t.layout.sampleTag : t.layout.noDataTag}</span>}
      </button>
      <button
        className="chip-x"
        onClick={(e) => {
          e.stopPropagation();
          s.removeAt({ line, zone, index });
        }}
        aria-label={t.layout.remove}
        title={t.layout.remove}
      >
        ×
      </button>
    </span>
  );
}

function ZoneBox({ line, zone, items, at }: { line: number; zone: Zone; items: WidgetInstance[]; at: Map<string, string> }) {
  const t = useT();
  const openPicker = useStore((s) => s.openPicker);
  const ids = items.map((_, i) => at.get(`${line}:${zone}:${i}`)!);
  const empty = items.length === 0;
  const { setNodeRef, isOver } = useDroppable({ id: zoneId(line, zone) });
  return (
    <SortableContext items={ids} strategy={rectSortingStrategy}>
      <div ref={setNodeRef} className="zone" data-zone={zone} data-empty={empty} data-over={isOver}>
        {items.map((it, i) => (
          <Chip key={ids[i]} id={ids[i]!} line={line} zone={zone} index={i} item={it} />
        ))}
        <button className="addchip" onClick={() => openPicker(line, zone)} aria-label={t.layout.addTo(line + 1, t.layout.zones[zone])}>
          ＋{empty && zone !== "center" && <span>{t.layout.emptyZone[zone]}</span>}
        </button>
      </div>
    </SortableContext>
  );
}

function Row({ line, index, total, withCenter, at }: { line: LineConfig; index: number; total: number; withCenter: boolean; at: Map<string, string> }) {
  const t = useT();
  const s = useStore();
  return (
    <div className="linerow">
      <div className="linerow-gutter">
        <span className="linerow-num mono">{index + 1}</span>
        <div className="linerow-tools">
          <button disabled={index === 0} onClick={() => s.moveLine(index, -1)} title={t.layout.moveUp} aria-label={t.layout.moveUp}>
            ↑
          </button>
          <button disabled={index === total - 1} onClick={() => s.moveLine(index, 1)} title={t.layout.moveDown} aria-label={t.layout.moveDown}>
            ↓
          </button>
          <button onClick={() => s.removeLine(index)} title={t.layout.deleteLine} aria-label={t.layout.deleteLine}>
            ×
          </button>
        </div>
      </div>
      <div className={`linerow-body ${withCenter ? "with-center" : ""}`}>
        <ZoneBox line={index} zone="left" items={line.left ?? []} at={at} />
        {withCenter && <ZoneBox line={index} zone="center" items={line.center ?? []} at={at} />}
        <ZoneBox line={index} zone="right" items={line.right ?? []} at={at} />
      </div>
      {s.advanced && (
        <div className="linerow-adv">
          <label>
            {t.layout.overflow}
            <select
              className="field !w-auto !py-0.5"
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
          <label>
            {t.layout.hideBelow}
            <input
              className="field !w-16 !py-0.5"
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
          </label>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const t = useT();
  const config = useStore((s) => s.config)!;
  const advanced = useStore((s) => s.advanced);
  const reorder = useStore((s) => s.reorder);
  const moveWidget = useStore((s) => s.moveWidget);
  const addLine = useStore((s) => s.addLine);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [dragging, setDragging] = useState<string | null>(null);
  const { ids, at } = useMemo(() => indexChips(config.lines), [config.lines]);
  // One decision for every row, so the three columns line up down the page.
  const withCenter = advanced || config.lines.some((l) => (l.center?.length ?? 0) > 0);

  function onDragStart(e: DragStartEvent) {
    setDragging(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
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
    <section className="section">
      <div className="section-head">
        <h2 className="h2">{t.layout.title}</h2>
        <span className="hint">{t.layout.hint}</span>
      </div>
      <div className="linehead">
        <span />
        <div className={`linehead-zones ${withCenter ? "with-center" : ""}`}>
          <span>{t.layout.zones.left}</span>
          {withCenter && <span>{t.layout.zones.center}</span>}
          <span>{t.layout.zones.right}</span>
        </div>
      </div>
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="linelist">
          {config.lines.map((line, i) => (
            <Row key={i} line={line} index={i} total={config.lines.length} withCenter={withCenter} at={at} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{dragging ? <ChipFace widget={dragging.split("#")[0]!} ghost /> : null}</DragOverlay>
      </DndContext>
      <button className="btn mt-3" onClick={addLine}>
        ＋ {t.layout.addLine}
      </button>
    </section>
  );
}
