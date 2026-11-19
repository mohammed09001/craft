#pragma once

// The ground-plane ruler: numbered ticks along the X and Y axes on the ground, whose label spacing follows the zoom.
// A port of the reference's groundPlaneRuler.ts (the layout, the label step with its hysteresis, the pixel projection) and
// of the geometry createGroundPlaneRulerRuntime.ts builds. Renderer independent: no Qt, no drawing; the application turns the
// result into line geometry and label quads. Replayed against the real reference modules by tst_ground_ruler
// (ruler-reference.json).

#include <optional>
#include <string>
#include <vector>

#include "view/ViewPose.h"

namespace craft {

inline constexpr double kRulerMinLabelPixels = 60;
inline constexpr double kRulerMaxLabelPixels = 140;
inline constexpr int kRulerMinorDivisions = 5;

// createGroundPlaneRulerRuntime.ts
inline constexpr double kRulerAxisZ = 0;
inline constexpr double kRulerLabelZ = 0.5;
inline constexpr double kRulerLabelPixelHeight = 12;
inline constexpr double kRulerLabelOffsetPixels = 14;
inline constexpr double kRulerMajorTickPixels = 8;
inline constexpr double kRulerMinorTickPixels = 4;
inline constexpr double kRulerAxisOpacity = 0.66;
inline constexpr double kRulerTickOpacity = 0.52;

struct RulerTick {
  double position;
  bool major;
};
struct RulerLabelPosition {
  double value;
  double position;
};
struct RulerLayout {
  double step = 0;
  std::vector<RulerTick> ticks;
  std::vector<RulerLabelPosition> labels;
};

struct RulerStepSelection {
  double pixelsPerWorldUnit = 0;
  double minStep = 0;
  double maxStep = 0;
  std::optional<double> currentStep;
  double minLabelPixels = kRulerMinLabelPixels;
  double maxLabelPixels = kRulerMaxLabelPixels;
};

struct RulerStepBounds {
  double minStep, maxStep;
};
RulerStepBounds rulerStepBounds(double minorStep, double size);

/// The label step for the current zoom: from the 1/2/5 x 10^n sequence within the bounds; a current step is kept while its
/// on-screen span stays in the readable band (hysteresis), otherwise the one nearest the band's centre is taken.
std::optional<double> selectRulerLabelStep(const RulerStepSelection& selection);

/// Ticks (minor ticks subdivide each label interval) and labels for one axis spanning `halfExtent` either side of the origin.
RulerLayout computeGroundPlaneRulerLayout(double halfExtent, double step, int minorDivisions = kRulerMinorDivisions);

/// String(Math.round(value)).
std::string formatRulerLabel(double value);

/// On-screen length in pixels of a world segment on the ground, measured the way the reference does: the projected NDC length
/// scaled by half the viewport HEIGHT (for both components). nullopt for unusable inputs.
std::optional<double> projectWorldLengthToPixels(const ViewPose& pose, double aspect, const Vec3& origin, const Vec3& axisUnit,
                                                 double worldLength, double viewportHeightPx);

struct RulerLabel {
  std::string text;
  double x, y;     // world position (z is kRulerLabelZ)
  double height;   // world height of the label quad
};

struct RulerGeometry {
  std::vector<float> axes;   // line list: the two axes
  std::vector<float> ticks;  // line list: a tick across each axis at every tick position
  std::vector<RulerLabel> labels;
  double step = 0;
  double pixelsPerWorldUnit = 0;
};

/// Keeps the ruler's state like the reference runtime: the label step with its hysteresis, and when the geometry is rebuilt
/// (when the step changes or the grid changed, not on every camera move).
class GroundPlaneRuler {
 public:
  void setGrid(double size, double minorStep);
  /// Returns true when the geometry was rebuilt. `viewportHeightPx` <= 0 means 600, as the reference.
  bool update(const ViewPose& pose, double aspect, double viewportHeightPx);
  const RulerGeometry& geometry() const { return geometry_; }

 private:
  double size_ = 220;
  double minorStep_ = 10;
  std::optional<double> currentStep_;
  bool dirty_ = true;
  RulerGeometry geometry_;
};

}  // namespace craft
