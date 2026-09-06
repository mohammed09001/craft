# Post-Repair Deep Investigation — Defect Map

**Scope:** investigation only. No production code was modified. One temporary reproduction test was written, run, and fully reverted (verified via `git diff --stat` showing zero residual diff).
**Method:** direct code tracing (Bug-Investigation-style backward tracing from candidate symptom to first broken invariant), targeted store-level reproduction via the real Vitest test infrastructure (the most reliable "current runtime state" evidence available without a live browser session), and a background code-mapping pass over Registration, Sprue, Flip, Eraser, Body Browser, cross-store History, and async guards.
**Not performed:** live browser reproduction of the flow matrix in Part I of the request, and the 20–30 cycle repeated-loop stress test. These require either driving the actual running app or a much larger time budget than a single investigation pass; see §30/§31 for what's still needed before those can be marked verified.

---

## 1. Executive Summary

One **confirmed, reproducible, currently-live visual defect** was found and verified with a real failing assertion against production code: erasing the last remaining Cut-by-Face cutting plane leaves `lastCommittedResult` (and the resolved `sprues` geometry) stale, so `selectActiveMoldBodies` — the single selector both `MoldBodiesBrowser` and the Viewport read — keeps resolving the *pre-erase* mold bodies even though `definition` has correctly gone to `null` and `workflow` has correctly returned to `"selectingFaces"`. This is a genuine, currently-shipping bug, independent of and untouched by the two recent repair passes.

No other confirmed defects were found in the areas investigated (Registration sizing/placement mechanics, Sprue body-rebinding, Flip gating, Eraser scope, cross-store History separation, Registration/Sprue async guards) — those areas were traced and found to already behave as their own doc comments describe, with one **vestigial-but-harmless** finding (`document.registrationPolicyId` is a dead, always-`"default"` field that plays no actual role in registration policy selection).

Several requested investigation phases (browser-driven flow matrix, 20–30 cycle stress, final registration mesh measurement, Automatic vs. One Mold side-by-side consistency re-check) were **not executed** this pass — see §31 for an explicit accounting.

## 2. Current Flow Reproduction

Not performed via live browser. Store-level reproduction was used instead (see §4, the one confirmed defect). No claim is made about the literal video/browser flow beyond what store-level tests can prove.

## 3. Visual Defect Inventory

| # | Action | Expected | Actual | Reproducible | Severity |
|---|---|---|---|---|---|
| 1 | Cut by Face: erase the last remaining cutting plane | Body Browser/Viewport show nothing (back to face-selection, no committed mold) | Body Browser/Viewport continue showing the pre-erase mold bodies (stale `lastCommittedResult`) | **Yes — verified with a real test against production code** | **HIGH** (stale geometry visible/exportable after a destructive edit that should have cleared it) |

No other visible defects were confirmed this pass. This does not mean none exist elsewhere — it means none were found within the areas actually traced.

## 4. First Broken Invariant Map

**Defect #1 — stale `lastCommittedResult` after erasing the final cutting plane**

`removeSplitFaceAndRebuild` (`splitFace.store.ts:535`), the `!cuttingPlanes.length` branch (`splitFace.store.ts:570-591`):

```
if(!cuttingPlanes.length){
 set(current=>({
  ...current,
  undoStack:[...before.undoStack.slice(-49), snap(before)],
  redoStack:[],
  selectedFaceIds:[], selectedSplitFaceId:null, cuttingPlanes:[],
  workflow:"selectingFaces", definition:null,
  cavity:unavailableCavity(before.cavity.clearanceMm),
  registration:unavailableRegistration(),
  activePlaneId:null, error:null,
 }));
 return true;
}
```

This patch nulls `definition`, `cavity`, and `registration`, but never touches `lastCommittedResult` or `sprues` — both are left at their pre-erase values via the `...current` spread. `selectActiveMoldBodies` (`splitFace.store.ts:1140`) reads `state.lastCommittedResult?.bodies ?? state.definition?.moldBodies` — since `lastCommittedResult` is still truthy, it wins over the correctly-nulled `definition`, and both `MoldBodiesBrowser.tsx:14` and the Viewport's own body source read this same selector.

