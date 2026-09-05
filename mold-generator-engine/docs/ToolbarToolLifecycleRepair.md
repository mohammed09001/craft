# Mold Craft Toolbar Tool Lifecycle — Repair Report

**Baseline:** `docs/ToolbarToolLifecycleInvestigation.md` (2026-08-07, read in full before any edit)
**Branch:** feature/professional-eraser-redesign
**Scope actually executed:** Stage 0 (revalidation) → Stage 2 (Construct re-entry) → the report's §31.1 Level-1 sprue-intent fix → Stage 4 (Registration intent) evaluated and **not** implemented, with evidence. Stages 5–26 were not started; see §21 (Remaining Work) for why, and the Evidence-Gate Decisions below for the specific stop conditions that apply.

---

## 1. Executive Summary

The toolbar did **not** become one fully connected lifecycle in this pass, and it was not supposed to: the investigation report's own final verdict (§40) says only the staged Level-1 local fixes are safe to implement without further product-policy decisions, and the task's stop conditions require the same restraint. Two confirmed, evidence-backed, test-verified destructive-reset bugs were fixed. The larger architectural work (durable intent layer, stale/dependency model, regeneration orchestrator, One Mold extension replay, Sprue remapping, Flip/Eraser dependency-awareness) was investigated only as far as needed to make a defensible **stop-or-go** call per tool, and stopped where the next step required a product decision this session cannot make, or where investigation showed the report's proposed fix would not address any real, currently-reachable behavior (Registration).

## 2. Original Broken Architecture (confirmed unchanged from the report)

- One shared geometry container (`useSplitFaceStore`), but intent, stale state, regeneration ownership, and history live in separate, inconsistent per-store mechanisms.
- `enterSelection()` (Cut by Face activation) unconditionally nulled `definition`, `cavity`, and `registration` on **every** call, including merely opening/reopening the Constructed Cutting Plan panel with zero edits — confirmed exactly as reported, at the exact cited line.
- `adoptCommittedSegmentationResult` reset the singleton to `...initial`, which wipes `sprueDefinitions` (the one field the report identifies as genuine, durable, user-authored *intent*) on every segmentation commit — not just derived geometry.
- Registration has no standalone intent; its presence is inferred purely from `status==="generated"` geometry.

## 3. Evidence-Gate Decisions

| Decision | Evidence | Stop/Go |
|---|---|---|
| Fix `enterSelection()` nulling `definition`/`cavity`/`registration` on activation | `toggleFace` (same file, splitFace.store.ts:355) already tolerates being called directly from `"partsReady"` and performs the equivalent invalidation atomically, at the moment of a real edit. `enterSelection`'s nulling was redundant with that for the real-edit case and destructive for the no-edit case. `createMoldParts`'s own guard (`workflow!=="planesReady"`) and its own atomic invalidation are unaffected. No existing test asserts the destructive nulling as intended behavior (grep-confirmed across 16 files referencing `enterSelection`/`activateCutByFaceSelection`). | **GO** — implemented, tested |
| Fix `sprueDefinitions` wipe in `adoptCommittedSegmentationResult` | Report §19 identifies Sprue as "the only tool with genuinely persistent re-executable intent." `promoteReplannedSegmentationResult` (the Scale-replay sibling of this function) already preserves `sprueDefinitions` correctly via `...s`; only the fresh-adopt path's `...initial` spread wiped it. `document`'s `sprues` fingerprint parameter is fed `sprueDefinitions` (intent, not geometry) everywhere else in the file — the adopt path's hardcoded `[]` was the one inconsistent call site. No test encodes the wipe as intended. | **GO** — implemented, tested |
| Add durable `registrationEnabled`/intent flag (Stage 4, report §31.4/§32.2) | Registration has **no toolbar button** and **no disable path** anywhere in the codebase (grep-confirmed: zero references to `registrationEnabled` or a "stale" registration consumer). It is a fully automatic derived side effect of Cavity — there is no discrete user intent to *lose*, because nothing ever sets it to "off." The report's own §40 places this under "architectural layer," not the safe-to-implement Level-1 set. Inventing a flag that is always `true` and has no consumer would be architecture-for-its-own-sake, explicitly forbidden by the task's Anti-Hallucination Rule. The actual visible symptom ("Registration disappears on reopen") is already fixed by the Stage 2 change, since Registration is no longer nulled merely by opening the panel. | **STOP** — no code change; documented |
| Represent invalidated Registration as `stale` instead of `unavailable` | `stale` is declared in `DerivedRegistrationState`'s type union but has zero consumers anywhere (grep-confirmed). Changing the emitted status without any UI/behavior to interpret it differently would not change observable behavior and would risk breaking existing `status==="unavailable"` checks elsewhere. No test or UI currently distinguishes the two. | **STOP** — no code change; documented |
| One Mold extension replay after Mold Scale (`hasExtensionBoundaries` early-return), regeneration-after-Scale auto vs explicit, Sprue body-ID remapping, Flip intent transform, regeneration orchestrator | Report §28 Level 5 and §37 explicitly flag these as **product-policy questions** ("should Cavity/Registration auto-regenerate after Scale, or require explicit Rebuild?"; "should One Mold extension boundaries replay automatically?"). This matches the task's Stop Condition #3 verbatim ("Product policy is required to decide whether regeneration is automatic or explicit"). Implementing any of these would mean guessing product intent. | **STOP** — not attempted; flagged for product decision |

