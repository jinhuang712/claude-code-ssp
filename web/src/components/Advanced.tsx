import { useEffect, useId, useState } from "react";
import { api, type DoctorReport } from "../api";
import { useT } from "../i18n";
import { describeStatusLine } from "../statusline";
import { useStore } from "../store";

/** The way out: put back whatever this configurator replaced (or remove it when there was nothing). */
function Restore() {
  const t = useT();
  const installed = useStore((s) => s.installed);
  const plan = useStore((s) => s.installPlan);
  const uninstall = useStore((s) => s.uninstall);
  if (installed !== true) return null;
  const prev = plan?.savedPrevious ? describeStatusLine(plan.savedPrevious) : null;
  return (
    <div className="row row-top">
      <span className="min-w-0">
        {t.restore.title}
        <span className="hint block">{prev ? t.restore.previous : t.restore.none}</span>
        {prev && (
          <code className="mono banner-code" title={prev.full}>
            {prev.short}
          </code>
        )}
      </span>
      <button className="btn btn-danger" onClick={() => void uninstall()}>
        {prev ? t.restore.restoreButton : t.restore.removeButton}
      </button>
    </div>
  );
}

/** A skipped project widget folder `<root>/.claude/claude-code-ssp/widgets` → its project root. */
function projectRootOf(dir: string): string {
  return dir.replace(/[\\/]\.claude[\\/]claude-code-ssp[\\/]widgets[\\/]?$/, "");
}

function DoctorReportView() {
  const t = useT();
  const cwd = useStore((s) => s.projectCwd);
  const trustProject = useStore((s) => s.trustProject);
  const [r, setR] = useState<DoctorReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api.doctor(cwd).then(setR).catch((e) => setErr(String(e)));
  useEffect(() => {
    void load();
    // Reload when the previewed project changes: layers and skipped widgets are per project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);
  if (err) return <p className="hint">{t.doctor.failed(err)}</p>;
  if (!r) return <p className="hint">{t.doctor.loading}</p>;
  const skipped = r.plugins.skipped ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="row">
        <span>{t.doctor.layers}</span>
        <button className="btn" onClick={() => void load()}>
          {t.doctor.refresh}
        </button>
      </div>
      <div>
        {r.layers.map((l) => (
          <div key={l.name} className="mono text-xs flex gap-2">
            <span style={{ color: l.exists ? "var(--fg)" : "var(--muted)" }}>{l.exists ? "✓" : "–"}</span>
            <span className="w-20 shrink-0">{t.doctor.layerNames[l.name] ?? l.name}</span>
            <span className="hint truncate" title={l.path ?? undefined}>
              {l.path ?? t.doctor.builtIn}
            </span>
            {l.error && <span style={{ color: "var(--danger)" }}>{l.error}</span>}
          </div>
        ))}
      </div>
      <div>
        <div className="hint mb-1">{t.doctor.pluginDirs}</div>
        {r.plugins.dirs.map((d) => (
          <div key={d} className="mono text-xs hint truncate" title={d}>
            {d}
          </div>
        ))}
        {r.plugins.loaded.map((p) => (
          <div key={p.file} className="mono text-xs">
            ✓ {p.file} → {p.ids.join(", ")}
          </div>
        ))}
        {r.plugins.errors.map((e) => (
          <div key={e.file} className="mono text-xs" style={{ color: "var(--danger)" }}>
            ✗ {e.file}: {e.message}
          </div>
        ))}
        {skipped.map((sk) => (
          <div key={sk.dir} className="skipped">
            <div className="mono text-xs">
              <span style={{ color: "var(--warn)" }}>
                ⊘ {t.doctor.skipped}: {sk.dir}
              </span>{" "}
              <span className="hint">({sk.reason})</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn" onClick={() => void trustProject(projectRootOf(sk.dir)).then(load)}>
                {t.doctor.trust}
              </button>
              <span className="hint">{t.doctor.trustHint}</span>
            </div>
          </div>
        ))}
        {!r.plugins.loaded.length && !r.plugins.errors.length && !skipped.length && <div className="hint text-xs">{t.doctor.noPlugins}</div>}
      </div>
      <details className="text-xs">
        <summary className="hint cursor-pointer">{t.doctor.statusLine(r.settings.path)}</summary>
        <pre className="mono mt-1 max-h-40 overflow-auto p-2 text-xs" style={{ background: "var(--bg-deep)", borderRadius: "var(--r-1)" }}>
          {r.settings.error ?? JSON.stringify(r.settings.statusLine, null, 2)}
        </pre>
      </details>
      <details className="text-xs">
        <summary className="hint cursor-pointer">{t.doctor.lastStdin(r.lastPayload?.capturedAt ? new Date(r.lastPayload.capturedAt).toLocaleTimeString() : "")}</summary>
        <pre className="mono mt-1 max-h-72 overflow-auto p-2 text-xs" style={{ background: "var(--bg-deep)", borderRadius: "var(--r-1)" }}>
          {r.lastPayload ? JSON.stringify(r.lastPayload.payload, null, 2) : t.doctor.notCaptured}
        </pre>
      </details>
    </div>
  );
}

/** A collapsible page section whose open state is remembered per browser. */
function Disclosure({ storageKey, title, hint, children }: { storageKey: string; title: string; hint: string; children: React.ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(storageKey, open ? "0" : "1");
    } catch {
      /* not remembered */
    }
  };
  return (
    <section className="section">
      <button className="disclosure" aria-expanded={open} aria-controls={id} onClick={toggle}>
        <i aria-hidden="true">▸</i>
        {title}
        <span className="hint">{hint}</span>
      </button>
      {open && (
        <div id={id} className="panel">
          {children}
        </div>
      )}
    </section>
  );
}

