import { useT } from "../i18n";
import { isDirty, useStore } from "../store";

export function Header() {
  const t = useT();
  const s = useStore();
  const dirty = isDirty(s);
  const state = s.saving ? "saving" : dirty ? "dirty" : "saved";
  const status = s.saving ? t.header.saving : dirty ? t.header.dirty : t.header.saved;
  const enabled = s.installed === true ? t.header.applied : s.installed === false ? t.header.notApplied : null;
  return (
    <header className="topbar">
      <h1>{t.header.title}</h1>
      <span className="status" data-state={state}>
        {status}
        {enabled && <span> · {enabled}</span>}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button className="btn" disabled={s.past.length === 0} onClick={() => s.undo()} title={s.past.length ? t.header.undoTitle(s.past.length) : t.header.nothingToUndo}>
          {t.header.undo}
          {s.past.length > 1 ? ` ${s.past.length}` : ""}
        </button>
        <button className="btn" onClick={() => void s.resetCounters()} title={t.header.resetCountersTitle}>
          {t.header.resetCounters}
        </button>
        <button className={s.installed === true ? "btn" : "btn btn-primary"} onClick={() => void s.install()} title={s.installed === true ? t.header.reapplyTitle : t.header.applyTitle}>
          {s.installed === true ? t.header.reapply : t.header.apply}
        </button>
      </div>
    </header>
  );
}
