# Viewport comparison: native Qt Quick 3D against the Three.js reference

Measured 2026-11-18 on one machine. This document says what was measured, how, what the numbers are, and what they do not
prove. The code is `scripts/native/compare-viewport.ps1` (runner), `scripts/native/viewport/` (reference capture, models,
memory sampling), `native/app/ViewportBench.*` (native measurements, development builds only) and `native/tools/ImageCompare.*`
(image metrics, tested by `tst_imagecompare`).

## Short version

- **Framing and geometry match closely.** The part lands in the same place at the same size: mask overlap (IoU) 0.97 to 0.997,
  area ratio 0.99 to 1.02, centroid offset 0 to 1.4 px at 960 x 640. Getting there found and fixed one real bug (below).
- **Colour, lighting and surroundings do not match.** SSIM inside the part is 0.49 to 0.72. The reference uses a different
  palette (part `#b8e3ec` dark / `#4a8fa8` light, a background gradient), tone mapping, shadows, a labelled grid and a hint
  badge; native has a flat palette and none of those. This is a visual-parity gap, not a geometry one, and it is not closed.
- **Performance, for what was measured:** at the display's 75 Hz both hold full rate up to 405k triangles. Uncapped, native
  has a fixed cost of about 5.5 ms per frame (about 175 fps) that does not grow with the part, so the reference is faster on
  small parts (690 fps) and native is faster on large ones (170 fps against 128 at 405k triangles). Native imports 2 to 4.4
  times faster and uses about a third of the memory. Native loads a 1.3M-triangle, 62.5 MiB file that the reference refuses.
- **Not shown:** anything about other GPUs, other display refresh rates, other viewport sizes, or the 512 MiB ceiling.

## Method

| | |
|---|---|
| Machine | Windows 11 Home, Intel UHD Graphics 620 (the Radeon 530 in the machine was not used), display at 75 Hz |
| Native | Release build (`windows-release`), Qt 6.8.3, Qt Quick 3D on D3D11; `craft --viewport-bench` |
| Reference | the production build of `mold/frontend` (`vite build`, unmodified), installed Chrome 157 (headless), ANGLE on the same Intel adapter, driven by Playwright |
| Viewport | 960 x 640 px in both (the window is sized so the viewport item, not the window, is exactly that; the page is sized so the canvas is), device pixel ratio 1 |
| Scenes | `box_30mm` (12 triangles) and `sphere_9k` (9,024; both are fixtures of the reference's own e2e suite) in the dark and light themes; generated `sphere_82k`, `torus_405k` (19.3 MiB, just under the reference's 25 MiB limit) and `sphere_1_3m` (62.5 MiB, over it) in the dark theme |
| Repeats | 3 runs per scene and mode, medians reported; 300 orbit frames after 30 warm-up frames |

**Pixels.** Each application renders the viewport with nothing loaded and with the part. The part's mask is where those two
frames differ by more than 24/255 in any channel, with thin marks removed (a morphological opening with a 5 px square: both
applications redraw their adaptive grid when a part loads) and only the largest connected region kept (which drops the grid
labels). Reported: IoU of the two masks, area ratio, centroid offset, the distance between the two silhouettes' boundaries
(mean, 95th percentile, maximum), and inside the part SSIM (8 x 8 luminance windows) and the mean absolute colour difference.
The "No model loaded" panel and the interaction hint badge of the reference are hidden in both of its frames; the native
"Open an STL file" hint is hidden in its empty frame.

**Import.** Milliseconds from the file being chosen to the part being ready (parsed, validated, grounded) and to the second
frame after that (the first that can show it). Native: from `importStlFile` to the model being ready, and the second
`frameSwapped`. Reference: in the page, from the file input's change event to the "Ready:" status and the second animation
frame after it.

**Orbit.** A continuous drag of 3 px per frame for 300 frames.
- Native: the interval between consecutive swap-chain presents of the real window, taken on the render thread. CPU and GPU
  overlap, as in normal use.
- Reference "pipelined": the 300 steps run back to back and one pixel is read back at the end, which cannot return before the GPU
  has finished everything; frames per second is 300 divided by that time. This is the throughput, the same idea as native's.
- Reference "synced": a one-pixel readback in every frame. CPU and GPU no longer overlap, so this is the per-frame latency and its
  spread, and a pessimistic frame rate. (In these runs Chrome's `gl.finish()` did not wait for the GPU, and a page loop alone times JavaScript: a first
  version of this measurement read about 1,800 fps for the 405k-triangle part.)
- Counters on the reference's WebGL context show every step rendered (about 2 passes and 15 draw calls per step).
- Two modes: with the display's vsync (the cadence a user sees) and uncapped (`--bench-no-vsync` in native, Chrome's
  `--disable-gpu-vsync --disable-frame-rate-limit`), which shows the cost of a frame.

**Memory.** Working set and private bytes of every process of the application (native: one; Chrome: browser, GPU process,
renderers, utilities) after the orbit, plus the GPU memory Windows attributes to those processes. On this integrated adapter
the two Windows counters ("local" and "shared") report the same number, so one figure is quoted.

