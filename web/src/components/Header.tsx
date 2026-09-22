import { useT, type Messages } from "../i18n";
import { isDirty, useStore } from "../store";
import { describeStatusLine } from "../statusline";

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

export function Header() {
  const t = useT();
  const s = useStore();
  const { state, text } = statusOf(s, t);
  return (
    <>
    <header className="topbar">
      <div className="topbar-id">
        <h1>{t.header.title}</h1>
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
    <ConsentBanner />
    </>
  );
}
