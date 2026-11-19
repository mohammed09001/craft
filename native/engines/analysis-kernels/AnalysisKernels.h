#pragma once

// Numerical kernels for the Python analysis worker, called through ctypes (a plain C interface: no Qt, no Python headers).
//
// craft_evaluate_pull_directions is the hot loop of the pull-direction candidate evaluation
// (mold_generator_engine/pipeline/detailed_mold_analysis/evaluation.py): for every candidate direction, against every analyzable face,
// the draft angle, the side of the face, and the sums the engine's metrics and score are built from. It does the same arithmetic in the
// same order as the Python loop, so every sum comes out bit for bit the same; the worker checks that on load with a fixed set of
// faces and directions, and without the library (or when that check fails) the worker runs the Python loop.
//
// Built without floating-point contraction (no fused multiply-add) and without fast-math, so that a*b+c is a multiply and an add as
// in CPython. The threads split the candidates, never the faces of one candidate, so the result does not depend on the thread count.

#include <cstdint>

#if defined(_WIN32)
#if defined(CRAFT_KERNELS_BUILD)
#define CRAFT_KERNELS_API extern "C" __declspec(dllexport)
#else
#define CRAFT_KERNELS_API extern "C" __declspec(dllimport)
#endif
#else
#define CRAFT_KERNELS_API extern "C" __attribute__((visibility("default")))
#endif

/// Layout version of the interface below. The caller refuses a library whose version it does not know.
#define CRAFT_KERNELS_ABI_VERSION 1

/// Doubles per face in `faces`: unit normal x, y, z and the face area.
#define CRAFT_EVAL_FACE_STRIDE 4
/// Doubles per candidate in `results`.
#define CRAFT_EVAL_RESULT_STRIDE 10

// Result record per candidate (all doubles; counts are exact in a double):
//   [0] analyzed face count      [1] total analyzed area        [2] positive side area   [3] negative side area
//   [4] neutral area             [5] low-draft area             [6] sum of area * draft angle (degrees)
//   [7] minimum draft angle (degrees; NaN when there is no face)   [8] faces meeting the recommended draft (count)
//   [9] sum of area * clamp01(draft / recommended draft)   (the default scoring policy's weighted quality)

#define CRAFT_KERNELS_OK 0
#define CRAFT_KERNELS_INVALID_ARGUMENT 1
#define CRAFT_KERNELS_FAILED 2

CRAFT_KERNELS_API int craft_kernels_abi_version(void);

/// Evaluates `candidate_count` unit directions (3 doubles each) against `face_count` analyzable faces (CRAFT_EVAL_FACE_STRIDE doubles
/// each, in the order the Python loop visits them). `threads` <= 0 means one per hardware thread (at most 16), 1 means no threads.
/// Returns CRAFT_KERNELS_OK, CRAFT_KERNELS_INVALID_ARGUMENT (a null pointer with a positive count, a negative count, a
/// non-positive recommended draft, a non-finite tolerance) or CRAFT_KERNELS_FAILED (an exception inside).
CRAFT_KERNELS_API int craft_evaluate_pull_directions(std::int64_t face_count, const double* faces, std::int64_t candidate_count,
                                                     const double* directions, double alignment_tolerance,
                                                     double minimum_recommended_draft_degrees, int threads, double* results);
