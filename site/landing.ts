/**
 * The welcome page's own behaviour (the configurator it embeds is separate: site/demo/entry.ts).
 *
 * - Language (EN / 中文) and appearance (system / light / dark), with the configurator's own
 *   switches and rules: the same localStorage keys, the same resolution, <html lang> and
 *   <html data-theme>. Once the configurator is mounted, `connectApp` joins the two so either one's
 *   switches change both — the page and the app are one surface.
 * - The hero terminal's rows are sized so the widest fills the terminal: CSS can only guess a
 *   monospace cell's width, and a right-aligned zone that stops short of the edge reads wrong.
 * - The recording shown (and its poster) is the one matching the page's scheme.
 * - Copy buttons.
 */
import { COPY_LABELS, ZH } from "./i18n";

export type Lang = "en" | "zh";
export type ThemePref = "system" | "light" | "dark";

// The configurator's keys (web/src/i18n/index.ts, web/src/theme.ts): one saved choice for both.
const LANG_KEY = "ssp.lang";
const THEME_KEY = "ssp.theme";

// localStorage can throw (blocked storage, private mode): the choice then just isn't remembered.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* applies for this page view only */
  }
}

/** The configurator's detectLang(): a saved choice, then the browser's languages (zh* → 中文), then English. */
function detectLang(): Lang {
  const saved = read(LANG_KEY);
  if (saved === "en" || saved === "zh") return saved;
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const p of prefs) {
    const base = p?.toLowerCase().split("-")[0];
    if (base === "zh" || base === "en") return base;
  }
  return "en";
}

const systemLight = matchMedia("(prefers-color-scheme: light)");
let lang: Lang = detectLang();
let themePref: ThemePref = ((p) => (p === "light" || p === "dark" ? p : "system"))(read(THEME_KEY));

/** The configurator's stores, once it is mounted (see connectApp). */
let app: { setLang(l: Lang): void; setTheme(p: ThemePref): void } | null = null;

// ---- language

const EN_TITLE = document.title;
/** Attributes that are translated too: the marker holding the key, and where the English is kept. */
const TRANSLATED_ATTRS = [
  { marker: "data-i18n-aria", key: "i18nAria", attr: "aria-label", keep: "enAria" },
  { marker: "data-i18n-title", key: "i18nTitle", attr: "title", keep: "enTitle" },
] as const;

/** Swap every translated string to `next`; the English comes back from what the markup held. */
function applyLang(next: Lang): void {
  lang = next;
  const zh = next === "zh";
  document.documentElement.lang = zh ? "zh-CN" : "en";
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    el.dataset.en ??= el.innerHTML;
    el.innerHTML = zh ? (ZH[el.dataset.i18n!] ?? el.dataset.en) : el.dataset.en;
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-zh]")) {
    el.dataset.en ??= el.innerHTML;
    el.innerHTML = zh ? el.dataset.zh! : el.dataset.en;
  }
  for (const a of TRANSLATED_ATTRS) {
    for (const el of document.querySelectorAll<HTMLElement>(`[${a.marker}]`)) {
      el.dataset[a.keep] ??= el.getAttribute(a.attr) ?? "";
      el.setAttribute(a.attr, zh ? (ZH[el.dataset[a.key]!] ?? el.dataset[a.keep]!) : el.dataset[a.keep]!);
    }
  }
  document.title = zh ? ZH["doc.title"]! : EN_TITLE;
  for (const btn of document.querySelectorAll<HTMLButtonElement>("button[data-copy]")) btn.textContent = COPY_LABELS[next].copy;
  for (const btn of document.querySelectorAll<HTMLButtonElement>("button[data-lang]")) btn.setAttribute("aria-pressed", String(btn.dataset.lang === next));
  // Chinese and English set the hero at different widths.
  fitTerminal();
}

function chooseLang(next: Lang): void {
  write(LANG_KEY, next);
  applyLang(next);
  app?.setLang(next);
}

// ---- appearance

function applyTheme(pref: ThemePref): void {
  themePref = pref;
  const light = pref === "light" || (pref === "system" && systemLight.matches);
  document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
  for (const btn of document.querySelectorAll<HTMLButtonElement>("button[data-theme-pref]")) btn.setAttribute("aria-pressed", String(btn.dataset.themePref === pref));
}

function chooseTheme(pref: ThemePref): void {
  write(THEME_KEY, pref);
  applyTheme(pref);
  app?.setTheme(pref);
}

