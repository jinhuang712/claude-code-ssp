import { LANGS, useLang, useT, type Lang } from "../i18n";
import { useTheme, type ThemePref } from "../theme";

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
        <select className="field !w-auto !py-0.5" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          {(Object.keys(LANGS) as Lang[]).map((l) => (
            <option key={l} value={l}>
              {LANGS[l].langName}
            </option>
          ))}
        </select>
      </label>
      <label className="footer-item">
        <span>{t.footer.appearance}</span>
        <select className="field !w-auto !py-0.5" value={pref} onChange={(e) => setPref(e.target.value as ThemePref)}>
          <option value="system">{t.footer.system}</option>
          <option value="light">{t.footer.light}</option>
          <option value="dark">{t.footer.dark}</option>
        </select>
      </label>
      <a className="footer-link ml-auto" href="https://github.com/jinhuang712/claude-code-ssp" target="_blank" rel="noreferrer">
        {t.footer.source} ↗
      </a>
    </footer>
  );
}
