import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LineConfig, WidgetInstance, Zone } from "../api";
import { nameOf, useStore } from "../store";

const CAT_COLOR: Record<string, string> = {
  model: "#7aa2f7",
  project: "#e0af68",
  git: "#bb9af7",
  context: "#9ece6a",
  usage: "#7dcfff",
  cost: "#f7768e",
  session: "#c0caf5",
  activity: "#ff9e64",
  environment: "#73daca",
  misc: "#9aa5ce",
};

function chipId(line: number, zone: Zone, index: number): string {
  return `${line}:${zone}:${index}`;
}
function parseId(id: string) {
  const [l, z, i] = id.split(":");
  return { line: Number(l), zone: z as Zone, index: Number(i) };
}

function Chip({ line, zone, index, item }: { line: number; zone: Zone; index: number; item: WidgetInstance }) {
  const id = chipId(line, zone, index);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const s = useStore();
  const manifest = s.widgets.find((w) => w.id === item.widget);
  const selected = s.selection?.line === line && s.selection.zone === zone && s.selection.index === index;
  return (
    <span
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="chip group"
      data-selected={selected}
      {...attributes}
      {...listeners}
    >
      <i className="dot" style={{ background: CAT_COLOR[manifest?.category ?? "misc"] }} />
      <button className="chip-name" onClick={() => s.select({ line, zone, index })} title="点击修改">
        {nameOf(manifest, item.widget)}
      </button>
      <button
        className="chip-x"
        onClick={(e) => {
          e.stopPropagation();
          s.removeAt({ line, zone, index });
        }}
        title="移除"
      >
        ×
      </button>
    </span>
  );
}

function ZoneBox({ line, zone, items }: { line: number; zone: Zone; items: WidgetInstance[] }) {
  const openPicker = useStore((s) => s.openPicker);
  const ids = items.map((_, i) => chipId(line, zone, i));
  const empty = items.length === 0;
  return (
    <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
      <div className="zone" data-zone={zone} data-empty={empty}>
        {items.map((it, i) => (
          <Chip key={ids[i]} line={line} zone={zone} index={i} item={it} />
        ))}
        <button className="addchip" onClick={() => openPicker(line, zone)} title="添加">
          {empty ? (zone === "left" ? "＋ 左边放什么" : zone === "right" ? "＋ 右边放什么" : "＋") : "＋"}
        </button>
      </div>
    </SortableContext>
  );
}

function Row({ line, index, total }: { line: LineConfig; index: number; total: number }) {
  const s = useStore();
  const showCenter = s.advanced || (line.center?.length ?? 0) > 0;
  return (
    <div className="linerow group/row">
      <div className="linerow-gutter">
        <span className="linerow-num">{index + 1}</span>
        <div className="linerow-tools">
          <button disabled={index === 0} onClick={() => s.moveLine(index, -1)} title="上移">
            ↑
          </button>
          <button disabled={index === total - 1} onClick={() => s.moveLine(index, 1)} title="下移">
            ↓
          </button>
          <button onClick={() => s.removeLine(index)} title="删除这一行">
            ×
          </button>
        </div>
      </div>
      <div className={`linerow-body ${showCenter ? "with-center" : ""}`}>
        <ZoneBox line={index} zone="left" items={line.left ?? []} />
        {showCenter && <ZoneBox line={index} zone="center" items={line.center ?? []} />}
        <ZoneBox line={index} zone="right" items={line.right ?? []} />
      </div>
      {s.advanced && (
        <div className="linerow-adv">
          <label>
            放不下时
            <select
              className="field !w-auto !py-0.5"
              value={line.overflow ?? "wrap"}
              onChange={(e) =>
                s.setConfig((c) => {
                  c.lines[index]!.overflow = e.target.value as LineConfig["overflow"];
                })
              }
            >
              <option value="wrap">右侧另起一行</option>
              <option value="truncate">截断</option>
              <option value="drop-right">隐藏右侧</option>
            </select>
          </label>
          <label>
            窄于
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
            列时隐藏整行
          </label>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const config = useStore((s) => s.config)!;
  const reorder = useStore((s) => s.reorder);
  const moveWidget = useStore((s) => s.moveWidget);
  const addLine = useStore((s) => s.addLine);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const a = parseId(String(e.active.id));
    const b = parseId(String(e.over.id));
    if (a.line === b.line && a.zone === b.zone) reorder(a.line, a.zone, a.index, b.index);
    else moveWidget(a, b.line, b.zone, b.index);
  }

  return (
    <section className="section">
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="h2 !mb-0">布局</h2>
        <span className="text-xs opacity-40">每一行对应状态栏的一行。点名字修改，拖动排序。</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="linelist">
          {config.lines.map((line, i) => (
            <Row key={i} line={line} index={i} total={config.lines.length} />
          ))}
        </div>
      </DndContext>
      <button className="btn mt-3" onClick={addLine}>
        ＋ 加一行
      </button>
    </section>
  );
}