## 4. Files Modified

### `frontend/src/features/mold-generation/split-face/splitFace.store.ts`
- **Pre-existing dirty status:** already heavily modified in the working tree before this session (415 lines of pre-existing diff against `HEAD`), consistent with the investigation report's own warning about a very dirty tree.
- **Responsibility:** the singleton "document" store — canonical mold definition, cavity, registration, sprue intent/geometry, document/revision, undo/redo.
- **Changes made (exactly two, isolated):**
  1. `enterSelection()` (~line 354): removed `definition:null, cavity:unavailableCavity(...), registration:unavailableRegistration()` from the returned patch. It now only transitions `workflow` (so viewport face-click interaction still activates correctly, per `Viewport.tsx`'s `splitFaceSelectionActive` gate) and clears `error`/`activePlaneId`. Added a doc comment explaining the activation-vs-edit distinction.
  2. `adoptCommittedSegmentationResult` (~line 1045): the `document` fingerprint's `sprues` parameter now uses `s.sprueDefinitions` (matching every other call site in the file) instead of a hardcoded `[]`; the returned state patch now includes `sprueDefinitions:s.sprueDefinitions` so a fresh segmentation-commit reset no longer wipes the user's Sprue intent. Added a doc comment explaining why.
- **Unrelated pre-existing changes in this file:** left completely untouched (verified both edits are isolated via grep on my own added comment text; nothing else in the file's already-large diff was touched).

### `frontend/src/features/mold-generation/cutting-workflow/cuttingWorkflow.store.test.ts`
- **Pre-existing dirty status:** already heavily modified (1288/523 pre-existing insertions/deletions against HEAD).
- **Change:** added one regression test, `"reopening the panel with zero edits does not clear a committed Cavity/Registration, and Cancel leaves them untouched"`, in the existing `"cuttingWorkflow.store Done -- Cut by Face tab"` describe block. Verified it fails against the pre-fix `enterSelection()` (assertion diff showed `definition` becoming `null`) and passes with the fix.

### `frontend/src/features/mold-generation/split-face/splitFace.store.test.ts`
- **Pre-existing dirty status:** already heavily modified (pre-existing diff against HEAD).
- **Change:** added one regression test, `"preserves Sprue intent (sprueDefinitions) across a committed segmentation adoption instead of wiping it to [], regression for lost Sprue intent on One Mold/Automatic re-commit"`, in the existing `"adoptCommittedSegmentationResult"` describe block. Verified it fails against the pre-fix code (`sprueDefinitions` became `[]`) and passes with the fix.

### `docs/ToolbarToolLifecycleRepair.md` (this file)
- New file — the mandated final report.

No other production or test files were modified.

## 5. Shared Tool Lifecycle Contract

**Not introduced.** Per Stage 1's own instruction ("do NOT build a huge new framework first... only introduce states proven necessary") and the evidence gate above, no new shared lifecycle abstraction was warranted by the two confirmed bugs — both were local, single-function fixes to an existing, otherwise-sound mechanism (`toggleFace`'s own atomic invalidation-on-edit, `promoteReplannedSegmentationResult`'s own correct intent preservation). The existing informal contract — *activation transitions workflow only; a real edit invalidates atomically at the moment of the edit* — was restored to consistency rather than replaced.

## 6. Intent Model (current state, after this repair)

| Tool | Durable intent today | Notes |
|---|---|---|
| Cut by Face | `cuttingPlanes` | unchanged, already correct |
| Segmentation (One Mold/Automatic) | boolean `segmentationLineage` only, no re-applicable planar inputs | unchanged — report's provenance-loss finding stands; not addressed this pass |
| Registration | none (geometry-backed only) | evaluated; adding a flag would not fix anything reachable (see §3) |
| Sprue | `sprueDefinitions` | **now survives segmentation re-adopt**, in addition to the cases it already survived (Scale, re-entry) |
| Mold Scale | `clearanceMm` | unchanged, already correct |
| Flip | none (locked pre-generation) | unchanged, out of scope this pass |
| Eraser | none beyond surviving `cuttingPlanes`/sprue intent | unchanged, out of scope this pass |
| Cavity | `clearanceMm` + input signature | unchanged, already correct (explicit re-run is intentional CAD behavior per report §17) |

## 7. Construct Re-entry (Stage 2 result)

- **Reopen, zero edits:** `definition`, `cavity`, `registration` are now left untouched by `openSession()`/`activateCutByFaceSelection()`. Only `workflow` transitions to the editable state needed for face-click interaction. Verified with a real (non-synthetic-geometry) regression test using `useSplitFaceStore.setState` markers for cavity/registration status, chained after a real `toggleFace` + `commitActiveTab` commit.
- **Cancel after zero edits:** unchanged — was already correct (`cancelSession()` restores the full pre-session snapshot verbatim).
- **Edit then Done:** unchanged from before this fix — `toggleFace` and `createMoldParts` already invalidate/rebuild correctly and atomically; this was never the broken path.
- **Dependent recovery:** Cavity/Registration/Sprue/segmented bodies/Body Browser are no longer destroyed by the act of opening the panel. What happens if the user then clicks **Done** with zero edits (which re-runs `createMoldParts` against unchanged `cuttingPlanes` and resets Cavity to a fresh "ready" state) is **unchanged, pre-existing behavior**, not addressed here — this is the report's Level 3 "reopen = edit node" finding, and is architecture-layer work, not part of the confirmed Level-1 bug.

## 8. Segmentation Provenance

**Not addressed.** The report's finding that `segmentationLineage` is a boolean with no re-applicable planar inputs remains true. This is a Stage 6/7 item requiring the One Mold extension-replay product decision (§3) before any provenance schema can be designed correctly — implementing storage without knowing what it needs to enable (replay vs. just better user messaging) risks building the wrong shape.

## 9. One Mold Extension Recovery / Automatic More Molds / Mold Scale / Cavity / Registration / Sprue / Flip / Eraser Lifecycles

**Not modified.** All confirmed by Stage 0 to match the report's findings; none were touched because touching them (per §3) requires a product-policy answer this session is not positioned to give, or (Registration) because the proposed fix would not change any reachable behavior. See report §14–§19 for the still-accurate per-tool detail; nothing in this repair changes those sections' conclusions except:
- Registration/Cavity are no longer destroyed by mere Construct re-entry (§7 above cascades into these).
- Sprue intent additionally survives a fresh segmentation commit, not just Scale and re-entry.

## 10. Regeneration Dependency Order

Unchanged from the report's proven order (§12): Source/K1 → Clearance/K2 base → Segmentation → Cavity → Sprue → Registration → Body Browser/Export. No orchestrator was built (Stage 9 explicitly gated on durable intent + stale semantics + replayable provenance existing first — none of those architectural prerequisites were built this pass, so an orchestrator was correctly not attempted).

## 11. Async Safety

Unchanged and unaudited beyond Stage 0's re-confirmation that the report's "async guards are strong, do not rewrite" finding still holds (no code in the async/request-guard paths was touched).

## 12. Tests

```
npx tsc -b --noEmit                     → 0 errors
npx vitest run                          → 177 files passed, 6 failed; 1093 tests passed, 16 failed, 5 skipped (1114 total)
```

**The 6 failing files and 16 failing tests are pre-existing and unrelated to this repair.** All share one root cause: `"Worker is not defined"` (or a cascading assertion from a `createCavity`/`createMoldParts` call that fails for that reason), thrown from the real (unmocked) `Worker`-based cavity-generation path in a jsdom test environment. Confirmed pre-existing by:
- Reproducing the identical failure with my `enterSelection()` fix reverted (byte-identical error).
- Reproducing the identical failure in `moldWorkflow.integration.test.ts` and `moldWorkflow.decoupling.test.ts` / `moldParts3dRuntime.test.ts`, none of which I touched — two of which (`moldWorkflow.decoupling.test.ts`, `moldParts3dRuntime.test.ts`) are **not even in the dirty working-tree diff** (`git status --short` shows no local modification), meaning they fail at the last commit too.

Failing files: `moldWorkflow.integration.test.ts`, `moldWorkflow.postCavityAlignment.test.ts`, `moldWorkflow.decoupling.test.ts`, `CavityAction.test.tsx`, `registrationLifecycle.store.test.ts`, `moldParts3dRuntime.test.ts` (the last fails to load entirely — a stale partial `vi.mock` missing `createCavityWorkerRunner`).

New regression tests added by this repair (2), both pass and both were verified to fail against the pre-fix code:
1. `cuttingWorkflow.store.test.ts` — zero-edit reopen preserves committed Cavity/Registration/definition; Cancel leaves them untouched.
2. `splitFace.store.test.ts` — Sprue intent survives a second committed segmentation adoption.

All previously-passing tests in files I touched or whose behavior I could affect (`splitFace.store.test.ts`, `cuttingWorkflow.store.test.ts`, `CuttingSessionPanel.test.tsx`, `SplitFaceControls.test.tsx`, `splitFace.removeAndRebuild.test.ts`, `splitFace.removeSplitFace.test.ts`, `splitFace.selectedSplitFace.test.ts`, `moldWorkflow.decoupling.test.ts`'s one non-Worker-dependent test) still pass, except the pre-existing Worker-dependent failure noted above.

## 13. Browser Validation

**Not performed.** No browser automation was used this session; the fix was verified at the store level (the layer where the report's own evidence lives — `enterSelection`, `activateCutByFaceSelection`, `adoptCommittedSegmentationResult` are all store functions, not UI). Visual confirmation of the reported video symptom (Registration disappearing on Construct reopen) is **not visually proven** — only proven via store-level regression test. This is stated explicitly per the task's instruction not to claim visual closure without browser execution.

## 14. Dirty-Worktree Safety

- No `git reset`, `git clean`, `git checkout --`, or stash of unrelated files was performed.
- Both edited production files (`splitFace.store.ts`) and both edited test files were already dirty before this session; my edits are two isolated, grep-verifiable insertions in `splitFace.store.ts` and one new `it(...)` block each in the two test files. No pre-existing hunks were reformatted, reverted, or touched.
- No diagnostic residue, temporary files, or console logging was left in the committed diff (debug `console.log` calls added during investigation of the unrelated Worker-mock issue were removed before finalizing the test).

## 15. Remaining Risks / Deferred Work

- **Registration/Cavity still do not auto-regenerate after Mold Scale.** This is unchanged, pre-existing, and — per both the report and this session's own evidence gate — requires a product decision (auto vs. explicit "Rebuild Cavity") before it can be implemented correctly.
- **One Mold with a user extension boundary still does not replay across Mold Scale** (`hasExtensionBoundaries` early-return in `regenerateSegmentationAfterScale`, cuttingWorkflow.store.ts). Same product-policy gate.
- **Segmentation provenance is still boolean-only** (`segmentationLineage`); no re-applicable planar inputs are stored. Blocked on the same extension-replay policy decision — building the storage schema before knowing what it must support risks the wrong shape.
- **No shared stale/dependency/regeneration-orchestrator model exists.** Correctly not built (Stage 9's own precondition — durable intent + stale semantics + replayable provenance — was not established this pass).
- **Sprue body-ID remapping after topology change** and **Flip intent transform** were not investigated this pass.
- **"Reopen with zero edits, then click Done"** still resets Cavity/Registration to a fresh, non-complete state (re-runs `createMoldParts` against unchanged inputs). This is a different, still-open finding from the one fixed here (which was specifically about *opening* the panel, before any Done/Cancel decision) — flagged for a follow-up "reopen = edit node" pass (report §33.4), out of scope for the Level-1 fix implemented here.

## 16. Final Verdict

- **Does Mold Craft now have one coherent toolbar loop?** No — this pass fixed two confirmed, evidence-backed destructive-reset bugs (Level 1) and explicitly declined to build the architectural layer (durable intent framework, stale model, orchestrator) without product-policy answers this session cannot supply, matching the report's own recommendation.
- **Can Construct be reopened without destructive mutation?** Yes, for the specific case fixed: zero-edit reopen no longer nulls `definition`/`cavity`/`registration`. Verified by regression test.
- **Do upstream edits preserve downstream intent?** Improved for Sprue (now survives a fresh segmentation commit, in addition to Scale and re-entry, which it already survived). Unimproved for Registration (no intent exists to preserve, and none was fabricated) and Segmentation provenance (still boolean-only).
- **Does One Mold with extension boundaries survive Mold Scale?** No change — still declines replay, by an existing deliberate (if under-communicated) product decision.
- **Does Automatic recover after topology changes?** Unchanged — already worked correctly per the report.
- **Does Cavity remain semantically coherent?** Unchanged — already correct (explicit re-run model).
- **Does Registration survive as intent and regenerate correctly?** No durable intent was added (evidence showed none is needed for any currently-reachable behavior); its *visible* survival across re-entry is improved as a side effect of the Construct fix.
- **Does Sprue survive/remap truthfully?** Intent survival improved (see above); body-ID remapping was not investigated.
- **Are Flip and Eraser dependency-aware?** Unchanged, not investigated this pass.
- **Does Undo/Redo restore semantic project state?** Unchanged, not investigated this pass beyond confirming (Stage 0) the report's finding still holds.
- **Can tools be repeatedly entered/edited/committed?** Improved for Construct specifically (repeated no-op reopen/cancel is now a true no-op).
- **What remains incomplete?** Everything listed in §15, all gated on product-policy decisions this session was not authorized to make, or on architectural prerequisites (durable intent, stale semantics, replayable provenance) that were correctly not built ahead of proving they're needed.

---

# Addendum: Visual-Outcome Repair — One Mold Extension Replay After Mold Scale

**Follow-up task:** fix the exact video failure (Segmentation → Cavity → Registration → reopen → add X → Done → Mold Scale → mold collapses to one whole body, Registration disappears) with minimal, targeted code change — no new architecture.

## 1. Visual Problem

After committing a One Mold segmentation plan that included a user-added extension boundary (e.g. axis "y"), then using Mold Scale, the multi-body segmented mold permanently collapsed into a single whole-K2 body. Registration could never return because there were no segmented interfaces left to key against. This happened even though the extension boundary's underlying data (axis + coordinate) was cheap, valid, and available at commit time — it was simply never replayed.

## 2. First Broken Invariant

`regenerateSegmentationAfterScale` (`cuttingWorkflow.store.ts:372`, prior code): `if (isOneMold && oneMoldProvenance.hasExtensionBoundaries) return;` — an unconditional early return that skipped replanning entirely whenever the committed result had used *any* extension boundary, regardless of whether that boundary would still be geometrically valid after the clearance change.

## 3. Root Cause

`OneMoldCommitProvenance` (`cuttingWorkflow.contracts.ts`) stored only a boolean, `hasExtensionBoundaries: boolean`, computed at commit time as `segmentation.extensionBoundaries.length > 0`. The actual extension data — `{axis, coordinateMm}` per boundary, already a small, serializable, already-existing type (`ExtensionBoundaryRequest`, defined in `segmentationMode.store.ts`) — was captured transiently in the segmentation draft during the session but discarded down to that boolean the moment the tab committed. The no-replay branch was not protecting a real geometric invariant; the doc comment confirmed the actual reason: *"it cannot safely reconstruct a user's manual extension choice"* — i.e., the plan was discarded, not that replay was geometrically impossible. `suggestExtensionAxisPosition` (the function that originally computes `coordinateMm`) derives it from the model's own geometry snapshot along that axis, independent of K2/clearance — so a clearance-only Mold Scale edit does not itself invalidate a previously-valid extension coordinate.

## 4. Files Modified

| File | Change | Kind |
|---|---|---|
| `cuttingWorkflow.contracts.ts` | `OneMoldCommitProvenance.hasExtensionBoundaries: boolean` → `extensionBoundaries: readonly ExtensionBoundaryRequest[]` (reusing the existing segmentation-store type, no new type invented) | **Replacement** |
| `cuttingWorkflow.store.ts` | (a) commit-time assignment now stores the real array instead of a boolean; (b) `regenerateSegmentationAfterScale`'s no-replay early-return **deleted**; replaced with: replay each stored extension boundary via the existing `applyExtensionBoundary` store action, then compare topology using the existing `computeEffectivePlan` (not a new function) before accepting | **Replacement + modification** |
| `cuttingWorkflow.store.test.ts` | Old test asserting "does not attempt automatic replay" **rewritten** into two tests: successful replay (multi-body survives Scale) and correct fallback (topology-invalidating Scale still declines, via the *existing* mismatch path, not a new one) | **Replacement** |
| `splitFace.store.test.ts` | One new test confirming Create Cavity + Registration recover correctly on a promoted multi-body result (proves the *existing*, unchanged, automatic Cavity→Registration pipeline handles the replayed result with no separate recovery mechanism needed) | **Addition** (test only, no production code) |

No other files were touched.

## 5. Code Accumulation Audit

Production code only (`cuttingWorkflow.contracts.ts` + `cuttingWorkflow.store.ts`):

- **Lines added (production):** ~34 (18-line replay block + 3-line doc-comment growth in `cuttingWorkflow.store.ts`; 22-line replacement interface block + 1 import line in `cuttingWorkflow.contracts.ts`, see below)
- **Lines deleted (production):** ~20 (2-line boolean early-return removed; 28-line old doc+interface block removed from contracts.ts, replaced by the 22-line new one)
- **Lines modified in place:** 1 (the commit-time field assignment)
- **Net production LOC change: approximately +14 lines**, entirely inside the two files that already owned this exact logic. No new file, store, type module, or abstraction was created.

For the one added block (the extension-replay loop + effective-topology comparison in `regenerateSegmentationAfterScale`):
- **Why modification was insufficient:** the old code's only handling of extension boundaries was to refuse to replan at all; there was no partial logic to extend — the behavior had to change from "never attempt" to "attempt, then fall back on genuine failure," which is new control flow, not a rephrasing of existing control flow.
- **What old code was removed:** the unconditional `if (isOneMold && oneMoldProvenance.hasExtensionBoundaries) return;` early-return — fully deleted, not left dormant alongside the new path.
- **Net line increase:** ~14 lines net across both files.
- **Why unavoidable:** replaying extension boundaries requires (a) storing the real per-boundary data instead of a boolean and (b) calling the *existing* `applyExtensionBoundary`/`computeEffectivePlan` store actions in a loop before the *existing* `acceptPlan`/`executeAcceptedPlan` calls — there is no existing branch that already does this, and the fix is only meaningful if the topology comparison (`sameTopology`) is checked against the effective (extension-inclusive) plan rather than the bare base plan, which is why the comparison also had to move after the replay loop, not just add a loop next to the old check.

No new store, framework, dependency graph, or orchestrator was added. `applyExtensionBoundary`, `computeEffectivePlan`, and `sameTopology` are all pre-existing functions this change **reuses**, not duplicates.

## 6. Obsolete Code Removed

- The unconditional `hasExtensionBoundaries` no-replay early-return in `regenerateSegmentationAfterScale` — deleted, not left as a dead branch.
- The `hasExtensionBoundaries: boolean` field and its "cannot safely reconstruct" doc comment in `cuttingWorkflow.contracts.ts` — deleted; replaced by the field that actually carries the reconstructable data.
- The test `"One Mold: does not attempt automatic replay when the committed result used a user extension boundary"` — this test enshrined the broken collapse as expected behavior. Per this task's Phase 15 instruction, it was rewritten (not left in place, not merely skipped) into two tests reflecting the corrected contract: successful replay, and the (still-correct, unchanged) genuine-topology-mismatch fallback.

No dual "old workaround + new workaround" was left active anywhere.

## 7. Construct Re-edit Result

Unchanged from the prior repair pass (already fixed): reopening Construct with zero edits does not mutate committed state; editing (adding extension X) and clicking Done invalidates old segmentation/cavity/registration and commits the new segmentation, exactly per this task's own Phase 7 required contract ("old Registration disappears because topology changed → new segmentation commits → user Create/Rebuild Cavity → Registration is generated again"). Not re-tested this pass beyond the existing regression coverage; no code in this path changed in this addendum.

## 8. One Mold Extension Replay

- **Plan/provenance used:** the committed `OneMoldCommitProvenance.extensionBoundaries` (now real `{axis, coordinateMm}` data, not a boolean).
- **Replay result (topology-preserving Scale):** succeeds — verified by test: base plan replans, each extension boundary reapplies via `applyExtensionBoundary`, the resulting effective plan's topology matches the committed provenance, `acceptPlan`/`executeAcceptedPlan` run normally, and the executed multi-body result is promoted via the existing `promoteReplannedSegmentationResult`.
- **Body count:** before Scale = N (>1, segmented); during Scale = 1 (temporary whole-K2 base, synchronous, unchanged behavior); after regeneration = N again (same count as originally committed).
- **Replay result (topology-invalidating Scale, e.g. forcing a 3rd required segment):** correctly declines and falls back to the whole-K2 base — verified by a second test — using the same pre-existing topology-mismatch path a non-extension commit already used, not a new failure path.

## 9. Mold Scale Result

- Before Scale body count: >1 (segmented, matches the originally committed piece count).
- During Scale (synchronous, unchanged): 1 (truthful temporary whole-K2 base; `segmentationRegenerationCount` > 0 blocks Create Cavity during this window, as before).
- After regeneration body count: back to the original committed count (topology-preserving case) or correctly remains 1 with an honest fallback (topology-invalidating case) — never silently substituted with the wrong piece count.

## 10. Whole-K2 Fallback

Unchanged from before this addendum: the whole-K2 base is promoted synchronously and immediately by the Scale commit itself (`invalidateForClearance`), independent of replay outcome — this is intentional, documented, pre-existing behavior (interactive Scale edits stay worker-free). What changed is *how often* the async replan tail successfully replaces that temporary base with a real multi-body result: previously, any committed extension boundary made replacement impossible by construction; now it is attempted and, in the common (clearance-only, topology-preserving) case, succeeds. Genuine failure (topology mismatch, or a boundary that no longer applies) still leaves the whole-K2 base as the current `partsReady` state with the segmentation draft's own phase/result as the honest record of why — this presentation contract was not changed, per this task's explicit non-goal against modifying it further without new evidence of a masquerading-as-success defect (none was found).

## 11. Cavity / Registration Recovery

User-visible sequence (topology-preserving Scale, the video's case): multi-body mold visible → Create Cavity → Registration visible → reopen Construct, add extension, Done (new segmentation, old cavity/registration invalidated exactly as expected) → Create Cavity → Registration visible on the new interfaces → Mold Scale → mold remains multi-body → Create/Rebuild Cavity works again → Registration regenerates. The Cavity→Registration mechanism itself was not modified (confirmed unchanged and already correct); a new test (`splitFace.store.test.ts`) proves it operates correctly on a promoted post-replay multi-body result using the same automatic derived-evaluation path used everywhere else — no separate "enabled" flag or recovery mechanism was added, per Phase 8's explicit instruction.

## 12. Automatic More Molds Control

Unchanged — not modified, not re-tested beyond the existing suite (still passing). Automatic never carried a boolean/array extension-boundaries gate in the first place (it always fully replans); this fix does not touch its path.

## 13. Cut by Face / Manual Control

Unchanged — not modified. The existing "control: Manual More Molds is unaffected" test still passes.

## 14. History / Undo / Redo

Unchanged — not modified. `promoteReplannedSegmentationResult`'s existing atomic in-place promotion (no new history entry; the Scale commit's own entry already covers the gesture) is untouched by this fix; the pre-existing Undo/Redo regression tests around it still pass.

## 15. Body Browser / Viewport

Unchanged mechanism (`selectActiveMoldBodies` = `lastCommittedResult?.bodies ?? definition?.moldBodies`, not modified). Verified via test that after a successful replay, `definition.moldBodies.length` equals the original committed count and `workflow === "partsReady"` — the same source Body Browser/Viewport already read, so they now truthfully show the regenerated multi-body result instead of the collapsed single body.

## 16. Tests

```
npx tsc -b --noEmit                     → 0 errors
npx vitest run cuttingWorkflow.store.test.ts   → 71 passed
npx vitest run splitFace.store.test.ts         → 38 passed
npx vitest run (full suite)                    → 177 files passed, 6 failed (pre-existing,
                                                   unrelated — see prior report §12);
                                                   1095 passed, 16 failed (same pre-existing
                                                   16), 5 skipped, 1116 total
```

New/rewritten tests, each verified to fail against the pre-fix code and pass against the fix:
1. `cuttingWorkflow.store.test.ts` — *"One Mold: replays a committed user extension boundary after Mold Scale instead of permanently collapsing to the whole-K2 base"* (new).
2. `cuttingWorkflow.store.test.ts` — *"One Mold: falls back to the whole-K2 base when a committed extension boundary is no longer valid after Mold Scale"* (new; control for the still-correct failure path).
3. `splitFace.store.test.ts` — *"Create Cavity and Registration recover truthfully on a multi-body result promoted after Scale..."* (new; confirms existing, unchanged Cavity/Registration mechanism handles the replayed result — this one does not fail on old code, since it exercises unchanged functions, and serves as direct evidence for success criteria items 10–11, not as a regression test for this specific change).

## 17. Browser Validation

**NOT VISUALLY PROVEN.** No browser automation was used this session. The fix is verified at the store/orchestration level, which is where the report's own evidence and this exact defect live (`regenerateSegmentationAfterScale` is a store-level function, not UI). The visible video symptom (mold collapsing, Registration disappearing) is fixed at the level the store state drives the UI from (`selectActiveMoldBodies`, `workflow`, `cavity.status`, `registration.status` — the same fields Body Browser, CavityAction, and the registration presentation layer already read unmodified), but this has not been confirmed by an actual browser replay of the video flow.

## 18. What the User Will See

- **Before this repair:** After adding an extension axis to a One Mold segmentation, committing it, creating Cavity, and seeing Registration — then using Mold Scale — the mold permanently collapsed into a single unsegmented block. The Molds browser showed one body named "Mold" instead of the multiple segmented pieces. Registration disappeared and could never come back without the user manually reopening One Mold and recommitting from scratch.
- **After this repair:** After adding an extension axis, committing, creating Cavity, and seeing Registration — then using Mold Scale — the mold **briefly** shows a single temporary body while the scale gesture completes (same as before, this is expected and instantaneous), and then **returns to the same multi-body segmented result**, now correctly reflecting the new clearance. Create/Rebuild Cavity works again immediately. Registration reappears once Cavity is (re)created. The Molds browser shows the correct multiple mold bodies, not a single whole "Mold".
- **If the extension boundary is no longer geometrically valid after the scale change** (rare — e.g. the clearance change forces a different required piece count): the mold correctly falls back to the single truthful base body, exactly as it already did for a plain (no-extension) topology-changing Scale — this is not a regression, it is the same honest, pre-existing fallback behavior extended consistently.

## 19. Skill Usage

- **Edit:** every change replaced or deleted existing logic (the boolean field, the no-replay branch, the obsolete test) rather than adding a parallel path; no new file was created.
- **Bug Investigation:** traced the failure to the exact first broken invariant (`hasExtensionBoundaries` early-return) by reading the production code directly rather than trusting the prior report's description alone, then traced *why* the data was unavailable (the boolean-only provenance) rather than patching the symptom.
- **Explore:** re-read `segmentationMode.store.ts`'s `ExtensionBoundaryRequest`/`applyExtensionBoundary`/`computeEffectivePlan` and `commitActiveTab`'s provenance-capture code directly before writing any patch, confirming the replay data already existed transiently and just needed to survive commit — avoiding inventing a new provenance mechanism.
- **Add Tooling:** used only to reason about whether `regenerateSegmentationAfterScale` (the existing tool-lifecycle orchestrator for this path) could express the corrected behavior itself — it could, with its own existing helper functions, so no new tooling/orchestration layer was added.
- **Design Principle:** preserved canonical truth (whole-K2 remains the honest synchronous intermediate; only the async promotion target changed) and avoided introducing a second, parallel fallback system.
- **UX Interaction Principle:** validated the actual reopen → edit → Done → Scale → recover sequence via the added tests, matching exactly what Phase 7/9 required.
- **UI Principle:** confirmed (by tracing `selectActiveMoldBodies`, `cavity.status`, `registration.status` — the same store fields already driving Body Browser/CavityAction/Registration display) that fixing the store state is sufficient for the UI to reflect the truth, without touching any UI component.

## 20. Final Verdict

- **Is the exact video flow fixed?** At the store/state level, yes — verified by test. Not yet visually proven in a browser.
- **Does One Mold + X extension survive Mold Scale?** Yes, when the extension remains geometrically valid after the clearance change (the common case, matching the video). When it does not, the system now correctly attempts replay and only then falls back — same honest failure semantics as a plain topology mismatch, not a blanket refusal.
- **Does the mold remain multi-body?** Yes, after the async regeneration tail completes, in the topology-preserving case.
- **Does Body Browser remain multi-body?** Yes — it reads the same `definition.moldBodies` this fix corrects.
- **Can Cavity be recreated?** Yes — verified by test, using the unchanged, existing Create/Rebuild Cavity mechanism.
- **Can Registration reappear correctly?** Yes — verified by test, using the unchanged, existing automatic Registration-generation mechanism; no new intent/enabled flag was added.
- **Was unnecessary production code removed?** Yes — the boolean field, its doc comment, and the no-replay branch were deleted, not left dormant.
- **What is the net production LOC change?** Approximately **+14 lines**, confined to the two files (`cuttingWorkflow.contracts.ts`, `cuttingWorkflow.store.ts`) that already owned this exact logic — no new store, framework, or abstraction.
- **Is the result visually proven?** **NOT VISUALLY PROVEN** — browser execution was not performed this session. State-level (store/orchestration) proof only.
