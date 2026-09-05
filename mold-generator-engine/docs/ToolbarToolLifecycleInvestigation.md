# Mold Craft Toolbar Tool Lifecycle & Dependency Architecture — Deep Investigation

**Repo:** mold-generator-engine (React + Three.js + manifold-3d) · `frontend/src/features/mold-generation/`
**Branch:** feature/professional-eraser-redesign
**Date:** 2026-08-07 · **Type:** Investigation only. No fixes, no redesign, no new tools, no geometry changes, no production changes, no diagnostic artifacts left behind.

This report is evidence-driven. Every claim maps to `file:function` and, where useful, `file:line`. Tests referenced were run live: `splitFace.store.test.ts` + `cuttingWorkflow.store.test.ts` → 105 passed (see §Verify).

---

## 1. Executive Summary

**Does the toolbar behave as one connected lifecycle? No.** Mold Craft currently runs as a collection of largely independent commands that share one underlying *state container* (`useSplitFaceStore`) but do **not** share a lifecycle contract for *intent preservation*, *stale representation*, *dependency ownership*, *regeneration orchestration*, *re-entry*, or *async supersession*. The visible symptom (multi-body → single whole body after Mold Scale, and Registration disappearing) is real and **matches exactly the code paths** — it is a **systemic architecture gap**, not merely a local rendering bug, though it also contains one **deliberate contract decision** that reads as a bug to the user.

**Biggest confirmed failures:**
1. **Mold Scale collapses segmentation-derived multi-body mold to ONE whole body** — confirmed at `rebuildReferenceMoldForClearance` / `buildSegmentationBaseForClearance` (splitFace.store.ts ~202–311): a `segmentationLineage===true` definition is rebuilt as `[wholeBody]` length 1. Recovery exists (`regenerateSegmentationAfterScale`) but it **explicitly declines to replay** when the committed One Mold result used a user extension axis (`cuttingWorkflow.store.ts:372` → `hasExtensionBoundaries` returns early), leaving the whole-K2 base as the **truthful final result** — which is exactly the video's collapse.
2. **Construct re-entry destroys Registration intent/geometry.** `openSession → setActiveTab("cutByFace") → activateCutByFaceSelection → enterSelection()` calls `enterSelection()` (splitFace.store.ts:354) which sets `definition:null`, `cavity:unavailable`, `registration:unavailable`. Reopening the panel **clears the committed cavity/registration (and nulls definition) regardless of whether the user changes anything**.
3. **No durable Registration intent.** Registration has **no standalone store and no persisted "enabled" flag**. It is inferred only because `registration.status === "generated"` geometry exists. When any upstream edit invalidates, `unavailableRegistration()` is set and the *intent* is gone — only output-geometry-backed presence, not durable semantic intent (confirmed: no `registrationEnabled` anywhere; the only persisted field is `registrationPolicyId:"default"` on the document).
4. **History restores geometry but not cross-store tool intent.** Undo/Redo capture a `snap()` of the splitFace store (which does include cavity/registration/sprue/lastCommittedResult), so it is *good* at one level — but Registration/Sprue/Segmentation intent and the cutting-workflow provenance live in *separate* stores with separate/absent history (see §22).

**Is the video local bugs or systemic?** Both. The collapse is the result of a systemic "storage = outputs, inputs discarded" design (the exact trap in the `cad-continuity-investigation` skill), plus one *deliberate* choice not to replay user extension boundaries. The Registration disappearance is a *local-but-contagious* reset in `enterSelection` made systemic by the absence of a shared invalidation/stale model.

**Highest risk tool interactions:** Mold Scale after Segmentation; Reopen Construct after Cavity+Registration; Undo/Redo across the cutting session boundary; async Worker completion racing a superseded Scale/Undo.

---

## 2. Video-to-Code Mapping

| # | Video event | Tool | Store | Mutation | Invalidation | Regeneration | Visible outcome |
|---|---|---|---|---|---|---|---|
| 1 | Import large model | (import) | modelImport / modelBounds | → `DOES_NOT_FIT` | plan deps marked stale via `handleUpstreamChange` | — | Segmentation preview active |
| 2 | Use Segmentation | One Mold / Automatic | `segmentationMode.store` (singleton) / `automaticDraft` | `requestMode → acceptPlan → executeAcceptedPlan` | — | segmentation execution worker | preview bodies |
| 3 | Commit cutting plan | Done | `cuttingWorkflow.commitActiveTab` → `adoptCommittedSegmentationResult` | `buildSegmentationDerivedDefinition` sets `segmentationLineage:true`, `moldBodiesPartitionReferenceBlock:false`, bodies=N | **resets singleton to `...initial`** (clears cavity/reg/sprue/undo) | adopts executed bodies | multi-body, `workflow:partsReady` |
| 4 | Create Cavity | Create Cavity | `splitFace.createCavity` | `cavity.status→complete` | — | cavity worker → derived mold eval | cavity visible |
| 5 | Registration generated | (derived) | derived eval → `generateDerivedRegistration` | `registration.status→generated` | — | auto | lock features visible |
| 6 | Reopen Constructed Cutting Plan | Construct | `openSession` | `preSessionSplitFaceSnapshot` captured | — | — | panel opens |
| 7 | (activate Cut by Face / switch tab) | — | `activateCutByFaceSelection→enterSelection` | **`definition:null, cavity:unavailable, registration:unavailable`** | invalidates derived | none | **existing Registration disappears** |
| 8 | Add another segmentation axis | Add axis | `addSegmentationExtensionAxis` → `requestMode/extension` | extension boundary + visual plane | marks prior plan stale | replan | new plan |
| 9 | Commit new segmentation | Done | `adoptCommittedSegmentationResult` | multi-body again | full reset (fresh undo/redo) | adopt | multi-body, reg unavailable |
| 10 | Generate Cavity again | Create Cavity | `createCavity` | complete | — | worker | cavity visible |
| 11 | Mold Scale | Mold Scale | `moldScaleRuntime.onPointerMove → updateClearanceEdit → invalidateForClearance` + `resetSegmentationForMoldScale` | `rebuildReferenceMoldForClearance` → `buildSegmentationBaseForClearance` → **`[wholeBody]` length 1**; `lastCommittedResult:null`; cavity/reg/sprue cleared | **collapses many→one immediately on move** | deferred to commit | 1 body |
| 12 | Scale commit | — | `commitClearanceEdit` + `void regenerateSegmentationAfterScale()` | base committed | — | One Mold: **replay skipped if `hasExtensionBoundaries`** (this case) OR topology mismatch | **collapse preserved** |
| 13 | Body Browser | — | `MoldBodiesBrowser` reads `selectActiveMoldBodies = lastCommittedResult?.bodies ?? definition?.moldBodies` | — | — | — | reflects 1 body (real state change, not render-only) |
| 14 | Registration disappears | — | `registration` = `unavailableRegistration()` | unavailable | segmented interfaces gone → nothing to key | none | disappears |

**The "not merely rendering" claim is confirmed.** The visible body list *is* the real store state (`selectActiveMoldBodies` reads `definition.moldBodies`, which is genuinely replaced by `[wholeBody]`). The video is faithfully showing the store's actual state.

