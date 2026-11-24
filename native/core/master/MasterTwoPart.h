#pragma once

// Automatic two-part Master Mold planner, planar fast path.
//
// Input: the original model, untouched. No Split by Face, mold or cut is needed. Output: a `MasterMoldOutcome` with exactly two printable master
// tools (A and B) and the two virtual working-mold halves they are inverted from, or a structured failure.
//
// Method (opposing translation along one axis u, flat parting plane u.x = c):
//   1. Release axis. For a candidate u, half A (u.x >= c) pulls toward +u and half B toward -u. A flat cut at c is release-compatible exactly when
//      no surface of the part that faces against u lies above the plane and no surface that faces along u lies below it (an "against" surface
//      with mold material on its outer side would be run into by the half that has to slide past it). Over the triangles of the part this is a closed
//      form: c must lie in [max projection of any against-facing triangle, min projection of any along-facing triangle]. Axes come from the world
//      axes, principal axes, dominant face normals and a Fibonacci sample, with local refinement of the best; every axis is judged on every triangle,
//      so unseen areas are never assumed safe.
//   2. Working halves. In the frame where u is +Z, with envelope B and part P: W_A = (B - P) in z >= c, W_B = (B - P) in z <= c, plus the final-cast
//      inlet (sprue) above the apex and three registration keys of complementary polarity in the flange.
//   3. Masters. Each half is placed in its own pour frame with its flat parting face on the master floor and the part impression rising from it
//      (half B is turned over): M_i = E_i - (T_i(W_i) + headspace), an open-top tool with base, integral walls, the impression, the inlet post and the
//      key pits / pins. Nothing detachable is required.
//   4. Verification on the final feature-complete solids: for each of the four release motions (cast half out of its master, the two working halves
//      apart, product out of the mold) every obstacle face that opposes the motion is extruded back over the moving body and intersected with it
//      exactly. That is a continuous swept-volume test, not discrete samples. A face that opposes the motion and reaches the moving body is a witnessed
//      block; one whose overlap cannot be classed against tolerance is "unverified", never a pass.
//
// Honest limits: only translation along one axis with a flat seam; opposite pulls only. A part that needs a curved seam or another direction pair is
// reported as no feasible plan, which is a bounded-search outcome, not proof that no rigid two-part solution exists.

#include <array>
#include <optional>
#include <string>
#include <vector>

#include "master/MasterContract.h"
#include "master/MasterEngine.h"
#include "master/MasterProfile.h"

namespace craft {

/// One evaluated release axis (exposed for tests and diagnostics).
struct PlanarAxisEvaluation {
  Point3 axis;                // unit
  double minProjectionMm = 0; // extent of the part along `axis`
  double maxProjectionMm = 0;
  double lowerMm = 0;         // highest projection of any face that opposes half A's pull: the seam must be at or above it
  double upperMm = 0;         // lowest projection of any face that opposes half B's pull: the seam must be at or below it
  double widthMm = 0;         // upperMm - lowerMm after clamping to the part's extent; >= 0 means a flat seam exists
  bool feasible = false;
};
PlanarAxisEvaluation evaluatePlanarAxis(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices, const Point3& axis,
                                        double slidingSine);

/// `seed` must carry world-space positions (worldMeshFromSnapshot). Throws CodedError("cancelled") when `hooks.cancel` is set.
MasterMoldOutcome planTwoPartMasters(IMeshGeometryEngine& engine, const MasterSeedSnapshot& seed, const MasterProcessProfile& profile = MasterProcessProfile{},
                                     const MasterMoldEngineHooks& hooks = {});

}  // namespace craft
