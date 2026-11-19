#include "AnalysisKernels.h"

#include <cmath>
#include <limits>

#if defined(_WIN32)
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#else
#include <pthread.h>
#include <unistd.h>
#endif

// This library is loaded into python.exe, so it keeps to the C runtime the interpreter already has (no C++ standard library
// objects, no exceptions, no allocation): that is why the threads are the platform's own rather than std::thread, and why the
// library needs nothing next to it. asin is then the very function CPython calls, which the bit-for-bit claim depends on.

namespace {

// math.degrees in CPython is x * (180.0 / pi), with the constant computed once in double.
constexpr double kRadToDeg = 180.0 / 3.14159265358979323846;

struct Job {
  std::int64_t faceCount;
  const double* faces;
  const double* directions;
  double tolerance;
  double recommendedDraft;
  double* results;
  std::int64_t first;  // this thread's candidates: [first, last)
  std::int64_t last;
};

// One candidate against every face: the loop of PullDirectionEvaluator._evaluate (evaluation.py), accumulator by accumulator in the
// same order of operations.
void evaluateCandidate(std::int64_t faceCount, const double* faces, const double* direction, double tolerance,
                       double recommendedDraft, double* out) {
  const double px = direction[0], py = direction[1], pz = direction[2];
  double total = 0.0, positive = 0.0, negative = 0.0, neutral = 0.0, low = 0.0, weightedDraft = 0.0, weightedQuality = 0.0;
  double minimumDraft = std::numeric_limits<double>::quiet_NaN();
  bool anyFace = false;
  std::int64_t meeting = 0;

  for (std::int64_t i = 0; i < faceCount; ++i) {
    const double* face = faces + i * CRAFT_EVAL_FACE_STRIDE;
    const double area = face[3];

    double signedAlignment = (face[0] * px) + (face[1] * py) + (face[2] * pz);
    if (signedAlignment <= -1.0) signedAlignment = -1.0;
    else if (signedAlignment >= 1.0) signedAlignment = 1.0;
    const double draft = std::asin(std::fabs(signedAlignment)) * kRadToDeg;

    total += area;
    if (signedAlignment > tolerance) positive += area;
    else if (signedAlignment < -tolerance) negative += area;
    else neutral += area;

    weightedDraft += area * draft;
    if (!anyFace) {
      minimumDraft = draft;
      anyFace = true;
    } else if (draft < minimumDraft) {
      minimumDraft = draft;
    }

    if (draft >= recommendedDraft) ++meeting;
    else low += area;

    double quality = draft / recommendedDraft;
    if (quality <= 0.0) quality = 0.0;
    else if (quality >= 1.0) quality = 1.0;
    weightedQuality += area * quality;
  }

  out[0] = static_cast<double>(faceCount);
  out[1] = total;
  out[2] = positive;
  out[3] = negative;
  out[4] = neutral;
  out[5] = low;
  out[6] = weightedDraft;
  out[7] = minimumDraft;
  out[8] = static_cast<double>(meeting);
  out[9] = weightedQuality;
}

void runJob(const Job& job) {
  for (std::int64_t c = job.first; c < job.last; ++c)
    evaluateCandidate(job.faceCount, job.faces, job.directions + 3 * c, job.tolerance, job.recommendedDraft,
                      job.results + c * CRAFT_EVAL_RESULT_STRIDE);
}

constexpr int kMaxThreads = 16;

int hardwareThreads() {
#if defined(_WIN32)
  SYSTEM_INFO info;
  GetSystemInfo(&info);
  return info.dwNumberOfProcessors > 0 ? static_cast<int>(info.dwNumberOfProcessors) : 1;
#else
  const long n = sysconf(_SC_NPROCESSORS_ONLN);
  return n > 0 ? static_cast<int>(n) : 1;
#endif
}

#if defined(_WIN32)
DWORD WINAPI threadMain(LPVOID argument) {
  runJob(*static_cast<const Job*>(argument));
  return 0;
}
#else
void* threadMain(void* argument) {
  runJob(*static_cast<const Job*>(argument));
  return nullptr;
}
#endif

}  // namespace

int craft_kernels_abi_version(void) { return CRAFT_KERNELS_ABI_VERSION; }

int craft_evaluate_pull_directions(std::int64_t faceCount, const double* faces, std::int64_t candidateCount, const double* directions,
                                   double alignmentTolerance, double minimumRecommendedDraftDegrees, int threads, double* results) {
  if (faceCount < 0 || candidateCount < 0) return CRAFT_KERNELS_INVALID_ARGUMENT;
  if ((faceCount > 0 && !faces) || (candidateCount > 0 && (!directions || !results))) return CRAFT_KERNELS_INVALID_ARGUMENT;
  if (!std::isfinite(alignmentTolerance) || !std::isfinite(minimumRecommendedDraftDegrees) || !(minimumRecommendedDraftDegrees > 0.0))
    return CRAFT_KERNELS_INVALID_ARGUMENT;
  if (candidateCount == 0) return CRAFT_KERNELS_OK;

  int workers = threads > 0 ? threads : hardwareThreads();
  if (workers > kMaxThreads) workers = kMaxThreads;
  // A thread is not worth its start-up below some amount of work.
  if (static_cast<double>(faceCount) * static_cast<double>(candidateCount) < 2.0e5) workers = 1;
  if (static_cast<std::int64_t>(workers) > candidateCount) workers = static_cast<int>(candidateCount);

  Job jobs[kMaxThreads];
  // Contiguous chunks of candidates, one per thread. Each candidate is computed by one thread, start to end, so the sums do not
  // depend on how many threads there are.
  const std::int64_t chunk = (candidateCount + workers - 1) / workers;
  int jobCount = 0;
  for (int w = 0; w < workers; ++w) {
    const std::int64_t first = static_cast<std::int64_t>(w) * chunk;
    if (first >= candidateCount) break;
    const std::int64_t last = first + chunk < candidateCount ? first + chunk : candidateCount;
    jobs[jobCount++] = Job{faceCount, faces, directions, alignmentTolerance, minimumRecommendedDraftDegrees, results, first, last};
  }

  // Job 0 runs on the calling thread; the others on threads of their own. A thread that cannot be started is run here too, after
  // the others have been launched, so a failure to start one costs time and never changes a result.
  bool started[kMaxThreads] = {};
#if defined(_WIN32)
  HANDLE handles[kMaxThreads] = {};
  for (int j = 1; j < jobCount; ++j) {
    handles[j] = CreateThread(nullptr, 0, threadMain, &jobs[j], 0, nullptr);
    started[j] = handles[j] != nullptr;
  }
  runJob(jobs[0]);
  for (int j = 1; j < jobCount; ++j) {
    if (started[j]) {
      WaitForSingleObject(handles[j], INFINITE);
      CloseHandle(handles[j]);
    } else {
      runJob(jobs[j]);
    }
  }
#else
  pthread_t handles[kMaxThreads];
  for (int j = 1; j < jobCount; ++j) started[j] = pthread_create(&handles[j], nullptr, threadMain, &jobs[j]) == 0;
  runJob(jobs[0]);
  for (int j = 1; j < jobCount; ++j) {
    if (started[j]) pthread_join(handles[j], nullptr);
    else runJob(jobs[j]);
  }
#endif
  return CRAFT_KERNELS_OK;
}
