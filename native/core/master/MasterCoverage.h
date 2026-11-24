#pragma once

// Two-direction release coverage: a necessary condition for ANY two-part mold whose halves leave by straight translation, in any two directions a and b
// (not only opposite ones).
//
// Remove half A first along a, then half B along b. A mold point can be in A only if its ray along +a meets no product; it can be in B only if its ray
// along +b meets none. So every mold point must be free along a or free along b: the mold points blocked in both are trapped and no partition can place
// them. Conversely, A = {points free along a} and B = the rest is a valid ordering whenever nothing is trapped (a point free along a has every point
// further along its ray free along a, so A never has B in front of it), apart from the connectivity and keys of the two bodies.
//
// The product is voxelised (a voxel is solid when its centre is inside, so features thinner than a voxel vanish: the estimate leans toward "free", and a
// large trapped volume is therefore a real obstruction, not an artefact of resolution). Each direction's free voxels come from a layer-by-layer sweep that
// lets a ray slip between the two neighbouring voxels of its path (again leaning toward "free"). Pairs are then compared as bit masks.

#include <string>
#include <vector>

#include "contracts/Geometry.h"
#include "master/MasterEngine.h"

namespace craft {

struct DirectionPairCoverage {
  Point3 first, second;      // unit directions; a release along `first` then `second`
  double trappedMm3 = 0;     // mold blocked along both
  double trappedFraction = 0;
};

struct CoverageAnalysis {
  bool ran = false;
  int directions = 0;        // sampled on the full sphere (both senses of every axis)
  int pairs = 0;
  double voxelMm = 0;
  double moldVolumeMm3 = 0;
  DirectionPairCoverage best;               // least trapped volume over all pairs (a pair of one direction twice is the single-axis case)
  DirectionPairCoverage bestOpposing;       // best pair of opposite directions: the planar and curved seams' territory
  std::vector<DirectionPairCoverage> opposing;  // the least-trapped opposite pairs, at least 4 degrees apart, best first (at most 12)
  Point3 trappedCentroid;                   // of the best pair's trapped voxels
  Bounds3 trappedBounds;
  int trappedComponents = 0;                // connected pockets of the best pair's trapped voxels
  double largestPocketMm3 = 0;
  std::string note;
};

/// `positions` / `indices` are the world-space product (a closed, consistently wound surface). `margin` is the mold thickness around the product's bounds.
/// `resolution` is the voxel count along the longest side of the mold block; `directions` how many directions on the sphere. Throws CodedError("cancelled").
CoverageAnalysis analyzeTwoDirectionCoverage(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices, double margin, int resolution,
                                             int directions, const MasterMoldEngineHooks& hooks);

}  // namespace craft
