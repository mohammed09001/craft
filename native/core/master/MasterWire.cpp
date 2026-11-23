#include "master/MasterWire.h"

#include <array>
#include <cstring>
#include <optional>
#include <string>
#include <type_traits>
#include <utility>

namespace craft::wire {

namespace {
constexpr char kMagic[4] = {'C', 'M', 'W', '1'};
constexpr std::uint8_t kKindRequest = 1, kKindResult = 2;
}  // namespace

class Writer {
 public:
  static constexpr bool kReading = false;
  void raw(const void* data, std::size_t n) {
    const auto* p = static_cast<const std::uint8_t*>(data);
    bytes.insert(bytes.end(), p, p + n);
  }
  std::size_t remaining() const { return ~std::size_t{0}; }
  std::vector<std::uint8_t> bytes;
};

class Reader {
 public:
  static constexpr bool kReading = true;
  explicit Reader(std::span<const std::uint8_t> data) : p_(data.data()), left_(data.size()) {}
  void raw(void* out, std::size_t n) {
    if (n > left_) throw WireError("The data is truncated.");
    if (n) std::memcpy(out, p_, n);
    p_ += n;
    left_ -= n;
  }
  std::size_t remaining() const { return left_; }

 private:
  const std::uint8_t* p_;
  std::size_t left_;
};

// --- the generic pieces ------------------------------------------------------------------------------------------------------------------

template <class A, class T>
  requires std::is_arithmetic_v<T>
void io(A& a, T& v) {
  a.raw(&v, sizeof(T));
}

template <class A, class T>
  requires std::is_enum_v<T>
void io(A& a, T& v) {
  auto n = static_cast<std::int32_t>(v);
  io(a, n);
  v = static_cast<T>(n);
}

template <class A>
void io(A& a, std::string& s) {
  std::uint64_t n = s.size();
  io(a, n);
  if constexpr (A::kReading) {
    if (n > a.remaining()) throw WireError("A string is longer than the data.");
    s.resize(static_cast<std::size_t>(n));
  }
  a.raw(s.data(), s.size());
}

template <class A, class T>
void io(A& a, std::vector<T>& v) {
  static_assert(!std::is_same_v<T, bool>, "vector<bool> is not supported");
  std::uint64_t n = v.size();
  io(a, n);
  if constexpr (A::kReading) {
    // Every element takes at least one byte on the wire, so a count beyond the remaining data is corrupt: refuse it before allocating.
    if (n > a.remaining()) throw WireError("A list is longer than the data.");
    if constexpr (std::is_arithmetic_v<T>) {
      if (n * sizeof(T) > a.remaining()) throw WireError("A list is longer than the data.");
    }
    v.resize(static_cast<std::size_t>(n));
  }
  if constexpr (std::is_arithmetic_v<T>) {
    a.raw(v.data(), v.size() * sizeof(T));
  } else {
    for (T& e : v) io(a, e);
  }
}

template <class A, class T>
void io(A& a, std::optional<T>& v) {
  bool has = v.has_value();
  io(a, has);
  if constexpr (A::kReading) {
    if (has) {
      v.emplace();
      io(a, *v);
    } else {
      v.reset();
    }
  } else {
    if (has) io(a, *v);
  }
}

template <class A, class T, std::size_t N>
void io(A& a, std::array<T, N>& v) {
  for (T& e : v) io(a, e);
}

// Structs: one `visit` each, found by argument-dependent lookup through the archive's namespace.
template <class A, class T>
  requires std::is_class_v<T> && (!std::is_same_v<T, std::string>)
void io(A& a, T& v);

// --- geometry ----------------------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, Point3& v) { io(a, v.x); io(a, v.y); io(a, v.z); }
template <class A> void visit(A& a, Bounds3& v) { io(a, v.min); io(a, v.max); }
template <class A> void visit(A& a, MeshFaceRun& v) { io(a, v.startTriangle); io(a, v.triangleCount); io(a, v.role); }
template <class A> void visit(A& a, MeshPayload& v) { io(a, v.positions); io(a, v.indices); io(a, v.faceRuns); }

// --- seed ----------------------------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, MasterSeedSourceMesh& v) { io(a, v.modelId); io(a, v.positions); io(a, v.indices); io(a, v.bounds); io(a, v.geometryVersion); }
template <class A> void visit(A& a, MasterCastingProcessProfile& v) {
  io(a, v.profileId); io(a, v.flexibleCastTarget); io(a, v.reusableToolingPreferred); io(a, v.shrinkCompensationMmPerMm);
  io(a, v.minimumToolingWallMm); io(a, v.releaseClearanceMm); io(a, v.maximumToolingPieceCount); io(a, v.ventRequirementPolicy);
  io(a, v.maximumWorkingMoldPieceCount); io(a, v.sacrificialToolingPermitted);
}
template <class A> void visit(A& a, MasterPlanningPreferences& v) { io(a, v.preferredMaximumWorkingMoldPieces); }
template <class A> void visit(A& a, MasterSeedSnapshot& v) {
  io(a, v.schemaVersion); io(a, v.seedId); io(a, v.sourceModelId); io(a, v.sourceGeometryVersion); io(a, v.sourceMesh);
  io(a, v.sourceTransform); io(a, v.sourceBounds); io(a, v.printerBuildVolume); io(a, v.processProfile); io(a, v.userPreferences);
  io(a, v.sourceProjectRevision);
}

// --- tooling set -----------------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, MasterPourFaceCandidate& v) {
  io(a, v.direction); io(a, v.source); io(a, v.exposedOpeningAreaMm2); io(a, v.castingDepthMm); io(a, v.valid); io(a, v.rejectionReason); io(a, v.score);
}
template <class A> void visit(A& a, MasterVentRecommendation& v) { io(a, v.recommendationId); io(a, v.pocketIndex); io(a, v.pocketPosition); io(a, v.message); }
template <class A> void visit(A& a, MasterVentFeature& v) { io(a, v.featureId); io(a, v.start); io(a, v.end); io(a, v.radiusMm); io(a, v.proof); }
template <class A> void visit(A& a, MasterVentPlan& v) { io(a, v.status); io(a, v.features); io(a, v.unresolvedRecommendations); }
template <class A> void visit(A& a, MasterPourFaceDecision& v) {
  io(a, v.selected); io(a, v.castingOrientation); io(a, v.score); io(a, v.candidates); io(a, v.fillabilityWarnings); io(a, v.ventPlan);
}
template <class A> void visit(A& a, MasterReleaseDirection& v) { io(a, v.direction); io(a, v.accessibilityFraction); io(a, v.undercutAreaMm2); }
template <class A> void visit(A& a, MasterSurfaceAccessibility& v) { io(a, v.directions); io(a, v.onePieceReleaseFeasible); }
template <class A> void visit(A& a, MasterPartingSurface& v) { io(a, v.kind); io(a, v.axis); io(a, v.coordinateMm); io(a, v.planeNormal); io(a, v.origin); }
template <class A> void visit(A& a, MasterToolingPiece& v) {
  io(a, v.pieceId); io(a, v.name); io(a, v.mesh); io(a, v.bounds); io(a, v.volumeMm3); io(a, v.triangleCount); io(a, v.watertight); io(a, v.manifold);
  io(a, v.releaseDirection); io(a, v.regions); io(a, v.toolingRegistrationFeatureIds); io(a, v.fitsBuildVolume); io(a, v.directionVector);
}
template <class A> void visit(A& a, MasterReleaseStep& v) {
  io(a, v.stepIndex); io(a, v.pieceId); io(a, v.direction); io(a, v.clearanceDistanceMm); io(a, v.collisionVerified); io(a, v.directionVector);
}
template <class A> void visit(A& a, MasterToolingRegistrationFeature& v) { io(a, v.featureId); io(a, v.kind); io(a, v.malePieceId); io(a, v.femalePieceId); }
template <class A> void visit(A& a, MasterToolingAssembly& v) { io(a, v.pieces); io(a, v.registrationFeatures); io(a, v.coreMode); io(a, v.releaseSequence); }
template <class A> void visit(A& a, MasterToolingSet& v) {
  io(a, v.moldPartId); io(a, v.moldPartName); io(a, v.castTargetVersion); io(a, v.sourceSignature); io(a, v.pourFaceDecision); io(a, v.accessibility);
  io(a, v.releaseMode); io(a, v.partingSurfaces); io(a, v.assembly); io(a, v.warnings); io(a, v.fingerprint);
}