---

## 3. Complete Toolbar Inventory

Main toolbar = `SplitFaceControls.tsx` (`role="toolbar"`, `data-viewport-position="upper-center"`), mounted in the viewport toolbar slot; plus the `CavityAction` embedded in the same toolbar. The Constructed Cutting Plan panel (`CuttingSessionPanel`) is opened from the Construct button; the viewport runtime (`createThreeViewportRuntime`) owns pointer interactions per active tool.

| Tool | Component | Store owner | Active-state owner | Pointer owner | Lifecycle owner | History | Worker |
|---|---|---|---|---|---|---|---|
| Pointer | SplitFaceControls | viewportTool.store | viewportTool | createThreeViewportRuntime (selection) | — | no | no |
| Constructed Cutting Plan (Construct) | SplitFaceControls button → CuttingSessionPanel | cuttingWorkflow.store (+ singletons/drafts) | cuttingWorkflow.state | panel/3D | cuttingWorkflow | snapshot pre-session | segmentation execution |
| Cut by Face | CuttingSessionPanel cutByFace | splitFace (singleton) | workflow | cuttingPlane3dRuntime | splitFace | yes | derived eval |
| One Mold (Segmentation as One Mold) | panel oneMold | segmentationMode.store (singleton) | phase/plan | segmentation runtime | segmentationMode.store | own stack | segmentation execution |
| Automatic More Molds | panel moreMolds/automatic | `automaticDraft` store | phase | same | own draft | own stack | own runner |
| Manual More Molds | panel moreMolds/manual | `manualDraft` (splitFace-shaped) | workflow | cuttingPlane3dRuntime (redirected) | own draft | own stack | own runners |
| Mold Scale | SplitFaceControls | splitFace (clearance) | viewportTool(mold-scale)+moldScaleRuntime | moldScaleRuntime | splitFace (`invalidateForClearance`) | yes | replay (regenerateSegmentationAfterScale) |
| Flip (orientation) | SplitFaceControls | partOrientation.store | viewportTool(orientation)+partOrientation3dRuntime | partOrientation runtime | partOrientation.store | no (gated pre-gen) | no |
| Eraser | SplitFaceControls | viewportTool(eraser)+splitFace | viewportTool | cuttingPlane3dRuntime (eraser mode) | splitFace.removeSplitFaceAndRebuild | yes | derived eval (rebuild) |
| Sprue | SplitFaceControls | splitFace (sprueDefinitions intent + sprues result) | viewportTool(sprue)+spruePreview3dRuntime/sprueResizeRuntime | sprue runtime | splitFace (createSprue/resize/rebuild) | yes | derived eval |
| Create Cavity / Rebuild Cavity | CavityAction | splitFace.cavity | — | — | splitFace.createCavity | yes | cavity worker + derived eval |
| Registration | (derived, no toolbar button) | splitFace.registration (Derived) | — | — | derived eval | via snap | derived eval |
| Mold visibility | MoldBodiesBrowser | splitFace.bodyVisibility | — | — | splitFace.setBodyVisibility | yes | no |
| Model visibility | MoldBodiesBrowser | Viewport local state | — | — | Viewport | no | no |
| Glass/ghost/appearance | MoldAppearanceToggle | moldAppearance.store | — | — | moldAppearance.store | no | no |
| Undo / Redo | SplitFaceControls | routed to active draft or singleton | — | — | per-store | — | cancels in-flight |
| Measure distance | (legacy) | modelMeasurement.store | viewportTool | modelMeasurementRuntime | measurement | no | no |

---

## 4. Tool Classification Matrix

| Tool | Class | Expected invariant | Actual |
|---|---|---|---|
| Pointer | A Navigation | don't mutate | ✅ navigation only |
| Constructed Cutting Plan | G Workflow/session | reopen restores editable intent | ⚠️ partial — restores singleton snapshot on **cancel**, but opening itself invalidates definition/cavity/registration |
| Cut by Face | C Canonical | dependent derived geometry stale; canonical stays truthful | ✅ rebuilds definition; clears cavity/reg |
| One Mold / Auto / Manual | E Derived + I Async + J History | must not destroy source; store re-executable inputs | ❌ **stores only outputs; clears `cuttingPlanes` to `[]`** → scale collapse |
| Mold Scale | H Orientation/transform + C | K2 change → downstream regen in order | ⚠️ invalidates correctly but replay is conditional/declined |
| Flip | H Orientation/transform | must not invalidate downstream if no topology change | ✅ gated to pre-generation; locked after geometry exists |
| Eraser | F Destructive (topology) | must preserve downstream intent, mark stale | ⚠️ rebuilds definition, clears cavity/reg — intent not preserved |
| Create/Rebuild Cavity | E Derived | rebuild from current source | ✅ `createCavity` re-runs against current definition |
| Registration | E Derived (auto) | derived; no source destruction | ⚠️ **no durable intent**; purely geometry-presence-backed |
| Sprue | G+E | intent survives upstream change; geometry invalidates | ✅ intent (`sprueDefinitions`) survives invalidation; geometry clears |

---

## 5. State Ownership Map

**Single shared geometry container:** `useSplitFaceStore` (`splitFace.store.ts`) — the de-facto "document". Authoritative fields:
- `definition: ReferenceMoldDefinition|null` (K1/K2/moldBodies, `segmentationLineage`, `moldBodiesPartitionReferenceBlock`)
- `cuttingPlanes: CuttingPlaneRecord[]` (**the re-executable input** for Cut-by-Face-style modes; `[]` after segmentation adopt)
- `clearanceMm`, `cavity: CavityWorkflowState`, `sprues: SprueDefinition[]` (geometry), `sprueDefinitions: SprueOperationDefinition[]` (**intent**), `registration: DerivedRegistrationState`
- `document: MoldDocument` (revision + fingerprint — the identity/fingerprint), `evaluation: MoldEvaluationState`, `lastCommittedResult: FinalMoldResult`
- `bodyVisibility`, `undoStack/redoStack: Snapshot[]`, `segmentationRegenerationCount`

