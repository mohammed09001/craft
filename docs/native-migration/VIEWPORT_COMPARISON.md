# Viewport comparison: native Qt Quick 3D against the Three.js reference

Measured 2026-11-18 on one machine, twice: once before the native viewport was given the reference's look and once after.
This document says what was measured, how, what the numbers are, and what they do not prove. The code is
`scripts/native/compare-viewport.ps1` (runner), `scripts/native/viewport/` (reference capture, models, memory sampling),
`native/app/ViewportBench.*` (native measurements, development builds only) and `native/tools/ImageCompare.*` (image metrics,
tested by `tst_imagecompare`). The look itself is `native/core/view/ViewportLook.*`, pinned to the reference's own modules by
`tst_viewport_look`.

## Short version

- **Framing and geometry match closely.** The part lands in the same place at the same size: mask overlap (IoU) 0.977 to 0.999,
  area ratio 0.986 to 1.001, centroid offset 0 to 1.3 px at 960 x 640. Getting there found and fixed a real bug (the view
  direction after an import, D-077).
- **The look now follows the reference.** First measurements showed native with a different palette, headlight-style lighting and no
  tone mapping. Native now uses the reference's part and mold colours, background, five-point lighting rig, ACES tone mapping,
  grid and edge style. Whole-frame colour difference fell about tenfold (mean absolute difference 0.053 to 0.067, now 0.004 to
  0.007) and structural similarity of the whole frame rose from 0.78 to 0.89, now 0.91 to 0.97. Inside the part, similarity is
  0.60 to 0.84 and the colour difference 0.025 to 0.031: shading is close but not the same (below).
- **The ground-plane ruler and the hint badge are ported** (below): the numbered ticks along the grid axes with the reference's
  label step and hysteresis, checked against the real reference modules, and the badge that hides at the first press or wheel.
- **Still different:** a fine shadow-map moire pattern on the reference's flat faces, shadows, and native's own caption. The
  timing tables below were measured before the ruler existed and have not been repeated with it (the run was stopped, see the
  ruler section).
- **Performance, for what was measured:** at the display's 75 Hz both hold full rate up to 405k triangles. Uncapped, native costs
  about 4.4 ms per frame (about 215 fps) up to 405k triangles, the reference 1.4 ms on a tiny part (695 fps) growing to 7.6 ms at
  405k (131 fps): the reference is faster on small parts and native on large ones, crossing between 82k and 405k triangles.
  Native imports 3 to 17 times faster and uses a quarter to a third of the memory. Native loads a 1.3M-triangle, 62.5 MiB file that the
  reference refuses.
- **Not shown:** anything about other GPUs, other refresh rates, other viewport sizes, or the 512 MiB ceiling.

## Method

| | |
|---|---|
| Machine | Windows 11 Home, Intel UHD Graphics 620 renders both (the Radeon 530 in the machine was not used). Two monitors: KG272 at 75 Hz and DELL S2721H at 60 Hz; the native bench moves its window to the fastest one (D-083) |
| Native | Release build (`windows-release`), Qt 6.8.3, Qt Quick 3D on D3D11; `craft --viewport-bench` |
| Reference | the production build of `mold/frontend` (`vite build`, unmodified), installed Chrome 157 (headless), ANGLE on the same Intel adapter, driven by Playwright |
| Viewport | 960 x 640 px in both (the window is sized so the viewport item, not the window, is exactly that; the page is sized so the canvas is), device pixel ratio 1 |
| Scenes | `box_30mm` (12 triangles) and `sphere_9k` (9,024; both are fixtures of the reference's own e2e suite) in the dark and light themes; generated `sphere_82k`, `torus_405k` (19.3 MiB, just under the reference's 25 MiB limit) and `sphere_1_3m` (62.5 MiB, over it) in the dark theme |
| Repeats | 3 runs per scene and mode, medians reported; 300 orbit frames after 30 warm-up frames |

