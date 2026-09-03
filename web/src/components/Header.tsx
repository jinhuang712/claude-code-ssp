import { isDirty, useStore } from "../store";

export function Header() {
  const s = useStore();
  const dirty = isDirty(s);
  const state = s.saving ? "saving" : dirty ? "dirty" : "saved";
  const status = s.saving ? "保存中" : dirty ? "有改动，稍后自动保存" : "已自动保存";
  const enabled = s.installed === true ? "已应用到 Claude Code" : s.installed === false ? "还没应用到 Claude Code" : null;
  return (
    <header className="topbar">
      <h1>Claude Code 状态栏</h1>
      <span className="status" data-state={state}>
        {status}
        {enabled && <span> · {enabled}</span>}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button className="btn btn-primary" onClick={() => void s.install()}>
          {s.installed ? "重新应用到 Claude Code" : "应用到 Claude Code"}
        </button>
      </div>
    </header>
  );
}