## Results

### Pixels (the two renderers' parts, same frame size)

| scene | mask IoU | area native/ref | centroid offset (px) | boundary mean / p95 / max (px) | SSIM in part | mean abs diff in part |
|---|---|---|---|---|---|---|
| box_30mm dark | 0.989 | 0.992 | 0.1 | 7.8 / 40.0 / 80.7 | 0.514 | 0.160 |
| box_30mm light | 0.992 | 1.007 | 0.3 | 0.7 / 1.0 / 3.0 | 0.489 | 0.142 |
| sphere_9k dark | 0.984 | 1.011 | 1.4 | 5.9 / 25.0 / 82.0 | 0.686 | 0.117 |
| sphere_9k light | 0.997 | 1.001 | 0.0 | 2.7 / 1.0 / 88.0 | 0.669 | 0.174 |
| sphere_82k dark | 0.986 | 1.012 | 1.3 | 5.3 / 22.3 / 82.0 | 0.720 | 0.117 |
| torus_405k dark | 0.968 | 1.024 | 0.7 | 2.7 / 11.7 / 40.7 | 0.642 | 0.121 |

Rendering is deterministic: both runs (display cadence and uncapped) produced identical frames. Before the camera fix below, the
box gave IoU 0.82, area ratio 0.92 and a 12.5 px centroid offset.

How to read the boundary column: where the reference's yellow axis labels sit next to the part (the dark scenes) they join the
part's region and stretch the boundary statistics, which is why the light-theme box is within 1 px at p95 and the dark box is not.
That is the likely cause (it fits the side-by-side images), not something separately verified. The IoU, area and centroid columns
are not affected the same way. Images: `side-by-side.png` and `diff.png` per scene in the run folder.

### Import (ms)

| scene | triangles | file MiB | native ready | native first frame | reference ready | reference first frame |
|---|---|---|---|---|---|---|
| box_30mm | 12 | 0.0 | 9 to 12 | 36 to 48 | 28 | 159 to 163 |
| sphere_9k | 9,024 | 2.7 | 40 to 41 | 76 to 77 | 98 to 99 | 226 to 228 |
| sphere_82k | 81,920 | 3.9 | 91 | 143 | 399 | 602 |
| torus_405k | 405,000 | 19.3 | 458 | 617 | 1,755 | 1,904 |
| sphere_1_3m | 1,310,720 | 62.5 | 1,598 | 2,025 | refused | refused |

(Display-cadence run; the uncapped run agrees within about 15 %: for example 501 / 530 against 1,948 / 2,107 for the torus.)
The reference's message for the last row is "The STL file is too large for local loading." (the 25 MiB limit; native allows 512 MiB, see
PARITY_MATRIX).

### Orbit, at the display's cadence (75 Hz, so 13.3 ms is a full-rate frame)

| scene | native fps | native p50 / p95 / p99 / max (ms) | reference fps pipelined / synced | reference synced p50 / p95 / p99 / max (ms) |
|---|---|---|---|---|
| box_30mm | 74.7 | 13.3 / 13.9 / 14.6 / 25.6 | 75.2 / 75.2 | 13.3 / 14.0 / 14.5 / 15.6 |
| sphere_9k | 74.7 | 13.3 / 13.6 / 14.4 / 25.3 | 75.2 / 75.3 | 13.3 / 13.9 / 14.3 / 14.9 |
| sphere_82k | 74.7 | 13.3 / 13.7 / 14.2 / 25.6 | 75.4 / 75.2 | 13.3 / 14.5 / 15.6 / 16.9 |
| torus_405k | 74.7 | 13.3 / 13.8 / 14.5 / 25.5 | 74.7 / 75.1 | 13.4 / 14.5 / 15.1 / 15.7 |
| sphere_1_3m | 37.1 | 26.7 / 27.7 / 28.4 / 36.6 | refused | |

Both hold the full 75 Hz up to 405k triangles. Native shows one slow frame (about 25 ms) per run (not investigated). At 1.3M triangles native presents every second refresh.

### Orbit, uncapped (the cost of a frame)

| scene | native fps | native p50 / p95 / p99 (ms) | reference fps pipelined | reference fps synced | reference synced p50 / p95 (ms) |
|---|---|---|---|---|---|
| box_30mm | 176 | 5.3 / 6.5 / 10.2 | 694 | 310 | 2.9 / 3.6 |
| sphere_9k | 175 | 5.4 / 6.4 / 9.0 | 688 | 201 | 5.4 / 6.2 |
| sphere_82k | 169 | 5.5 / 7.7 / 16.8 | 302 | 190 | 5.3 / 5.9 |
| torus_405k | 170 | 5.6 / 8.0 / 16.5 | 128 | 88 | 11.3 / 13.3 |
| sphere_1_3m | 123 | 8.1 / 9.6 / 16.7 | refused | | |

