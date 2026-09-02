import { defineWidget } from "../core/types.js";
import { sanitizeDisplayText } from "../data/utils/sanitize.js";

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

export const customEnv = defineWidget<{ name: string; label: string | null; color: string }>({
  id: "custom.env",
  name: "Environment variable",
  description: "Value of an environment variable visible to the statusline process.",
  category: "misc",
  sample: "AWS_PROFILE=prod",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", default: "", title: "Variable name" },
      label: { type: ["string", "null"], default: null, title: "Label (defaults to NAME=)" },
      color: { type: "string", default: "fg" },
    },
  },
  defaults: { name: "", label: null, color: "fg" },
  render(_ctx, o, api) {
    if (!o.name) return null;
    const v = process.env[o.name];
    if (!v) return null;
    const label = o.label === null ? `${o.name}=` : o.label;
    return [...(label ? [api.seg(label, { fg: "muted" })] : []), api.seg(sanitizeDisplayText(v).slice(0, 60), { fg: o.color })];
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
