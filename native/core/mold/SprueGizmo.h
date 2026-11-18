#pragma once

// The Sprue resize gizmo: a ring at each opening of a sprue (the main opening on the mold's top face and the entry-neck
// opening at the cavity), hover-highlighted, dragged horizontally to change that diameter, edited numerically on a
// double click.
//
// Port of mold/frontend/src/features/viewport/runtime/sprueResizeRuntime.ts (handle geometry and orientation, picking,
// drag arithmetic, snapping, limits, label, colours) and of selectSpruePresentationDefinitions in
// split-face/splitFace.store.ts (which intent/resolved fields drive the presentation). The reference has no gizmo
// that MOVES a sprue (moveSprue exists only as a store action), so none is ported.
//
// Picking uses the reference's own tessellated pick torus (Three.js TorusGeometry, 8 x 32 segments, tube
// max(0.45, r * 0.16)) with its front-face-only rule, so the same pixels hit the same handle
// (tst_sprue_gizmo_equivalence replays the real runtime).

#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "mold/SprueGeneration.h"
#include "mold/SpruePreview.h"
#include "view/Rotation.h"

namespace craft {

inline constexpr double kSprueDiameterSnapMm = 0.25;
inline constexpr double kSprueDiameterSensitivityMmPerPixel = 0.05;

inline constexpr unsigned kSprueHandleColorRgb = 0x3ea36d;
inline constexpr unsigned kSprueHandleHoverRgb = 0x67c58f;
inline constexpr unsigned kSprueHandleActiveRgb = 0xf0b44d;
inline constexpr unsigned kSprueHandlePendingRgb = 0xd8a43b;
inline constexpr unsigned kSprueHandleInvalidRgb = 0xb33a36;
inline constexpr double kSprueHandleIdleOpacity = 0.72;

enum class SprueHandleOpening { Top, Bottom };
enum class SprueHandleVisual { Idle, Hover, Active };

/// What the viewport shows for one sprue (the reference's SpruePresentationDefinition).
struct SpruePresentation {
  std::string operationId;
  Point3 position;
  Point3 inwardDirection;
  SprueProfileDimensions profile;
  std::optional<double> depthMm;                          // only once resolved
  std::optional<std::vector<std::string>> targetBodyIds;  // only once resolved
  std::string status;                                     // pending | resolved | invalid
};

/// One entry per intent, in order. A pending intent shows its requested anchor/axis/profile (never stale resolved
/// fields, depth or bodies); otherwise resolved geometry wins when there is any, and an intent that failed with no
/// resolved geometry shows its own fields under status "invalid".
std::vector<SpruePresentation> presentSprues(const std::vector<SprueOperationDefinition>& intents, const std::vector<SprueDefinition>& resolved);

struct SprueHandle {
  std::string operationId;
  SprueHandleOpening opening = SprueHandleOpening::Top;
  std::string status;
  Vec3 position;       // the opening's centre (mold frame)
  Quat orientation;    // maps the ring's +Z (its normal) onto the outward sprue axis
  double radiusMm = 0;
  double mainDiameterMm = 0, entryNeckDiameterMm = 0;  // the sprue's current profile
  std::vector<std::string> targetBodyIds;              // mold bodies this sprue cuts (empty until resolved)
  std::shared_ptr<const IndexedSurface> pickMesh;      // the tessellated pick ring, built once with the handle

  double diameterMm() const { return opening == SprueHandleOpening::Top ? mainDiameterMm : entryNeckDiameterMm; }
  double minimumDiameterMm() const;
  double maximumDiameterMm() const;
  double visualTubeMm() const;  // the ring that is drawn
  double targetTubeMm() const;  // the fatter invisible ring that is picked
  std::string id() const { return operationId + (opening == SprueHandleOpening::Top ? ":top" : ":bottom"); }
};

/// The rings of every presentation: the top ring always, the bottom ring once the sprue has a resolved depth.
std::vector<SprueHandle> buildSprueHandles(const std::vector<SpruePresentation>& presentations);

/// three.js TorusGeometry(radius, tube, radialSegments, tubularSegments): its vertex order, normals and indices, with
/// coordinates rounded to float32.
IndexedSurface torusSurface(double radius, double tube, int radialSegments = 8, int tubularSegments = 32);

struct SprueHandlePick {
  int handle = -1;
  double distance = 0;
};
/// The nearest handle whose pick ring the ray hits (front faces only, as the reference's raycast of the pick mesh).
std::optional<SprueHandlePick> pickSprueHandle(const Ray& ray, const std::vector<SprueHandle>& handles);

/// Clamps and couples a requested diameter to the handle's rules (main >= entry neck, neck <= main, 2..50 mm).
/// nullopt for a non-finite request.
std::optional<double> normalizeHandleDiameter(const SprueHandle& handle, double diameterMm);

/// The diameter a drag asks for, `dx`/`dy` pixels from the press point: horizontal motion minus a quarter of the
/// vertical, 0.05 mm per pixel, snapped to 0.25 mm unless Shift is held, then normalised.
std::optional<double> dragDiameter(const SprueHandle& handle, double dxPixels, double dyPixels, bool shiftHeld);

/// "Ø 7.00 mm"
std::string diameterLabel(double diameterMm);
/// The label turns to the warning colour at either limit.
bool diameterLabelWarns(const SprueHandle& handle, double diameterMm);

unsigned handleColorRgb(const std::string& status, SprueHandleVisual visual);
double handleOpacity(SprueHandleVisual visual);
double handleVisualScale(SprueHandleVisual visual);

}  // namespace craft