/** Settings most people never need: margins, colour depth, snapshots, project files, the way out. */
export function Advanced() {
  const t = useT();
  const s = useStore();
  const c = s.config!;
  const project = s.layers.find((l) => l.name === "project");
  const marginId = useId();
  const colorId = useId();
  const captureId = useId();
  return (
    <Disclosure storageKey="ssp.advanced" title={t.advanced.title} hint={t.advanced.hint}>
      <div className="row">
        <label htmlFor={marginId}>
          {t.advanced.rightMargin}
          <span className="hint ml-2">{t.advanced.rightMarginHint}</span>
        </label>
        <input
          id={marginId}
          className="field !w-20"
          type="number"
          min={0}
          max={20}
          value={c.columnsOffset}
          onChange={(e) =>
            s.setConfig((x) => {
              x.columnsOffset = Number(e.target.value);
            })
          }
        />
      </div>
      <div className="row">
        <label htmlFor={colorId}>{t.advanced.colorMode}</label>
        <select
          id={colorId}
          className="field !w-auto"
          value={c.colorLevel}
          onChange={(e) =>
            s.setConfig((x) => {
              x.colorLevel = e.target.value as typeof x.colorLevel;
            })
          }
        >
          {(["auto", "truecolor", "256", "16", "none"] as const).map((lv) => (
            <option key={lv} value={lv}>
              {t.advanced.colorLevels[lv]}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label htmlFor={captureId}>
          {t.advanced.capture}
          <span className="hint ml-2">{t.advanced.captureHint(s.paths?.samples ?? "~/.claude/plugins/claude-code-ssp/samples")}</span>
        </label>
        <input
          id={captureId}
          type="checkbox"
          className="h-4 w-4"
          checked={c.captureSamples}
          onChange={(e) =>
            s.setConfig((x) => {
              x.captureSamples = e.target.checked;
            })
          }
        />
      </div>
      <div className="row">
        <span className="min-w-0">
          {t.advanced.saveProject}
          <span className="hint block truncate" title={project?.path ?? undefined}>
            {project?.path}
          </span>
        </span>
        <button className="btn" onClick={() => void s.saveAsProject()}>
          {project?.exists ? t.advanced.overwriteProject : t.advanced.saveAsProject}
        </button>
      </div>
      <Restore />
    </Disclosure>
  );
}

/** Where every setting came from, which custom widgets loaded (or were refused), and raw inputs. */
export function Diagnostics() {
  const t = useT();
  const c = useStore((s) => s.config!);
  const [pluginsA, pluginsB] = t.advanced.pluginsHint;
  return (
    <Disclosure storageKey="ssp.diagnostics" title={t.doctor.section} hint={t.doctor.sectionHint}>
      <DoctorReportView />
      <details className="text-xs">
        <summary className="hint cursor-pointer">{t.advanced.configJson}</summary>
        <pre className="mono mt-1 max-h-64 overflow-auto p-2 text-xs" style={{ background: "var(--bg-deep)", borderRadius: "var(--r-1)" }}>
          {JSON.stringify(c, null, 2)}
        </pre>
      </details>
      <p className="hint">
        {pluginsA}
        <code className="mono">~/.config/claude-code-ssp/widgets/</code>
        {pluginsB}
      </p>
    </Disclosure>
  );
}
