import { useT, type Messages } from "../i18n";
import { isDirty, useStore } from "../store";
import { describeStatusLine } from "../statusline";
import { Icon } from "./Icon";

/**
 * Asked before this configurator replaces another tool's statusLine. Nothing is overwritten until
 * "Replace it" — the old entry is parked and can be restored from Advanced settings.
 */
function ConsentBanner() {
  const t = useT();
  const consent = useStore((s) => s.consent);
  const install = useStore((s) => s.install);
  const dismiss = useStore((s) => s.dismissConsent);
  if (!consent) return null;
  const cmd = describeStatusLine(consent.current);
  return (
    <div className="banner" role="alertdialog" aria-labelledby="consent-title" aria-describedby="consent-body">
      <div className="min-w-0">
        <strong id="consent-title">{t.consent.title}</strong>
        <p id="consent-body" className="hint">
          {t.consent.body}
        </p>
        <code className="mono banner-code" title={cmd.full}>
          {cmd.short}
        </code>
      </div>
      <div className="banner-actions">
        <button className="btn btn-primary" onClick={() => void install(true)}>
          {t.consent.replace}
        </button>
        <button className="btn" onClick={dismiss}>
          {t.consent.notNow}
        </button>
      </div>
    </div>
  );
}

type StatusState = "error" | "saving" | "dirty" | "defaults" | "live" | "unapplied" | "saved";

/**
 * One short, true sentence about where the config stands. Order matters: a failure outranks
 * everything, and "nothing saved yet" must not read as "Saved" on a first visit.
 */
function statusOf(s: ReturnType<typeof useStore.getState>, t: Messages): { state: StatusState; text: string } {
  if (s.saveError) return { state: "error", text: t.header.saveFailed };
  if (s.saving) return { state: "saving", text: t.header.saving };
  if (isDirty(s)) return { state: "dirty", text: t.header.dirty };
  const hasFile = s.layers.some((l) => l.name !== "defaults" && l.exists);
  if (!hasFile) return { state: "defaults", text: t.header.defaults };
  if (s.installed === true) return { state: "live", text: t.header.savedLive };
  if (s.installed === false) return { state: "unapplied", text: t.header.savedNotApplied };
  return { state: "saved", text: t.header.saved };
}

/** Where edits are written. Hidden until the previewed project has its own config file. */
function ScopeSelect() {
  const t = useT();
  const scope = useStore((s) => s.scope);
  const setScope = useStore((s) => s.setScope);
  const project = useStore((s) => s.layers.find((l) => l.name === "project"));
  const projectName = useStore((s) => (s.projectCwd ?? project?.path ?? "").split(/[\\/]/).filter(Boolean).slice(-1)[0] ?? "");
  if (!project?.exists && scope !== "project") return null;
  return (
    <label className="scope">
      <span>{t.header.scope}</span>
      <select className="field field-sm !w-auto" value={scope} onChange={(e) => setScope(e.target.value as "user" | "project")} title={scope === "project" ? (project?.path ?? "") : undefined}>
        <option value="user">{t.header.scopeUser}</option>
        <option value="project">{t.header.scopeProject(projectName)}</option>
      </select>
    </label>
  );
}

export function Header() {
  const t = useT();
  const s = useStore();
  const { state, text } = statusOf(s, t);
  return (
    <>
    <header className="topbar">
      <div className="topbar-id">
        {/* ✻ is Claude Code's own mark (its welcome box and spinner); decorative, the h1 names the page. */}
        <span className="brand-mark" aria-hidden="true">
          ✻
        </span>
        <h1 className="serif">{t.header.title}</h1>
        {s.sandbox && (
          <span className="tag tag-warn" title={t.header.sandboxTitle}>
            {t.header.sandbox}
          </span>
        )}
        {/* Polite live region: screen readers hear "Saving… / Saved" without focus moving. */}
        <span className="status" data-state={state} role="status" title={s.saveError ? `${t.header.saveFailed}: ${s.saveError}` : t.header.statusDetail}>
          <span className="status-text">{text}</span>
          {state === "error" && (
            <button className="linklike" onClick={() => void s.saveNow()}>
              {t.header.retry}
            </button>
          )}
        </span>
      </div>
      <div className="topbar-actions">
        <ScopeSelect />
        <button className="btn btn-ghost" disabled={s.past.length === 0} onClick={() => s.undo()} title={s.past.length ? t.header.undoTitle(s.past.length) : t.header.nothingToUndo}>
          <Icon name="undo" />
          {t.header.undo}
          {s.past.length > 1 && <span className="count">{s.past.length}</span>}
        </button>
        <button className="btn btn-ghost" onClick={() => void s.resetCounters()} title={t.header.resetCountersTitle}>
          <Icon name="reset" />
          {t.header.resetCounters}
        </button>
        <button className={s.installed === true ? "btn" : "btn btn-primary"} onClick={() => void s.install()} title={s.installed === true ? t.header.reapplyTitle : t.header.applyTitle}>
          {s.installed === true ? t.header.reapply : t.header.apply}
        </button>
      </div>
    </header>
    <ConsentBanner />
    </>
  );
}