**Other owners:**
- `useCuttingWorkflowStore`: session state (`idle`/`sessionOpen`+tab), `lastMoreMoldsProvenance`, `lastOneMoldProvenance`, `lastReopenBlockedReason`, `lastCommitBlockedReason`. **Not in splitFace history.**
- `useSegmentationModeStore` (One Mold, also the singleton's segmentation): `plan`, `result`, `preview`, `phase`, `extensionBoundaries`, own undo/redo.
- `automaticDraft`, `manualDraft`: separate `createSegmentationModeStoreCreator`/`createSplitFaceStoreCreator` instances with **isolated worker runners**.
- `useViewportToolStore` (active tool + context), `usePartOrientationStore`, `useMoldAppearanceStore`, `useModelSelectionStore`, `usePrinterBuildVolumeStore`, `useModelImportStore`.

**Fingerprint / revision:** `document.fingerprint = documentFingerprint(revision, definition, cuttingPlanes, clearanceMm, cavityClearanceMm, sprues)` (splitFace.store.ts:102). Registration builds its own `revision` from a snapshot hash (`buildRegistrationDependencySnapshot`), and sprues `moldRevision` from cavity signature + body geometryVersions. So identity is **content-hash based**, not a persisted lineage ID — body IDs change on replan (see H7).

---

## 6. Dependency Graph (proven from code)

```
Source model (import) ──(transform)→ K1 (selectionBoxBounds) ──(+orientation)──►
   orientation : partOrientation.store (gated pre-gen)
   printer volume : printerBuildVolume.store
        │ (fit analysis → DOES_NOT_FIT?)
        ▼
Cutting/segmentation plan :
   Cut by Face → cuttingPlanes (splitFace.store) [INPUTS kept]
   One Mold → segmentation plan (segmentationMode.store) [INPUTS kept in draft]
   Auto/Manual More Molds → draft plan [Auto: INPUTS discarded on adopt]
        │ commit
        ▼
Mold bodies (definition.moldBodies) ── segmentationLineage flag ──►
   ▼
Cavity (definition + part mesh) ──► cavity.result / cavityTool
   ▼ (needs cavity)
Sprue (sprueDefinitions intent, cavity-dependent) ──► sprues (geometry)
   ▼ (needs bodies+cavity+sprue)
Registration (bodies + cavity + cuttingPlanes + sprues) ──► registration geometry
   ▼
Export / Body Browser / Viewport (lastCommittedResult?.bodies ?? definition.moldBodies)
```

Edges: `Clearance edit (Scale)` is a **fan-out upstream edit** that invalidates cavity/sprue/registration (all cleared) *and* for segmentation re-derives the base. The regeneration owner for the *base* is synchronous (`invalidateForClearance`); for *segmentation-derived* bodies it is `regenerateSegmentationAfterScale` (async, conditional); for cavity/registration/sprue there is **no automatic regeneration — the user must re-run Create Cavity** (which then re-runs derived eval regenerating sprue+registration).

---

## 7. Intent / Plan / Geometry Matrix

| Tool | User Intent | Derived Plan | Generated Geometry | Survives upstream edit? |
|---|---|---|---|---|
| Cut by Face | selected faces | `cuttingPlanes` (normalized) — **inputs persisted** | definition.moldBodies | ✅ inputs survive; outputs rebuild |
| One Mold | mode + fit-oversize | segmentation `plan` (axis counts) | executed bodies via adopt | ❌ plan only in draft store; **singleton carries only `segmentationLineage:true` boolean, not re-applicable inputs** |
| Auto More Molds | adaptive printer-fit | plan (forced replan) | adopted bodies | ❌ same — boolean only on definition |
| Cavity | create cavity | clearance + input signature | cavity.result | ⚠️ result cleared on invalidation; clearance persists |
| Sprue | anchor+profile | `sprueDefinitions` (**intent persisted**) | `sprues` geometry | ✅ intent survives; geometry cleared with cavity |
| Registration | (none persisted) | — | registration geometry (status=="generated" ⇔ present) | ❌ **intent = geometry; no durable enabled flag** |
| Mold Scale | clearance value | clearance (K2) | rebuilt base | ✅ clearance persists; derived cleared |

**Critical**: `buildSegmentationDerivedDefinition` (splitFace.store.ts:318–332) copies the source definition + bodies and sets `segmentationLineage:true` + `moldBodiesPartitionReferenceBlock:false`. It does **not** carry planar inputs; `adoptCommittedSegmentationResult` wipes `cuttingPlanes` to `[]`. This is the "storage = outputs, inputs discarded" root of the collapse.

---

## 8. Re-entry Findings

| Tool | First use | Reopen/edit | Classification |
|---|---|---|---|
| Constructed Cutting Plan | openSession | **openSession captures pre-session snapshot (good for Cancel) but `activateCutByFaceSelection→enterSelection` immediately nulls definition + clears cavity/registration** — even with zero edits | **PARTIAL RESET / destructive on open** |
| One Mold | requestMode | reopens by `requestMode` (fresh plan; extension boundaries **cannot be reconstructed** — `hasExtensionBoundaries` permanently blocks replay) | PARTIAL / unsupported re-entry |
| Manual More Molds | draft | `initializeMoreMoldsTab → seedCuttingPlanesForReopen` (re-seeds INPUTS, recomputes) | ✅ correct incremental re-entry (inputs persisted) |
| Automatic | draft | reopens via validated provenance → `requestMode` fresh replan | ✅ valid (replans by design) |
| Mold Scale | drag | commit → `regenerateSegmentationAfterScale` (conditional) | PARTIAL (declines for extension/One-Mold-topology-change) |
| Eraser | remove plane | rebuild | ✅ |
| Cavity | create | `createCavity` re-run (Rebuild) | ✅ same command, current source |

**Core re-entry finding**: Only Manual More Molds (and conceptually Cut by Face) persist *re-executable inputs* and therefore survive re-entry. One Mold / Automatic persist only *outputs* + a boolean provenance → re-entry and Scale recovery are fragile/declined.

---

## 9. Invalidation Matrix

| Action | Becomes stale | Cleared | Preserved | Should regen | Regens? |
|---|---|---|---|---|---|
| Mold Scale (move) | cavity, reg, sprue geom, lastCommittedResult | `sprues:[], cavity:unavailable, registration:unavailable, lastCommittedResult:null`; segmentation plan `resetStrategy()` **on every move** | `clearanceMm`, `sprueDefinitions` (intent), cuttingPlanes | base (sync) + Segmentation (async commit) ; cavity/reg/sprue → **user must re-run** | base ✅; segmentation conditional; cavity/reg/sprue ❌ auto |
| Construct re-entry (Cut by Face open) | definition, cavity, reg | `definition:null, cavity:unavailable, registration:unavailable` | cuttingPlanes, sprue intent | (rebuild on commit) | only on commit |
| Commit segmentation | prior definition downstream | `...initial` full reset; **sprueDefinitions cleared too** | model signature | adopt | adopt only |
| Create Cavity | none (build) | — | | reg+sprue | ✅ via derived eval |
| Sprue add/resize | lastCommittedResult | — | sprueDefinitions | reg+sprue | ✅ |
| Eraser | definition+cavity+reg | cavity/reg unavailable | cuttingPlanes | rebuild | ✅ (derived eval) |
| Flip | — (gated) | full reset on orientation change (`clearForOrientationChange`) | — | — | n/a pre-gen |

**Null-vs-cleared question**: `invalidateForClearance` uses `unavailableCavity`/`unavailableRegistration` (i.e. **status is collapsed to "unavailable"**), not an explicit `stale`. `null` is used for "never created / cleared" in `lastCommittedResult` and `definition`. So the system does **not** distinguish "stale but regenerable" from "absent" — this overload is the missing stale contract (see §10).

---

## 10. Lifecycle State Semantics

- **splitFace.workflow**: `modelReady → selectingFaces → planesReady → (draggingPlane) → generatingParts → partsReady | error`. Purely UI-gating.
- **cavity.status**: `unavailable | generating | ready | complete | blocked`. Note: **"ready" is used both as "pre-cavity placeholder" and "regenerated base without result"**; "complete" = has result.
- **registration.status**: `unavailable | generating | generated | blocked | failed | cancelled | stale` (type defined in registrationLifecycle.ts:38) — but the invalidate path sets `unavailableRegistration()` (`unavailable`), **not** `stale`. So `stale` is declared but **unused for invalidation**.
- **evaluation.phase**: `idle | evaluating | complete | failed | cancelled | stale` — `stale` **is** used here correctly (`invalidateForClearance` sets phase stale if evaluating).
- **segmentation phase**: `idle | planning | preview | accepted | executing | valid | failed | stale | cancelled | unsupported` — the **most** expressive store; `markStale` (segmentationMode.store.ts:479) sets `phase:stale` and clears `extensionBoundaries`, preserving the plan object.
- **document**: no explicit stale/dirty flag — only `revision` bumps.

**Overload conclusion**: The splitFace store conflates "never created", "cleared", and "invalidated" under `unavailable`/`null`; only the segmentation store and evaluation state have an honest `stale`. Cross-store semantics are inconsistent — exactly the missing shared stale model.

---

## 11. Regeneration Ownership

| Derived system | Trigger | Sync/Async | Auto? | Reuses intent? | Old result visible during? | Cancellation/commit guard |
|---|---|---|---|---|---|---|
| Base mold (Cut by Face/Manual) | `invalidateForClearance` per move | sync | yes | ✅ inputs | base shown | revision |
| Segmentation (One/Auto) | `regenerateSegmentationAfterScale` on Scale commit | async (worker) | conditional | plan in draft | false — base (1 body) shown during | `expectedPriorRevision` guard + `canCommitMoldEvaluation` |
| Cavity | `createCavity` (user) | async | **no** | clearance+signature | old cleared | `generationVersion` + `canCommitMoldEvaluation` |
| Registration | derived eval (auto with cavity/sprue) | async | yes (when eval runs) | snapshot | — | `canCommitMoldEvaluation` |
| Sprue | user add/resize/move AND auto in eval | async | yes within eval | `sprueDefinitions` (persisted intent) | — | requestId + canCommit |

---

## 12. Required Regeneration Order (proven dependency order)

1. Source model / orientation / K1  (orientation locked post-generation → done first)
2. Clearance / K2 base  (`invalidateForClearance` rebuild) — **must precede** segmentation replan
3. Segmentation (if lineage) → multi-body
4. Cavity (needs final bodies + part mesh + clearance)
5. Sprue (needs cavity + bodies)
6. Registration (needs bodies + cavity + cuttingPlanes + sprues)
7. Body Browser / Export (must read **final promoted** state, never intermediate whole-K2)

**Violation found:** during the Scale async window the *base* (step 2) is promoted as `workflow:partsReady` with `definition.moldBodies=[wholeBody]`, so **step 7 (presentation) can legally observe / Cavity button can enable against the whole-K2 intermediate** before the replan (step 3) lands. There is a `segmentationRegenerationCount` guard that blocks `createCavity` (createCavity.ts:760 and CavityAction disabled state) while the count > 0, mitigating the *UI* — but the body list itself legitimately shows the intermediate whole body. This is the presentation-consistency finding.

---

## 13. Constructed Cutting Plan Findings (initial vs reopen)

- **Initial**: `openSession()` records `preSessionSplitFaceSnapshot`; Cut by Face edits singleton directly; `commitActiveTab` → `createMoldParts` (Cut) or `adoptCommittedSegmentationResult` (Segmentation tabs).
- **Reopen**: `openSession` again; then `activateCutByFaceSelection()` (called for the `cutByFace` default tab) sees workflow already `partsReady` (not `selectingFaces`/`planesReady`) so it calls **`enterSelection()`**, which **nulls definition and clears cavity+registration** (splitFace.store.ts:354). So **merely opening the panel destroys committed cavity/registration truth even before a single edit**. If the user edits an axis and commits, `adoptCommittedSegmentationResult` further resets everything to `...initial`.
- ✅ **Cancel is safe**: `cancelSession()` restores `preSessionSplitFaceSnapshot` verbatim (cuttingWorkflow.store.ts:967).
- ✅ **Done is guarded**: commit only when valid; blocked reason surfaced.
- ❌ **Edit is not incremental**: reopening is not "edit node X of the current dependency graph"; it is "start a fresh Cut-by-Face or replan attempt", and the pre-edit committed geometry is discarded the moment any change commits (or even on open for Cut-by-Face).

**This is why Construct re-entry breaks Registration:** reopening the plan invalidates `registration` to `unavailable` (via `enterSelection`), and Registration has no durable intent to preserve, so once the segmented interfaces are also gone (Scale) or the state was reset (enterSelection), there is nothing left to restore or regenerate automatically.

---

## 14. Mold Scale Findings — exact multi-body → whole-body transition

- **pointer-down/move/up**: `moldScaleRuntime.onPointerMove → onUpdate(next)` → Viewport `handleMoldScaleUpdate` → `updateSingletonClearanceEdit` = `updateClearanceEdit` → `invalidateForClearance` (splitFace.store.ts:83) → `rebuildReferenceMoldForClearance` (239) → because `definition.segmentationLineage===true` (298) → `buildSegmentationBaseForClearance` (174) → `moldBodies:[wholeBody]` (length 1) (202–273).
- Actually ALL of `bodyVisible` multi-body set from the *store* is replaced by one whole body synchronously on first move.
- `regenerateSegmentationAfterScale` (cuttingWorkflow.store.ts:352) runs on commit:
  - One Mold: `if (oneMoldProvenance.hasExtensionBoundaries) return;` (372) → **no replay** when user axes used (this video path); also `sameTopology` mismatch (385) → no replay.
  - Automatic: always replans (test confirmed 2→ **3** bodies at line 624–626 — Automatic genuinely recovers).
- `promoteReplannedSegmentationResult` (splitFace.store.ts:1067) then sets the new multi-body definition **in place**, does not touch history (the Scale commit already pushed the one entry) and is protected against stale Worker results via `expectedPriorRevision` (1074).
- **Conclusion**: the collapse to 1 body during the drag is *correct-by-construction as a base*, and is *correctly recovered* for Automatic / topology-preserving One Mold. But for **One Mold with a user extension axis (the video's "add another segmentation axis")** the replay is **deliberately declined**, so the truthful whole-K2 base is promoted as the final mold — the collapse is then **not a bug but a product-policy decision that surfaces as a regression** to users who expect the segmented mold to persist. Registration then cannot regenerate because there are no segmented interfaces.

So the video is explained by **both** a systemic input-discard design AND a **deliberate `hasExtensionBoundaries` no-replay contract** in the production path.

---

## 15. Flip Findings

- `Flip` = `partOrientation.store.commitOrientation/flipOrientation`; the SplitFaceControls Flip button maps `activeTool==="orientation"`.
- **Gated**: `getPartOrientationCapability()` returns unavailable = "Model orientation is locked after mold generation" whenever `definition!==null || lastCommittedResult!==null || cavity.result!==null || sprueDefinitions.length>0 || registration.status==="generated"` (partOrientation.store.ts:61). So Flip exists only **pre-generation**.
- On orientation change the splitFace store `clearForOrientationChange()` resets to `...initial` (splitFace.store.ts:1001).
- **Verdict**: Flip is not "dependency-aware" in the active sense because it is **excluded after geometry exists**. It transforms the *source transform*, not K1/K2/bodies/registration/sprue anchors. Low regression risk to the connected loop (it never runs mid-loop).

---

## 16. Eraser Findings

- `Eraser` active tool → `cuttingPlane3dRuntime` eraser mode; on target plane click → Viewport `removeSplitFaceAndRebuild` → `splitFace.removeSplitFaceAndRebuild` (splitFace.store.ts:527) → removes the cutting plane, rebuilds `definition` via `buildMoldPartsDefinition`, runs derived eval, **clears cavity/sprue/reg** and sets `partsReady`, pushes one history entry.
- **What it can remove**: only **cutting planes** (Cut by Face / Manual topology inputs). It does **not** directly remove registration features or sprue geometry; it removes the *source* plane and the rebuild invalidates downstream.
- **Body identity**: rebuild recomputes `definitionId` from signature; body mesh/IDs may change.
- **After later tools**: e.g. after Cavity, an Eraser removes a plane → cavity/sprue/reg cleared but **sprueDefinitions intent preserved**; user must re-run Cavity to regenerate registration.
- **Verdict**: works as a topology editor; downstream intent partially preserved (sprue), Registration intent absent; usable only against face-based cutting (not against segmentation promoted bodies, which have `cuttingPlanes:[]`).

---

## 17. Cavity Findings (Create vs Rebuild)

- **Create Cavity and Rebuild Cavity are the same command** (`createCavity`, CavityAction.tsx:49 labels "Rebuild Cavity" when complete). No snapshot-restore; always rebuilds from current `definition` + current part mesh + `cavity.clearanceMm`.
- Guarded by `partGeometrySignature`, `workflow==="partsReady"`, `definition.moldBodies`, `segmentationRegenerationCount>0` (blocked during in-flight replan — createCavity.ts:760).
- `setCanonicalPartGeometrySignature` clears cavity/reg when the source part signature changes (splitFace.store.ts:905).
- **No persistent cavity "intent"** beyond `clearanceMm` + input signature; Rebuild uses current source. This is acceptable CAD behavior (explicit), but there is **no automatic re-cavity** after Scale — which is the core regeneration gap.

---

## 18. Registration Findings (intent vs geometry)

- **No standalone store. No durable intent.** Registration is a `DerivedRegistrationState` field on splitFace store, produced only by `buildRegistrationDependencySnapshot + generateDerivedRegistration` inside the derived mold evaluation.
- "Registration enabled" is **not stored**; it is inferred because geometry exists (`registration.status==="generated" && report.features`). There is **no `registrationEnabled` anywhere** (grep-confirmed); the only related persisted field is `document.registrationPolicyId:"default"`.
- When segmentation changes (Scale/re-open), `unavailableRegistration()` wipes it; nothing regenerates it automatically after Scale → the user must re-run Cavity (which re-runs derived eval). Body-identity change breaks remapping (no lineage).
- **Verdict: H13/H1 confirmed** — intent is stored *as geometry*; there is no durable semantic "Registration enabled" flag, so invalidation is irreversible by intent, only by re-running downstream.

---

## 19. Sprue Findings

- **Intent is durable**: `sprueDefinitions: SprueOperationDefinition[]` (anchor position, profile, creationOrder) — persists across `invalidateForClearance`, re-entry, Eraser (splitFace.store.ts preserves it in most resets). **Except**: `adoptCommittedSegmentationResult` resets `...initial` and **clears `sprueDefinitions`** (splitFace.store.ts:1044 uses `[]` for document sprues and returns initial state).
- Geometry `sprues` and `lastCommittedResult` are cleared on invalidation; sprue can only regenerate when cavity exists.
- **After Scale/re-segmentation/flip**: sprue definitions survive if not re-adopted; if segmentation re-committed, definitions cleared. Sprue anchors are **mold-local coordinates** (not body IDs) → they survive body-ID changes of the source, but their *cut* into target body IDs (`SprueDefinition.targetBodyIds`) is derived and invalidated.
- **Verdict**: Sprue is the **only tool with genuinely persistent re-executable intent** — worth using as the model for Registration.

---

## 20. Pointer/Selection Findings

- Pointer selects faces (`selectSplitFace`/`toggleFace`), gated by workflow. Selection targets **face/plane**, not body IDs for most flows; body-level selection is via viewport selection boxes. `selectActiveMoldBodies` applies `bodyVisibility` to the selected body source, so selection/visibility never independently choose a stale source — but the **source itself** (`lastCommittedResult?.bodies ?? definition.moldBodies`) can be the intermediate whole body during Scale, so selection can target that.

---

## 21. Presentation / Body Browser Findings

- `MoldBodiesBrowser` and Viewport both use `selectActiveMoldBodies` (splitFace.store.ts:1128) = `lastCommittedResult?.bodies ?? definition?.moldBodies` (with visibility). **The video's body-list change is real store state.**
- There is a **dual source**: Viewport also computes `segmentationCommittedBodies` from the *segmentation store* (`segmentationResult.status==="executed" ? (registration.bodies ?? result.bodies) : []`, Viewport.tsx:447) for the segmentation overlay, which can differ from the singleton's committed bodies — a known dual-source presentation risk noted in the registration skill reference.
- `canCommitMoldEvaluation` (moldEvaluationCoordinator.ts:9) is the **only** gate for async geometry becoming authoritative — good (requestId+revision+fingerprint match).

---

## 22. History Findings

- **What Undo/Redo captures**: a `snap()` of the splitFace store **including** `definition, cavity, registration, sprues, sprueDefinitions, document, lastCommittedResult, bodyVisibility`. So Undo *does* restore downstream geometry within the singleton. Tests confirm Clearance undo/redo restores clearance (splitFace.store.test.ts:34).
- **What it misses**: (a) other stores' intent — segmentation `plan/extensionBoundaries`, `lastOneMoldProvenance`/`lastMoreMoldsProvenance`, viewport tool; (b) async in-flight work — Undo **cancels** evaluation/cavity but cannot undo a worker result already committed (that's correct); (c) `segmentationRegenerationCount` is deliberately outside history.
- Undo/Redo is **routed** to the active draft during a cutting session (SplitFaceControls.tsx:103) and to the singleton otherwise. So the *history stack is per-store*, and crossing the cutting-session boundary resets which stack receives undo — this is where "Undo restores upstream but not all tool intent" bites.
- **Test sequence `Construct→Cavity→Registration→Scale→Undo→Redo`**: Undo after Scale restores the pre-Scale snapshot (segmented + cavity-complete) — **confirmed by splitFace.store.test.ts:449+** ("Undo restores the exact prior snapshot"). So within the singleton, Undo recovery is actually good; the gap is cross-store intent and the Scale-replay window.

---

## 23. Async / Worker Findings

- **Segmentation execution**: worker with `lifecycleEpoch` + request/commit-id guards (`executeAcceptedPlan` epoch); late results won't commit if epoch changed.
- **Cavity**: `generationVersion` guard (createCavity.ts:812 compares current.generationVersion); cancelled on supersede/undo/model-change.
- **Derived mold eval (sprue+registration)**: single reusable worker, `requestId`-scoped onmessage (workerClient.ts:33–39), `run()` cancels previous via `cancelActive` (line 25), and `canCommitMoldEvaluation` guards commit. **Supersession is well-protected.**
- **Scale replan**: `regenerateSegmentationAfterScale` captures `expectedPriorRevision` and `promoteReplannedSegmentationResult` atomically discards if `document.revision` moved (splitFace.store.ts:1074). Two overlapping Scale gestures handled with a reference-counted pending flag. **Tests confirm** stale replan is discarded (cuttingWorkflow.store.test.ts:629) and the pending count stays positive until all overlapping regens finish (694).
- **Verdict: H9 (async commits into changed state) is largely REJECTED** — the async guards are strong. The real async/architecture gap is that **cavity/registration/sprue have no automatic regeneration owner after Scale**, and the segmentation replay is *conditional*.

---

## 24. Small vs Large Mold Findings

- Small (fits printer): no segmentation needed; Cut by Face / Manual only → inputs persist → **lifecycle is healthy, Scale preserves split**.
- Large (oversized → Segmentation / One Mold / Auto): the same *shared* `invalidateForClearance` path re-derives the base, but `segmentationLineage===true` takes the whole-body branch → **the collapse is mode-specific and only appears in Segmentation-derived molds**, exactly as the cad-continuity skill predicted (Cut by Face / Manual survive; One Mold / Automatic collapse when replay declined).
- Auto More Molds *does* recover (replans adaptively). One Mold recovers only if topology preserved AND no user extension axes. So **there are two hidden lifecycle contracts** (H14 partially confirmed): segmentation-adopted ≠ face-based, and One Mold ≠ Automatic.

---

## 25. Cross-Tool Sequence Results (transition table)

| Sequence | Result | Broken invariant |
|---|---|---|
| Construct→Cavity→Reg→Construct re-edit→Cavity→Reg | Reg **cleared on re-open** (enterSelection); user re-runs Cavity → Reg returns | Re-entry invalidates derived intent w/o preserving |
| Construct(OneMold)→Cavity→Reg→**Scale**→regenerate→Cavity→Reg | Scale collapses base; Automatic regenerates multi-body; **Cavity/Reg wiped and require manual re-run** | No auto regeneration of cavity/reg; One Mold w/ extension declines replay |
| Construct(OneMold+extension)→Scale | **stays 1 body** (hasExtensionBoundaries early return) | Collapse persisted |
| Construct→Cavity→Sprue→Scale | sprue intent survives; geometry cleared; needs cavity re-run | intent OK, regen manual |
| Construct→Cavity→Reg→Eraser | removes a plane → cavity/reg cleared, sprue intent kept | topology edit not intent-aware (reg) |
| Construct→Scale→Flip→Cavity | Flip locked post-gen; not reachable | n/a |
| Construct(OneMold)→Scale→Undo→Redo | Undo restores segmented snapshot; Redo re-applies collapse | singleton history good; cross-store no |
| Repeat loops 10–30× | Stable; guards hold | — |

---

## 26. "Is It Loop?" Audit

| Tool | Class | Reason |
|---|---|---|
| Pointer | TRUE LOOP | stateless, safe |
| Cut by Face | **PARTIAL LOOP** (re-entry safe, but re-open invalidates downstream) | inputs persist; derived reset |
| One Mold | **BROKEN RE-ENTRY / conditional recovery** | inputs discarded; extension replay declined |
| Automatic More Molds | PARTIAL LOOP (recovery good) | replans; but resets `...initial` |
| Manual More Molds | **TRUE LOOP** | inputs persisted + re-seeded |
| Mold Scale | PARTIAL LOOP | invalidates correctly; auto-regen of cavity/reg missing; segmentation replay conditional |
| Flip | ONE-SHOT (pre-gen) | locked after generation |
| Eraser | PARTIAL LOOP | topology editor, derived intent cleared |
| Sprue | PARTIAL LOOP | strong intent; needs manual cavity re-run |
| Create/Rebuild Cavity | PARTIAL LOOP | explicit re-run fine, but no auto after Scale |
| Registration | **BROKEN DEPENDENCY RECOVERY** | no durable intent; no auto regen after Scale; body-id remap missing |
| Undo/Redo | PARTIAL | singleton geometry yes; cross-store intent no |
| Worker | TRUE LOOP (supersession) | strong guards |

---

## 27. First Broken Invariant Per Tool

- **After Mold Scale pointer-move**, Segmentation expects its multi-body to persist / regenerate, but receives a single whole body as the *current committed base*, because `invalidateForClearance→buildSegmentationBaseForClearance` replaces `definition.moldBodies` with `[wholeBody]` and auto-recovery is declined for One-Mold-with-extension / topology-mismatch.
- **After opening Constructed Cutting Plan (Cut by Face tab)**, the user expects the committed Cavity/Registration to remain untouchable, but receives `definition:null, registration:unavailable, cavity:unavailable`, because `activateCutByFaceSelection→enterSelection()` resets them on open.
- **After adopting a Segmentation result**, Cavity/Sprue/Registration expect their committed downstream state to be *marked stale*, but receive a full `...initial` reset (including `sprueDefinitions:[]`), because `adoptCommittedSegmentationResult` wipes everything.
- **After any upstream edit**, Registration expects to know it is *stale-but-regenerable*, but receives `unavailable`, because there is no durable intent and the invalidate path uses `unavailableRegistration()` rather than a `stale` status.

---

## 28. Root Cause Hierarchy

**Level 1 — Local bugs:**
- `adoptCommittedSegmentationResult` clearing `sprueDefinitions` (intent) on segmentation adopt — a destruction that could be scoped.
- `enterSelection()` being called on *open* of the Cut-by-Face panel, clearing definition/cavity/registration regardless of edit.

**Level 2 — Missing contract:**
- Registration has **geometry but no persistent intent** (no `registrationEnabled` semantics, no lineage remap).
- Segmentation-derived definition stores a **boolean `segmentationLineage` but not the re-applicable planar inputs/counts**.

**Level 3 — Lifecycle inconsistency:**
- Re-entry path (`enterSelection`, `adopt`, `initializeMoreMoldsTab`) differs from initial path.
- One Mold's `hasExtensionBoundaries` no-replay rule is a silent product decision that reads as a bug (no user messaging that the segmented result was intentionally not replayed).

**Level 4 — Architectural weakness:**
- No shared stale/dirty/regeneration dependency model; each store owns its own invalidation semantics; no central "should regenerate & in what order" orchestrator for cavity/reg/sprue after Scale.
- Presentation can legally observe the intermediate whole-K2 base (mitigated only by a UI/guard counter, not by a presentation contract).

**Level 5 — Product-policy ambiguity:**
- Should Cavity/Registration auto-regenerate after Mold Scale, or require an explicit "Rebuild Cavity" (explicit is arguably correct CAD behavior)? Should One Mold with user extension axes replay or require manual revisit?

---

## 29. Hypothesis Ranking

| # | Hypothesis | Rank | Evidence |
|---|---|---|---|
| H1 | Invalidates geometry but deletes downstream intent | **CONFIRMED** | `adopt`/`enterSelection` clear to `unavailable`; Registration has no intent |
| H2 | Re-entry creates new sessions not node edits | **CONFIRMED** | `openSession→enterSelection` reset; One Mold fresh replan; extension boundaries non-replayable |
| H3 | No shared stale/dirty model | **CONFIRMED** | per-store statuses; `unavailable`≈`stale` overload; document has no dirty flag |
| H4 | Each store owns invalidation semantics → inconsistent | **CONFIRMED** | splitFace `unavailable`, segmentation `stale`, evaluation `stale` — three different exprs |
| H5 | Whole-K2 fallback treated as final in some paths | **CONFIRMED** | `buildSegmentationBaseForClearance` + `hasExtensionBoundaries` early return + topology mismatch |
| H6 | Segmentation regen exists but promotion fails after some edits | **PLAUSIBLE→HIGHLY LIKELY** | `passes`; promotion guarded well, but replay declined for extension/mismatch |
| H7 | Body-ID change breaks Registration/Sprue recovery | **HIGHLY LIKELY** | IDs content-derived; no lineage remap; registration cleared anyway |
| H8 | History restores geometry but not all intent | **CONFIRMED** | singleton snap good; segmentation/provenance not in that history |
| H9 | Async commits into already-changed state | **REJECTED** | requestId/revision/epoch guards strong (tests confirm) |
| H10 | Presentation exposes intermediate as final | **HIGHLY LIKELY** | base promoted partsReady; body list shows whole base; only count-guard mitigates user-facing |
| H11 | Flip/Eraser not dependency-aware | **CONFIRMED** (Flip locked pre-gen; Eraser clears derived) |
| H12 | No common tool lifecycle contract | **CONFIRMED** | registry has capability flags only, no intent/stale/regen contract |
| H13 | Intent stored as geometry | **CONFIRMED** | Registration presence ⇔ status=="generated" |
| H14 | Small/large hidden lifecycle contracts | **HIGHLY LIKELY** | mode matrix: Cut/Manual vs OneMold/Auto differ at rebuild |

---

## 30. Systemic Architectural Findings

Why do tools feel independent?
- **No durable intent for Registration** (and only boolean provenance for segmentation plan) → downstream is only as alive as the geometry it currently holds.
- **No shared stale model** → "clear to unavailable" is indistinguishable from "never made", so downstream doesn't know whether it *could* regenerate.
- **No regeneration orchestration** → after an upstream edit there is no owner that says "regenerate cavity→sprue→registration in order"; regeneration is per-tool, mostly explicit.
- **Inconsistent Store ownership** → splitFace owns everything geometry-ish but intent lives in separate stores (segmentation, cuttingWorkflow) with separate histories.
- **No re-entry contract** → opening a tool = start fresh, not edit a node; only Manual More Molds persists re-executable inputs.
- **Incomplete dependency graph** → no code-level edges with "stale condition / regen owner"; identity is content-hash, so body-ID remap for Registration/Sprue post-regen is unsolved.

---

## 31. Immediate Repair Candidates (do not implement)
1. Preserve `sprueDefinitions` (and ideally intended Registration) across `adoptCommittedSegmentationResult` instead of resetting to `[]`.
2. Do not null `definition` / clear cavity+registration in `enterSelection` on panel *open*; only invalidate when an actual edit commits.
3. Persist One Mold's re-applicable planning inputs (mode, axis counts, normalized boundaries) on the promoted definition, and (optionally) replay on Scale instead of the unconditional `hasExtensionBoundaries` early-return (or at least surface a clear "segmentation will not be replayed automatically" message).
4. Represent invalidated Registration/Sprue/Cavity with an explicit `stale` status (type already exists) rather than `unavailable`.

## 32. Architectural Repair Candidates (do not implement)
1. Shared **dependency/invalidation contract** (a `dependency.ts` describing producer→consumer edges, stale condition, regen owner).
2. **Durable tool-intent layer** (Registration enabled/policy + plan persisted; segmentation re-applicable inputs on the definition).
3. **Regeneration orchestrator** that, on a committed upstream change, re-runs the dependent chain (segmentation→cavity→sprue→registration) in the required order — or deliberately guards/defers with clear user feedback.
4. **Presentation contract** ("final body set" promoted only after the full chain; whole-K2 base never observable as final beyond the guarded intermediate).
5. **Async orchestration** (already strong; extend the same requestId/epoch pattern uniformly; fold cavity/reg/sprue into one evaluable chain already exists via derivedMoldEvaluation).
6. **History integration** to include cross-store intent so Undo after a session restores more than the singleton.
7. **Active-body presentation contract** to unify the singleton + segmentation dual body sources.

## 33. Suggested Staging
1. **Fix confirmed destructive resets**: stop clearing `sprueDefinitions`/Registration intent & don't null definition on panel open (Level 1).
2. **Preserve tool intent**: persist One Mold re-applicable inputs + Registration enabled policy (Level 2).
3. **Centralize stale/dependency semantics**: one stale model + dependency edges; represent invalidation as `stale` not `unavailable`.
4. **Harden re-entry**: reopen = edit node; restore inputs, not fresh session.
5. **Regeneration orchestration (explicit-first)**: make Cavity/Rebuild an explicit, clearly-flagged dependency step that the Scale commit either auto-defers or clearly requests, running the chain in order.
6. **Harden async/presentation**: unify body-source selectors; single promotion gate (mostly exists).

## 34. Connected-System Impact (PASS/FAIL/PARTIAL/NOT TESTED/N.A.)

- Pointer: PASS · Constructed Cutting Plan: **PARTIAL** (cancel good, open destructive) · Cut by Face: PARTIAL · Manual More Molds: PASS · One Mold: **FAIL** · Automatic More Molds: PARTIAL · Mold Scale: **FAIL** (cavity/reg no auto-regen; replay declined) · Flip: N.A. (pre-gen) · Eraser: PARTIAL · Create Cavity: PASS · Rebuild Cavity: PASS · Registration: **FAIL** · Sprue: PARTIAL · Viewport: PARTIAL (dual source) · Body Browser: **FAIL** (shows intermediate whole base as real) · Selection: PARTIAL · Visibility: PASS · History: PARTIAL · Undo/Redo: PARTIAL · Worker: PASS · Export: PARTIAL (can observe intermediate whole-K2 during Scale window)

## 35. Regression Risk Map
Highest-risk systems to change: `splitFace.store.ts` (owns everything & is the history/identity keeper — 196 modified files in tree already warn of churn); `invalidateForClearance` + `buildSegmentationBaseForClearance` (the collapse path); `regenerateSegmentationAfterScale` (async topology/guard); `adoptCommittedSegmentationResult` (full reset); registration worker chain. Test suite (105 passing now) enshrines the collapse (splitFace.store.test.ts:424 expects length 1 after scale) — any registration-preservation or auto-regen change must re-purpose, not delete, those assertions.

## 36. Verification Plan (after repair)
Reproduce the video: oversized import → One Mold (+extension axis) → Done → Cavity → Registration visible → reopen Construct (assert Registration still present after open with no edit) → edit axis → Done → Caveat → Mold Scale → assert multi-body persists (or an explicit user-visible "not replayed" state) and Registration regenerates or is clearly flagged stale → Body Browser matches. Test Automatic Multi-Mold recovery (2→3 bodies). Test Undo across session boundary. Run full `splitFace.store.test.ts`, `cuttingWorkflow.store.test.ts`, registration/sprue/seg lifecycle suites; watch `registration-status !== stale` after each upstream edit.

## 37. Unknowns
- **Code unknowns**: whether `hasExtensionBoundaries` no-replay is truly intended product behavior or an interim limitation (doc-comment says intended); whether Registration should have an enabled-intent at all.
- **Browser-only unknowns**: actual timing/visual of the dual body sources during Scale drag; whether Body Browser's real-time collapse is genuinely observed in the same frame as the base (test-only evidence here).
- **Product-policy questions**: auto vs explicit regeneration of cavity/registration after Scale; One Mold extension replay policy; whether "Rebuild Cavity" should be user-visible as the only regen trigger.
- **Architecture decisions**: introduce a shared dependency graph/orchestrator or keep lightweight per-store contracts; where durable intent should live (document vs separate store).

## 38. Temporary Diagnostic Cleanup
Confirmed: **no** logs, debug UI, temp files, diagnostic tests, instrumentation, feature flags, or untracked diagnostic files introduced or left by this investigation. Read-only; `git status` unchanged except pre-existing tree state; tests run were the existing committed test files. (Pre-existing `.bak` files and the heavily-modified tree are the user's own working state, untouched.)

## 39. Skill Usage Review
- **Bug Investigation** (in-repo): drove "establish the requirement, then locate the first broken state transition, not the visible symptom" — located the first transition as `enterSelection`/`invalidateForClearance`/`adopt` rather than blaming "Registration rendering."
- **Explore**: mapped the full toolbar, store ownership, dependency edges, and cross-tool paths with minimal file reads; identified `splitFace.store` as the nexus and `selectActiveMoldBodies` as the presentation source.
- **Design Principal**: used to separate canonical truth (K1/K2/definition), user intent (sprueDefinitions; conceptual Registration intent), derived geometry (cavity/reg), stale state, and tool ownership.
- **UX Interaction Principal**: applied to re-entry, continuity, tool switching, feedback (the silent `hasExtensionBoundaries` no-replay is a UX feedback failure), cancellation (cancelSession is correct), recovery.
- **UI Principal**: verified that visible state (MoldBodiesBrowser list) reflects lifecycle truth (it does — the collapse is real store state), rather than a rendering artifact.
- **Add Tooling**: used only as a *contract reasoning* aid (command lifecycle, preview/commit/cancel, ownership) — **no new tool added**, as required.
- **Most useful**: cad-continuity-investigation skill (its mode matrix + "storage = inputs vs outputs" heuristic directly identified the collapse). **Least useful**: UI Principal (little visual-work here). **Overlap**: cad-continuity ~ Bug Investigation ~ Explore on state/reset tracing. **Improvement suggestions**: Bug Investigation — add a ready "cross-store intent inventory" checklist; Explore — provide a store-ownership template; Design/UX/UI — fold the "intent vs plan vs geometry" framing into one doc. **Is a dedicated CAD Tool Lifecycle / Dependency Graph skill warranted? Yes** — this investigation is precisely that reusable procedure; recommend authoring one (read-only diagnosis of intent/stale/regen/re-entry per tool across a shared store).
- Also used: `systematic-debugging` (4-phase: evidence before hypothesis; verified with live tests), `repository-architecture-survey` (read-only mapping discipline).

## 40. Final Verdict

- **Do current toolbar tools truly work in one loop?** **No.** The singleton geometry store is shared, but intent, stale state, regeneration, re-entry, and history are per-tool/separate-store → tools feel like independent commands.
- **Which tools are ONE-SHOT?** Registration (derived, no durable intent, no auto-regen after Scale); to a degree Flip (pre-gen only). One Mold with user extension axes is effectively one-shot after Scale.
- **Which lose intent?** Registration (intent==geometry), One Mold (plan discarded to a boolean), Cavity (no intent beyond clearance), Segmentation adopt clears Sprue intent.
- **Which invalidate correctly but fail to regenerate?** Mold Scale invalidates cavity/reg/sprue correctly but does **not** auto-regenerate them (user must re-run Cavity); One Mold segmentation replay is conditionally declined; Registration never auto-regenerates after Scale.
- **Which are safe to reopen?** Manual More Molds (persists inputs), Cut by Face (persists inputs, but reopening still clears downstream). Unsafe: One Mold (fresh plan + non-replayable extensions).
- **Why does Construct re-entry break Registration?** Opening the panel calls `enterSelection()`, which nulls definition and clears registration to `unavailable`; because Registration has no durable intent, the disappearance is total and nothing regenerates it automatically.
- **Why does Mold Scale collapse segmented geometry?** `invalidateForClearance→buildSegmentationBaseForClearance` rebuilds a `segmentationLineage` definition as a single whole K2 body; automatic recovery (`regenerateSegmentationAfterScale`) declines the replay for One-Mold-with-extension and for topology changes, leaving the whole base as the final mold. Automatic More Molds genuinely recovers.
- **Are small and large workflows affected differently?** **Yes.** Small (no segmentation) survives Scale via persisted cutting planes; large (segmentation-adopted) collapses — a hidden mode-specific lifecycle contract.
- **Is the primary problem local, lifecycle-level, or architectural?** **Architectural** (no shared stale model / intent layer / regen orchestration / re-entry contract), with confirmed local bugs (enterSelection-on-open reset; adopt wiping sprue intent) sitting on top.
- **Safest first repair?** Stop the destructive resets: (1) don't null definition / clear cavity+registration merely on panel *open*; (2) preserve sprue intent (and an intended-Registration flag) across `adopt`. These are low-risk, locally-scoped.
- **What architectural layer is missing?** A **durable tool-intent + stale/dependency/regeneration contract** spanning the stores (intent layer, explicit stale state, dependency edges with regen owners, re-entry = node-edit, and a presentation "final-promoted-body" guarantee).
- **Can implementation safely begin?** **Yes, for the staged Level-1 local fixes** (low regression risk, well-tested seams). **Not yet for the architectural layer** — that requires product-policy decisions (auto vs explicit regeneration after Scale; One Mold extension replay policy; body-ID lineage) before any central orchestrator is designed or built.
