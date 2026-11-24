#pragma once

// Part-solid validation and preparation.
// Port of validateAndPreparePartSolid() in
// mold/frontend/src/features/mold-generation/cavity-generation/partSolid.validator.ts:
// transform to mold space, weld triangle-soup vertices, drop degenerate and
// duplicate faces, repair small triangular holes, reject open / non-manifold /
// bow-tie / overlapping-component input, and normalise outward winding.

#include <vector>

#include "contracts/Geometry.h"
#include "contracts/Operation.h"
#include "geometry/GeometryTolerance.h"

namespace craft {

/// Mirrors WatertightPartSolid in cavityGeneration.contracts.ts.
struct WatertightPartSolid {
  MeshPayload mesh;
  Bounds3 bounds;
  double volumeMm3 = 0;
  std::size_t triangleCount = 0;
  std::size_t connectedComponentCount = 0;
  bool watertight = false;
  bool manifold = false;
  std::vector<Issue> warnings;
};

struct PartSolidValidationResult {
  bool ok = false;
  WatertightPartSolid prepared;  // meaningful only when ok
  std::vector<Issue> warnings;
  std::vector<Issue> blockers;
  std::size_t openEdgeCount = 0;
  std::size_t nonManifoldEdgeCount = 0;
};

/// `positions`/`indices` are the canonical part triangles; `localToMold`
/// places them in the mold frame (identity grounding plus the part offset).
PartSolidValidationResult validateAndPreparePartSolid(const std::vector<double>& positions,
                                                      const std::vector<std::uint32_t>& indices,
                                                      const Transform& localToMold,
                                                      const GeometryTolerancePolicy& tolerance);

}  // namespace craft
