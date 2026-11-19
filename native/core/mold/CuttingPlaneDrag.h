#pragma once

// Dragging a Cut by Face plane with the right mouse button.
//
// Port of the drag in mold/frontend/src/features/viewport/runtime/cuttingPlane3dRuntime.ts (and the commit of the split-face
// store's commitPlaneDrag). A secondary-button press on a plane starts the drag. The plane then follows the pointer along its
// own axis: the pointer ray is intersected with a "reference plane" that contains the plane's axis direction and faces the
// camera (the view direction with its component along the axis removed; the camera's up vector with its component removed when
// that is nothing; and when that is nothing too, a plane with no normal, which is what the reference does and where the plane
// then does not move), and the plane's coordinate is where it started plus how far the hit has moved along the axis. The
// coordinate is clamped to the part box K1 with the inset the planes keep from its faces. Nothing happens until the pointer has
// moved 4 px from the press (Euclidean distance), and once it has the drag stays a drag: releasing it commits the coordinate,
// releasing it without having moved cancels it and the plane is where it was.
//
// Pure geometry on rays: the camera, the pointer and the application's state are the caller's. The arithmetic is the
// reference's operation by operation (Three.js Ray.intersectPlane and Vector3 operations), compared with the real runtime by
// tst_cutplane_drag_equivalence.

#include <optional>

#include "mold/CuttingPlaneSlabs.h"
#include "mold/ReferenceMold.h"
#include "view/ViewPose.h"

namespace craft {

/// Euclidean pointer distance from the press that must be passed before the plane moves (the reference's 4 px).
inline constexpr double kCutPlaneDragThresholdPx = 4.0;

struct CutPlaneDrag {
  FaceId face = FaceId::Top;
  Axis axis = Axis::Z;
  double startCoordinate = 0;  // where the plane was when it was pressed
  double coordinate = 0;       // where it is now (clamped into K1)
  Vec3 startHit;               // the press ray's hit on the reference plane
  Vec3 planeNormal;            // the reference plane: normal (possibly zero) and constant
  double planeConstant = 0;
  double startX = 0, startY = 0;  // the press, in pixels
  bool moved = false;
};

/// The reference's Ray.intersectPlane: the point where `ray` meets the plane (normal . p + constant = 0), or nullopt when it is
/// parallel to it or the hit is behind the ray's origin. A plane without a normal (all zero) is met at the ray's origin.
std::optional<Vec3> intersectReferencePlane(const Ray& ray, const Vec3& normal, double constant);

/// Starts dragging `slab` from a press whose world ray is `ray`; `viewDirection` is the camera's unit direction and `cameraUp`
/// its up vector (0,0,1 in this Z-up application). nullopt when the press ray misses the reference plane.
std::optional<CutPlaneDrag> beginCutPlaneDrag(const PlaneSlab& slab, const Ray& ray, const Vec3& viewDirection,
                                              const Vec3& cameraUp, double pixelX, double pixelY);

/// Moves the drag to the pointer at (pixelX, pixelY) with world ray `ray`. Returns true when the plane's coordinate was
/// recomputed (the pointer is beyond the threshold, or the drag already moved, and the ray meets the reference plane).
bool updateCutPlaneDrag(CutPlaneDrag& drag, const Ray& ray, double pixelX, double pixelY, const Bounds3& k1);

struct CutPlaneDragEnd {
  bool commit = false;      // false: the drag never moved, it is cancelled and the plane stays where it was
  double normalized = 0;    // the position to commit (a fraction of K1's span, clamped)
};

/// What releasing the drag does.
CutPlaneDragEnd finishCutPlaneDrag(const CutPlaneDrag& drag, const Bounds3& k1);

/// A position that differs from the plane's current one by no more than this is not a move (commitPlaneDrag's 1e-9).
inline constexpr double kCutPlaneCommitEpsilon = 1e-9;

/// The split-face store's commitPlaneDrag decision: the position the plane takes when a drag commits `requested` (clamped into
/// K1's safe interval), or nullopt when that is where the plane already is (within the epsilon): then nothing is recorded, no
/// undo step is made and the committed mold is kept.
std::optional<double> commitCutPlanePosition(const Bounds3& k1, Axis axis, double currentNormalized, double requested);

}  // namespace craft
