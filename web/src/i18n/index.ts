/**
 * Tiny i18n layer: typed message objects + a zustand store for the active language.
 *
 * Why not a library: the panel has two locales and ~200 strings; a typed object gives compile-time
 * key checking and argument checking for free, with zero runtime or bundle cost.
 */
import { create } from "zustand";
import type { JsonSchema, WidgetManifest } from "../api";
import { en, type Messages } from "./en";
import { zh } from "./zh";

export type { Messages };
export type Lang = "en" | "zh";

export const LANGS: Record<Lang, Messages> = { en, zh };
const STORAGE_KEY = "ssp.lang";

function isLang(v: unknown): v is Lang {
  return v === "en" || v === "zh";
}

/**
 * The language to start in: an explicit earlier choice wins, then the browser's preference list
 * (any `zh*` → 简体中文), then English. localStorage can throw in locked-down browsers, hence the try.
 */
export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* storage unavailable: fall through to the browser preference */
  }
  const prefs = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const p of prefs) {
    const base = p?.toLowerCase().split("-")[0];
    if (base === "zh") return "zh";
    if (base === "en") return "en";
  }
  return "en";
}

/** BCP 47 tag for <html lang>; it also steers CJK glyph selection (Han unification) in the browser. */
export const HTML_LANG: Record<Lang, string> = { en: "en", zh: "zh-CN" };

interface LangState {
  lang: Lang;
  setLang(lang: Lang): void;
}

export const useLang = create<LangState>((set) => ({
  lang: detectLang(),
  setLang(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* not persisted; the choice still applies for this page view */
    }
    set({ lang });
  },
}));

/** Messages for the active language; re-renders the caller when the language changes. */
export function useT(): Messages {
  return LANGS[useLang((s) => s.lang)];
}

/** Non-hook access for store actions and other code outside React render. */
export function tr(): Messages {
  return LANGS[useLang.getState().lang];
}

// ---- widget-facing helpers ------------------------------------------------------------------

/** Display name: a locale override, else the manifest's own (English) name, else the id. */
export function widgetName(m: Messages, w: WidgetManifest | undefined, id: string): string {
  return m.widgets.names[id] ?? w?.name ?? id;
}

/** One-line description, with the same fallback chain as `widgetName`. */
export function widgetDesc(m: Messages, w: WidgetManifest | undefined, id: string): string {
  return m.widgets.descs[id] ?? w?.description ?? "";
}

export function categoryName(m: Messages, cat: string): string {
  return m.widgets.categories[cat] ?? cat;
}

/** "showFileStats" → "Show file stats": last resort for a field nobody titled. */
function humanize(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Title for an option field. In English the widget's own schema title is authoritative (the table
 * only fills gaps); in other locales the translation wins because schema titles are English.
 */
export function fieldTitle(m: Messages, name: string, schema: JsonSchema): string {
  const table = m.widgets.fields[name];
  const own = typeof schema.title === "string" ? schema.title : undefined;
  return (m === en ? (own ?? table) : (table ?? own)) ?? humanize(name);
}

/** Label for one enum value, preferring per-widget wording (see `enumsByField`). */
export function enumLabel(m: Messages, widgetId: string, field: string, value: string): string {
  return m.widgets.enumsByField[`${widgetId}.${field}`]?.[value] ?? m.widgets.enums[value] ?? value;
}