**Pixels.** Each application renders the viewport with nothing loaded and with the part. The part's mask is where those two
frames differ by more than 24/255 in any channel, with thin marks removed (a morphological opening with a 5 px square: both
applications redraw their adaptive grid when a part loads) and only the largest connected region kept (which drops the grid
labels). Reported: IoU of the two masks, area ratio, centroid offset, the distance between the two silhouettes' boundaries
(mean, 95th percentile, maximum), inside the part SSIM (8 x 8 luminance windows) and the mean absolute colour difference, and the
same two measures over the whole frame and over the empty frames (the background, grid and labels). The "No model loaded" panel and
the interaction hint badge of the reference are hidden in both of its frames; the native "Open an STL file" hint is hidden in its
empty frame.

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
  spread, and a pessimistic frame rate. (In these runs Chrome's `gl.finish()` did not wait for the GPU, and a page loop alone times
  JavaScript: a first version of this measurement read about 1,800 fps for the 405k-triangle part.)
- Counters on the reference's WebGL context show every step rendered (about 2 passes and 15 draw calls per step).
- Two modes: with the display's vsync (the cadence a user sees) and uncapped (`--bench-no-vsync` in native, Chrome's
  `--disable-gpu-vsync --disable-frame-rate-limit`), which shows the cost of a frame.

**Memory.** Working set and private bytes of every process of the application (native: one; Chrome: browser, GPU process,
renderers, utilities) after the orbit, plus the GPU memory Windows attributes to those processes. On this integrated adapter
the two Windows counters ("local" and "shared") report the same number, so one figure is quoted.

## Results

### Pixels (the two renderers' parts, same frame size), after the look was aligned

| scene | mask IoU | area native/ref | centroid offset (px) | boundary mean / p95 / max (px) | SSIM in part | mean abs diff in part |
|---|---|---|---|---|---|---|
| box_30mm dark | 0.995 | 0.999 | 0.3 | 2.7 / 15.3 / 47.7 | 0.603 | 0.031 |
| box_30mm light | 0.999 | 1.000 | 0.1 | 0.3 / 1.0 / 137.0 | 0.602 | 0.031 |
| sphere_9k dark | 0.981 | 0.989 | 1.3 | 2.6 / 9.7 / 68.0 | 0.794 | 0.027 |
| sphere_9k light | 0.998 | 1.001 | 0.0 | 0.7 / 1.0 / 81.0 | 0.799 | 0.029 |
| sphere_82k dark | 0.982 | 0.988 | 1.3 | 2.7 / 9.3 / 68.0 | 0.789 | 0.027 |
| torus_405k dark | 0.977 | 0.986 | 0.5 | 1.1 / 3.3 / 30.7 | 0.842 | 0.025 |

### Before and after the look was aligned (same frames of the same scenes)

| scene | whole-frame mean abs diff | background (empty frame) mean abs diff | whole-frame SSIM | SSIM in part | mean abs diff in part |
|---|---|---|---|---|---|
| box_30mm dark | 0.067 to 0.007 | 0.048 to 0.006 | 0.787 to 0.916 | 0.514 to 0.603 | 0.160 to 0.031 |
| box_30mm light | 0.065 to 0.007 | 0.052 to 0.005 | 0.887 to 0.913 | 0.489 to 0.602 | 0.142 to 0.031 |
| sphere_9k dark | 0.053 to 0.004 | 0.048 to 0.006 | 0.828 to 0.967 | 0.686 to 0.794 | 0.117 to 0.027 |
| sphere_9k light | 0.059 to 0.005 | 0.052 to 0.005 | 0.948 to 0.961 | 0.669 to 0.799 | 0.174 to 0.029 |
| sphere_82k dark | 0.053 to 0.005 | 0.048 to 0.006 | 0.823 to 0.963 | 0.720 to 0.789 | 0.117 to 0.027 |
| torus_405k dark | 0.054 to 0.007 | 0.048 to 0.006 | 0.781 to 0.946 | 0.642 to 0.842 | 0.121 to 0.025 |