**First Broken Invariant:** After erasing the final cutting plane, the presentation layer expects "no committed mold" (since `definition` is `null`), but `selectActiveMoldBodies` still resolves the previous committed mold, because `removeSplitFaceAndRebuild`'s empty-plane-list branch resets `definition`/`cavity`/`registration` but not `lastCommittedResult`/`sprues`.

**Evidence:** reproduced with a real store-level test (written, run, and reverted this session): after `createMoldParts` → `removeSelectedSplitFaceAndRebuild` down to zero cutting planes, `useSplitFaceStore.getState().lastCommittedResult` is **not** `null` (assertion failure showed the full stale `FinalMoldResult` object, including the previous "Mold 2" body, still present) even though `definition` correctly is `null`.

**Contrast with the correct sibling branch:** the *other* branch of the same function (`splitFace.store.ts:594-651`, taken whenever at least one cutting plane remains) *does* set a fresh `lastCommittedResult:finalResult` on every rebuild — so this is specifically an omission in the zero-planes-left early-return, not a general pattern bug in the function.

## 5. Tool-by-Tool Status

- **Pointer:** not re-investigated this pass (no code touched, no new evidence).
- **Construct:** unchanged since the prior two repair passes (re-entry preserves committed state; One Mold extension replay after Scale works for the topology-preserving case). Not re-verified visually this pass.
- **Mold Scale:** unchanged since the prior repair pass. Not re-verified visually this pass.
- **Flip:** traced (via a background mapping pass) and found to already have dedicated, passing test coverage (`partOrientation.store.test.ts`, 8 tests covering unavailable-pre-import, orientation composition, quarter-turn snapping, one-revision-per-flip, and the post-generation lock). Gate: locked whenever `definition !== null || lastCommittedResult !== null || cavity.result !== null || sprueDefinitions.length > 0 || registration.status === "generated"`. **No defect found.** Not dependency-aware in the active sense (by design — it's excluded once any geometry exists), matching the original investigation's conclusion; this was not re-litigated.
- **Eraser:** confirmed in scope only for Cut-by-Face-style cutting planes (singleton or Manual draft) — segmentation-derived (One Mold/Automatic) bodies have no `cuttingPlanes` to erase, by design (`adoptCommittedSegmentationResult` resets `cuttingPlanes` to `[]`). **Defect #1 above lives in this tool's own rebuild path.**
- **Create/Rebuild Cavity:** not re-investigated this pass beyond what the prior repair pass already verified.
- **Registration:** sizing/placement mechanics traced (see §15) — found to work as documented, no defect found. Final-mesh measurement was **not performed** (would require running the real geometry pipeline and inspecting output dimensions, not done this pass).
- **Sprue:** body-binding mechanism traced (see §16) — found to already be defect-resistant by construction (re-resolved from current bodies on every evaluation, never a stale persisted binding). No defect found.
- **Undo/Redo:** confirmed (via code tracing, not new evidence) to be fully separate per-store stacks (singleton vs. segmentation draft vs. Manual/Automatic drafts) with no cross-store merge — this matches the original investigation's already-documented finding; not a new defect, not re-litigated as one.

## 6. Mode Matrix

Not re-investigated this pass. No new evidence beyond what the original investigation and the two prior repair passes already established (Cut by Face / Manual persist re-executable inputs; One Mold / Automatic persist only outputs + provenance, with One Mold's extension-boundary case now replayable per the prior repair).

## 7. Intent / Plan / Geometry Matrix

Unchanged from the prior repair report's §6/§7. Not re-derived this pass.

## 8–10. Invalidation / Stale-State / Regeneration Findings

The one new finding is Defect #1 (§4): an invalidation that is *incomplete* — `definition`/`cavity`/`registration` are correctly invalidated but `lastCommittedResult`/`sprues` are not, breaking the implicit invariant (already relied upon correctly everywhere else in this same file) that `lastCommittedResult` must never outlive the `definition` it was derived from.

## 11–14. Construct Re-entry / Mold Scale / One Mold Replay / Automatic Recovery Findings

Not re-investigated this pass — no code in these paths was touched or newly evidenced. Refer to the prior repair report (`ToolbarToolLifecycleRepair.md`) for the last-verified state of each.

## 15. Registration Findings

Traced via code (not independently re-measured this pass):

- **Sizing:** a 4-rung profile ladder (`registrationPlanner.ts:222-256`) scales width/depth from `minSpan`/`minBodyThickness`, clamped to a process-wide `REGISTRATION_MANUFACTURING_MINIMUM_WIDTH_MM` (2.4mm) floor and each policy's `preferredNominalWidthMm` ceiling. `profileSearchOrder` differs by policy: normal mold tries smallest-first; Automatic-Segmentation-derived molds try preferred-first (30mm) via `AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY`.
- **Placement:** normal mold uses `"edge-corridor"` (fixed inset from interface bounds); Automatic-Segmentation-derived molds use `"cavity-wall-centered"` (centers the feature in the actual solid-material interval next to the cavity, falling back to edge-corridor if no cavity region exists yet).
- **Policy selection is driven by `definition.segmentationLineage`** (via `registrationSizingPolicyFor`), *not* by `document.registrationPolicyId` — that field is a dead, hardcoded-`"default"` literal with no other value ever assigned anywhere in the codebase (grep-confirmed across production and test code). It plays no role in the actual policy decision. **Vestigial, not a visible bug** — flagged for §25/§26, not for repair this pass.
- **Final mesh:** not independently measured this pass.
- **Lifecycle:** unchanged from the prior repair (generated automatically as part of Cavity's derived evaluation; regenerates correctly on a fresh Create/Rebuild Cavity call, verified by the prior pass's regression test).

## 16. Sprue Findings

`SprueOperationDefinition` (the persisted intent) stores only anchor position, inward direction, and profile — never body IDs. `targetBodyIds` exists only on the *resolved* `SprueDefinition` and is recomputed from scratch on every `runDerivedMoldEvaluation` call, by intersecting the sprue tool against whatever bodies are current at that moment (`SprueGenerationService.ts:460`, `replacedBodyIds = affectedIndexes.map(...)`). **There is no persisted body-ID binding to go stale after a segmentation replan** — every regeneration re-resolves from current geometry by construction. This directly resolves the original investigation's H7 ("body-ID change breaks Sprue recovery") for Sprue specifically: the design already avoids the failure mode by never persisting a body-ID binding in the first place. No defect found.

## 17. Flip Findings

See §5. No defect found; already well-tested and correctly gated.

## 18. Eraser Findings

See §4/§5. **Defect #1 lives here.** Scope is correctly limited to Cut-by-Face-style planes; the bug is specific to the zero-cutting-planes-remaining branch of `removeSplitFaceAndRebuild`.

## 19. Body Browser / Viewport / Selection Consistency

Two sources were confirmed to exist by design, not by accident: `MoldBodiesBrowser`/singleton `selectActiveMoldBodies` (committed state only) vs. Viewport's own `segmentationCommittedBodies` (reads the live segmentation draft directly, needed because an *uncommitted* segmentation session has nothing in the singleton yet). This dual-source split was already flagged as a known risk in the original investigation (§21) and is not re-litigated as a new defect here — no reproduction was attempted to confirm whether it currently causes an actual visible disagreement, only that the two code paths exist and read different stores. This remains an **open, not-newly-confirmed** risk area (see §31).

Independently, Defect #1 (§4) is a genuine, confirmed consistency violation: `selectActiveMoldBodies` (read by both consumers) resolves stale data after an Eraser action that should have cleared it.

## 20. History / Undo / Redo

Confirmed (code tracing) to be fully separate per-store stacks: the singleton snapshots itself into its own `undoStack`/`redoStack`; `segmentationMode.store.ts` maintains its own independent stack scoped only to its own fields (explicitly documented as intentional); Manual/Automatic drafts each get their own independent instance. No code path merges or cross-references stacks. This matches the original investigation's already-documented finding (not a new defect); no cross-store Undo/Redo test was executed this pass.

## 21. Async / Worker

Registration and Sprue are evaluated together in one Worker call. The client auto-cancels any in-flight prior request on a new one and filters by `requestId`. The authoritative commit gate, `canCommitMoldEvaluation` (`moldEvaluationCoordinator.ts:9-17`), requires the evaluation to still be `"evaluating"` with a matching `requestId`, `document.revision`, and `document.fingerprint` — every Sprue-mutating action re-reads `get()` and re-checks this gate before applying a result. A separate guard, `isRegistrationAcceptedForCommit`, prevents a previously-keyed Registration from silently downgrading to unkeyed on a later cavity attempt. **This matches the original investigation's "async guards are strong" conclusion** — re-confirmed via code tracing, not newly re-tested with live race reproduction.

## 22. Small vs Large Differences

Not re-investigated this pass.

## 23. Repeated Loop Stress Results

**Not performed this pass.**

## 24. Hypothesis Ranking

| # | Hypothesis | Rank | Evidence |
|---|---|---|---|
| H1 | Some tools still invalidate intent instead of geometry | NOT TESTED | no new evidence gathered |
| H2 | Some re-entry paths still create a new session instead of editing intent | NOT TESTED | unchanged since prior pass |
| H3 | Whole-K2 fallback still becomes final in additional cases | NOT TESTED | unchanged since prior pass |
| H4 | One Mold replay is fixed only for one extension pattern | WEAK | prior pass's fix is generic (loops over all stored boundaries, no per-axis special-casing found on inspection), but only one axis was exercised by the regression test |
| H5 | Automatic and One Mold recovery contracts are inconsistent | NOT TESTED | no new evidence |
| H6 | Registration generated from stale/temporary interfaces in some paths | REJECTED for the Eraser/Cavity path (unchanged mechanism already verified correct by the prior pass's regression test); NOT TESTED elsewhere |
| H7 | Sprue body binding breaks when body IDs change | **REJECTED** | confirmed by design: no persisted body-ID binding exists to break (§16) |
| H8 | Body Browser/Viewport exposes transitional geometry | **CONFIRMED** (Defect #1, a different mechanism than "transitional" — it's *stale*, not *transitional*) |
| H9 | History snapshots restore incomplete cross-store state | **CONFIRMED as a known, documented, unchanged limitation** (fully separate stacks by design) — not investigated for new symptoms |
| H10 | Tool activation/deactivation still mutates canonical state in some tools | NOT TESTED (Construct's case was already fixed by the prior pass) |
| H11 | Create/Rebuild Cavity can execute against the wrong geometry source in a timing window | NOT TESTED |
| H12 | Flip and Eraser remain mostly one-shot/dependency-unaware | Flip: **CONFIRMED intentional, correct** (locked pre/post generation by design, well-tested). Eraser: **PARTIALLY CONFIRMED broken** — Defect #1 is exactly a dependency/invalidation-completeness failure. |
| H13 | Tests encode behavior that is still visually wrong | NOT TESTED broadly; the specific gap found (§4) is an *absence* of a test, not a wrong assertion |
| H14 | Recent repair code improved internal state but doesn't reach the real browser path | NOT TESTED (no browser session run) |

## 25. Recent Code Accumulation Audit

Only the two files touched by the two prior repair passes were candidates for this audit (`splitFace.store.ts`, `cuttingWorkflow.store.ts`, `cuttingWorkflow.contracts.ts`, and their test files). No dead branches, duplicate lifecycle code, or obsolete comments were found in the changed regions themselves — both passes explicitly deleted the code they replaced (the destructive `enterSelection` nulling, the `sprueDefinitions` wipe, the `hasExtensionBoundaries` boolean and its no-replay branch) rather than leaving old and new paths coexisting.

One unrelated, pre-existing dead field was found during this pass: `document.registrationPolicyId: "default"` (see §15) — always the same literal, never read by the actual policy-selection code (`registrationSizingPolicyFor` uses `segmentationLineage` instead). Classification: **UNKNOWN/SIMPLIFY candidate** — plausibly intended as a future extension point (a real second policy ID never shipped) rather than leftover cruft; not confirmed either way, and out of scope to touch without understanding original intent.

## 26. Root Cause Hierarchy

- **Level 1 — local bug:** Defect #1 — `removeSplitFaceAndRebuild`'s zero-planes-remaining branch omits resetting `lastCommittedResult`/`sprues`.
- **Level 2 — lifecycle gap:** none newly confirmed this pass.
- **Level 3 — ownership gap:** none newly confirmed this pass.
- **Level 4 — architecture:** the Body Browser/Viewport dual-source split (§19) remains an architectural question mark, not newly escalated.
- **Level 5 — product policy:** none newly raised this pass.

## 27. Repair Priority Table

| Issue | Severity | Visual impact | Owner | Safest first repair |
|---|---|---|---|---|
| Defect #1: stale `lastCommittedResult`/`sprues` after erasing the last cutting plane | HIGH | immediate (stale geometry visible in Body Browser + Viewport) | `removeSplitFaceAndRebuild`, `splitFace.store.ts:570-591` | Add `lastCommittedResult:null, sprues:[]` to the existing zero-planes-remaining patch object — one-line-per-field addition to an already-correct branch, no new logic, mirrors exactly what the function's own other branch already does for `lastCommittedResult` |

## 28. Recommended Repair Sequence (not implemented this pass)

1. Fix Defect #1 by adding the two missing fields to the existing reset object in `removeSplitFaceAndRebuild`'s zero-planes-remaining branch. Add a regression test asserting `lastCommittedResult === null` after erasing the final face (the gap the existing test suite currently has — the existing "returns to face selection after deleting the final face" test checks `definition`/`workflow` but never `lastCommittedResult`).
2. Independently audit `clearSelection` (`splitFace.store.ts:665`) for the same omission pattern — it was observed to have an identical structural gap (resets `definition`/`cavity`/`registration` but not `lastCommittedResult`/`sprues`) but no caller was found wiring it into the live UI in this pass's grep sweep, so its reachability is unconfirmed. Should be resolved (confirm reachable-and-broken, or confirm dead code) before deciding whether to fix it in the same pass as Defect #1.

## 29. What NOT to Repair Yet

- The Body Browser/Viewport dual-source split (§19) — no confirmed defect, only a known architectural question already on record from the original investigation. Repairing this without a confirmed reproduction would be speculative.
- `document.registrationPolicyId` — vestigial but not visibly broken; removing/repurposing it without knowing its original intended future use risks silently deleting a real (if unused) extension point.

## 30. Browser Validation Requirements (for whichever repair follows)

To close out Defect #1 visually: import a small model → Cut by Face → toggle one face → Done → confirm mold visible in Body Browser and Viewport → Erase the one remaining cutting plane → confirm Body Browser becomes empty/hidden and Viewport shows no mold bodies (not the stale pre-erase mold).

## 31. Unknowns

- **Code unknowns:** whether `clearSelection` (§28.2) is reachable from any current UI path.
- **Runtime unknowns:** whether the Body Browser/Viewport dual-source split (§19) produces an actual observable disagreement in any reachable state, or is fully reconciled by the time either is visible to the user.
- **Browser unknowns:** the entire Part I flow matrix from the request (10 numbered sequences) was not run against a live browser session this pass; none of the visual claims in the original video or prior repair reports were re-verified visually this pass.
- **Product-policy unknowns:** none newly raised.

## 32. Temporary Diagnostic Cleanup

Confirmed: the one temporary reproduction test (in `splitFace.removeAndRebuild.test.ts`) was added, run, and then removed; `git diff --stat` on that file shows zero residual change from before this investigation began. No other files were modified. No debug logging, temporary files, or untracked artifacts were left behind.

## 33. Skill Usage Review

- **Bug Investigation** (applied manually, in-repo — the named "Bug Investigation Skill" file was not present/invokable in the current environment, as the project's custom skill files are part of the repo's pre-existing large set of deleted-but-uncommitted files): drove the "trace backward from candidate symptom to first broken invariant, then reproduce with a real test before concluding" discipline that found Defect #1.
- **Explore** (applied via a background mapping subagent for breadth, plus direct manual tracing for depth): mapped Registration/Sprue/Flip/Eraser/Body-Browser/History/Async code locations efficiently without reading every file in full, then the highest-value one (Eraser's rebuild function) was read and traced manually to the actual bug.
- **UX Interaction Principle:** applied to recognize that "stale committed result outliving its own invalidated `definition`" is a re-entry/continuity violation, not merely an internal state quirk — the user would see it as "my mold came back after I deleted it," a direct interaction-trust break.
- **UI Principle:** applied to confirm `MoldBodiesBrowser` has no independent gate of its own (`if (!bodies?.length) return null` only) — meaning the store-level bug translates directly and unconditionally into a visible UI bug, not something a UI-level guard happens to mask.
- **Design Principle:** applied to identify the exact missing invariant ("`lastCommittedResult` must never outlive the `definition` it was derived from") by comparing the broken branch against its own correct sibling branch in the same function.
- **Add Tooling:** used only to reason about whether Eraser's existing lifecycle contract (invalidate-on-real-edit, matching Construct's already-fixed contract) already covers this case — it does conceptually, the implementation just missed two fields; no new tooling/architecture was proposed.
- **Most useful:** Bug Investigation (found the one real, confirmed defect). **Least useful (this pass):** Add Tooling — the areas investigated didn't surface any tool-lifecycle-contract gap distinct from the one local implementation bug found. **Overlap:** Explore and Bug Investigation, as usual, share the "read the actual code before concluding" discipline. **Improvement suggestion:** a checklist item specifically for "does every early-return/short-circuit branch in a multi-branch mutator reset the *same* fields as its sibling branches" would have found Defect #1 faster by pattern-matching rather than manual reading.

## 34. Final Verdict

- **What is still visibly broken?** One confirmed defect: stale mold geometry remains visible after erasing the last Cut-by-Face cutting plane (Defect #1, §4).
- **What is already genuinely fixed?** The two prior repair passes' targets (Construct re-entry destructive reset, sprue-intent loss on segmentation adopt, One Mold extension replay after Scale) — not re-broken by anything found this pass; no code in those paths was touched or found faulty this pass.
- **Which recent repair code is useful?** All of it, as far as this pass's evidence goes — no dead or redundant code was found in either repair's changes.
- **Which recent repair code appears unnecessary?** None found.
- **Which tool interactions are still destructive?** Eraser, specifically when it removes the *last* remaining cutting plane (Defect #1).
- **Which modes are still inconsistent?** Not newly evidenced this pass.
- **What is the single highest-value repair target?** Defect #1 — a two-line fix (add `lastCommittedResult:null, sprues:[]` to the existing zero-planes-remaining branch) with immediate, confirmed visual impact.
- **What should the next repair prompt modify?** `removeSplitFaceAndRebuild`'s zero-cutting-planes-remaining branch in `splitFace.store.ts`.
- **What should it delete/replace rather than add?** Nothing needs deleting for this fix — it's a pure completion of an existing, otherwise-correct reset object, matching the pattern its own sibling branch already uses.
- **Is the system ready for a repair phase?** Yes, for Defect #1 specifically — it is narrow, confirmed, reproducible, and low-risk. The system is **not** yet ready to close out the broader Body-Browser/Viewport dual-source question or any of the phases marked NOT TESTED in §31 without further, dedicated investigation (ideally including live browser reproduction, which this pass did not perform).
