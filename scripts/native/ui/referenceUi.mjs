// Drives the REAL reference app (the production build of mold/frontend in the installed Chrome) through its UI states and saves a
// full-page screenshot of each, for the side-by-side walk-through with the native window
// (docs/native-migration/UI_WALKTHROUGH.md).
//
//   node referenceUi.mjs --out dir [--stl part.stl] [--theme dark|light] [--size 1280x800] [--dump 1] [--dist D:\CraftNative\build\reference-dist]
//                         [--steps "click:Flip;shot:03-flip;dump:03-flip"]
//
// Steps (after the import), separated by ';': click:<accessible name> (a button, link or any element with that label or text), clickxy:<x>,<y> (page
// pixels), shot:<name>, dump:<name>, wait:<ms>, fill:<field label>=<value>, wheel:<deltaY>, key:<Playwright key>, hover:<accessible name>, text:<name> (writes the page's visible text to <name>.txt).
//
// Without --stl only the empty workspace is captured. With --dump 1 it also writes controls.json: every visible button, link, checkbox,
// slider, tab and field with its accessible name, so that the controls of the two applications can be compared by name. Nothing in the
// app is modified; the page is reached through its own file input and its own buttons.
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const frontendDir = path.join(repoRoot, "mold", "frontend");
const { chromium } = createRequire(path.join(frontendDir, "package.json"))("@playwright/test");

const args = (() => {
  const out = {};
  for (let i = 2; i < process.argv.length; i += 2) out[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  return out;
})();
const outDir = path.resolve(args.out);
const [width, height] = (args.size ?? "1280x800").split("x").map(Number);
const theme = args.theme ?? "dark";
const dist = path.resolve(args.dist ?? "D:\\CraftNative\\build\\reference-dist");
fs.mkdirSync(outDir, { recursive: true });

const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = path.join(dist, urlPath);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": mime[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--force-device-scale-factor=1"] });
try {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await context.addInitScript((themeMode) => {
    localStorage.setItem("mold-generator-ui-shell", JSON.stringify({ state: { themeMode, isNavigationCollapsed: false }, version: 1 }));
  }, theme);
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  await page.goto(base, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const shot = async (name) => { await page.screenshot({ path: path.join(outDir, `${name}.png`) }); console.log(`saved ${name}.png`); };
  const dump = async (name) => {
    const controls = await page.evaluate(() => {
      const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
      const nameOf = (e) => (e.getAttribute("aria-label") || e.getAttribute("title") || e.innerText || e.getAttribute("placeholder") || e.value || "").trim().replace(/\s+/g, " ").slice(0, 80);
      return [...document.querySelectorAll("button, a[href], input, select, textarea, [role=tab], [role=switch], [role=slider], [role=checkbox], [role=button]")]
        .filter(visible)
        .map((e) => { const r = e.getBoundingClientRect(); return { tag: e.tagName.toLowerCase(), role: e.getAttribute("role") || e.getAttribute("type") || "", name: nameOf(e), disabled: e.disabled === true || e.getAttribute("aria-disabled") === "true", box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }; });
    });
    fs.writeFileSync(path.join(outDir, `${name}-controls.json`), JSON.stringify(controls, null, 1));
    console.log(`${name}: ${controls.length} controls`);
  };

  await shot("01-empty");
  if (args.dump === "1") await dump("01-empty");
  if (args.stl) {
    await page.getByLabel("Local STL file", { exact: true }).setInputFiles(path.resolve(args.stl));
    await page.waitForTimeout(2500);
    await shot("02-model-loaded");
    if (args.dump === "1") await dump("02-model-loaded");
  }
  for (const step of (args.steps ?? "").split(";").map((s) => s.trim()).filter(Boolean)) {
    const [verb, ...rest] = step.split(":");
    const arg = rest.join(":");
    try {
      if (verb === "click") await page.getByRole("button", { name: arg, exact: true }).or(page.getByLabel(arg, { exact: true })).or(page.getByText(arg, { exact: true })).first().click({ timeout: 5000 });
      else if (verb === "hover") await page.getByRole("button", { name: arg, exact: true }).first().hover({ timeout: 5000 });
      else if (verb === "clickxy") { const [x, y] = arg.split(",").map(Number); await page.mouse.click(x, y); }
      else if (verb === "fill") { const [label, ...value] = arg.split("="); await page.getByLabel(label, { exact: true }).fill(value.join("=")); }
      else if (verb === "wheel") { await page.mouse.move(width / 2, height / 2); await page.mouse.wheel(0, Number(arg)); }
      else if (verb === "key") await page.keyboard.press(arg);
      else if (verb === "wait") await page.waitForTimeout(Number(arg));
      else if (verb === "shot") await shot(arg);
      else if (verb === "dump") await dump(arg);
      else if (verb === "text") fs.writeFileSync(path.join(outDir, `${arg}.txt`), await page.evaluate(() => document.body.innerText));
      else console.log(`unknown step '${step}'`);
      if (["click", "clickxy", "key", "hover", "fill", "wheel"].includes(verb)) await page.waitForTimeout(600);
    } catch (error) {
      console.log(`step '${step}' failed: ${String(error.message).split("\n")[0]}`);
      problems.push(`step '${step}': ${String(error.message).split("\n")[0]}`);
    }
  }
  fs.writeFileSync(path.join(outDir, "problems.json"), JSON.stringify(problems, null, 1));
  if (problems.length) console.log(`page problems: ${problems.length}`);
} finally {
  await browser.close();
  server.close();
}