Rendering is deterministic: runs of the same scene produce identical frames. Before the camera fix (D-077) the box had IoU 0.82, area
ratio 0.92 and a 12.5 px centroid offset. Before the mask clean-up (opening and largest region) the overlap numbers were 0.70 to
0.89 and included grid lines and labels.

How to read the boundary column: where the reference's yellow axis labels sit next to the part (the dark scenes) they join the part's
region and stretch the boundary statistics, which is why the light-theme box is within 1 px at p95 and the dark box is not. That is
the likely cause (it fits the side-by-side images), not something separately verified. IoU, area and centroid are not affected the
same way. Images: `side-by-side.png` and `diff.png` per scene in the run folder.

Why the inside of the part still differs (SSIM 0.60 on the flat-faced box, 0.79 to 0.84 on the round parts): the reference renders a
fine moire pattern on flat faces (probably shadow-map self-shadowing, its own artefact) that native has nothing like, and the
reference's image-based environment light and specular response are approximated in native by an ambient term and a sky light (R-Viewport-7).

### Import (ms; vsync run to uncapped run)

| scene | triangles | file MiB | native ready | native first frame | reference ready | reference first frame |
|---|---|---|---|---|---|---|
| box_30mm | 12 | 0.0 | 9 to 11 | 31 to 40 | 27 to 30 | 158 to 163 |
| sphere_9k | 9,024 | 2.7 | 35 to 48 | 56 to 89 | 97 to 109 | 232 to 255 |
| sphere_82k | 81,920 | 3.9 | 29 | 52 to 101 | 380 to 388 | 593 to 605 |
| torus_405k | 405,000 | 19.3 | 98 to 100 | 130 to 289 | 1,696 to 1,737 | 1,842 to 1,886 |
| sphere_1_3m | 1,310,720 | 62.5 | 302 to 309 | 683 to 715 | refused | refused |

The reference's message for the last row is "The STL file is too large for local loading." (the 25 MiB limit; native allows 512 MiB,
see PARITY_MATRIX). Native's import is about four to five times faster than in the first measurement (torus 458 ms before, 98 ms
now) because it no longer builds feature-edge lines for the imported part: the reference does not outline the part either (D-082).

### Orbit, at the display's cadence (the 75 Hz monitor, so 13.3 ms is a full-rate frame)

| scene | native fps | native p50 / p95 / p99 / max (ms) | reference fps pipelined / synced | reference synced p50 / p95 / p99 / max (ms) |
|---|---|---|---|---|
| box_30mm | 74.7 | 13.3 / 13.8 / 14.3 / 25.1 | 75.2 / 75.3 | 13.3 / 13.9 / 14.3 / 15.3 |
| sphere_9k | 74.7 | 13.3 / 13.8 / 14.4 / 25.1 | 75.2 / 75.2 | 13.3 / 13.9 / 14.3 / 15.0 |
| sphere_82k | 74.7 | 13.3 / 13.7 / 14.4 / 25.0 | 75.4 / 75.2 | 13.4 / 14.5 / 15.6 / 17.2 |
| torus_405k | 74.2 | 13.3 / 14.0 / 15.7 / 25.5 | 74.9 / 74.9 | 13.4 / 14.6 / 15.3 / 16.1 |
| sphere_1_3m | 37.5 | 26.7 / 27.4 / 27.8 / 28.0 | refused | |

Both hold the full 75 Hz up to 405k triangles. Native shows one slow frame (about 25 ms) per run (not investigated). At 1.3M
triangles native presents every second refresh. In the full run two of three runs of `sphere_9k` in the light theme were disturbed
(61.7 and 59.5 fps, a 60 ms stall) while the same scene in the dark theme was clean; six reruns of that scene afterwards were all
74.7 fps, and the table uses the undisturbed behaviour. The cause was not found (R-Viewport-5).

