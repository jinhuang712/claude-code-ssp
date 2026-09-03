import { useMemo, useState } from "react";
import { ZH_CATEGORY, nameOf, useStore } from "../store";

const ZONE_LABEL = { left: "左边", center: "中间", right: "右边" } as const;

export function Picker() {
  const { widgets, picker, closePicker, addWidget } = useStore();
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = widgets.filter((w) => !needle || `${w.id} ${w.name} ${nameOf(w, w.id)} ${w.description}`.toLowerCase().includes(needle));
    const map = new Map<string, typeof list>();
    for (const w of list) map.set(w.category, [...(map.get(w.category) ?? []), w]);
    return [...map.entries()];
  }, [widgets, q]);
  if (!picker) return null;
  return (
    <div className="overlay" onClick={closePicker}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="添加到状态栏">
        <div className="sheet-head">
          <input autoFocus className="field" placeholder="搜索名称或说明" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && closePicker()} />
          <span className="hint whitespace-nowrap">
            加到第 {picker.line + 1} 行{ZONE_LABEL[picker.zone]}
          </span>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          {groups.map(([cat, list]) => (
            <div key={cat} className="mb-4">
              <div className="cat-head">{ZH_CATEGORY[cat] ?? cat}</div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {list.map((w) => (
                  <button key={w.id} className="pick" onClick={() => addWidget(picker.line, picker.zone, w.id)}>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{nameOf(w, w.id)}</span>
                      {w.source === "plugin" && <span className="tag">插件</span>}
                    </div>
                    {w.sample && <div className="mono sample truncate">{w.sample}</div>}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && <div className="hint p-4">没有匹配的项目。换个词试试，或清空搜索。</div>}
        </div>
      </div>
    </div>
  );
}