Native's frame costs about 5.3 to 5.6 ms from 12 to 405,000 triangles: the cost is not the part. It is probably the rest of
the Qt Quick window (two 3D views, the inspector and toolbars) and the swap chain, but that was not profiled (R-Viewport-3).
The reference's cost grows with the part and crosses native's between 82k and 405k triangles on this GPU.

### Memory after the orbit (MiB)

| scene | native working set | native private | native GPU | reference working set | reference private | reference GPU | reference JS heap |
|---|---|---|---|---|---|---|---|
| box_30mm | 201 to 237 | 157 to 193 | 65 | 602 to 620 | 328 to 353 | 110 to 128 | 8 |
| sphere_9k | 189 to 239 | 148 to 195 | 66 to 67 | 616 to 646 | 339 to 378 | 110 to 129 | 9 to 18 |
| sphere_82k | 189 to 249 | 148 to 207 | 70 to 71 | 702 to 747 | 422 to 475 | 121 to 144 | 58 |
| torus_405k | 281 to 347 | 242 to 308 | 93 to 94 | 1,009 to 1,022 | 688 to 721 | 166 to 179 | 155 |
| sphere_1_3m | 435 to 562 | 430 to 558 | 156 to 158 | refused | | | |

The ranges are the display-cadence run to the uncapped run (the application's own start-up memory varies between runs by
tens of MiB, so the part's share is only visible on the large models: the torus adds about 43 to 111 MiB to native and about
431 to 451 MiB to the reference's process tree). The reference number includes the whole browser, which is a larger idle
baseline than a Qt application.

## What was found

1. **Fixed: the camera after an import.** The reference fits a newly imported model from the current view direction
   (`localStlImport`: `fitCameraToModel`; its starting camera looks along (95, -120, 73)), and only Reset View goes to the fixed
   (1, -1, 0.78) direction. Native reset the direction on every import, so the first view was a few degrees off and a user's
   view was thrown away by the next import. The first side-by-side showed the part rotated by roughly 15 degrees. Native now
   fits from the current direction (D-077; `importFitsFromTheCurrentViewDirection` in `tst_app_workflow`).
2. **Not fixed: palette and lighting.** Reference dark theme: part `#b8e3ec`, background gradient `#161c24` to `#0a0e13`, feature
   edges `#380f0e`, ACES tone mapping at exposure 0.95, shadow maps enabled (PCF soft); light theme part `#4a8fa8`. Native: part `#9fb4c7` /
   `#5b7a99` on a flat background. The reference also shows a fine moire pattern on flat faces (probably shadow-map
   self-shadowing; its own artefact, native has nothing like it).
3. **Not fixed: scene extras.** The reference draws a smaller labelled grid (yellow numbers) and the hint badge (a ground shadow
   is expected from its settings but was not separately verified); native draws a large grid to the horizon, dark feature
   edges (a seam line shows on the sphere) and a scale caption.
4. **Not ported: automatic part orientation.** The reference has an Orient action (`automaticModelOrientation`,
   `partOrientation3dRuntime`) that rotates a part to its best resting face. Native has no such action and no parity row for it.
5. **A real difference in robustness:** an STL whose facet normals are zero (the hand-made `bracket.stl` fixture) renders black in the
   reference (the same with software GL) and lit in native, which recomputes its own normals.
6. **Native loads what the reference refuses:** 62.5 MiB and 1.3M triangles in 1.6 s, rendered at half the display rate.

## Limits of these numbers

- One machine, one integrated GPU, one display refresh rate, one viewport size, one orbit path. They say nothing about a
  discrete GPU (where a fixed 5 ms per frame matters less or more), a 60 or 144 Hz display, a 4K viewport, or macOS.
- The reference runs in headless Chrome with synthetic pointer events and a GPU readback to wait for completion; native runs a
  real window. The cadence protocols are comparable in intent, not identical, and the synced column is deliberately pessimistic.
- Native timings come from a Release build with the test-only code compiled in (`CRAFT_BUILD_TESTS`); the Debug build is much
  slower and was not used for any number here.
- Three runs per scene: the run logs agree closely run to run (native 74.7 to 74.8 fps at the display cadence, for example),
  but no confidence intervals were computed.
- The mask method has known weak points: it includes the reference's shadow where it touches the part, and the grid labels as
  described above. IoU near 0.99 therefore means "the silhouettes agree", not "the images agree".
- The memory numbers are of the whole process tree at one moment; no leak or repeated-import test was done.

## Re-running

```
cmake --build --preset windows-release --target craft craft_imgcompare          (from native/)
node node_modules\vite\bin\vite.js build --outDir D:\CraftNative\build\reference-dist --emptyOutDir   (from mold/frontend/)
.\scripts\native\compare-viewport.ps1                 # display cadence, writes summary.md and summary.json
.\scripts\native\compare-viewport.ps1 -NoVsync        # uncapped
.\scripts\native\compare-viewport.ps1 -Recompare <run folder>     # only the pixel metrics, from saved frames
```

Results go to `D:\CraftNative\build\viewport-compare\run-<time>` (frames, side-by-side and difference images, one JSON per run).
The raw runs behind this document: `final-vsync` and `final-uncapped` in that folder.
