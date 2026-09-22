import { LANGS, useLang, useT, type Lang } from "../i18n";
import { isDirty, useStore } from "../store";

/** Language picker: each option is written in its own language so it can be found by anyone. */
function LangSwitch() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  return (
    <select className="field !w-auto !py-0.5" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t.header.language} title={t.header.language}>
      {(Object.keys(LANGS) as Lang[]).map((l) => (
        <option key={l} value={l}>
          {LANGS[l].langName}
        </option>
      ))}
    </select>
  );
}

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
        <LangSwitch />
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
