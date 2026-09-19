# Master Mold Execution 07
## Production Recovery, Verified Intelligence, Runtime Closure, and Ten-Loop Completion

**Date:** 2026-09-17
**Repository:** `mohammed09001/craft`
**Branch:** `main`
**Audited HEAD:** `3c05856d2775dc69ad3c2b3ae4c2ae077f173afe`

# Mission

This execution repairs the remaining Master Mold problems found in the live Craft repository. It preserves the autonomous user flow: Import Model → Master Mold, without requiring Cut by Face, Segmentation, or Create Cavity.

# Confirmed Remaining Problems

1. Exact Working Mold failure stops too early instead of escalating from 2 to 3 to 4 pieces.
2. Large geometry is copied and transformed repeatedly across main thread and Worker.
3. Parting-interface silhouette classification contains a midpoint/provenance defect.
4. Master Tooling split search remains heavily axis/fraction driven.
5. Multi-panel registration relies on AABB interface heuristics and an unexplained tiny key radius.
6. Localized removable core exists but is not driven by the actual locked region.
7. Pour/Vent planning remains coarse and axis/AABB based.
8. UI can show a pieces icon while simultaneously showing blocked/red failure.
9. Stale in-flight work and failure semantics are not fully closed.
10. QA still does not reproduce the real high-poly /workspace failure strongly enough.

# Global Loop Contract

Each loop follows: OBSERVE → TRACE → REPRODUCE → HYPOTHESIZE → PLAN → IMPLEMENT → FOCUSED TEST → NEIGHBOR REGRESSION → GOAL CHECK. If the goal fails, remain in the same loop. Do not continue with PARTIAL. Do not pause for user approval.

# LOOP 01 — Exact Working Mold Failure Must Escalate Piece Count

Goal: return the minimum exactly verified Working Mold piece count.

Repository evidence: `workingMoldPlanner.ts` chooses the first planning-feasible piece count, while `masterMoldEngine.ts` exact-verifies finalists for that count only. If all exact finalists fail, the engine can return `no_release_plan` instead of escalating to the next allowed piece count.

Required repair: iterate piece counts from 2 to the configured maximum. For each count, generate bounded planning finalists, exact-verify them, preserve exact rejection evidence, and continue to the next count when all finalists fail. Stop only at the first exactly verified count.

Gate: exact failure at N escalates to N+1; smallest verified count wins; rejection evidence is preserved; piece-count caps remain enforced.

# LOOP 02 — Eliminate Main-Thread Geometry Copy Waste

Repository evidence: `masterMoldSeed.ts` creates transformed world-space `number[]`; `masterMoldGeneration.workerClient.ts` converts them to `Float32Array`/`Uint32Array`; `masterMoldGeneration.worker.ts` immediately converts them back with `Array.from(...)`.

Required repair: transfer local typed geometry plus transform to the Worker, move heavy world transformation off the UI thread, avoid unnecessary full-array copies, and make planning/kernel contracts accept typed or ArrayLike inputs where practical. Measure seed preparation, transfer, first Worker progress, and heartbeat.

Gate: high-poly input no longer causes a main-thread stall before Worker progress and geometry correctness is unchanged.

# LOOP 03 — Fix Parting Interface Truth

Repository evidence: `workingMoldPlanner.ts` stores midpoint samples between adjacent patch centroids and later tries to find a patch whose centroid equals the midpoint. Missing lookup can currently count as silhouette evidence.

Required repair: preserve patch A/B provenance at interface creation time; classify silhouette from actual adjacent patch normals, release directions, and visibility transitions. Add a pre-CSG accessibility-gain gate for useless splits.

Gate: midpoint lookup no longer determines silhouette truth; true/false silhouette cases pass; oblique Working Mold behavior remains valid.

# LOOP 04 — Make Master Tooling Split Search Geometry-Driven

Repository evidence: `multiPiecePlanner.ts` still uses `candidateAxes = [+X,+Y,+Z]`, split fractions 0.35/0.5/0.65, max split depth 2, and a bounded exact-attempt count per axis.

Required repair: derive split candidates from locked regions, accessibility deficits, undercuts, failed pull directions, local normal clusters, and printer build-volume constraints. Keep axis/fraction candidates as fallback only. Permit bounded oblique planar tooling splits.

Gate: a non-axis tooling fixture can succeed where axis candidates fail; exact attempts stay bounded.

# LOOP 05 — Make Multi-Panel Registration Manufacturable

Repository evidence: multi-panel interface discovery currently depends on AABB-touch heuristics. Registration radius is bounded by `Math.min(registrationPinRadiusMm, caseWallThicknessMm / 2, 0.1)`, leaving an unexplained 0.1 mm cap.

Required repair: use actual interface geometry or split provenance, derive key size from wall/interface/tolerance/process limits, avoid cavity/vent/pour/release corridors, then rerun topology, connectivity, release, assembly, and build-volume verification.

Gate: 3- and 4-panel realistic fixtures have real registration or an explicit physically justified block reason.

# LOOP 06 — Make Localized Core Lock-Driven

Repository evidence: `planLocalizedRemovableCore(...)` exists, but candidate core regions are still based on bounded heuristic split regions and current automatic use is limited by triangle-count conditions.

Required repair: identify the actual local lock from inaccessible patch clusters, release-collision evidence, undercut regions, or visibility deficits. Use planning geometry to localize high-poly locks and exact CSG only for shortlisted cores.

Gate: core region derives from lock evidence; high-poly models are not excluded solely by triangle count; core and shell release order is verified.