### Orbit, uncapped (the cost of a frame)

| scene | native fps | native p50 / p95 / p99 (ms) | reference fps pipelined | reference fps synced | reference synced p50 / p95 (ms) |
|---|---|---|---|---|---|
| box_30mm | 216 | 4.3 / 5.3 / 13.3 | 695 | 348 | 2.8 / 3.4 |
| sphere_9k | 215 | 4.4 / 5.3 / 13.3 | 687 | 319 | 3.1 / 3.4 |
| sphere_82k | 222 | 4.3 / 5.3 / 13.3 | 320 | 201 | 5.0 / 5.9 |
| torus_405k | 202 | 4.5 / 6.4 / 13.4 | 132 | 91 | 11.0 / 12.8 |
| sphere_1_3m | 108 | 9.2 / 10.7 / 13.3 | refused | | |

Native's frame costs about 4.3 to 4.5 ms from 12 to 405,000 triangles (it was about 5.5 ms before the part's edge lines were removed):
the cost is not the part. It is probably the rest of the Qt Quick window (two 3D views, the inspector and toolbars) and the swap chain,
but that was not profiled (R-Viewport-3). The reference's cost grows with the part and crosses native's between 82k and 405k triangles
on this GPU.

### Memory after the orbit (MiB; vsync run to uncapped run)

| scene | native working set | native private | native GPU | reference working set | reference private | reference GPU | reference JS heap |
|---|---|---|---|---|---|---|---|
| box_30mm | 172 to 239 | 128 to 195 | 56 to 65 | 595 to 630 | 323 to 360 | 110 to 128 | 8 |
| sphere_9k | 178 to 240 | 134 to 197 | 58 to 67 | 626 to 644 | 350 to 379 | 111 to 129 | 17 to 18 |
| sphere_82k | 186 to 250 | 145 to 208 | 70 to 71 | 744 to 761 | 442 to 471 | 121 to 142 | 58 |
| torus_405k | 253 to 350 | 213 to 310 | 93 to 94 | 1,001 to 1,003 | 695 to 701 | 166 to 177 | 155 |
| sphere_1_3m | 437 to 598 | 431 to 593 | 157 to 158 | refused | | | |

The ranges are the display-cadence run to the uncapped run (the applications' own start-up memory varies between runs by tens of MiB,
so the part's share is only visible on the large models: the torus adds about 14 to 111 MiB to native and about 424 to 426 MiB to the
reference's process tree). The reference number includes the whole browser, which is a larger idle baseline than a Qt application.

## What was found

1. **Fixed: the camera after an import.** The reference fits a newly imported model from the current view direction
   (`localStlImport`: `fitCameraToModel`; its starting camera looks along (95, -120, 73)), and only Reset View goes to the fixed
   (1, -1, 0.78) direction. Native reset the direction on every import, so the first view was a few degrees off and a user's
   view was thrown away by the next import. Native now fits from the current direction (D-077;
   `importFitsFromTheCurrentViewDirection` in `tst_app_workflow`).
2. **Fixed: the look.** Native now uses the reference's own values (D-082): part `#b8e3ec` and mold `#ba4a44` (roughness 0.38, metalness
   0.06), the page backgrounds `#0b1118` / `#f7f9fb`, the five-point lighting rig (key, fill, rim, hemisphere, ambient) fixed in the
   world, ACES tone mapping at the reference's exposure, the grid opacities 0.32 / 0.50 with the colours the frames show, and feature
   edges (`#380f0e`, opacity 0.65, 25 degrees) on mold bodies only. The values are read from the reference's modules by a generated
   fixture and pinned by `tst_viewport_look` (6 mutations caught). The background is a plain rectangle under a transparent 3D view,
   because Qt tone maps its clear colour and the reference does not tone map its background (backgrounds now match to the byte).