/**
 * Join the page's switches to the configurator's stores (called by site/demo/entry.ts once the app
 * has loaded): the page's clicks go to the app, and the app's own switches come back to the page.
 * Both sides write the same keys and resolve the scheme the same way, so the round trip settles.
 */
export function connectApp(bridge: {
  setLang(l: Lang): void;
  setTheme(p: ThemePref): void;
  onLang(cb: (l: Lang) => void): void;
  onTheme(cb: (p: ThemePref) => void): void;
}): void {
  app = bridge;
  bridge.onLang((l) => l !== lang && applyLang(l));
  bridge.onTheme((p) => p !== themePref && applyTheme(p));
}

// ---- hero terminal

/** Row size bounds in px: below 11 the terminal scrolls sideways instead (rows never wrap). */
const TERM_MIN_PX = 11;
const TERM_MAX_PX = 18;

function fitTerminal(): void {
  for (const body of document.querySelectorAll<HTMLElement>(".lp-term-body")) {
    body.style.removeProperty("--lp-term-fs");
    const rows = [...body.querySelectorAll<HTMLElement>(".lp-row")];
    const widest = Math.max(0, ...rows.map((r) => r.getBoundingClientRect().width));
    if (!(widest > 0)) continue;
    const style = getComputedStyle(body);
    const avail = body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const current = parseFloat(getComputedStyle(rows[0]!).fontSize);
    // Floor to a tenth of a pixel: rounding up could tip a full row into a scrollbar.
    const size = Math.min(TERM_MAX_PX, Math.max(TERM_MIN_PX, Math.floor(((current * avail) / widest) * 10) / 10));
    body.style.setProperty("--lp-term-fs", `${size}px`);
  }
}

// ---- recording

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

/** Point each recording at the file for the current scheme; keep its place when the scheme flips. */
function syncVideos(): void {
  const light = document.documentElement.getAttribute("data-theme") === "light";
  for (const video of document.querySelectorAll<HTMLVideoElement>(".lp-video video")) {
    const want = video.dataset[light ? "light" : "dark"];
    if (!want || video.getAttribute("src") === want) continue;
    const at = video.currentTime;
    // The poster is what shows before playback — and all that shows under reduced motion.
    const poster = video.dataset[light ? "lightPoster" : "darkPoster"];
    if (poster) video.poster = poster;
    video.setAttribute("src", want);
    video.currentTime = at;
    if (reducedMotion.matches) {
      // No autoplay under reduced motion: the viewer starts it from the controls.
      video.removeAttribute("autoplay");
      video.controls = true;
    } else {
      // play() rejects when the browser blocks autoplay; the first frame still shows.
      void video.play().catch(() => {});
    }
  }
}

// ---- copy buttons

function wireCopyButtons(): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>("button[data-copy]")) {
    btn.addEventListener("click", async () => {
      const source = document.getElementById(btn.dataset.copy ?? "");
      if (!source) return;
      // The "$ " prompts are presentation (aria-hidden, unselectable); copy just the commands.
      const text = [...source.childNodes]
        .filter((n) => !(n instanceof HTMLElement && n.classList.contains("lp-dollar")))
        .map((n) => n.textContent)
        .join("");
      const labels = COPY_LABELS[lang];
      try {
        await navigator.clipboard.writeText(text.trim());
        btn.textContent = labels.copied;
      } catch {
        // Clipboard refused (insecure context, permissions): select it for a manual copy instead.
        getSelection()?.selectAllChildren(source);
        btn.textContent = labels.selected;
      }
      setTimeout(() => (btn.textContent = COPY_LABELS[lang].copy), 1600);
    });
  }
}

// ---- start

for (const btn of document.querySelectorAll<HTMLButtonElement>("button[data-lang]")) btn.addEventListener("click", () => chooseLang(btn.dataset.lang as Lang));
for (const btn of document.querySelectorAll<HTMLButtonElement>("button[data-theme-pref]")) btn.addEventListener("click", () => chooseTheme(btn.dataset.themePref as ThemePref));
// Follow the system live while the choice is "system" (the configurator does the same).
systemLight.addEventListener("change", () => themePref === "system" && applyTheme("system"));
applyTheme(themePref);
if (lang !== "en") applyLang(lang);
else for (const btn of document.querySelectorAll<HTMLButtonElement>("button[data-lang]")) btn.setAttribute("aria-pressed", String(btn.dataset.lang === "en"));

// Measure with the page's real fonts, not the fallback they replace.
void document.fonts.ready.then(fitTerminal);
addEventListener("resize", fitTerminal);
syncVideos();
new MutationObserver(syncVideos).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
wireCopyButtons();
