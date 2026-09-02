import { isDirty, useStore } from "../store";

export function Header() {
  const s = useStore();
  const dirty = isDirty(s);
  const status = s.saving ? "保存中…" : dirty ? "未保存" : "已自动保存";
  return (
    <header className="flex items-center gap-4 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Claude Code 状态栏</h1>
        <p className="mt-0.5 text-sm opacity-60">
          {s.installed === true ? "已启用 · " : s.installed === false ? "尚未启用 · " : ""}
          {status}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button className="btn btn-primary !px-4 !py-2 !text-sm" onClick={() => void s.install()}>
          {s.installed ? "重新应用到 Claude Code" : "应用到 Claude Code"}
        </button>
      </div>
    </header>
  );
}
