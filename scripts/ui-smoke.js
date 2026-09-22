// Playwright snippet run by scripts/ui-smoke.sh (via `playwright-cli run-code --filename`).
// __URL__ and __OUT__ are substituted by the shell script. Returns a JSON report; `ok` is the verdict.
// The file must be a single function *expression* (no trailing semicolon): run-code evaluates it as one.
async (page) => {
  const URL = "__URL__";
  const OUT = "__OUT__";
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  // 1. Keyboard: Tab must reach the footer and never stick on one element (the old xterm trap).
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  let reachedFooter = false;
  let stuck = 0;
  let prev = "";
  for (let i = 0; i < 200 && !reachedFooter; i++) {
    await page.keyboard.press("Tab");
    const cur = await page.evaluate(() => {
      const a = document.activeElement;
      return { key: `${a?.tagName}|${a?.className}|${a?.textContent?.slice(0, 20)}`, footer: !!a?.closest("footer") };
    });
    stuck = cur.key === prev ? stuck + 1 : 0;
    prev = cur.key;
    if (stuck >= 3) break;
    reachedFooter = cur.footer;
  }

  // 2. Drawers open, trap focus, and close with Esc.
  const drawer = async (open) => {
    await open();
    await page.waitForTimeout(400);
    const opened = (await page.locator(".drawer").count()) === 1;
    const focusInside = await page.evaluate(() => !!document.activeElement?.closest(".drawer"));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    return { opened, focusInside, closed: (await page.locator(".drawer").count()) === 0 };
  };
  const options = await drawer(() => page.locator("button.chip-name").first().click());
  const picker = await drawer(() => page.locator("button.addchip").first().click());

  // 3. No horizontal page scroll at any supported width; screenshots for a human look.
  const overflow = {};
  for (const [w, h] of [[1440, 900], [1024, 800], [720, 900], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    overflow[w] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.screenshot({ path: `${OUT}/smoke-${w}.png`, fullPage: true });
  }

  const drawersOk = [options, picker].every((d) => d.opened && d.focusInside && d.closed);
  const ok = errors.length === 0 && reachedFooter && stuck < 3 && drawersOk && Object.values(overflow).every((v) => v <= 0);
  return JSON.stringify({ ok, errors, keyboard: { reachedFooter, stuck }, drawers: { options, picker }, overflow });
}
