#pragma once

// Cavity offset engines (positive cavity clearance).
// Ports of cavity-generation/:
//   cavityEngine.selector.ts          -> selectCavityOffsetEngine
//   manifold.engine.ts                -> buildAdaptiveClearancePolicy, direct Minkowski tool
//   cavityDistanceField.profile.ts    -> buildDistanceFieldQualityProfile
//   cavityDistanceField.engine.ts     -> distance-field (SDF + level set) tool
//   cavityOffset.orchestrator.ts      -> createAutomaticCavityTool (with fallback)

#include <array>
#include <string>
#include <vector>

#include "IMeshGeometryEngine.h"
#include "contracts/Operation.h"
#include "mold/PartSolid.h"

namespace craft {

enum class CavityQualityMode { Standard, High };
inline const char* qualityModeName(CavityQualityMode m) {
  return m == CavityQualityMode::High ? "high" : "standard";
}

inline constexpr std::size_t kDirectMinkowskiTriangleLimit = 50'000;
inline constexpr double kHeavyModelTriangleReference = 250'000;
inline constexpr double kDistanceFieldComplexityThreshold = 0.35;

enum class OffsetEngineKind { ExactZeroClearance, DirectMinkowski, DistanceField };
const char* offsetEngineName(OffsetEngineKind kind);

struct CavityComplexityMetrics {
  std::size_t triangleCount = 0;
  std::size_t connectedComponentCount = 1;
  double requestedClearanceMm = 0;
  CavityQualityMode qualityMode = CavityQualityMode::Standard;
  double boundsDiagonalMm = 0;
  double smallestDimensionMm = 0;
  double volumeMm3 = 0;
};

struct CavityEngineDecision {
  OffsetEngineKind engine = OffsetEngineKind::ExactZeroClearance;
  double complexityScore = 0;
  std::string estimatedCost;
  std::vector<std::string> reasonCodes;
};

double calculateCavityComplexityScore(const CavityComplexityMetrics& metrics);
CavityEngineDecision selectCavityOffsetEngine(const CavityComplexityMetrics& metrics);
CavityEngineDecision selectCavityOffsetEngineForPreparedSolid(const WatertightPartSolid& prepared,
                                                              double requestedClearanceMm,
                                                              CavityQualityMode qualityMode);

struct AdaptiveClearancePolicy {
  bool simplify = false;
  double simplificationToleranceMm = 0;
  int sphereSegments = 16;
};
AdaptiveClearancePolicy buildAdaptiveClearancePolicy(std::size_t triangleCount, double clearanceMm,
                                                     double geometryToleranceMm,
                                                     CavityQualityMode qualityMode);

struct DistanceFieldQualityProfile {
  CavityQualityMode qualityMode = CavityQualityMode::Standard;
  double requestedClearanceMm = 0;
  double targetEdgeLengthMm = 0;
  double effectiveEdgeLengthMm = 0;
  double surfaceToleranceMm = 0;
  double maximumAxisCells = 0;
  double boundsPaddingMm = 0;
  Bounds3 bounds;
  std::array<double, 3> estimatedGridDimensions{};
  double estimatedGridCellCount = 0;
  double maximumGridCellCount = 0;
  bool exceedsGridBudget = false;
};
DistanceFieldQualityProfile buildDistanceFieldQualityProfile(const WatertightPartSolid& prepared,
                                                             double requestedClearanceMm,
                                                             CavityQualityMode qualityMode,
                                                             double geometryToleranceMm);

/// Mirrors CavityToolData: the cavity tool solid and how it was built.
struct CavityTool {
  WatertightPartSolid solid;
  double clearanceMm = 0;
  std::string implementationMethod = "exact-watertight-part-solid";
  CavityQualityMode qualityMode = CavityQualityMode::Standard;
};

struct CavityOffsetAttempt {
  OffsetEngineKind engine = OffsetEngineKind::ExactZeroClearance;
  bool succeeded = false;
  std::string errorMessage;
};

struct AutomaticCavityOffsetResult {
  CavityTool tool;
  CavityEngineDecision decision;
  std::vector<CavityOffsetAttempt> attempts;
  bool usedFallback = false;
  bool hasDistanceFieldProfile = false;
  DistanceFieldQualityProfile distanceFieldProfile;
};

/// Direct Minkowski sum with a sphere (the zero-clearance case returns the
/// prepared solid unchanged). Throws CodedError("cavity_offset_failed").
CavityTool createCavityTool(IMeshGeometryEngine& engine, const WatertightPartSolid& prepared,
                            double clearanceMm, CavityQualityMode qualityMode, double tolerance);

struct DistanceFieldToolResult {
  CavityTool tool;
  DistanceFieldQualityProfile profile;
};
DistanceFieldToolResult createDistanceFieldCavityTool(IMeshGeometryEngine& engine,
                                                      const WatertightPartSolid& prepared,
                                                      double clearanceMm,
                                                      CavityQualityMode qualityMode,
                                                      double geometryToleranceMm,
                                                      const CancellationToken& cancel = {});

/// Selector + engines + the reference fallback (direct failure falls back to
/// the distance field). Throws CodedError("cavity_offset_failed" or
/// "cavity_cancelled").
AutomaticCavityOffsetResult createAutomaticCavityTool(IMeshGeometryEngine& engine,
                                                      const WatertightPartSolid& prepared,
                                                      double clearanceMm,
                                                      CavityQualityMode qualityMode,
                                                      double geometryToleranceMm,
                                                      const CancellationToken& cancel = {});

}  // namespace craft
