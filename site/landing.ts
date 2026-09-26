/**
 * The welcome page's own behaviour (the configurator it embeds is separate: site/demo/entry.ts).
 *
 * - The hero terminal's rows are sized so the widest fills the terminal: CSS can only guess a
 *   monospace cell's width, and a right-aligned zone that stops short of the edge reads wrong.
 * - The recording shown (and its poster) is the one matching the page's scheme, and follows it
 *   when the embedded configurator's appearance switch changes <html data-theme>.
 * - Copy buttons.
 */

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
      try {
        await navigator.clipboard.writeText(text.trim());
        btn.textContent = "Copied";
      } catch {
        // Clipboard refused (insecure context, permissions): select it for a manual copy instead.
        getSelection()?.selectAllChildren(source);
        btn.textContent = "Selected";
      }
      setTimeout(() => (btn.textContent = "Copy"), 1600);
    });
  }
}

// Measure with the page's real fonts, not the fallback they replace.
void document.fonts.ready.then(fitTerminal);
addEventListener("resize", fitTerminal);
syncVideos();
new MutationObserver(syncVideos).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
wireCopyButtons();
