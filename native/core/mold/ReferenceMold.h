#pragma once

// Reference mold block, Cut-by-Face planes, and the orthogonal partition.
//
// Ports of (all under mold/frontend/src/features/mold-generation/):
//   reference-mold-definition/referenceMoldBlock.geometry.ts
//   reference-mold-definition/orthogonalMold.ts
//   split-face/splitFace.contracts.ts + splitFace.geometry.ts
//
// Vocabulary kept from the reference: K1 is the part bounding box placed in
// the mold frame ("selection box"), K2 is the reference mold block (K1 grown
// by the clearance on every side, bottom resting on Z = 0).

#include <array>
#include <optional>
#include <string>
#include <vector>

#include "contracts/Geometry.h"

namespace craft {

inline constexpr double kDefaultReferenceMoldClearanceMm = 10;
inline constexpr double kMinReferenceMoldClearanceMm = 1;
inline constexpr double kMaxReferenceMoldClearanceMm = 225;
/// Millimeter tolerance shared by the orthogonal solid kernel.
inline constexpr double kMoldGeometryToleranceMm = 1e-6;
inline constexpr double kCuttingPlaneInsetMm = kMoldGeometryToleranceMm;
inline constexpr double kCuttingPlaneNormalizedEpsilon = 1e-6;

double clampReferenceMoldClearance(double clearanceMm);

/// K1 grown by the clearance; nullopt for invalid bounds or a clearance
/// outside [min, max].
std::optional<Bounds3> createReferenceMoldBlockBounds(const Bounds3& innerBounds,
                                                      double clearanceMm);

struct ReferenceMoldFrameBounds {
  Point3 partOffset;            // always (0, 0, clearance)
  Bounds3 selectionBoxBounds;   // K1
  Bounds3 referenceMoldBlockBounds;  // K2
};

/// Places a grounded part into the manufactured mold frame: the mold bottom
/// stays on Z = 0 and the part is lifted by the clearance.
std::optional<ReferenceMoldFrameBounds> createReferenceMoldFrameBounds(
    const Bounds3& groundedPartBounds, double clearanceMm);

// --- Cut by Face ----------------------------------------------------------

/// Order matters: it is the reference PART_BOUNDING_BOX_FACE_IDS order and is
/// used as the plane creation order.
enum class FaceId : int { Front = 0, Back, Left, Right, Top, Bottom };
inline constexpr std::array<FaceId, 6> kFaceIds{FaceId::Front, FaceId::Back,  FaceId::Left,
                                                FaceId::Right, FaceId::Top,   FaceId::Bottom};
const char* faceIdName(FaceId face);
std::optional<FaceId> faceIdFromName(const std::string& name);

struct CuttingPlane {
  FaceId sourceFace = FaceId::Top;
  Axis axis = Axis::Z;
  Point3 normal;
  double normalizedPosition = 0;  // 0..1 across K1 along `axis`
  bool enabled = true;
  int creationOrder = 0;
};

struct NormalizedInterval {
  double min = 0;
  double max = 1;
};

/// Throws std::invalid_argument when K1 is too thin for a plane on `axis`.
NormalizedInterval safeNormalizedInterval(const Bounds3& bounds, Axis axis);
double clampNormalizedPosition(double value, const Bounds3& bounds, Axis axis);
double normalizedToWorldCoordinate(const Bounds3& bounds, Axis axis, double normalized);

/// Default plane sits on the chosen K1 face (inset by the epsilon); pass a
/// normalized position to place it elsewhere along the face's axis.
CuttingPlane createCuttingPlane(FaceId face, std::optional<double> normalizedPosition = {});

struct CutPlaneData {
  Axis axis = Axis::Z;
  double coordinate = 0;
  Point3 normal;
  std::string sourceSketchId;
  FaceId sourceFace = FaceId::Top;
  int order = 0;
};

std::vector<CutPlaneData> cuttingPlanesToCutPlaneData(const Bounds3& bounds,
                                                      const std::vector<CuttingPlane>& planes);

// --- Mold bodies ----------------------------------------------------------

struct MoldBody {
  std::string id;
  std::string name;
  bool visible = true;
  Bounds3 bounds;
  Point3 centroid;
  int generationOrder = 0;
  std::string sourceSelectedFaceSignature;
  std::size_t triangleCount = 0;
  double volumeMm3 = 0;
  bool watertight = true;
  MeshPayload mesh;
  std::string geometryVersion;
  std::string sprueOperationId;  // set on bodies a sprue cut into
};

struct ReferenceMoldDefinition {
  int schemaVersion = 1;
  std::string definitionId;
  std::string modelId;
  Point3 partOffset;
  Bounds3 selectionBoxBounds;      // K1
  double clearanceMm = kDefaultReferenceMoldClearanceMm;
  Bounds3 referenceMoldBlockBounds;  // K2
  std::vector<FaceId> usedFaces;
  std::vector<MoldBody> moldBodies;
};

struct MoldPartitionResult {
  std::vector<MoldBody> bodies;
  double sourceSolidVolumeMm3 = 0;
  double partitionedVolumeMm3 = 0;
};

struct PartitionCoverage {
  double sourceSolidVolumeMm3 = 0;
  double partitionedVolumeMm3 = 0;
  double toleranceMm3 = 0;
};

/// Throws CodedError("mold_partition_incomplete") when the bodies do not add
/// up to the K2 volume.
PartitionCoverage validateMoldPartitionCoverage(const Bounds3& outer,
                                                const std::vector<MoldBody>& bodies);

/// The unpartitioned K2 block as a single watertight body.
MoldBody createWholeMoldBody(const Bounds3& referenceMoldBlockBounds, const std::string& id,
                             const std::string& name);

/// Stage A: partitions the K2 solid along the given planes. K1 must lie
/// strictly inside K2. Throws std::invalid_argument / CodedError as the
/// reference does.
MoldPartitionResult partitionOrthogonalMold(const ReferenceMoldDefinition& definition,
                                            const std::vector<CutPlaneData>& planes);

}  // namespace craft