// --- working mold plan -----------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, WorkingMoldPieceTarget& v) {
  io(a, v.pieceId); io(a, v.name); io(a, v.mesh); io(a, v.bounds); io(a, v.volumeMm3); io(a, v.geometryVersion); io(a, v.assignedDirection);
  io(a, v.directionId); io(a, v.releaseOrder); io(a, v.interfaceIds); io(a, v.triangleCount); io(a, v.watertight); io(a, v.manifold);
}
template <class A> void visit(A& a, WorkingMoldPartingInterface& v) {
  io(a, v.interfaceId); io(a, v.pieceAIndex); io(a, v.pieceBIndex); io(a, v.samplePoints); io(a, v.kind); io(a, v.selfIntersecting);
}
template <class A> void visit(A& a, WorkingMoldReleaseStep& v) { io(a, v.stepIndex); io(a, v.pieceIndex); io(a, v.direction); io(a, v.clearanceDistanceMm); io(a, v.collisionVerified); }
template <class A> void visit(A& a, WorkingMoldRegistrationFeature& v) {
  io(a, v.featureId); io(a, v.interfaceId); io(a, v.kind); io(a, v.malePieceIndex); io(a, v.femalePieceIndex); io(a, v.position); io(a, v.direction);
}
template <class A> void visit(A& a, WorkingMoldRegistrationPlan& v) { io(a, v.features); io(a, v.reason); }
template <class A> void visit(A& a, PlanningWarning& v) { io(a, v.code); io(a, v.message); io(a, v.pieceIndex); }
template <class A> void visit(A& a, WorkingMoldPlanScore& v) { io(a, v.slidingWallAreaMm2); io(a, v.seamCrossingCount); io(a, v.areaImbalance); io(a, v.interfaceCount); io(a, v.total); }
template <class A> void visit(A& a, RejectedPieceCount& v) { io(a, v.pieceCount); io(a, v.reason); }
template <class A> void visit(A& a, AutoWorkingMoldPlan& v) {
  io(a, v.sourceGeometryVersion); io(a, v.moldPieces); io(a, v.partingInterfaces); io(a, v.releaseSequence); io(a, v.registrationPlan);
  io(a, v.warnings); io(a, v.score); io(a, v.rejectedPieceCounts);
}