3. **A reference quirk, followed:** in the running reference the part colour, mold colour and lighting do not change with the theme:
   frames in the light theme show the dark theme's part and shading, byte for byte, even after toggling the theme at runtime, although
   the code has a light variant for each (the fixture shows the light rig with key intensity 1.3 against 1.45). Native follows what the
   application shows (D-081). Only the background and grid change with the theme.
4. **Ported afterwards: the ground-plane ruler and the hint badge** (section "The ground-plane ruler" below). Native's own coloured X/Y/Z axis lines are gone: the reference has none, the ruler is its orientation aid.
5. **Not ported: automatic part orientation.** The reference has an Orient action (`automaticModelOrientation`,
   `partOrientation3dRuntime`) that rotates a part to its best resting face. Native has no such action and no parity row for it.
6. **A real difference in robustness:** an STL whose facet normals are zero (the hand-made `bracket.stl` fixture) renders black in the
   reference (the same with software GL) and lit in native, which recomputes its own normals.
7. **Native loads what the reference refuses:** 62.5 MiB and 1.3M triangles ready in 0.3 s, rendered at half the display rate.
8. **A consequence to be aware of:** mold bodies are now all the reference's red, where native used a six-colour palette to tell bodies
   apart (R-Viewport-8).

## The ground-plane ruler

The reference draws, on the ground, the X and Y axes with a tick every fifth of a label step and numbered labels at every step
(yellow on the dark background, blue on the light one). The label step comes from the 1/2/5 x 10^n sequence so that labels stay
60 to 140 px apart on screen, with hysteresis: the current step is kept while its span stays in that band, so the ruler is rebuilt
only when the step changes or the grid changes, not on every camera move. Labels are camera-facing quads of 12 px at the zoom they
were built at, depth tested against the part. All of it is `groundPlaneRuler.ts` and `createGroundPlaneRulerRuntime.ts`.

