// Captures the Three.js reference viewport for the comparison with the native one
// (docs/native-migration/VIEWPORT_COMPARISON.md).
//
//   node captureReference.mjs --stl part.stl --out dir --size 960x640 [--theme dark|light] [--frames 300]
//                             [--dist D:\CraftNative\build\reference-dist] [--label text] [--hold-ms 0]
//
// Runs the real production build of the reference app (mold/frontend, built with `vite build`) in the installed Chrome with
// hardware WebGL, at a page size where the canvas is exactly --size. Writes empty.png (the scene with nothing loaded, the
// "No model loaded" overlay hidden), part.png (after importing the STL through the app's own file input) and result.json
// (import timing, frame cadence under a continuous orbit, memory, the WebGL renderer). Nothing in the app is modified.

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
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
const stl = path.resolve(args.stl);
const outDir = path.resolve(args.out);
const [width, height] = (args.size ?? "960x640").split("x").map(Number);
const theme = args.theme ?? "dark";
const orbitFrames = Number(args.frames ?? 300);
const dist = path.resolve(args.dist ?? "D:\\CraftNative\\build\\reference-dist");
const holdMs = Number(args["hold-ms"] ?? 0);
const angle = args.angle ?? "d3d11";      // d3d11 (hardware) | swiftshader (software, for diagnosing)
const headed = args.headed === "1";
const noVsync = args.novsync === "1";     // present without waiting for the display refresh, to see the rendering cost
fs.mkdirSync(outDir, { recursive: true });

