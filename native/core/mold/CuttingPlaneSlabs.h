#pragma once

// The cutting planes of Cut by Face as thin translucent slabs in the viewport, and the picking the Eraser tool uses.
//
// Port of the plane visuals and the eraser interaction of mold/frontend/src/features/viewport/runtime/
// cuttingPlane3dRuntime.ts: each enabled plane is a box 0.02 mm thick along its axis and as wide as the reference mold
// block (K2) on the other two, centred on K2, at the plane's coordinate across the selection box (K1). Amber when
// idle; under the Eraser the plane the pointer is over turns red (surface opacity 0.42, edges 1). The raycast is
// Three.js's (double-sided, nearest slab wins), so the same pixels pick the same plane
// (tst_cutplane_equivalence replays the real runtime).

#include <optional>
#include <vector>

#include "mold/ReferenceMold.h"
#include "view/ViewPose.h"

namespace craft {

inline constexpr double kCutPlaneSlabThicknessMm = 0.02;

inline constexpr unsigned kCutPlaneIdleRgb = 0xf59e0b;
inline constexpr unsigned kCutPlaneHoverRgb = 0xffb52e;
inline constexpr unsigned kCutPlaneDraggingRgb = 0xef3038;
inline constexpr unsigned kCutPlaneEraseRgb = 0xef3038;

enum class CutPlaneVisual { Idle, Hover, Dragging, EraseHover };

unsigned cutPlaneColorRgb(CutPlaneVisual visual);
double cutPlaneSurfaceOpacity(CutPlaneVisual visual);
double cutPlaneEdgeOpacity(CutPlaneVisual visual);

struct PlaneSlab {
  FaceId face = FaceId::Top;
  Axis axis = Axis::Z;
  double coordinate = 0;  // along `axis`, across K1
  Vec3 center;            // K2's centre, with `coordinate` on the plane's own axis
  Vec3 size;              // 0.02 along the axis, K2's extent on the others
};

/// The slabs of the enabled planes, in the given order (the reference draws only `enabled` records).
std::vector<PlaneSlab> buildPlaneSlabs(const Bounds3& k1, const Bounds3& k2, const std::vector<CuttingPlane>& planes);

struct CutPlanePick {
  int slab = -1;
  double distance = 0;
};

/// The nearest slab the ray crosses (either side of the thin box), or nullopt.
std::optional<CutPlanePick> pickPlaneSlab(const Ray& ray, const std::vector<PlaneSlab>& slabs);

}  // namespace craft
