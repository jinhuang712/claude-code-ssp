import { defineWidget } from "../core/types.js";
import { sanitizeDisplayText } from "../data/utils/sanitize.js";
import { labelPrefix } from "./_shared.js";

export const customText = defineWidget<{ text: string; color: string }>({
  id: "custom.text",
  name: "Static text",
  description: "Any fixed text or symbol, e.g. a separator glyph or your name.",
  category: "misc",
  sample: "★",
  schema: {
    type: "object",
    properties: {
      text: { type: "string", default: "★", title: "Text" },
      color: { type: "string", default: "muted", title: "Color (token or #hex)" },
    },
  },
  defaults: { text: "★", color: "muted" },
  render(_ctx, o, api) {
    const t = sanitizeDisplayText(o.text);
    return t ? [api.seg(t, { fg: o.color })] : null;
  },
});

export const customEnv = defineWidget<{ name: string; showName: boolean; color: string }>({
  id: "custom.env",
  name: "Environment variable",
  description: "Value of an environment variable visible to the statusline process.",
  category: "misc",
  sample: "AWS_PROFILE=prod",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", default: "", title: "Variable name", description: "Required, e.g. AWS_PROFILE. Nothing shows until it is set." },
      showName: { type: "boolean", default: true, title: "Show NAME= before the value" },
      color: { type: "string", default: "fg" },
    },
  },
  /*
    No own `label` option: the automatic NAME= prefix used to double as the label, so the panel's
    Label row said "hidden" while NAME= showed, and a custom label hugged the value ("H/Users/me").
    Custom labels now go through the engine's generic label (muted, followed by a space).
  */
  defaults: { name: "", showName: true, color: "fg" },
  render(_ctx, o, api) {
    if (!o.name) return null;
    const v = process.env[o.name];
    if (!v) return null;
    // Configs from before showName kept a custom label in options.label; honour it.
    const legacy = (o as { label?: unknown }).label;
    const prefix = typeof legacy === "string" ? labelPrefix(legacy) : o.showName ? `${o.name}=` : "";
    return [...(prefix ? [api.seg(prefix, { fg: "muted" })] : []), api.seg(sanitizeDisplayText(v).slice(0, 60), { fg: o.color })];
  },
});

export const customLink = defineWidget<{ text: string; url: string; color: string }>({
  id: "custom.link",
  name: "Link",
  description: "Clickable text (OSC 8 hyperlink).",
  category: "misc",
  sample: "docs ↗",
  schema: {
    type: "object",
    properties: {
      text: { type: "string", default: "docs ↗" },
      url: { type: "string", default: "https://code.claude.com/docs/en/statusline" },
      color: { type: "string", default: "accent" },
    },
  },
  defaults: { text: "docs ↗", url: "https://code.claude.com/docs/en/statusline", color: "accent" },
  render(_ctx, o, api) {
    if (!o.text || !o.url) return null;
    const seg = api.seg(sanitizeDisplayText(o.text), { fg: o.color, underline: true });
    seg.link = o.url;
    return [seg];
  },
});
