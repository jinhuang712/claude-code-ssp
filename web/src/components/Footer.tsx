import { LANGS, useLang, useT, type Lang } from "../i18n";
import { useTheme, type ThemePref } from "../theme";
import { Icon } from "./Icon";

const PREFS: ThemePref[] = ["system", "light", "dark"];

/**
 * Viewer preferences (language, appearance). They live in the footer rather than the header so the
 * header stays about the statusline itself; language is auto-detected, so most people never need it.
 */
export function Footer() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const pref = useTheme((s) => s.pref);
  const setPref = useTheme((s) => s.setPref);
  return (
    <footer className="footer">
      <label className="footer-item">
        <span>{t.header.language}</span>
        {/* Each language is named in itself so it can be found by someone who can't read the current one. */}
        <select className="field field-sm !w-auto" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          {(Object.keys(LANGS) as Lang[]).map((l) => (
            <option key={l} value={l}>
              {LANGS[l].langName}
            </option>
          ))}
        </select>
      </label>
      {/* Three options, all visible: a segmented control (toggle buttons in a named group). */}
      <div className="footer-item" role="group" aria-labelledby="appearance-label">
        <span id="appearance-label">{t.footer.appearance}</span>
        <span className="seg">
          {PREFS.map((p) => (
            <button key={p} type="button" aria-pressed={pref === p} onClick={() => setPref(p)}>
              {t.footer[p]}
            </button>
          ))}
        </span>
      </div>
      <a className="footer-link ml-auto" href="https://github.com/jinhuang712/claude-code-ssp" target="_blank" rel="noreferrer">
        {t.footer.source}
        <Icon name="external" size={13} />
      </a>
    </footer>
  );
}
