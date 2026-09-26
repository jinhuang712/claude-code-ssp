/**
 * Browser stand-ins for the `node:fs`, `node:os` and `node:path` imports the render engine carries
 * (web/vite.demo.config.ts aliases all three here). On the demo's render path none of the file
 * functions is actually called — they sit in modules like config.ts and reset.ts next to the pure
 * functions the demo uses — so they only need to exist. What *is* called gets a real answer:
 * `homedir()` (Project path's `~/…`), and `path` helpers.
 */

/** The fake home the demo session lives under (site/build.ts rewrites its paths to match). */
export const DEMO_HOME = "/Users/you";

const unavailable = (name: string) => () => {
  throw new Error(`${name} is not available in the demo`);
};

// ---- os
export const homedir = () => DEMO_HOME;
export const tmpdir = () => "/tmp";
export const platform = () => "darwin";
export const EOL = "\n";
export const hostname = () => "demo";

// ---- fs: nothing on disk; "doesn't exist" is the honest answer for every probe.
export const existsSync = () => false;
export const readFileSync = unavailable("fs.readFileSync");
export const writeFileSync = unavailable("fs.writeFileSync");
export const appendFileSync = unavailable("fs.appendFileSync");
export const mkdirSync = () => undefined;
export const readdirSync = () => [];
export const statSync = unavailable("fs.statSync");
export const lstatSync = unavailable("fs.lstatSync");
export const renameSync = unavailable("fs.renameSync");
export const rmSync = () => undefined;
export const unlinkSync = () => undefined;
export const cpSync = unavailable("fs.cpSync");
export const realpathSync = (p: string) => p;
export const openSync = unavailable("fs.openSync");
export const readSync = unavailable("fs.readSync");
export const closeSync = () => undefined;
export const fstatSync = unavailable("fs.fstatSync");
export const promises = {};

// ---- path (POSIX is enough: every demo path is one)
export const sep = "/";
export const delimiter = ":";
export const normalize = (p: string) => {
  const abs = p.startsWith("/");
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return (abs ? "/" : "") + out.join("/") || (abs ? "/" : ".");
};
export const join = (...parts: string[]) => normalize(parts.filter(Boolean).join("/"));
export const resolve = (...parts: string[]) => {
  let acc = "";
  for (const p of parts) acc = p.startsWith("/") ? p : `${acc}/${p}`;
  return normalize(acc.startsWith("/") ? acc : `/${acc}`);
};
export const dirname = (p: string) => {
  const i = p.replace(/\/+$/, "").lastIndexOf("/");
  return i <= 0 ? (i === 0 ? "/" : ".") : p.slice(0, i);
};
export const basename = (p: string, ext?: string) => {
  const b = p.replace(/\/+$/, "").split("/").pop() ?? "";
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
};
export const extname = (p: string) => {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i > 0 ? b.slice(i) : "";
};
export const isAbsolute = (p: string) => p.startsWith("/");
export const relative = (from: string, to: string) => {
  const a = normalize(from).split("/").filter(Boolean);
  const b = normalize(to).split("/").filter(Boolean);
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => ".."), ...b.slice(i)].join("/");
};
export const parse = (p: string) => ({ root: p.startsWith("/") ? "/" : "", dir: dirname(p), base: basename(p), ext: extname(p), name: basename(p, extname(p)) });
export const posix = { sep, join, resolve, dirname, basename, extname, isAbsolute, relative, normalize, parse };

export default {
  homedir, tmpdir, platform, EOL, hostname,
  existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, statSync, lstatSync, renameSync, rmSync, unlinkSync, cpSync, realpathSync, openSync, readSync, closeSync, fstatSync, promises,
  sep, delimiter, normalize, join, resolve, dirname, basename, extname, isAbsolute, relative, parse, posix,
};