Native: `core/view/GroundPlaneRuler` (the selection, layout, label text, projection and the stateful rebuild logic, no Qt),
`AppController` (follows the camera and the viewport size; rebuilds on the next turn of the event loop after a grid change, as
the reference does on the next frame, so an import's camera fit comes first), line geometry for the axes and ticks, and label
quads with a small text image each (white text, tinted by the material; Qt Quick 3D loads textures from files, so each label is
written once to a PNG in the cache directory). The Axes option of the View menu shows and hides the ruler.

**Checked against the real reference** (`ruler-reference.json`, generated by running the real modules: 10 tests in
`tst_ground_ruler`): the label step for 180 input combinations including the hysteresis and the invalid inputs, the tick and label
layout, the label text (`String(Math.round(v))`), the projection into pixels, and the geometry the real runtime builds along zoom
sequences (axes, tick vertices, label positions and heights, and the frames on which it rebuilds), for a dark and a light palette and
two grids. The colours and opacities of the axes (palette major grid colour, 0.66), ticks (white, 0.52) and labels are pinned as well.
Looking exactly along the up axis the reference's `lookAt` nudges the view by 0.0001 and native does not, which differs by about a
millionth in that one case.

**A correction this work forced.** The real engineering grid, built with the palette strings the application passes, has a white
minor grid (opacity 0.32) in both themes (three.js cannot parse `rgba(r g b / a)`) and a major grid in the palette's `rgb()` colour
(`#303943` dark, `#b7c3cf` light, opacity 0.50). The first look alignment had used a dim white major grid for the dark theme and a
grey minor grid for the light one, from measuring frames; the fixture now pins the real values and both grids draw every line, as
the reference's do.

**Pixels, after the ruler** (one run per scene, frames are deterministic; whole frame, native against reference):

| scene | empty-frame mean abs diff | whole-frame mean abs diff | whole-frame SSIM | mask IoU |
|---|---|---|---|---|
| box_30mm dark | 0.0063 to 0.0048 | 0.0068 to 0.0064 | 0.916 to 0.921 | 0.997 |
| box_30mm light | 0.0052 to 0.0029 | 0.0074 to 0.0070 | 0.913 to 0.921 | 0.999 |
| sphere_9k dark | 0.0063 to 0.0048 | 0.0040 to 0.0035 | 0.967 to 0.973 | 0.981 |
| sphere_9k light | 0.0052 to 0.0029 | 0.0046 to 0.0040 | 0.961 to 0.975 | 0.998 |

(Each cell is before the ruler, then after.) The labels sit within a few pixels of the reference's: the font is the platform's
(a browser's `system-ui` 600 weight against Qt's semibold), and the reference measures the zoom one frame late, which native does not copy.

**The hint badge** ("Left drag Rotate - Right drag Pan - Wheel Zoom"): bottom right, 16 px from the edges, the reference's panel
colour at 84 %, subtle border, muted text, shown while a model is loaded and nothing is busy until the first press or wheel in the
viewport, once per session (`Viewport.tsx` `showHint`). Two smoke tests send a real mouse press and a real wheel event; three
mutations (press, wheel, always hidden) each fail one.

**Not measured:** the timing tables above were taken before the ruler was added. A full re-measurement in both modes was started
and was stopped by the system after three scenes because it ran low on memory; it has not been repeated. The ruler adds a few
dozen label quads and two line models to every frame, so the frame cost and the import time should be re-measured before the
timing tables are quoted for the current build (R-Ruler-2).

## Limits of these numbers

- One machine, one integrated GPU, one display refresh rate for the timings, one viewport size, one orbit path. They say nothing about a
  discrete GPU, a 60 or 144 Hz display, a 4K viewport, or macOS. A first run of the "after" measurement had the native window on the
  60 Hz monitor and read 61 fps; the bench now picks the fastest screen and records it, which is why the result files name it.
- The reference runs in headless Chrome with synthetic pointer events and a GPU readback to wait for completion; native runs a
  real window. The cadence protocols are comparable in intent, not identical, and the synced column is deliberately pessimistic.
- Native timings come from a Release build with the test-only code compiled in (`CRAFT_BUILD_TESTS`); the Debug build is much
  slower and was not used for any number here.
- Three runs per scene: the run logs agree closely run to run, with the one disturbed scene described above, but no confidence
  intervals were computed.
- The mask method has known weak points: it includes the reference's shadow where it touches the part, and the grid labels as
  described above. IoU near 0.99 therefore means "the silhouettes agree", not "the images agree".
- The lighting is an approximation (R-Viewport-7): the colour difference inside the part is 0.025 to 0.031 on a 0 to 1 scale and the
  similarity is not 1, so this is not a claim of identical shading. Specular highlights, glass and the other part roles (registration
  keys, sprue funnels, cavity surfaces) were not compared.
- The memory numbers are of the whole process tree at one moment; no leak or repeated-import test was done.

## Re-running

```
cmake --build --preset windows-release --target craft craft_imgcompare          (from native/)
node node_modules\vite\bin\vite.js build --outDir D:\CraftNative\build\reference-dist --emptyOutDir   (from mold/frontend/)
.\scripts\native\compare-viewport.ps1                 # display cadence, writes summary.md and summary.json
.\scripts\native\compare-viewport.ps1 -NoVsync        # uncapped
.\scripts\native\compare-viewport.ps1 -Recompare <run folder>     # only the pixel metrics, from saved frames
.\scripts\native\generate-reference-fixtures.ps1 -Only look       # the look constants from the reference modules
```

Results go to `D:\CraftNative\build\viewport-compare\run-<time>` (frames, side-by-side and difference images, one JSON per run).
The raw runs behind this document: `final-vsync` and `final-uncapped` (before the look was aligned) and `look2-vsync`,
`look2-uncapped` and `recheck-9k` (after) in that folder.
