#pragma once

// Sprue generation: one engineering-profile sprue cut through every mold body
// it enters, plus the sequential evaluation over all sprue intents and the
// top-face placement query.
//
// Ports of mold-generation/sprue-generation/: SprueGenerationService.ts,
// sprueGeneration.contracts.ts, sprueTolerance.policy.ts, and of the sprue part
// of workflow/evaluateDerivedMold.ts and viewport/runtime/spruePreview3dRuntime.ts
// (placement). Failure reason codes are the reference strings.
//
// Deviation (docs D-011): the derived body geometry-version token is a native
// FNV hash over the same inputs, not string-equal to the reference token.

#include <map>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

#include "IMeshGeometryEngine.h"
#include "contracts/Geometry.h"
#include "geometry/RayPicking.h"
#include "mold/ReferenceMold.h"
#include "mold/SprueProfile.h"

namespace craft {

inline constexpr double kSprueTopNormalMinDot = 0.9;
inline constexpr double kSprueSurfaceToleranceMm = 1e-4;  // placement preview tolerance
inline constexpr double kSprueRayOriginOffsetMm = 1e-5;

/// Mirrors SprueTolerancePolicy.
struct SprueTolerancePolicy {
  double linearToleranceMm = 0;
  double areaToleranceMm2 = 0;
  double volumeToleranceMm3 = 0;
  double meaningfulVolumeMm3 = 0;
  double surfaceToleranceMm = 0;
  double outsideMarginMm = 0;
  double beyondMarginMm = 0;
};
/// Throws std::invalid_argument for invalid bounds/tolerance.
SprueTolerancePolicy buildSprueTolerancePolicy(const MoldBody& aggregate, double requestedToleranceMm);

/// Mirrors SprueOperationDefinition (the user's durable intent).
struct SprueValidation {
  std::string status = "pending";  // "pending" | "resolved" | "invalid"
  std::string reasonCode;
  std::string message;
};
struct SprueOperationDefinition {
  std::string operationId;
  Point3 position;         // anchor on the top face, mold-local
  Point3 inwardDirection{0, 0, -1};
  SprueProfileDesignResult profileDesign;
  int creationOrder = 0;
  SprueValidation validation;
};

/// Mirrors SprueDefinition (a resolved sprue).
struct SprueDefinition {
  std::string operationId;
  std::vector<std::string> targetBodyIds;
  Point3 position;
  Point3 inwardDirection;
  SprueProfileDimensions profile;
  double depthMm = 0;
  int circularSegments = kSprueCircularSegments;
  std::string moldFrameId;
  SprueTolerancePolicy tolerancePolicy;
};

struct SprueFailure {
  std::string reasonCode;  // SPRUE_* strings
  std::string message;
};

struct SprueGenerationInput {
  std::string operationId;
  Point3 position;
  SprueProfileDesignResult profileDesign;
  std::string moldRevision;
  std::vector<MoldBody> targetBodies;
  MeshPayload cavity;  // empty => SPRUE_CAVITY_MISSING
  std::string moldFrameId = "mold-frame";
  Point3 zAxis{0, 0, 1};
  double geometryToleranceMm = kMoldGeometryToleranceMm;
};

struct SprueGenerationResult {
  bool success = false;
  SprueFailure failure;
  SprueDefinition sprue;
  std::vector<MoldBody> updatedBodies;  // same ids as the replaced bodies
  std::vector<std::string> replacedBodyIds;
};

SprueGenerationResult generateSprue(IMeshGeometryEngine& engine, const SprueGenerationInput& input);

/// The per-sprue memo of evaluateDerivedMold.ts (`sprueResultCache`). A sprue's result depends only on its own definition and on the revision
/// of the bodies it sees (which already encodes the cavity signature and every upstream body's geometry version), so editing sprue k leaves
/// the results of sprues 0..k-1 reusable and skips their Boolean pass. Failures are memoised too. One record per operation id, and after each
/// evaluation the cache holds exactly that evaluation's records (a deleted sprue's record goes). Thread-safe: derived evaluation runs on worker
/// threads and a superseded job may still be finishing when the next one starts.
class SprueResultCache {
 public:
  struct Entry {
    std::string key;
    SprueGenerationResult result;
  };
  std::optional<SprueGenerationResult> find(const std::string& operationId, const std::string& key) const;
  void replaceAll(std::map<std::string, Entry> entries);
  void clear();
  std::size_t size() const;

 private:
  mutable std::mutex mutex_;
  std::map<std::string, Entry> entries_;
};

/// The complete snapshot of what generateSprue is given for one sprue (the reference's `sprueCacheKey`, plus the frame id, which it also forwards).
std::string sprueCacheKey(const std::string& moldRevision, const std::string& moldFrameId, const SprueOperationDefinition& definition);

/// Result of evaluating every sprue intent in creation order against the
/// cavity bodies (port of the sprue loop in evaluateDerivedMold).
struct SprueEvaluation {
  std::vector<MoldBody> bodies;  // cavity bodies with sprues applied
  std::vector<SprueDefinition> resolvedSprues;
  std::vector<SprueOperationDefinition> definitions;  // validation filled in
  std::vector<std::string> warnings;
  std::size_t cacheHits = 0, cacheMisses = 0;  // sprues served from the cache / generated (all misses without a cache)
};
/// `cache` (optional) memoises per sprue as above; the result is identical with or without it.
SprueEvaluation evaluateSprues(IMeshGeometryEngine& engine, const std::vector<MoldBody>& cavityBodies,
                               const MeshPayload& cavityTool, const std::string& cavitySourceSignature,
                               const std::string& moldFrameId,
                               std::vector<SprueOperationDefinition> definitions, SprueResultCache* cache = nullptr);

// --- placement ---------------------------------------------------------------

/// Mirrors SpruePreviewPlacement.
struct SpruePlacement {
  bool valid = false;  // false: the axis does not reach the cavity
  Point3 topPoint;
  Point3 inwardDirection{0, 0, -1};
  double stemLengthMm = 0;
  Point3 cavityPoint;  // meaningful only when valid
  SprueProfileDesignResult profileDesign;
};

struct SprueCavityFacts {
  const MeshPayload* mesh = nullptr;
  double volumeMm3 = 0;
  Bounds3 bounds;
};

/// Port of SpruePreview updateFromRay(): the ray must hit a mold body on its
/// exact top plane (`moldTopZ`) with an upward normal (>= 0.9); the stem runs
/// straight down to the first cavity surface. nullopt when the ray does not
/// land on the top face.
std::optional<SpruePlacement> computeSpruePlacement(const Ray& ray, const std::vector<MoldBody>& bodies,
                                                    double moldTopZ, const SprueCavityFacts& cavity);

}  // namespace craft
