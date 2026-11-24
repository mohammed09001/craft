#pragma once

// Part orientation: the Flip tool's quaternion arithmetic and the automatic orientation search.
//
// Ports of mold/frontend/src/features/viewport/partOrientation.store.ts (composePartFlip, the flip steps, the capability rule)
// and runtime/automaticModelOrientation.ts (the six candidate orientations, their scores and the selection rule), plus the
// geometry step of runtime/localStlImport.ts applyPartOrientation (rotate the source triangles, then ground them).
//
// The orientation is ONE unit quaternion applied to the model as imported (the source soup is never modified). It is rotated
// about the origin and the result is re-grounded (centred on XY, lowest point on Z = 0), so the rotation centre does not matter.

#include <array>
#include <optional>
#include <string>
#include <vector>

#include "contracts/Geometry.h"

namespace craft {

struct Quaternion {
  double x = 0, y = 0, z = 0, w = 1;
  friend bool operator==(const Quaternion&, const Quaternion&) = default;
};

inline constexpr Quaternion kIdentityOrientation{0, 0, 0, 1};

enum class PartFlipDirection { Left, Right, Forward, Backward, UpsideDown };

/// "left" | "right" | "forward" | "backward" | "upside-down" (the reference's names); nullopt for anything else.
std::optional<PartFlipDirection> parseFlipDirection(const std::string& name);
const char* flipDirectionName(PartFlipDirection direction);

/// The reference's normalizeOrientation: nullopt for a non-finite or zero-length quaternion.
std::optional<Quaternion> normalizeOrientation(const Quaternion& q);

/// The reference's composePartFlip: step * orientation (the flip is about a WORLD axis), normalised, components within 1e-12 of
/// 0 / +-1 snapped, and the sign chosen so the first non-zero of (w, x, y, z) is positive. A degenerate result is the identity.
Quaternion composePartFlip(const Quaternion& orientation, PartFlipDirection direction);

struct OrientationScore {
  double footprintArea = 0;
  double height = 0;
  double supportArea = 0;
  double supportPointRatio = 0;
};

struct OrientationEvaluation {
  std::string id;  ///< negative-z-down, positive-z-down, positive-x-down, negative-x-down, positive-y-down, negative-y-down
  Quaternion rotation;
  Bounds3 bounds;  ///< of the rotated, not yet grounded, vertices
  OrientationScore score;
};

/// The six candidates in the reference's order (the first of equals wins).
const std::array<std::pair<const char*, Quaternion>, 6>& orientationCandidates();

/// evaluateOrientationCandidates: candidates whose rotated bounds are not displayable are left out.
std::vector<OrientationEvaluation> evaluateOrientationCandidates(const TriangleSoup& soup);

/// selectBestOrientationCandidate: largest support area, then largest footprint, then lowest height (each within the
/// reference's epsilons); the earlier candidate keeps a tie. nullopt for an empty list.
std::optional<OrientationEvaluation> selectBestOrientationCandidate(const std::vector<OrientationEvaluation>& evaluations);

/// The orientation "Auto orient" commits: the best candidate's rotation, or nullopt when the model cannot be oriented.
std::optional<OrientationEvaluation> automaticOrientation(const TriangleSoup& soup);

/// The model rotated by `orientation` the way three.js's geometry.applyQuaternion does (a rotation matrix applied in double
/// precision, stored as float32).
TriangleSoup rotateSoup(const TriangleSoup& soup, const Quaternion& orientation);

}  // namespace craft
