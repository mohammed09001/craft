# P0-5: stopping a cancelled geometry job for real -- scoping and options (2026-11-23)

## The problem
A cancelled or timed-out mold or Master Mold job cannot be interrupted inside a Manifold Boolean. D-106 and D-107 release the UI at once and let the thread end on its own, and refuse a second heavy job while it does. That bounds the damage to one orphan thread, but not its duration (over 250 s was measured on the larger spheres) or its memory.

## Why a thread cannot be killed
`TerminateThread` leaves the CRT heap and any internal lock the thread held locked, so the next allocation anywhere in the process can deadlock. Not acceptable. The only safe hard stop is a separate process.

## Option A: proxy the `IMeshGeometryEngine` interface into a worker process
The seam is narrow (about 20 methods) and every mold and Master Mold job goes through it. Solids would live in the worker as handles; meshes cross the boundary only in `solidFromMesh` and `meshFromSolid`. Cancel means killing the worker.
**Blocker found:** `levelSet(const std::function<double(const Point3&)>& sdf, ...)` takes a closure that the kernel calls on every lattice point on all cores. That closure cannot cross a process boundary without being rebuilt in the worker from the mesh it was made from (`core/mold/SignedDistance.cpp`), which changes the interface. Also, every Boolean in the Master Mold release sweep becomes a round trip, so the many small operations of D-122 get slower and have to be re-measured.

## Option B: run the whole job in a worker process (recommended)
`Craft.exe --geometry-worker` reads a job file (request) and writes a result file, reporting progress lines on stdout. Cancel or timeout kills the process; Windows frees the memory at once. No interface change, no per-operation overhead, and the `levelSet` closure stays in-process.
**Cost:** serializers for the request and result types. `MasterMoldRequest/Result` and `MoldGenerationRequest/Result` together with `DerivedMoldEvaluation` reach roughly 50 nested structs (meshes, tooling sets, plans, budgets, issues, sprue cache). Each needs a writer and a reader, plus a round-trip test that compares the decoded value with the original on the real fixtures. Large meshes (hundreds of MiB at the top end) must go through files, not pipes.
**Also needed:** packaging the worker mode (same exe, no new file), a crash and non-zero-exit path that reports a clear error, the memory preflight (D-105, D-106) applied to the child, the sprue cache (`sprueCache_`) which today is shared by pointer with the job and would have to be sent or rebuilt, and tests that kill a running job and check the process is gone and memory is released.

## Option C: keep D-106/D-107, document the limit
Already in place. Honest, bounded to one thread at a time, not a fix.

## Recommendation
Option B, in phases, each shippable and tested on its own:
1. Worker mode and a framed job/progress/cancel protocol, with a trivial test job; kill-and-verify test.
2. Master Mold request/result serializers and round-trip tests on `master-reference.json`; switch Master Mold to the worker behind a setting; compare outputs with the in-process run on the equivalence fixtures (`tst_master_equivalence`).
3. Mold generation and derived evaluation the same way (`mold-reference.json`).
4. Remove the orphan-thread bookkeeping (`moldOrphans_`, `masterOrphans_`, `windingDown`) once both run out of process.
Rough size: several days of focused work, mostly the serializers and their tests. The risk is silent drift between a type and its serializer; the round-trip tests on real fixtures are the guard, and the in-process path stays available until the worker path has matched it on every fixture.

## Decision needed
Go ahead with Option B (phase 1 first), or accept Option C for v1 and record P0-5 as "bounded, not preemptive" in the release notes.

## Progress

- **Phase 1 done (2026-11-23):** Craft.exe --geometry-worker <job> <result> (handled in main before any GUI exists), WorkerProcess (start, progress, cancel by killing the process, outcome Succeeded / Failed / Cancelled / Crashed, never leaves a worker behind when destroyed), self-test job kinds echo and spin. 	st_geometry_worker (5 tests, 3.6 s): a job runs in another process; progress arrives; **cancel stops a process holding 400 MiB and burning CPU within 5 s and the process is gone**; a failing job reports its message; a worker killed from outside is neither Cancelled nor Succeeded; destroying the launcher leaves nothing behind. Mutation: not killing in cancel() fails the cancel test. Full Release CTest 47/47, 252.3 s. **No real job uses the worker yet**, so the application's behaviour is unchanged and P0-5 is not closed.
- **Phase 2 done for Master Mold (2026-11-23):** core/master/MasterWire.{h,cpp} (one visitor per struct, used for both writing and reading, so a field cannot be written and forgotten when reading; truncated, forged-length, wrong-kind and trailing-byte data are refused with WireError); a master-mold job in the worker (the request travels as payload.bin beside the job file, the result comes back as the result file, stage lines on stderr, failures as ERROR <code><TAB><message>); AppController::setGeometryWorkerExecutable (the application sets it to its own executable unless CRAFT_MASTER_IN_PROCESS is set). Cancel, timeout and reset kill the process: no orphan thread is counted, windingDown stays false and a new run is allowed at once. Tests: 	st_master_wire (round trip of real engine output for c-extrusion, bracket-soup and c-assembly with an independent comparison, mutation-checked by dropping the piece mesh from the visitor; every truncation length; forged 2^60 length), 	st_geometry_worker (13 tests: the result from the other process equals the in-process result, corrupt or missing request reports a code, **cancelling a real Master Mold on the torus part kills it within 5 s and the process is gone**), 	st_app_workflow (4 new: same tooling as in-process, cancel and timeout stop it for real with nothing winding down, an unstartable worker fails the run cleanly with worker_start_failed). Full Release CTest 48/48, 242.8 s, including pp_smoke_master with the worker on by default.
- Phase 3 (mold generation and derived evaluation) and phase 4 (remove the orphan-thread bookkeeping for Master Mold once mold generation is also out of process) not started. The mold's Cancel is still the in-process, non-interruptible kind.
- Not yet measured: the cost of the process start and of moving large meshes through the files on the big Master Mold cases (R-Parts-2). Not yet run: erify-install.ps1 on a package built with this change (the worker is the same executable, so no new file is expected).