const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon" };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = path.join(dist, urlPath);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": mime[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// Chrome's own processes (browser, GPU, renderer, ...) as the browser reports them.
let browserCdp;
const processMemory = async () => {
  const info = (await browserCdp.send("SystemInfo.getProcessInfo")).processInfo;
  const pids = info.map((p) => p.id).join(",");
  return JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-File", path.join(here, "process-memory.ps1"), "-Pids", pids], { encoding: "utf8" }));
};

const browser = await chromium.launch({
  channel: "chrome",
  headless: !headed,
  args: [...(noVsync ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : []), `--use-angle=${angle}`, "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--force-device-scale-factor=1", "--disable-features=CalculateNativeWinOcclusion"],
});
const result = { label: args.label ?? "", theme, angle, headed, noVsync, requestedSize: [width, height], stl, browserVersion: browser.version() };
try {
  browserCdp = await browser.newBrowserCDPSession();
  const context = await browser.newContext({ viewport: { width: width + 400, height: height + 160 }, deviceScaleFactor: 1 });
  await context.addInitScript((themeMode) => {
    localStorage.setItem("mold-generator-ui-shell", JSON.stringify({ state: { themeMode, isNavigationCollapsed: false }, version: 1 }));
    // The synthetic orbit drags below use pointer ids no real device owns; capture is irrelevant to them.
    for (const name of ["setPointerCapture", "releasePointerCapture"]) Element.prototype[name] = () => {};
    Element.prototype.hasPointerCapture = () => true;
    // Count what the app really draws, to prove each timed step rendered a frame.
    window.__gl = { clears: 0, draws: 0 };
    const proto = WebGL2RenderingContext.prototype;
    for (const [name, key] of [["clear", "clears"], ["drawElements", "draws"], ["drawArrays", "draws"], ["drawElementsInstanced", "draws"], ["drawArraysInstanced", "draws"]]) {
      const original = proto[name];
      proto[name] = function (...a) { window.__gl[key]++; return original.apply(this, a); };
    }
  }, theme);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${base}/workspace`);
  await page.locator("#viewport-live-status").getByText("Viewport: Ready").waitFor({ timeout: 60000 });

  // Size the page so the canvas is exactly the requested size.
  const canvas = page.locator("canvas");
  let box;
  for (let attempt = 0; attempt < 6; attempt++) {
    box = await canvas.boundingBox();
    const dw = width - Math.round(box.width), dh = height - Math.round(box.height);
    if (dw === 0 && dh === 0) break;
    const current = page.viewportSize();
    await page.setViewportSize({ width: current.width + dw, height: current.height + dh });
    await page.waitForTimeout(300);
  }
  box = await canvas.boundingBox();
  result.canvasSize = [Math.round(box.width), Math.round(box.height)];
  if (result.canvasSize[0] !== width || result.canvasSize[1] !== height) throw new Error(`canvas is ${result.canvasSize}, wanted ${[width, height]}`);

  const gl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2");
    const e = g.getExtension("WEBGL_debug_renderer_info");
    return { renderer: e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER), devicePixelRatio: window.devicePixelRatio };
  });
  result.renderer = gl;

  // The empty frame: nothing loaded, the "No model loaded" overlay hidden so only the scene remains.
  // Text overlays of the page around the scene are hidden in both frames (the "No model loaded" panel and the interaction
  // hint badge): they are not part of what is rendered, and the hint only appears once a model is loaded.
  await page.addStyleTag({ content: 'section[aria-label="Interactive 3D viewport"] [class*="emptyOverlay"], section[aria-label="Interactive 3D viewport"] [class*="hint"] { display: none !important; }' });
  await page.waitForTimeout(800);
  const clip = { x: box.x, y: box.y, width, height };
  await page.screenshot({ path: path.join(outDir, "empty.png"), clip });

  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const heap = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.filter((m) => /JSHeap/.test(m.name)).map((m) => [m.name, m.value / 1048576]));
  result.memoryBeforeImport = { jsHeapMiB: await heap(), ...(await processMemory()) };

  // Import through the app's own file input; time it in the page: from the input's change event to the "Ready:" status
  // and the second animation frame after it (the first frame that can show the part).
  await page.evaluate(() => {
    window.__import = { start: 0, ready: 0, firstFrame: 0 };
    document.addEventListener("change", () => { if (!window.__import.start) window.__import.start = performance.now(); }, true);
    const watch = () => {
      if (!window.__import.ready && /Ready: .*triangles\)/.test(document.body.innerText)) {
        window.__import.ready = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => { window.__import.firstFrame = performance.now(); }));
      }
    };
    new MutationObserver(watch).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await page.getByLabel("Local STL file", { exact: true }).setInputFiles(stl);
  // Either the part is shown, or the app refuses it (an alert: for instance the 25 MiB limit).
  await page.waitForFunction(() => window.__import.firstFrame > 0 || document.querySelector('[role="alert"]') !== null, null, { timeout: 120000, polling: 50 });
  const refusal = await page.evaluate(() => document.querySelector('[role="alert"]')?.textContent?.trim() ?? null);
  if (refusal) {
    result.refused = refusal;
    result.errors = errors;
    throw new Error(`REFUSED: ${refusal}`);
  }
  const timing = await page.evaluate(() => window.__import);
  result.importReadyMs = timing.ready - timing.start;
  result.importFirstFrameMs = timing.firstFrame - timing.start;
  result.modelStatus = (await page.locator("#viewport-live-status").innerText()).trim();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, "part.png"), clip });
  result.memoryAfterImport = { jsHeapMiB: await heap(), ...(await processMemory()) };

  // Frame cadence under a continuous orbit: one synthetic mouse drag step of 3 px per animation frame, measured two ways.
  // WebGL commands run asynchronously, so a page loop alone times JavaScript, not frames (gl.finish() only flushes in
  // Chrome). The app's render of the previous step runs before the step callback in the same animation frame, and reading
  // one pixel back cannot return before the GPU has completed everything submitted so far:
  //   pipelined: N steps back to back, then one readback; frames per second = N / the time until the GPU was done. This is
  //              the throughput, comparable to the native swap chain, whose back-pressure also lets CPU and GPU overlap.
  //   synced:    a readback in every step; each interval then includes that frame's GPU work with no overlap (CPU + GPU),
  //              so it is the per-frame latency and its percentiles, and a pessimistic frame rate.
  const orbit = (frames, warmup, sync) => page.evaluate(({ frames, warmup, sync }) => new Promise((resolve) => {
    const target = document.querySelector("canvas");
    const rect = target.getBoundingClientRect();
    let x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const fire = (type) => target.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    const gl = target.getContext("webgl2");
    const probe = new Uint8Array(4);
    const readback = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe);
    const before = { ...window.__gl };
    fire("pointerdown");
    const intervals = [];
    let last = 0, count = 0, startedAt = 0;
    const step = () => {
      if (sync) readback();
      const t = performance.now();
      if (last && count > warmup && sync) intervals.push(t - last);
      last = t;
      if (count === warmup) { readback(); startedAt = performance.now(); }
      if (++count >= frames + warmup) {
        readback();
        const total = performance.now() - startedAt;
        fire("pointerup");
        const done = window.__gl;
        const out = { steps: frames, rendersPerStep: (done.clears - before.clears) / (frames + warmup), drawCallsPerStep: (done.draws - before.draws) / (frames + warmup), meanMs: total / frames, fps: (1000 * frames) / total };
        if (sync) {
          const sorted = [...intervals].sort((a, b) => a - b);
          const at = (p) => sorted[Math.floor(p * (sorted.length - 1))] ?? 0;
          Object.assign(out, { p50Ms: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99), maxMs: at(1), over20ms: intervals.filter((v) => v > 20).length, over33ms: intervals.filter((v) => v > 33.4).length });
        }
        resolve(out);
        return;
      }
      x += 3;
      fire("pointermove");
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), { frames, warmup, sync });
  result.orbit = await orbit(orbitFrames, 30, false);
  result.orbitSynced = await orbit(orbitFrames, 30, true);
  // The orbit must really have moved the camera, or the cadence above would be the cadence of an idle page.
  await page.waitForTimeout(500);
  const afterOrbit = await page.screenshot({ clip });
  result.orbitChangedFrame = !afterOrbit.equals(fs.readFileSync(path.join(outDir, "part.png")));
  result.memoryAfterOrbit = { jsHeapMiB: await heap(), ...(await processMemory()) };
  if (holdMs > 0) await page.waitForTimeout(holdMs);
  result.errors = errors;
} catch (error) {
  if (String(error?.message ?? error).startsWith("REFUSED:")) result.refusedByApp = true;
  else result.failure = String(error?.stack ?? error);
} finally {
  fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
  await browser.close();
  server.close();
}
console.log(result.failure ? `REFERENCE_CAPTURE_FAIL ${result.failure}` : result.refusedByApp ? `REFERENCE_CAPTURE_REFUSED ${result.refused}` : "REFERENCE_CAPTURE_OK");
process.exit(result.failure ? 2 : 0);
