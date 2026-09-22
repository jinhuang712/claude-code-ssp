import type { SampleMeta } from "../api";
import { HTML_LANG, useLang, useT, type Lang } from "../i18n";
import { useStore } from "../store";

/** "3 minutes ago" / "yesterday" in the UI language; the exact time goes in the option's tooltip. */
function relTime(at: number, lang: Lang, now = Date.now()): string {
  const fmt = new Intl.RelativeTimeFormat(HTML_LANG[lang], { numeric: "auto" });
  const s = Math.round((at - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return fmt.format(s, "second");
  if (abs < 3600) return fmt.format(Math.round(s / 60), "minute");
  if (abs < 86400) return fmt.format(Math.round(s / 3600), "hour");
  return fmt.format(Math.round(s / 86400), "day");
}

/**
 * Which data the preview renders: your real sessions grouped by project (one entry per session,
 * newest first — the server dedupes), then the built-in samples under friendly names.
 */
export function SampleSelect() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const samples = useStore((s) => s.samples);
  const sampleId = useStore((s) => s.sampleId);
  const setSample = useStore((s) => s.setSample);

  const byProject = new Map<string, SampleMeta[]>();
  for (const s of samples) {
    if (s.source !== "live") continue;
    const p = s.project ?? t.preview.otherProject;
    byProject.set(p, [...(byProject.get(p) ?? []), s]);
  }
  const fixtures = samples.filter((s) => s.source === "fixture");
  const fixtureName = (s: SampleMeta) => {
    const key = s.id.replace(/^fixture:/, "");
    return t.preview.fixtures[key] ?? key;
  };

  return (
    <select className="field field-sm sample-select" value={sampleId ?? ""} onChange={(e) => void setSample(e.target.value || null)} title={t.preview.sample} aria-label={t.preview.sample}>
      {samples.length === 0 && <option value="">{t.preview.noSamples}</option>}
      {[...byProject.entries()].map(([project, list]) => (
        <optgroup key={project} label={project}>
          {list.map((s) => (
            <option key={s.id} value={s.id} title={s.capturedAt ? new Date(s.capturedAt).toLocaleString(HTML_LANG[lang]) : undefined}>
              {t.preview.sessionOption(project, s.model ?? t.preview.unknownModel, s.capturedAt ? relTime(s.capturedAt, lang) : "—")}
            </option>
          ))}
        </optgroup>
      ))}
      {fixtures.length > 0 && (
        <optgroup label={t.preview.builtInSamples}>
          {fixtures.map((s) => (
            <option key={s.id} value={s.id}>
              {t.preview.fixtureSample(fixtureName(s))}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
