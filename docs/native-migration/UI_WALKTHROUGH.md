# UI walk-through: the native window against the reference app

Done 2026-11-19 on one machine (Windows 11, 1920 x 1080 at 100 %). This document says how the two user interfaces were walked through,
how they are organised, which control of the reference corresponds to which control of the native window, what the walk-through found and
fixed, and what it did not look at. The tools are `scripts/native/ui/` (`native-tour.ps1`, `reference-tour.ps1`, `referenceUi.mjs`),
`native/app/UiTour.*` (the native tour, development builds only) and `scripts/native/check-source-encoding.py`. The pictures are in
`D:\CraftNative\build\ui-walkthrough\` (not in the repository).

## Short version

- **The model tools are now the reference's floating toolbar (2026-11-23, D-124).** Until then this document said the two UIs were organised
  differently on purpose and the native tools were text buttons in the window's tool bar; the owner compared a screenshot of each and wanted the
  reference's toolbar. The viewport now carries the same icon bar at its upper centre (Flip, the mold-scale stepper, the cutting-plane badge,
  Pointer, Eraser, Sprue, the cavity button, the glass toggle, Master Mold, Undo, Redo). The rest is still native (menus, the inspector, the status bar),
  and the window's tool bar keeps the file and view commands, as the reference's header does.
- **Every capability of the reference's toolbar has a native counterpart.** Flip (manual part orientation) was ported later (D-108); drag and drop of an STL
  onto the window and the Molds browser (show or hide each mold body and the original model) were missing and are now ported.
- **Looking found ten defects that no test had caught** (below), of which nine are fixed. The seed was one picture: the hint badge had a stray
  A-circumflex before each separator dot.
- **The cause of a whole group of failing smoke tests turned out to be a stale autosave** left by the new tour: the next launch opened with
  the "Recover unsaved work?" dialog over the window and every test that sends real mouse events failed. The smoke tests now have an autosave
  folder of their own (R-Smoke-1).
- **Not examined:** HiDPI and scaling in the real window, keyboard navigation and focus order, accessibility names, translations, the
  native file dialogs, and the lower half of every state the tour could not drive (below).

## Method

**Native.** `craft --ui-tour <dir>` drives the real controller through twelve states: empty, model loaded, part selected, cut faces chosen,
Eraser over a plane, mold generated, sprue placed, moldability report, Master Mold generated, segmentation planned, every inspector section
folded, import error. In each it
captures, for the dark and the light theme at 1280 x 800, the whole window and the whole content of the inspector (about 3,400 px tall in the
report state: the inspector scrolls, so a window capture shows a third of it), and the window in the dark theme at its minimum size: 36
window captures and 24 inspector captures. Every capture is linted from the live item tree: text that is truncated, items cut off at the right
edge of the panel they sit in, items outside the window, controls narrower than their content. `native-tour.ps1` runs it with an autosave
and cache folder of its own and exits non-zero on any finding.

**Reference.** `referenceUi.mjs` drives the production build of the reference app (the same one the viewport comparison uses) in Chrome with
Playwright, through its own buttons: import, select the part, open the cutting session (both tabs), Mold Scale, Master Mold, in both themes;
for each state a screenshot and an inventory of every visible control with its accessible name. A small step language (`click:`, `clickxy:`,
`shot:`, `dump:`, `key:`, `text:`) lets a state be explored without writing code.

**What a picture is for.** Pictures were looked at, not diffed: the two UIs share no layout. The lint and the inventories are what can be
repeated.

## How the two are organised

| | Reference | Native |
|---|---|---|
| Frame | header (import, title, theme), icon toolbar (centre), navigation panel (left, collapsible), status area (bottom) | menu bar, a tool bar of file and view commands, **the floating icon toolbar in the viewport (centre, as the reference)**, viewport, context inspector (right, scrolls), status bar |
| Settings and results | popovers and a session panel over the canvas; reports in a context area | one inspector column: Model, Segmentation, Master Mold, Mold, Mold result, Sprues, Import analysis, Engineering reports, Selection |
| Cutting | one session: "Constructed Cutting Plan" opens a panel with tabs Cutting by Face and Segmentation, Cancel and Done | no session: checkboxes and sliders per face, direct plane drag and the Eraser, a Segmentation section |
| Theme | the whole page | the whole window (a defect until today: see below) |
| Feedback | status area with eight indicators, live announcements | one status line and the units |

## Control map

| Reference control | Native | Status |
|---|---|---|
| Import Object / Replace Object | File > Open STL..., toolbar, **drag and drop (new)** | done |
| Switch to light / dark theme | View > Light theme | done (menu only, no toolbar button) |
| Navigation panel, collapse button, "Workspace" link | none: there is one workspace | not applicable |
| "Skip to engineering workspace" link | none | gap (accessibility, R-UI-3) |
| Flip (quarter turns of the part, arrow keys) | none | not ported (R-Viewport-4) |
| Mold Scale (numeric popover) | Clearance field in the Mold section | done |
| Constructed Cutting Plan (session, Cancel / Done) | Cut by face rows, plane drag, Eraser, Segmentation section | capabilities ported, the session step is not (a deliberate difference) |
| Pointer tool, Eraser tool, Sprue | Select, Eraser, Sprue | done |
| Master Mold, Master Mold pieces | **"Master" toolbar button (new)**, Mold menu > Master Mold, Generate Master Mold in the inspector, and the pieces list with its toggles | done (the reference's session-open rule does not apply: native has no cutting session) |
| Undo, Redo | toolbar, Edit menu, Ctrl+Z / Ctrl+Y | done |
| Printer build volume prompt, X / Y / Z axis buttons | Printer build volume fields, Add X / Y / Z cut | done |
| Molds browser: eye per mold body, eye for the original model | "Molds" section of the inspector: a checkbox per mold body and one for "Original" | done (checkboxes instead of eye icons; see below) |
| Engineering reports list, pull direction card | Engineering reports section of the inspector | done |
| Status area (Frontend, Mode, Engine, Analysis Session, Viewport, Model, Measurement, Selection) | status line with the last message, units and Z-up | partial: no indicators |
| Live announcements ("Model selected.") for screen readers | none | gap (accessibility) |
| Instruction text ("click the model to select it, Escape clears") | the hint badge says rotate, pan, zoom | partial |
| (none) | Measure tool, project save / open / recovery, STL export, mold opacity, cavity clearance, ruler option | native additions |

## Found and fixed

| # | Defect | How it showed | Fix | Guard |
|---|---|---|---|---|
| 1 | The hint badge read "Rotate, A-circumflex, dot, Right drag ..." | one picture | the middle dot is an escape in the source | `source_encoding` ctest over native, scripts and docs |
| 2 | The Light theme recoloured the viewport only: toolbar, menus and panels stayed in the operating system's scheme | the light capture had a dark window around a light viewport | the theme sets the application's colour scheme (Qt 6.8) | `theThemeSetsTheColourSchemeOfTheWholeWindow`, mutation caught |
| 3 | The third printer-size field was cut off at the panel edge | one picture; the tour's lint reports this class | three fields sharing the width under a label | the tour lint (0 findings) |
| 4 | **At the minimum window width (800 px) the toolbar ran off the window**: Redo and the mold opacity slider were outside it | the tour's lint (10 items, every state) | the opacity slider moved into the Mold section, minimum width 880 px | the tour lint |
| 5 | In the dark theme an unchecked checkbox was a plain blue square and a checked one the same square with a faint tick | a zoomed capture of the Cut by face rows | `CraftCheckBox`: an empty bordered box when off, the highlight colour and a white tick when on, explicit colours (the palette's base colour came out as the accent blue under this style) | looked at in both themes |
| 6 | The cut-face sliders started at a different x in every row | the same capture | a common width for the checkbox column | looked at |
| 7 | Engine identifiers shown to the user (`parting_strategy_requires_manual_review`, strategy and status names) | the 3,400 px inspector capture | the separators are shown as spaces (only the separators change: the report data and the words are the engine's) | looked at |
| 8 | **Drag and drop of an STL onto the window did nothing** (the reference tells the user to) | the reference's text inventory | `DropArea` with the reference's validation and messages (exactly one file, `.stl` in any case, not empty), checked before the unsaved-changes prompt; an outline while a drag is over the window | `droppedFilesAreValidatedLikeTheReference`, `app_smoke_drop` through real platform drag events; 8 mutations caught |
| 9 | The recovery dialog covered the window in every capture after a run that had not closed cleanly | the second tour's pictures | `native-tour.ps1` isolates autosave and cache; see the next section | the wrapper |
| 10 | (Not fixed) The Windows title bar stays in the system theme | the light capture | not fixable from QML | R-UI-2 |
| 13 | The reference has Master Mold as an entry of its toolbar; native had it only in the inspector. Adding the button also showed that **the panel's `canGenerate` never notified**: the model loading and the busy state change did not emit `masterMoldChanged`, so the inspector's own Generate Master Mold button stayed disabled after an import (it is greyed in the first tour's mold-generated capture) | a "Master" button (label short, name and tooltip "Master Mold"; highlighted when complete; unavailable while generating; tooltip is the progress, the failure, "needs regeneration", or the name) shared as one Action with a Mold-menu entry; the notification gap closed; the toolbar had no room left at 880 px (lint: Redo off the window) so its spacing went from 4 to 2 px | `masterMoldAvailabilityNotifiesWhenTheModelOrBusyStateChanges`, `app_smoke_master` through a real click; tour lint 0 |
| 12 | The reference's Molds browser had no counterpart: no way to hide a mold body or the model to look at what is inside | a "Molds" section (hidden under Master tooling, which has its own pieces list): a checkbox per body and one for the original model, accessible by name; visibility is kept by id in the scene model, survives the same mold being rebuilt, is reset by a new model, and is not an undo step (D-073). The checkbox list runs on the body ids so that toggling does not rebuild (and so destroy and unfocus) the checkbox that was toggled | `theMoldsBrowserShowsAndHidesBodiesAndTheModel` (picking skips a hidden model, undo depth unchanged), `app_smoke_molds` through real clicks; 7 of 9 mutations caught, the other two equivalent in practice |
| 14 | **The native window had no floating model toolbar** (owner's screenshots: the reference's icon bar over the viewport, against a row of text buttons in the window header) | `ViewportToolbar.qml`: a dark rounded bar (the reference's neutral-950 whatever the theme) at the upper centre of the viewport, 30 px icon buttons with the reference's own SVG glyph paths drawn by Qt Quick Shapes, the reference's hover, active (accent tinted), disabled (34 %) and focus states; Flip; a mold-scale stepper (minus, value in mm, plus; whole millimetres, clamped to the limits); a round badge with the number of chosen cutting planes; Pointer, Eraser, Sprue; the cavity button ("Create Cavity", then "Rebuild Cavity", "Creating Cavity…" while it runs); the glass-appearance toggle once a mold exists; Master Mold (tooltip is its state); Undo and Redo. The bar takes the pointer (a drag on it does not orbit, the wheel does not zoom) and wraps onto a second line in a narrow viewport. The window's tool bar keeps Open STL, Open project, Save project, Measure, Fit view and Reset view; the old text buttons for the tools are gone (the menus and shortcuts are unchanged) | `app_smoke_toolbar` through real clicks (every button, the stepper's arithmetic and displayed value, a disabled button ignoring a click, the badge, the cavity and glass buttons, Undo and Redo, and a drag on the bar not orbiting the view with a control drag that does; mutation: removing the bar's input area fails it), the existing real-click tests (`app_smoke_master`, `_flip`, `_undo`) on the same buttons, tour lint 0 at 100 % and 150 % text |
| 11 | The inspector was one 3,400 px column of fixed group boxes | the full-height capture | `CraftSection`: every section folds from its header (click, Space or Enter), the header takes focus with Tab, shows a focus ring and names itself and its state to a screen reader; "Collapse all" and "Expand all" at the top; nested sections too. Fold state lasts for the session, it is not saved with the project or between runs | `app_smoke_sections` through real clicks and keys, 9 mutations caught; a tour state with every section folded |
| 16 | A thin divider could hang alone at the end of the toolbar's first line when the bar wrapped in a narrow viewport | each divider (`BarSeparator`) is drawn only when the buttons before and after it are on its own line; it keeps its width, so hiding it does not move the buttons | `app_smoke_toolbar` sweeps the bar's width limit from 700 to 120 px and compares every divider with an answer computed from the buttons' own positions (it requires that some width hides one); two mutants caught, tour lint 0 at 100 % and 150 % |
| 15 | The first version of the floating toolbar lacked three of the reference's pieces: **Mold Scale**, the **Constructed Cutting Plan** session and the **Master Mold pieces list** | all three added (D-125). Mold Scale: a drag in the viewport (0.1 mm per pixel, one undo step, Escape restores the value and the mold) and a number field under the bar. The session: its button, a panel under the bar with the Cutting by Face and Segmentation tabs, a plane count or the X / Y / Z extension buttons, and Cancel and Done; Cancel rolls the planes, the extensions, the mold and the history back. The pieces list: a button once there is tooling, with Show all, Isolate and a check box per piece | 8 session and 6 Mold Scale controller tests (`tst_app_workflow`), real clicks in `app_smoke_toolbar` (the tool, a drag, Escape, a typed value, the session's tabs, axis buttons, Cancel, a refused Done and Done) and `app_smoke_master` (the list), mutations caught, tour lint 0 |

## The stale autosave, and what it says about R-Smoke-1

The tour exits without a clean shutdown, so it leaves an autosave in the real folder, and the next launch of any kind opens with "Recover
unsaved work?" as a modal dialog. The first full ctest after the tour failed six tests together: every one that sends real mouse events
(the sprue gizmo, both hint badge tests, undo, the Eraser, the plane drag) and none of the others. The dialog swallows the synthetic presses;
the failure messages ("the hint badge stayed after the first press", "hovering a plane ... did not highlight it") describe the symptom of that, not a
cause. Found by bisecting down to code that was identical to the last green run and still failing, then looking at the screen from an
earlier capture, which showed the dialog; deleting my three stale autosave files fixed it at once. (The bisect had its own trap: restoring a file by copying
it kept its old modification time, so the build did not rebuild it.)

What changed: every smoke test now has an autosave and a cache folder of its own in the build tree; a smoke or tour run with an isolated autosave
folder discards stale recovery state at start (never the user's own); the viewport comparison script isolates too. Proved by planting an autosave
in the real folder by running the tour unisolated: all eight smoke tests pass and the real file is untouched.

What it does not show: no smoke test leaves an autosave behind when it runs (checked after each of them, two rounds), so this does not by itself explain the
three earlier failures recorded in R-Smoke-1, which stay unexplained. It is a second way for exactly that kind of failure to arise (any killed
or timed-out run of the application leaves an autosave), and it is now closed.

## Open findings

- **Status indicators and the instruction text** of the reference have no equivalent; the status line carries the last message only.
- **The inspector's sections fold now** (item 11), but the content of an expanded reports section is still long and dense, there is no index to jump to a
  section, and the fold state is not remembered between runs.
- **Long engine identifiers** stay long: mold ids like `reference-mold:1:bracket.stl:1084:mold:5` and the registration warning that quotes two of
  them (technical text from the engine, wrapped but not shortened).
- **Part selection is yellow in the dark theme** (the reference's selection colour by background, D-060): not a defect, noted because it surprises.

## Not examined

HiDPI and Retina scaling in the real window (the comparison runs set the scale factor to 1); keyboard navigation, focus order and visible focus;
accessibility names (the cut-face sliders and most icon-free controls have none of their own); translations (strings go through `qsTr`, no
catalogue exists); the native file and folder dialogs (they are the operating system's and block the tour); the unsaved-changes prompt after a
drop (it shares `guarded()` with File > Open, whose prompt has no test either: a mutation that skipped it could not be written
against these files and is recorded as untested); the sprue editor popup and the Recover dialog in both themes beyond the one capture; the busy
state with the progress bar; text with long file names or other locales' number formats; and the reference's behaviour in states the tour did not
drive (Sprue, the Eraser on a plane, Mold Scale with a mold, the reports).

## Re-running

```
cmake --build --preset windows-release --target craft                      (from native/)
.\scripts\native\ui\native-tour.ps1                                        # pictures, lint, exit code
.\scripts\native\ui\reference-tour.ps1                                     # the reference in the same states, both themes
node scripts\native\ui\referenceUi.mjs --out dir --stl part.stl --steps "click:Flip;shot:x;dump:x"     # explore a state
python -I scripts\native\check-source-encoding.py                          # double-encoded text anywhere
```
