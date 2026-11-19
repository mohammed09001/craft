# Python analysis speed

Measured 2026-11-19 on one machine (Windows 11, Python 3.13.17, one core used). The engine is the existing pure-Python
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

## What is still slow

- **Smooth meshes grow faster than their face count.** Candidates x faces evaluations are inherent to the algorithm: 1,280 to 5,120
  faces (4x) took 2.8 to 20.7 s (7x). A smooth part of 20,000 faces would take minutes, not seconds (not measured). Removing that
  would change what is computed (fewer or merged candidates) and so the results; the behaviour-preserving alternative is to
  reimplement the evaluation natively, where 100 million evaluations are a fraction of a second (R-Analysis-1).
- **The pure-Python floor.** What remains for a smooth mesh is the arithmetic itself, about a microsecond per (candidate, face).
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
python -m pytest native\engines\analysis-bridge\tests -q                                        # worker tests (from the repository root)
```

## Limits of these numbers

One machine, one core, Windows, Python 3.13.17, generated shapes (boxes and icospheres), one run per cell. No real scanned or
production parts. The exactness argument for the hierarchy rests on IEEE-754 double arithmetic being applied in the same order
(true for CPython floats; no fused multiply-add) and on monotonic rounding in the box test; it is backed by the tests, not proven
formally, and was only run on Windows.
