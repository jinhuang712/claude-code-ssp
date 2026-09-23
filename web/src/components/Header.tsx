import { useId, useState } from "react";
import { LANGS, useLang, useT, type Lang, type Messages } from "../i18n";
import { isDirty, useStore } from "../store";
import { describeStatusLine } from "../statusline";
import { useTheme, type ThemePref } from "../theme";
import { Diagnostics } from "./Diagnostics";
import { Icon } from "./Icon";
import { Popover } from "./Popover";

/**
 * Asked before this configurator replaces another tool's statusLine. Nothing is overwritten until
 * "Replace it" — the old entry is parked and can be restored from the header's ⋯ menu.
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

/**
 * "Stop using this statusline", in two steps: the first click says what will happen (which command
 * comes back, or that ours is simply removed) and only the second one acts. A menu item is too easy
 * to hit by accident for something that changes settings.json.
 */
function RestoreItem({ close }: { close: () => void }) {
  const t = useT();
  const plan = useStore((s) => s.installPlan);
  const uninstall = useStore((s) => s.uninstall);
  const [confirming, setConfirming] = useState(false);
  const prev = plan?.savedPrevious ? describeStatusLine(plan.savedPrevious) : null;
  if (!confirming) {
    return (
      <button className="menu-item menu-danger" onClick={() => setConfirming(true)}>
        {t.restore.title}
      </button>
    );
  }
  return (
    <div className="menu-confirm" role="group" aria-label={t.restore.title}>
      <span className="hint">{prev ? t.restore.previous : t.restore.none}</span>
      {prev && (
        <code className="mono banner-code" title={prev.full}>
          {prev.short}
        </code>
      )}
      <div className="flex gap-2">
        <button
          className="btn btn-danger"
          autoFocus
          onClick={() => {
            close();
            void uninstall();
          }}
        >
          {prev ? t.restore.restoreButton : t.restore.removeButton}
        </button>
        <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
          {t.restore.cancel}
        </button>
      </div>
    </div>
  );
}

/** The header's ⋯ menu: actions that matter rarely (repairs, the way out, debugging), off the main surface. */
function HeaderMenu({ close, openDiagnostics }: { close: () => void; openDiagnostics: () => void }) {
  const t = useT();
  const s = useStore();
  const project = s.layers.find((l) => l.name === "project");
  // Each action closes the menu first, so focus returns to ⋯ before a toast or dialog appears.
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  return (
    <div className="menu">
      {s.installed === true && (
        <button className="menu-item" onClick={run(() => void s.install())} title={t.header.reapplyTitle}>
          {t.header.reapply}
        </button>
      )}
      <button className="menu-item" onClick={run(() => void s.resetCounters())} title={t.header.resetCountersTitle}>
        {t.header.resetCounters}
        <span className="hint">{t.header.resetCountersHint}</span>
      </button>
      <button className="menu-item" onClick={run(() => void s.saveAsProject())} title={project?.path ?? undefined}>
        {project?.exists ? t.header.overwriteProject : t.header.saveAsProject}
        {/* The file name is the same in every language (it is a path), so it isn't a locale string. */}
        <span className="hint mono">.claude/claude-code-ssp.json</span>
      </button>
      <button className="menu-item" onClick={run(openDiagnostics)}>
        {t.doctor.title}
      </button>
      {s.installed === true && <RestoreItem close={close} />}
      <ViewerPrefs />
      <a className="menu-item menu-link" href="https://github.com/jinhuang712/claude-code-ssp" target="_blank" rel="noreferrer">
        <span className="inline-flex items-center gap-1.5">
          {t.prefs.source}
          <Icon name="external" size={13} />
        </span>
      </a>
    </div>
  );
}

const APPEARANCE: ThemePref[] = ["system", "light", "dark"];

/**
 * Viewer preferences (language, panel appearance): per browser, never written to the config. They
 * used to fill a footer of their own; language is auto-detected and appearance follows the system,
 * so most people never touch either — the menu is enough.
 */
function ViewerPrefs() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const pref = useTheme((s) => s.pref);
  const setPref = useTheme((s) => s.setPref);
  const langId = useId();
  const appearanceId = useId();
  return (
    <div className="menu-prefs">
      <div className="menu-field">
        <label htmlFor={langId}>{t.header.language}</label>
        {/* Each language is named in itself so it can be found by someone who can't read the current one. */}
        <select id={langId} className="field field-sm !w-auto" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          {(Object.keys(LANGS) as Lang[]).map((l) => (
            <option key={l} value={l}>
              {LANGS[l].langName}
            </option>
          ))}
        </select>
      </div>
      {/* Three options, all visible: a segmented control (toggle buttons in a named group). */}
      <div className="menu-field" role="group" aria-labelledby={appearanceId}>
        <span id={appearanceId}>{t.prefs.appearance}</span>
        <span className="seg">
          {APPEARANCE.map((p) => (
            <button key={p} type="button" aria-pressed={pref === p} onClick={() => setPref(p)}>
              {t.prefs[p]}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}

export function Header() {
  const t = useT();
  const s = useStore();
  const [diagnostics, setDiagnostics] = useState(false);
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
        {/* Applying is the one step a first-time user must take, so it stays visible until done; afterwards "Re-apply" is a repair tool and lives in the menu. */}
        {s.installed !== true && (
          <button className="btn btn-primary" onClick={() => void s.install()} title={t.header.applyTitle}>
            {t.header.apply}
          </button>
        )}
        <Popover label={t.header.more} buttonClassName="btn btn-ghost btn-icon" buttonContent={<Icon name="more" />} align="end">
          {(close) => <HeaderMenu close={close} openDiagnostics={() => setDiagnostics(true)} />}
        </Popover>
      </div>
    </header>
    <ConsentBanner />
    {diagnostics && <Diagnostics onClose={() => setDiagnostics(false)} />}
    </>
  );
}
