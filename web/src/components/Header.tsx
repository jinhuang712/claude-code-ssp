import { isDirty, useStore } from "../store";

export function Header() {
  const s = useStore();
  const dirty = isDirty(s);
  const state = s.saving ? "saving" : dirty ? "dirty" : "saved";
  const status = s.saving ? "保存中" : dirty ? "有改动，正在自动保存" : "已保存 · Claude Code 下次刷新即生效";
  const enabled = s.installed === true ? "已应用 · 改动自动生效" : s.installed === false ? "首次改动会自动应用" : null;
  return (
    <header className="topbar">
      <h1>Claude Code 状态栏</h1>
      <span className="status" data-state={state}>
        {status}
        {enabled && <span> · {enabled}</span>}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          className="btn"
          disabled={s.past.length === 0}
          onClick={() => s.undo()}
          title={s.past.length ? `撤销上一步（还可撤销 ${s.past.length} 步），快捷键 Ctrl/⌘+Z` : "没有可撤销的改动"}
        >
          撤销{s.past.length > 1 ? ` ${s.past.length}` : ""}
        </button>
        <button className="btn" onClick={() => void s.resetCounters()} title="费用 / Tokens / API 次数 / 改动行数从现在起重新累计，只影响当前会话">
          重置计数
        </button>
        <button
          className={s.installed === true ? "btn" : "btn btn-primary"}
          onClick={() => void s.install()}
          title={s.installed === true ? "一般不需要点：每次保存会自动应用。这里只在 settings.json 被外部改坏时用来修复" : "把状态栏接到 Claude Code（只需一次，之后每次改动自动生效）"}
        >
          {s.installed === true ? "重新应用" : "应用到 Claude Code"}
        </button>
      </div>
    </header>
  );
}
