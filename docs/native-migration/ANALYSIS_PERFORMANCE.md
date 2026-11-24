# Python analysis speed

Measured 2026-11-19 on one machine (Windows 11, Intel Core i7-8550U with 4 cores and 8 threads, Python 3.13.17; Python itself uses one
core, the native kernel up to 8 threads). The engine is the existing pure-Python
`mold_generator_engine` that the native application runs behind its local worker (`native/engines/analysis-bridge/worker`). This
document says what was slow, what was changed, why the results cannot have changed, how that was checked, what the numbers are
and what is still slow. The code is in `mold/src/mold_generator_engine` (ray queries, candidate evaluation), the worker, and
`scripts/native/analysis/` (models, timing, comparison against an older commit).

## Short version

- **Parts with few distinct face normals (boxes, brackets, most CAD parts) are 50 to 150 times faster.** The 10,800-face box that
  took 561 s (884 s when re-run here next to other benchmark work) now takes 3.6 s; a 3,072-face box went from 59 s to 1.1 s.
- **Smooth meshes (every face normal different, such as an icosphere or a scan) are 7 to 29 times faster and use 35 times less
  memory.** A 1,280-face sphere went from 82 s and 1,646 MiB to 2.8 s and 47 MiB; a 5,120-face sphere, which would have needed
  several GiB, takes 21 s and 149 MiB. Their cost still grows faster than the face count (below).
- **The reports are the same.** Run against the commit before this work, the worker's whole report equals the old one field by field
  (only the creation time, the measured milliseconds and the engine version string differ), on every model that was run both ways.
  Behind that: 45 new Python test cases that compare each change with the original code for exact equality, 17 deliberate bugs that the
  tests catch, and the native tests that run the real worker pass.
- **The engine's own default behaviour is unchanged.** One change is an opt-in mode that only the worker uses.
- **A native kernel now does the candidate evaluation (second stage of the work, below).** On the smooth 20,480-face sphere the
  evaluation alone went from 294 s to 2.8 s, with the same results to the last bit, and the whole job takes 43 s. Smooth meshes no
  longer grow with candidates x faces in Python; what is left of their cost is the ray queries and the report.

## What was slow

A profile of the detailed stage on a 768-face box put 99 % of the time in one function: `ray_mesh_query.first_hit`, which tested every
ray against the bounding box of every triangle (4.7 million box tests for 6,144 rays and 768 triangles). Its class was already named
`BruteForceRayMeshQuery`, "a replaceable backend", so a faster backend fits the design.

With that gone, a smooth sphere showed the next layer. Pull-direction candidates are every face normal and its reverse (merged
within a tolerance), so a part with many distinct normals has about as many candidates as faces, and each candidate is evaluated
against every face: candidates x faces evaluations, each stored as an object (1.65 million objects for 1,280 faces). Then the
worker's `to_dict()` turned every one of those objects into a dict, only for its compaction to drop the lists again: for the sphere
that serialization was most of the job (16 of 18 profiled seconds on the 320-face sphere).

## What changed

