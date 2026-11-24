#include "mold/CuttingPlaneSlabs.h"

#include <array>

#include "geometry/ThreeRayTriangle.h"

namespace craft {

unsigned cutPlaneColorRgb(CutPlaneVisual visual) {
  switch (visual) {
    case CutPlaneVisual::Idle: return kCutPlaneIdleRgb;
    case CutPlaneVisual::Hover: return kCutPlaneHoverRgb;
    case CutPlaneVisual::Dragging: return kCutPlaneDraggingRgb;
    case CutPlaneVisual::EraseHover: return kCutPlaneEraseRgb;
  }
  return kCutPlaneIdleRgb;
}

double cutPlaneSurfaceOpacity(CutPlaneVisual visual) {
  switch (visual) {
    case CutPlaneVisual::Idle: return 0.22;
    case CutPlaneVisual::Hover: return 0.32;
    case CutPlaneVisual::Dragging: return 0.38;
    case CutPlaneVisual::EraseHover: return 0.42;
  }
  return 0.22;
}

double cutPlaneEdgeOpacity(CutPlaneVisual visual) { return visual == CutPlaneVisual::Idle ? 0.7 : 1.0; }

std::vector<PlaneSlab> buildPlaneSlabs(const Bounds3& k1, const Bounds3& k2, const std::vector<CuttingPlane>& planes) {
  std::vector<PlaneSlab> slabs;
  const Vec3 extent{k2.max.x - k2.min.x, k2.max.y - k2.min.y, k2.max.z - k2.min.z};
  const Vec3 centre{(k2.min.x + k2.max.x) / 2, (k2.min.y + k2.max.y) / 2, (k2.min.z + k2.max.z) / 2};
  for (const CuttingPlane& plane : planes) {
    if (!plane.enabled) continue;
    PlaneSlab slab;
    slab.face = plane.sourceFace;
    slab.axis = plane.axis;
    slab.coordinate = normalizedToWorldCoordinate(k1, plane.axis, plane.normalizedPosition);
    slab.size = extent;
    slab.center = centre;
    switch (plane.axis) {
      case Axis::X: slab.size.x = kCutPlaneSlabThicknessMm; slab.center.x = slab.coordinate; break;
      case Axis::Y: slab.size.y = kCutPlaneSlabThicknessMm; slab.center.y = slab.coordinate; break;
      case Axis::Z: slab.size.z = kCutPlaneSlabThicknessMm; slab.center.z = slab.coordinate; break;
    }
    slabs.push_back(slab);
  }
  return slabs;
}

std::optional<CutPlanePick> pickPlaneSlab(const Ray& ray, const std::vector<PlaneSlab>& slabs) {
  std::optional<CutPlanePick> best;
  for (std::size_t index = 0; index < slabs.size(); ++index) {
    const PlaneSlab& s = slabs[index];
    const Vec3 h{s.size.x / 2, s.size.y / 2, s.size.z / 2};
    const auto corner = [&](int sx, int sy, int sz) { return Vec3{s.center.x + sx * h.x, s.center.y + sy * h.y, s.center.z + sz * h.z}; };
    // Six faces as two triangles each, like BoxGeometry; the material is double-sided, so winding does not matter.
    const std::array<std::array<Vec3, 4>, 6> faces{{{corner(-1, -1, -1), corner(1, -1, -1), corner(1, 1, -1), corner(-1, 1, -1)},
                                                    {corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)},
                                                    {corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1)},
                                                    {corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1)},
                                                    {corner(-1, -1, -1), corner(-1, 1, -1), corner(-1, 1, 1), corner(-1, -1, 1)},
                                                    {corner(1, -1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(1, -1, 1)}}};
    for (const auto& f : faces) {
      for (int half = 0; half < 2; ++half) {
        const auto t = half == 0 ? intersectTriangleThree(ray, f[0], f[1], f[2], false) : intersectTriangleThree(ray, f[0], f[2], f[3], false);
        if (t && (!best || *t < best->distance)) best = CutPlanePick{static_cast<int>(index), *t};
      }
    }
  }
  return best;
}

}  // namespace craft