// --- request and result ------------------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, MasterMoldBudgetLineItem& v) { io(a, v.name); io(a, v.limit); io(a, v.used); io(a, v.pruned); io(a, v.reason); }
template <class A> void visit(A& a, MasterMoldBudgetReport& v) {
  io(a, v.candidateDirectionCount); io(a, v.planningPatchCount); io(a, v.workingMoldPlanCandidateCount); io(a, v.workingMoldConstructionAttempts);
  io(a, v.pourFaceAnalysisAttempts); io(a, v.ventAnalysisAttempts); io(a, v.toolingOnePieceAttempts); io(a, v.toolingMultiPieceAttempts);
  io(a, v.toolingExactPlanAttempts); io(a, v.releaseVerificationAttempts); io(a, v.limitsExceeded); io(a, v.budgetDetails);
}
template <class A> void visit(A& a, MasterToolingSetState& v) {
  io(a, v.moldPartId); io(a, v.moldPartName); io(a, v.status); io(a, v.sourceSignature); io(a, v.contentVersion); io(a, v.set);
  io(a, v.failureMessage); io(a, v.failureFamily);
}
template <class A> void visit(A& a, MasterMoldRequest& v) { io(a, v.operationId); io(a, v.generationVersion); io(a, v.seed); io(a, v.priorSets); }
template <class A> void visit(A& a, MasterMoldResult& v) {
  io(a, v.operationId); io(a, v.generationVersion); io(a, v.elapsedMs); io(a, v.sets); io(a, v.plan); io(a, v.workingMoldPieceCount);
  io(a, v.warningCount); io(a, v.budget); io(a, v.seedId); io(a, v.unportedPathsReached); io(a, v.unportedPaths);
}

template <class A, class T>
  requires std::is_class_v<T> && (!std::is_same_v<T, std::string>)
void io(A& a, T& v) {
  visit(a, v);
}

template <class T>
std::vector<std::uint8_t> encode(std::uint8_t kind, const T& value) {
  Writer w;
  w.raw(kMagic, sizeof kMagic);
  w.raw(&kind, 1);
  io(w, const_cast<T&>(value));   // the writer only reads
  return std::move(w.bytes);
}

template <class T>
T decode(std::uint8_t kind, std::span<const std::uint8_t> bytes) {
  Reader r(bytes);
  char magic[4];
  std::uint8_t got = 0;
  r.raw(magic, sizeof magic);
  r.raw(&got, 1);
  if (std::memcmp(magic, kMagic, sizeof kMagic) != 0) throw WireError("This is not Craft job data.");
  if (got != kind) throw WireError("The job data is of the wrong kind.");
  T value;
  io(r, value);
  if (r.remaining() != 0) throw WireError("The job data has trailing bytes.");
  return value;
}

}  // namespace craft::wire

namespace craft {

std::vector<std::uint8_t> encodeMasterMoldRequest(const MasterMoldRequest& request) { return wire::encode(wire::kKindRequest, request); }
MasterMoldRequest decodeMasterMoldRequest(std::span<const std::uint8_t> bytes) { return wire::decode<MasterMoldRequest>(wire::kKindRequest, bytes); }
std::vector<std::uint8_t> encodeMasterMoldResult(const MasterMoldResult& result) { return wire::encode(wire::kKindResult, result); }
MasterMoldResult decodeMasterMoldResult(std::span<const std::uint8_t> bytes) { return wire::decode<MasterMoldResult>(wire::kKindResult, bytes); }

}  // namespace craft