1. **A bounding-volume hierarchy for the ray queries** (`geometry/ray_mesh_bvh.py`, D-086). It returns exactly what the brute-force
   scan returns, bit for bit, because it changes which triangles are looked at and never how one is judged: a node is skipped only
   when the ray fails the very slab test that the brute-force version applies to each triangle's box, on a box that contains the boxes
   below it (rounding in that test is monotonic, so a ray that reaches a triangle's box reaches every box above it); every triangle
   that remains gets the same per-triangle box test and the same Moller-Trumbore arithmetic in the same order; of several hits at the
   same distance the lowest face index wins, which is what the ascending scan with a strict "closer than" gave. There is no pruning
   by hit distance, because a hit within the epsilon tolerance can lie a hair outside its box and the brute-force version would
   take it. The brute-force class stays, as the reference the tests compare against.
2. **A flat candidate-evaluation loop** (`pipeline/detailed_mold_analysis/evaluation.py`). What depends only on a face (can it be
   analyzed, its normalized normal) is computed once for all candidates; the inner loop does the same arithmetic in the same order
   without a function call per face. Not-analyzable faces share one immutable result.
3. **An opt-in mode that does not keep the per-face evaluations** (`PullDirectionEvaluator(retain_face_evaluations=False)`, D-087).
   The metrics, the score (the default policy's sum, accumulated in the same loop in the same order), the warnings and the
   evaluability are the same; `face_evaluations` becomes an object that knows its length and raises if an item is read. A custom
   scoring policy needs the evaluations, so it keeps them. The worker uses this mode: it only ever reports counts.
4. **A one-pass compact serialization in the worker** (`serialize_compact`, D-088). It produces what
   `compact_detailed_report(report.to_dict())` produces, key order and omitted counts included, without building the per-face lists.

## How it was checked

- `mold/tests/unit/test_ray_mesh_bvh.py` (18 tests): random triangle soups at three epsilons, icospheres including rays from
  inside, rays on vertices and along axes (zero direction components), ignored faces, distance floors, ties among identical
  triangles across leaves, degenerate and non-finite triangles, and a hit just outside a triangle's box but inside the tolerance.
  Every comparison is exact equality of the hit, not a tolerance. One test counts the box tests per ray.
- `test_pull_direction_evaluation_equivalence.py` (20 tests): the loop against the original face-by-face evaluation, including
  broken faces (zero, NaN and infinite area, missing, zero and non-finite normals), non-default thresholds, nothing analyzable, a
  zero candidate direction, normals parallel to a candidate whose dot product rounds above 1, and the not-kept mode and the custom
  policy. Comparison is by exact `repr` as well as `==` (Python 3.13 compares dataclass fields with `==`, and `nan != nan`).
- `native/engines/analysis-bridge/tests/test_compact_serialization.py` (7 tests): the one-pass serialization against the two-step one
  on real reports of four shapes and on awkward values (non-string keys, a non-list under an omitted key, NaN), as JSON text so key
  order counts, and the not-kept evaluator against the kept one through the cavity stage and the ranked candidates.
- 17 deliberate bugs, one at a time (a tie going to the later face, the per-triangle box test dropped, a stricter box test, the
  distance floor ignored, an ignored face not skipped, the epsilon in the barycentric test, each alignment clamp removed, a wrong side
  threshold, a reordered sum, ignored faces counted as analyzed, a wrong score scale, a missing clamp in the score, the custom-policy
  bypass, a count not recorded, the Count key not written, mapping keys not omitted): each makes a test fail. Two gaps were found this
  way and closed: the per-triangle box test needs a leaf with a second, distant triangle to be observable, and the alignment clamp
  needs normals whose self dot product rounds above 1.
- Whole pipeline against the original: `scripts/native/analysis/compare-analysis.ps1 -Baseline d58b3d1` extracts the engine and the
  worker of the commit before this work and compares the full payload of the moldability job field by field
  (`diff_payloads.py`). Also, a fingerprint (SHA-256) of each stage's canonical result (import report, detailed analysis, cavity
  analysis, readiness) was equal between the original and current engine on six models, and between the brute-force and
  hierarchy backends on the 3,072 and 10,800-face boxes.
- The native tests that run the real worker pass: `tst_analysis_bridge`, `tst_reports_equivalence`, `tst_app_workflow`, `app_smoke`.

## Results

Whole moldability job as the worker runs it (analysis, report conversion, compaction, JSON), best of one run, the baseline being
commit d58b3d1:

| model | faces | before | now | speed-up | peak memory before / now | report |
|---|---|---|---|---|---|---|
| box | 768 | 4.3 s | 0.49 s | 8.8x | 33 / 26 MiB | identical |
| box | 3,072 | 59.2 s | 1.1 s | 51x | 55 / 35 MiB | identical |
| box | 10,800 | 561 s (earlier session), 884 s (re-run here, machine busy) | 3.6 s | about 150x | not sampled / 58 MiB | all four stages' fingerprints equal |
| sphere (smooth) | 320 | 5.5 s | 0.77 s | 7.2x | 132 / 27 MiB | identical |
| sphere (smooth) | 1,280 | 81.8 s | 2.8 s | 29x | 1,646 / 47 MiB | identical |
| sphere (smooth) | 5,120 | not run (about 26 million objects, several GiB) | 20.7 s | | / 149 MiB | |

The time per stage for the 10,800-face box: detailed analysis 2.9 s, cavity analysis 1.1 s (the cavity stage's ray queries use the
hierarchy too; its other work was not touched).

## The native candidate evaluation (second stage)

After the first stage, a smooth mesh still spent its time in the candidates x faces loop: 16 s of the 19 s job on the 5,120-face
sphere. That loop is now a C++ function (`native/engines/analysis-kernels`, D-089), called from the worker through ctypes.

**What it is.** `craft_evaluate_pull_directions` takes the analyzable faces (unit normal and area), the unit candidate directions and
the two settings, and returns per candidate the sums the engine builds its evaluation from (analyzed area, area on each side, low-draft
area, area x draft angle, minimum draft, count meeting the recommended draft, and the default score's weighted quality). It is the
loop of `PullDirectionEvaluator._evaluate` with the same operations in the same order. Everything else (the metrics, the warnings,
the evaluability, the score) is still built by the engine's own code, now one method (`finish_candidate_evaluation`) that both the
Python loop and the kernel call, so there is one implementation of it.

**Why it gives the same bits.** Each sum is the same sequence of IEEE-754 double operations as in Python: the library is built
without fused multiply-add and without fast-math (`/fp:strict`, `-ffp-contract=off`), uses the release C runtime that `python.exe`
itself uses (so `asin` is the very function CPython calls), and multiplies by `180/pi` computed in double like `math.degrees`. The
threads split the candidates, never the faces of one candidate, so the result does not depend on the thread count.

**It is never trusted blindly.**
- The worker loads it only from the path the application gives it (`CRAFT_ANALYSIS_KERNELS`; the bundled `analysis/` folder, or the
  build tree in development), and only if its interface version is the one the worker speaks.
- On load it is checked against the Python arithmetic: 249 faces (random unit normals, axis-aligned ones, and four deliberately not unit length), 69 directions (including ones parallel
  and opposite to a face, whose dot product rounds to 1 or just past it), four settings including ones taken from the data so that a pair
  lands exactly on the tolerance or the recommended draft, with one thread and with four. One differing bit rejects the library.
  The check costs about 0.7 s once per worker start (most of it importing the engine).
- The load itself cannot raise a dialog: a file that is not a usable library would make Windows show a modal "Bad Image" box that an unwatched worker would wait on, so the load runs with the thread's error dialogs suppressed (R-Analysis-9).
- If the library is missing, cannot be loaded, fails the check, or reports an error during a run, the engine's own Python
  evaluation runs and the reason is logged and reported next to the report (`diagnostics.pullDirectionEvaluation`, `diagnostics.kernels`
  in the result envelope, not in the report).
- It is used only by the evaluator that does not keep per-face evaluations with the default scoring policy, which is the only mode the
  worker runs; every other configuration is the engine's code unchanged.

**How it was checked.**
- `native/engines/analysis-bridge/tests/test_native_evaluation.py` (28 tests): the whole evaluation against the Python loops by exact
  equality on random faces including broken ones (zero, NaN and infinite area, missing and non-finite normals), non-default settings,
  nothing analyzable, no candidates, a zero direction raising as before, thread counts 1, 2, 3, 7, 16 and automatic giving identical
  bytes, more threads than candidates, arguments the Python loop could not honour being refused and counted, a failing kernel falling
  back, the kernel not used for the other modes, the check rejecting a kernel wrong by one bit and one that depends on the thread
  count, every way loading is refused, and the check's own oracle against the engine's loop.
- 17 deliberate bugs in the C++ (a different summation order of the dot product, either alignment clamp removed, `>=` and `<=` where
  the loop has `>` and `<`, `>` for the draft threshold, the minimum keeping the largest, the quality clamp removed, a sum off by a
  millionth, two record fields swapped, an area added to the wrong side, a thread chunk dropping its last candidate, fused
  multiply-add allowed in an optimized build, a non-finite tolerance or a zero recommended draft accepted): 15 are caught and 2
  change no bit (the lower clamp of the quality ratio cannot fire because a draft angle is never negative, and the `180/pi` constant
  written out equals the computed one). Four of them survived the first version of the check data and led to the boundary faces and
  the settings taken from the data.
- Through the application's bridge: `tst_analysis_bridge` runs the real worker with and without the kernel on a tetrahedron and on
  the bracket fixture and requires the same report `data` object (every ranked candidate, score, metric and warning) and the right
  diagnostics, and requires a missing or corrupt library to fall back with its reason.
- The installed package: `verify-install.ps1` checks that the kernel and the module are in the package, that the bundled interpreter
  loads the installed library and passes its check, and that the application resolved it. Run on the package built from this commit:
  all checks pass, including the run from a hostile environment.
- Whole worker report, native kernel against the Python loop of the same engine and against the commit before the work: identical on
  every model where both were run (`compare-analysis.ps1`, `nativeReport` column).

**Numbers** (release kernel; evaluation alone, `time_evaluation.py`):

| model | faces | candidates | evaluations | Python loop | native | speed-up | results |
|---|---|---|---|---|---|---|---|
| sphere | 1,280 | 1,286 | 1.6 million | 0.87 s | 0.023 s | 38x | identical |
| sphere | 5,120 | 5,126 | 26 million | 16.3 s | 0.20 s | 81x | identical |
| sphere | 20,480 | 20,486 | 420 million | 294 s | 2.8 s | 104x | identical |

Whole job (`compare-analysis.ps1`, one run, release kernel; the baseline is commit d58b3d1, whose timings move by a third between
runs on this machine, 44 s and 59 s for the 3,072-face box):

| model | faces | before the work | stage 1 (Python loop) | with the kernel | report |
|---|---|---|---|---|---|
| box | 768 | 3.4 s | 0.40 s | 0.42 s | identical |
| box | 3,072 | 43.6 s | 0.97 s | 0.99 s | identical |
| sphere | 320 | 4.2 s | 0.58 s | 0.56 s | identical |
| sphere | 1,280 | 62.4 s | 2.4 s | 1.6 s | identical |
| box | 10,800 | 561 s (earlier) | 3.3 s | 3.4 s | identical to the Python loop |
| sphere | 5,120 | not run | 18.9 s | 6.4 s | identical to the Python loop |
| sphere | 20,480 | not run | about 5 minutes (the evaluation alone took 294 s) | 42.6 s, 449 MiB peak, 103 MB of JSON | not compared (two 100 MB reports) |

Boxes have few distinct normals, so they have few candidates and the kernel changes nothing for them; smooth meshes are where it
matters. After the kernel, a profile of the 5,120-face sphere shows the remaining time in the ray queries (undercut analysis and the
cavity openings, 102,400 rays through the hierarchy in Python, about 9 of the 19 profiled seconds) and in turning the report into JSON
(about 5).

## What is still slow

- **Ray queries and the report on large smooth meshes.** The candidate evaluation is no longer the limit (R-Analysis-1 is closed);
  the 20,480-face sphere takes 43 s, mostly rays (one ray set per face, each through the hierarchy in Python) and the 103 MB result.
  A native ray query would be the next step; it must reproduce the brute-force answers bit for bit like the hierarchy does, and it has
  not been started (R-Analysis-5).
- **Models with 100,000 faces or more were not measured.** Candidates x faces would be 10 billion evaluations: roughly 70 s in the
  kernel on this machine, but memory (the JSON, the model objects) and the ray queries will matter before that.
- **Models with real undercuts** (many occluded faces, long ray paths) were not measured: the generated parts have no complicated
  geometry. The hierarchy does not depend on that, but the numbers above should not be read as typical for a complex part.
- The default engine, used outside the worker, still keeps every per-face evaluation: unchanged reference behaviour, unchanged cost.

## Reproducing

```
python -I scripts\native\analysis\make_models.py D:\CraftNative\build\analysis-perf\models        # the models
python -I scripts\native\analysis\time_analysis.py <model.stl> [--backend brute|bvh] [--profile 25]   # per stage, with fingerprints
python -I scripts\native\analysis\time_worker.py <model.stl> [payload.json]                      # the whole worker job
.\scripts\native\analysis\compare-analysis.ps1 -Baseline <commit>                                # against an older commit
cd mold; python -m pytest tests -q                                                              # engine tests (venv with pytest)
python -I scripts\native\analysis\time_evaluation.py <model.stl> <craft_analysis_kernels.dll>      # the evaluation alone, Python against native
.\scripts\native\analysis\compare-analysis.ps1 -Baseline <commit> -Kernels <dll>                 # three columns: before, Python loop, kernel
set CRAFT_ANALYSIS_KERNELS=<dll>; python -m pytest native\engines\analysis-bridge\tests native\tests\python -q   # worker + kernel tests (repository root)
```

## Limits of these numbers

One machine, Windows, Python 3.13.17, generated shapes (boxes and icospheres), one run per cell. No real scanned or
production parts. The exactness argument for the hierarchy rests on IEEE-754 double arithmetic being applied in the same order
(true for CPython floats; no fused multiply-add) and on monotonic rounding in the box test; it is backed by the tests, not proven
formally, and was only run on Windows. The kernel's equality with Python rests on the C runtime's `asin` being the one CPython calls and
on the compiler not contracting multiplies and adds; both are checked by the load-time check on the machine that runs the analysis,
not assumed. A kernel built for macOS or Linux has not been built or run (macOS validation was stopped at the user's request).
