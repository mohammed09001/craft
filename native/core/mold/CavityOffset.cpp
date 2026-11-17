#include "mold/CavityOffset.h"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <functional>

#include "geometry/SignedDistance.h"

namespace craft {

namespace {

double clamp01(double v) { return std::min(1.0, std::max(0.0, v)); }

[[noreturn]] void offsetError(const std::string& message) {
  throw CodedError("cavity_offset_failed", message);
}

std::string joinDims(const std::array<double, 3>& d) {
  return std::to_string(static_cast<long long>(d[0])) + "\xC3\x97" +
         std::to_string(static_cast<long long>(d[1])) + "\xC3\x97" +
         std::to_string(static_cast<long long>(d[2]));
}

CavityTool toolFrom(const IMeshGeometryEngine& /*unused*/, const WatertightPartSolid& prepared,
                    MeshPayload mesh, const SolidPtr& solid, double clearanceMm,
                    CavityQualityMode quality, const char* method) {
  CavityTool tool;
  tool.solid = prepared;  // keeps connectedComponentCount / warnings like the reference spread
  tool.solid.mesh = std::move(mesh);
  tool.solid.bounds = solid->bounds();
  tool.solid.volumeMm3 = solid->volume();
  tool.solid.triangleCount = solid->triangleCount();
  tool.clearanceMm = clearanceMm;
  tool.implementationMethod = method;
  tool.qualityMode = quality;
  return tool;
}

}  // namespace

const char* offsetEngineName(OffsetEngineKind kind) {
  switch (kind) {
    case OffsetEngineKind::ExactZeroClearance: return "exact-zero-clearance";
    case OffsetEngineKind::DirectMinkowski: return "direct-minkowski";
    case OffsetEngineKind::DistanceField: return "distance-field";
  }
  return "exact-zero-clearance";
}

double calculateCavityComplexityScore(const CavityComplexityMetrics& m) {
  if (!std::isfinite(m.requestedClearanceMm) || m.requestedClearanceMm < 0 ||
      m.connectedComponentCount < 1) {
    throw std::invalid_argument("Cavity complexity metrics are invalid.");
  }
  if (m.requestedClearanceMm == 0) return 0;
  const double triangleScore = clamp01(m.triangleCount / kHeavyModelTriangleReference);
  const double componentScore = clamp01((double(m.connectedComponentCount) - 1) / 3);
  const double clearanceScore = clamp01(m.requestedClearanceMm / 1);
  const double qualityScore = m.qualityMode == CavityQualityMode::High ? 1 : 0;
  const double densityScore =
      m.volumeMm3 > 0 ? clamp01((m.triangleCount / std::cbrt(m.volumeMm3)) / 25'000) : 0;
  const double aspectScore = m.boundsDiagonalMm > 0 && m.smallestDimensionMm > 0
                                 ? clamp01((m.boundsDiagonalMm / m.smallestDimensionMm - 4) / 20)
                                 : 0;
  return clamp01(triangleScore * 0.55 + componentScore * 0.15 + clearanceScore * 0.1 +
                 qualityScore * 0.05 + densityScore * 0.1 + aspectScore * 0.05);
}

CavityEngineDecision selectCavityOffsetEngine(const CavityComplexityMetrics& m) {
  const double score = calculateCavityComplexityScore(m);
  CavityEngineDecision decision;
  if (m.requestedClearanceMm == 0) {
    decision.engine = OffsetEngineKind::ExactZeroClearance;
    decision.estimatedCost = "low";
    decision.reasonCodes = {"zero_clearance_exact_geometry"};
    return decision;
  }
  auto& reasons = decision.reasonCodes;
  reasons.push_back("positive_clearance_requested");
  if (m.qualityMode == CavityQualityMode::High) reasons.push_back("high_quality_requested");
  reasons.push_back(m.triangleCount > kDirectMinkowskiTriangleLimit ? "triangle_count_high"
                                                                    : "triangle_count_direct");
  if (m.connectedComponentCount > 1) reasons.push_back("multiple_components");
  const bool dense = m.volumeMm3 > 0 && m.triangleCount / std::cbrt(m.volumeMm3) > 25'000;
  const bool extreme = m.boundsDiagonalMm > 0 && m.smallestDimensionMm > 0 &&
                       m.boundsDiagonalMm / m.smallestDimensionMm > 20;
  if (dense) reasons.push_back("high_triangle_density");
  if (extreme) reasons.push_back("extreme_aspect_ratio");

  decision.complexityScore = score;
  const bool distanceField = m.triangleCount > kDirectMinkowskiTriangleLimit ||
                             m.connectedComponentCount > 1 || dense || extreme ||
                             score >= kDistanceFieldComplexityThreshold;
  if (distanceField) {
    reasons.push_back("complexity_score_distance_field");
    decision.engine = OffsetEngineKind::DistanceField;
    decision.estimatedCost = "high";
  } else {
    reasons.push_back("complexity_score_direct");
    decision.engine = OffsetEngineKind::DirectMinkowski;
    decision.estimatedCost = score < 0.2 ? "low" : "medium";
  }
  return decision;
}

CavityEngineDecision selectCavityOffsetEngineForPreparedSolid(const WatertightPartSolid& prepared,
                                                              double requestedClearanceMm,
                                                              CavityQualityMode qualityMode) {
  const Point3 d = prepared.bounds.size();
  CavityComplexityMetrics m;
  m.triangleCount = prepared.triangleCount;
  m.connectedComponentCount = prepared.connectedComponentCount;
  m.requestedClearanceMm = requestedClearanceMm;
  m.qualityMode = qualityMode;
  m.boundsDiagonalMm = std::hypot(d.x, d.y, d.z);
  m.smallestDimensionMm = std::min({d.x, d.y, d.z});
  m.volumeMm3 = prepared.volumeMm3;
  return selectCavityOffsetEngine(m);
}

AdaptiveClearancePolicy buildAdaptiveClearancePolicy(std::size_t triangleCount, double clearanceMm,
                                                     double geometryToleranceMm,
                                                     CavityQualityMode qualityMode) {
  if (clearanceMm < 0 || !std::isfinite(clearanceMm) || !std::isfinite(geometryToleranceMm) ||
      geometryToleranceMm <= 0) {
    throw std::invalid_argument("Adaptive cavity-clearance inputs are invalid.");
  }
  const bool high = qualityMode == CavityQualityMode::High;
  AdaptiveClearancePolicy policy;
  if (clearanceMm == 0 || triangleCount <= kDirectMinkowskiTriangleLimit) {
    policy.simplify = false;
    policy.simplificationToleranceMm = geometryToleranceMm;
    policy.sphereSegments = high ? 32 : 16;
  } else {
    policy.simplify = true;
    policy.simplificationToleranceMm =
        std::max(geometryToleranceMm, clearanceMm * (high ? 0.2 : 0.5));
    policy.sphereSegments = high ? 16 : 8;
  }
  return policy;
}

DistanceFieldQualityProfile buildDistanceFieldQualityProfile(const WatertightPartSolid& prepared,
                                                             double clearance,
                                                             CavityQualityMode quality,
                                                             double tolerance) {
  if (!std::isfinite(clearance) || clearance <= 0) {
    throw std::invalid_argument("Distance-field clearance must be positive.");
  }
  if (!std::isfinite(tolerance) || tolerance <= 0) {
    throw std::invalid_argument("Distance-field geometry tolerance must be positive.");
  }
  const Point3 size = prepared.bounds.size();
  for (int a = 0; a < 3; ++a) {
    if (!std::isfinite(size[a]) || size[a] <= 0) {
      throw std::invalid_argument("Distance-field source bounds are invalid.");
    }
  }
  const bool high = quality == CavityQualityMode::High;
  DistanceFieldQualityProfile p;
  p.qualityMode = quality;
  p.requestedClearanceMm = clearance;
  p.targetEdgeLengthMm = std::max(high ? 0.4 : 0.8, clearance * (high ? 0.5 : 1.0));
  p.maximumAxisCells = high ? 384 : 256;
  p.maximumGridCellCount = high ? 24'000'000 : 12'000'000;
  const double longest = std::max({size.x, size.y, size.z});
  p.effectiveEdgeLengthMm = std::max({tolerance, p.targetEdgeLengthMm, longest / p.maximumAxisCells});
  p.boundsPaddingMm = clearance + p.effectiveEdgeLengthMm * 2;
  const double pad = p.boundsPaddingMm;
  p.bounds = {{prepared.bounds.min.x - pad, prepared.bounds.min.y - pad, prepared.bounds.min.z - pad},
              {prepared.bounds.max.x + pad, prepared.bounds.max.y + pad, prepared.bounds.max.z + pad}};
  const Point3 expanded = p.bounds.size();
  for (int a = 0; a < 3; ++a) {
    p.estimatedGridDimensions[a] = std::max(1.0, std::ceil(expanded[a] / p.effectiveEdgeLengthMm));
  }
  p.estimatedGridCellCount = p.estimatedGridDimensions[0] * p.estimatedGridDimensions[1] *
                             p.estimatedGridDimensions[2];
  p.surfaceToleranceMm = std::max(tolerance, p.effectiveEdgeLengthMm * 0.25);
  p.exceedsGridBudget = p.estimatedGridCellCount > p.maximumGridCellCount;
  return p;
}

CavityTool createCavityTool(IMeshGeometryEngine& engine, const WatertightPartSolid& prepared,
                            double clearanceMm, CavityQualityMode quality, double tolerance) {
  if (!std::isfinite(clearanceMm) || clearanceMm < 0) {
    offsetError("Cavity clearance must be a non-negative millimeter value.");
  }
  const SolidPtr source = engine.solidFromMesh(prepared.mesh, tolerance, "Mesh preparation");
  SolidPtr tool = source;
  if (clearanceMm > 0) {
    const AdaptiveClearancePolicy policy =
        buildAdaptiveClearancePolicy(prepared.triangleCount, clearanceMm, tolerance, quality);
    SolidPtr offsetSource = source;
    if (policy.simplify) {
      offsetSource = engine.simplify(source, policy.simplificationToleranceMm);
      if (!offsetSource->isValid()) offsetError("Cavity clearance simplification failed.");
      if (offsetSource->isEmpty()) {
        offsetError("Cavity clearance simplification produced an empty solid.");
      }
    }
    try {
      tool = engine.minkowskiSphere(offsetSource, clearanceMm, policy.sphereSegments);
    } catch (const CodedError& error) {
      offsetError(error.what());
    }
  }
  return toolFrom(engine, prepared, engine.meshFromSolid(tool, {}, "Mesh export"), tool, clearanceMm,
                  quality, clearanceMm == 0 ? "exact-watertight-part-solid" : "manifold-minkowski-sphere");
}

DistanceFieldToolResult createDistanceFieldCavityTool(IMeshGeometryEngine& engine,
                                                      const WatertightPartSolid& prepared,
                                                      double clearanceMm, CavityQualityMode quality,
                                                      double tolerance,
                                                      const CancellationToken& cancel) {
  if (!std::isfinite(clearanceMm) || clearanceMm <= 0) {
    offsetError("Distance-field cavity clearance must be positive.");
  }
  DistanceFieldQualityProfile profile =
      buildDistanceFieldQualityProfile(prepared, clearanceMm, quality, tolerance);
  if (profile.exceedsGridBudget) {
    offsetError("Distance-field grid exceeds the safe budget: " + joinDims(profile.estimatedGridDimensions) +
                " cells (" + std::to_string(static_cast<long long>(profile.estimatedGridCellCount)) +
                " total, maximum " + std::to_string(static_cast<long long>(profile.maximumGridCellCount)) +
                ").");
  }
  if (!prepared.watertight || !prepared.manifold) {
    offsetError("Signed-distance generation requires a watertight manifold.");
  }

  SignedDistanceField field(prepared.mesh, tolerance);
  // Exact distances are only needed near the offset surface; one lattice step
  // is profile.effectiveEdgeLengthMm, so 4 steps beyond the clearance is ample.
  const double band = clearanceMm + 4 * profile.effectiveEdgeLengthMm;
  std::atomic<std::size_t> evaluations{0};
  const auto sdf = [&](const Point3& p) {
    if (((evaluations.fetch_add(1, std::memory_order_relaxed) + 1) & 0x3FF) == 0 && cancel.isCancelled()) {
      throw CodedError("cavity_cancelled", "Cavity generation was cancelled.");
    }
    // Manifold keeps sdf >= level; material is positive inside, and the
    // negative level -clearance outsets the surface.
    return field.signedDistanceBanded(p, band);
  };

  SolidPtr levelSet;
  try {
    levelSet = engine.levelSet(sdf, profile.bounds, profile.effectiveEdgeLengthMm, -clearanceMm,
                               profile.surfaceToleranceMm);
  } catch (const CodedError&) {
    throw;
  } catch (const std::exception& error) {
    offsetError(error.what());
  }
  if (cancel.isCancelled()) throw CodedError("cavity_cancelled", "Cavity generation was cancelled.");
  if (!levelSet->isValid()) offsetError("Distance-field cavity generation failed: invalid solid.");
  if (levelSet->isEmpty()) offsetError("Distance-field cavity generation produced an empty solid.");

  const std::size_t components = engine.decompose(levelSet).size();
  MeshPayload mesh = engine.meshFromSolid(levelSet, {}, "Mesh export");
  const double volume = levelSet->volume();
  if (!std::isfinite(volume) || volume <= 0) {
    offsetError("Distance-field cavity generation produced invalid volume.");
  }
  if (levelSet->triangleCount() == 0) {
    offsetError("Distance-field cavity generation produced no triangles.");
  }
  DistanceFieldToolResult result;
  result.profile = profile;
  result.tool = toolFrom(engine, prepared, std::move(mesh), levelSet, clearanceMm, quality,
                         "manifold-level-set-sdf");
  result.tool.solid.connectedComponentCount = components;
  return result;
}

AutomaticCavityOffsetResult createAutomaticCavityTool(IMeshGeometryEngine& engine,
                                                      const WatertightPartSolid& prepared,
                                                      double clearanceMm,
                                                      CavityQualityMode quality, double tolerance,
                                                      const CancellationToken& cancel) {
  if (!std::isfinite(tolerance) || tolerance <= 0) {
    offsetError("Automatic cavity geometry tolerance must be positive.");
  }
  AutomaticCavityOffsetResult result;
  result.decision = selectCavityOffsetEngineForPreparedSolid(prepared, clearanceMm, quality);

  const auto runDistanceField = [&] {
    DistanceFieldToolResult df =
        createDistanceFieldCavityTool(engine, prepared, clearanceMm, quality, tolerance, cancel);
    result.tool = std::move(df.tool);
    result.distanceFieldProfile = df.profile;
    result.hasDistanceFieldProfile = true;
  };
  const auto attempt = [&](OffsetEngineKind kind, const std::function<void()>& run) {
    try {
      run();
      result.attempts.push_back({kind, true, {}});
      return true;
    } catch (const CodedError& error) {
      if (error.code() == "cavity_cancelled") throw;
      result.attempts.push_back({kind, false, error.what()});
      if (kind == OffsetEngineKind::DistanceField) throw;  // no further fallback
      return false;
    }
  };

  switch (result.decision.engine) {
    case OffsetEngineKind::ExactZeroClearance:
      attempt(OffsetEngineKind::ExactZeroClearance, [&] {
        result.tool = createCavityTool(engine, prepared, clearanceMm, quality, tolerance);
      });
      return result;
    case OffsetEngineKind::DistanceField:
      attempt(OffsetEngineKind::DistanceField, runDistanceField);
      return result;
    case OffsetEngineKind::DirectMinkowski:
      if (attempt(OffsetEngineKind::DirectMinkowski, [&] {
            result.tool = createCavityTool(engine, prepared, clearanceMm, quality, tolerance);
          })) {
        return result;
      }
      result.usedFallback = true;
      attempt(OffsetEngineKind::DistanceField, runDistanceField);
      return result;
  }
  return result;
}

}  // namespace craft