# LOOP 07 — Improve Pour Face and Vent Intelligence

Repository evidence: `pourFace.ts` still uses the six Master Mold axis directions as actual pour candidates. Sealed-pocket detection is bounded and `safeVentPathsFor(...)` is conservative and AABB-oriented.

Required repair: add bounded geometry-derived pour candidates, group samples into actual air pockets, use AABB/ray as broad phase and mesh/protected-surface checks as final vent proof, and distinguish automatic verified vent from user-review-only recommendation.

Gate: vent paths are mesh-verified and final tooling geometry is reverified after vent subtraction.

# LOOP 08 — Fix Red Error + New Pieces Icon State

Repository evidence: `MasterMoldPiecesBrowser.tsx` renders whenever `sets.length > 0`. Blocked sets can therefore make the pieces icon appear while `MasterMoldAction.tsx` simultaneously shows a red blocked/error message.

Required repair: derive explicit idle/generating/success/partial-success/blocked/error/stale states. Show the pieces browser only when renderable tooling geometry exists. Partial success may expose valid pieces plus clear blocked diagnostics.

Gate: blocked-only result no longer looks like generated geometry; valid partial geometry remains inspectable.

# LOOP 09 — Close In-Flight Staleness and Failure Semantics

Repository evidence: `MasterMoldAction.tsx` skips live staleness propagation while `status === generating`. This must be paired with a guaranteed identity check/cancellation strategy or stale work may commit.

Required repair: either cancel/invalidate active generation on Master-relevant input changes or compare result seed identity with current live identity before commit. Add structured failure families so budget exhaustion is not described as physical impossibility.

Gate: source/transform/build-volume/reset/new-generation races cannot resurrect obsolete geometry.

# LOOP 10 — Real User Path Production Closure

Repository evidence: `masterMoldRealWorkspace.spec.ts` correctly tests Import → Master Mold without cutting or cavity, but still imports a 12-triangle box. The high-poly browser path currently runs through the isolated e2e harness rather than the real `/workspace`. Viewport E2E observation currently exposes only group presence and mesh count.

Required repair: add a deterministic high-poly STL to the real workspace E2E, verify heartbeat and progress, inspect actual store outcome, extend the E2E viewport observation with rendered piece IDs, visible piece IDs, and geometry identity per piece, then prove real UI hide/show/isolate affects actual Three.js meshes.

Gate: real high-poly /workspace flow remains responsive; 2/3/4-piece, oblique, multi-panel/core, build-volume, and vent cases are covered; full regression and production build pass.

# Non-Negotiable Invariants

- Master Mold starts directly from imported geometry.
- Do not require Cut by Face, Segmentation, or Create Cavity.
- Working Mold piece count and Master Tooling panel/core count are different decisions.
- Prefer minimum verified complexity, never minimum unverified complexity.
- Final emitted geometry must be the same geometry that passed final physical verification.
- Blocked metadata is not printable geometry.
- Search is bounded and budget exhaustion is distinct from physical impossibility.
- Create Cavity remains an independent workflow.
- Do not create a second Master Mold engine.

# Mandatory Context Packet

Before editing, inspect Execution 06, Execution continuous 06, `MasterMoldAction.tsx`, `MasterMoldPiecesBrowser.tsx`, `masterMold.store.ts`, `masterMoldSeed.ts`, planning mesh/direction/accessibility/planner/constructor contracts, `masterMoldEngine.ts`, `multiPiecePlanner.ts`, `pourFace.ts`, `toolingConstruction.ts`, Worker client/Worker/evaluator, viewport runtime/adapter, real workspace E2E, high-poly probe, and actual `package.json` scripts.

# Bug-Hunter Protocol

SYMPTOM → STATE TRACE → CALL TRACE → GEOMETRY TRACE → IDENTITY TRACE → PROOF TRACE → REPRODUCE → REPAIR → FOCUSED TEST → NEIGHBOR REGRESSION.

# Performance Evidence

Report triangle count, vertex count, seed preparation ms, Worker payload ms, first-progress latency, planning/accessibility/piece-count/CSG/tooling/result-transfer times, plus planning patches, raw/kept directions, exact attempts, release sweeps, localized core attempts, vent candidates, and limits exceeded.

# Forbidden Fixes

Do not require manual cutting, raise timeouts as the primary repair, hide red errors, mark blocked geometry current, weaken release checks, disable registration/vent logic, force all models to 2 or 4 pieces, use fixture-specific split planes, increase bundle limits instead of fixing code, or claim CI green without a real run.

# Definition of Done

Execution 07 is READY only when all ten loop gates pass. Otherwise NOT READY.

# Final Report

Report starting/final HEAD, branch, commits, changed files, each loop goal/root cause/repair/tests/evidence/PASS-FAIL, reproduction of the red-error + pieces-icon symptom, 2/3/4-piece geometry evidence, oblique tooling evidence, registration/core/vent evidence, real `/workspace` high-poly heartbeat/progress/viewport evidence, full regression results, build result, and CI run status. If no CI run exists, say so explicitly.

# Final Execution Instruction

LOOP 01 until PASS → LOOP 02 until PASS → LOOP 03 until PASS → LOOP 04 until PASS → LOOP 05 until PASS → LOOP 06 until PASS → LOOP 07 until PASS → LOOP 08 until PASS → LOOP 09 until PASS → LOOP 10 until PASS → FULL QUALITY GATE → FINAL REPORT.

> The geometry the user sees and can print must be the same final geometry that passed exact construction, assembly, registration, vent/core, release, lifecycle, performance, and real-browser verification.
