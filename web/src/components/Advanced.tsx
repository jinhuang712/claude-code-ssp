import { useEffect, useState } from "react";
import { api, type DoctorReport } from "../api";
import { useT } from "../i18n";
import { useStore } from "../store";
import { describeStatusLine } from "../statusline";

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

function Doctor() {
  const t = useT();
  const [r, setR] = useState<DoctorReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api.doctor().then(setR).catch((e) => setErr(String(e)));
  useEffect(() => {
    void load();
  }, []);
  if (err) return <p className="hint">{t.doctor.failed(err)}</p>;
  if (!r) return <p className="hint">{t.doctor.loading}</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="row">
        <span>{t.doctor.title}</span>
        <button className="btn" onClick={() => void load()}>
          {t.doctor.refresh}
        </button>
      </div>
      <div>
        <div className="hint mb-1">{t.doctor.layers}</div>
        {r.layers.map((l) => (
          <div key={l.name} className="mono text-xs flex gap-2">
            <span style={{ color: l.exists ? "var(--fg)" : "var(--muted)" }}>{l.exists ? "✓" : "–"}</span>
            <span className="w-20 shrink-0">{t.doctor.layerNames[l.name] ?? l.name}</span>
            <span className="hint truncate">{l.path ?? t.doctor.builtIn}</span>
            {l.error && <span style={{ color: "var(--danger)" }}>{l.error}</span>}
          </div>
        ))}
      </div>
      <div>
        <div className="hint mb-1">{t.doctor.pluginDirs}</div>
        {r.plugins.dirs.map((d) => (
          <div key={d} className="mono text-xs hint truncate">
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
        {!r.plugins.loaded.length && !r.plugins.errors.length && <div className="hint text-xs">{t.doctor.noPlugins}</div>}
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

export function Advanced() {
  const t = useT();
  const s = useStore();
  const c = s.config!;
  const project = s.layers.find((l) => l.name === "project");
  const [pluginsA, pluginsB] = t.advanced.pluginsHint;
  return (
    <section className="section">
      <button className="disclosure" aria-expanded={s.advanced} onClick={() => s.setAdvanced(!s.advanced)}>
        <i>▸</i>
        {t.advanced.title}
        <span className="hint">{t.advanced.hint}</span>
      </button>
      {s.advanced && (
        <div className="panel">
          <label className="row">
            <span>{t.advanced.separator}</span>
            <input
              className="field mono !w-24"
              value={c.separator}
              onChange={(e) =>
                s.setConfig((x) => {
                  x.separator = e.target.value;
                })
              }
            />
          </label>
          <label className="row">
            <span>
              {t.advanced.rightMargin}
              <span className="hint ml-2">{t.advanced.rightMarginHint}</span>
            </span>
            <input
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
          </label>
          <label className="row">
            <span>{t.advanced.colorMode}</span>
            <select
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
          </label>
          <label className="row">
            <span>
              {t.advanced.capture}
              <span className="hint ml-2">{t.advanced.captureHint("~/.claude/plugins/claude-code-ssp/samples")}</span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={c.captureSamples}
              onChange={(e) =>
                s.setConfig((x) => {
                  x.captureSamples = e.target.checked;
                })
              }
            />
          </label>
          <div className="row">
            <span>
              {t.advanced.saveProject}
              <span className="hint ml-2">{project?.path}</span>
            </span>
            <button className="btn" onClick={() => void s.saveNow("project")}>
              {project?.exists ? t.advanced.overwriteProject : t.advanced.saveAsProject}
            </button>
          </div>
          <Restore />
          <Doctor />
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
        </div>
      )}
    </section>
  );
}
