#include "view/GroundPlaneRuler.h"

#include <charconv>
#include <cmath>

namespace craft {

namespace {

constexpr double kMinDisplayable = 1e-9;

std::vector<double> niceStepCandidates(double minStep, double maxStep) {
  std::vector<double> candidates;
  if (!std::isfinite(minStep) || !std::isfinite(maxStep) || minStep <= 0 || maxStep < minStep) return candidates;
  const int startExponent = static_cast<int>(std::floor(std::log10(minStep)));
  const int endExponent = static_cast<int>(std::ceil(std::log10(maxStep)));
  for (int exponent = startExponent; exponent <= endExponent; ++exponent) {
    const double magnitude = std::pow(10.0, exponent);
    for (const double factor : {1.0, 2.0, 5.0}) {
      const double value = factor * magnitude;
      if (value >= minStep && value <= maxStep) candidates.push_back(value);
    }
  }
  return candidates;
}

}  // namespace

RulerStepBounds rulerStepBounds(double minorStep, double size) { return {minorStep, size / 2}; }

std::optional<double> selectRulerLabelStep(const RulerStepSelection& s) {
  if (!std::isfinite(s.pixelsPerWorldUnit) || s.pixelsPerWorldUnit <= 0 || !std::isfinite(s.minStep) || !std::isfinite(s.maxStep) ||
      s.minStep <= 0 || s.maxStep < s.minStep || !std::isfinite(s.minLabelPixels) || s.minLabelPixels <= 0 ||
      s.maxLabelPixels < s.minLabelPixels)
    return std::nullopt;

  if (s.currentStep && std::isfinite(*s.currentStep) && *s.currentStep >= s.minStep && *s.currentStep <= s.maxStep) {
    const double currentPixels = *s.currentStep * s.pixelsPerWorldUnit;
    if (currentPixels >= s.minLabelPixels && currentPixels <= s.maxLabelPixels) return s.currentStep;
  }

  const std::vector<double> candidates = niceStepCandidates(s.minStep, s.maxStep);
  if (candidates.empty()) return std::nullopt;

  const double target = (s.minLabelPixels + s.maxLabelPixels) / 2;
  std::optional<double> best;
  double bestDistance = INFINITY;
  for (const double candidate : candidates) {
    const double distance = std::fabs(candidate * s.pixelsPerWorldUnit - target);
    if (!best || distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

RulerLayout computeGroundPlaneRulerLayout(double halfExtent, double step, int minorDivisions) {
  RulerLayout layout;
  layout.step = step;
  if (!std::isfinite(halfExtent) || halfExtent <= 0 || !std::isfinite(step) || step <= 0 || minorDivisions <= 0) return layout;

  const double tick = step / minorDivisions;
  const long long firstTick = static_cast<long long>(std::ceil(-halfExtent / tick));
  const long long lastTick = static_cast<long long>(std::floor(halfExtent / tick));
  for (long long index = firstTick; index <= lastTick; ++index)
    layout.ticks.push_back({static_cast<double>(index) * tick, index % minorDivisions == 0});

  const long long firstLabel = static_cast<long long>(std::ceil(-halfExtent / step));
  const long long lastLabel = static_cast<long long>(std::floor(halfExtent / step));
  for (long long index = firstLabel; index <= lastLabel; ++index) {
    const double value = static_cast<double>(index) * step;
    layout.labels.push_back({value, value});
  }
  return layout;
}

std::string formatRulerLabel(double value) {
  if (!std::isfinite(value)) return std::isnan(value) ? "NaN" : (value < 0 ? "-Infinity" : "Infinity");
  const double floored = std::floor(value);
  double rounded = (value - floored >= 0.5) ? floored + 1 : floored;  // Math.round: halves go up
  if (rounded == 0) rounded = 0;             // String(-0) is "0"
  char buffer[64];
  const auto result = std::abs(rounded) >= 1e21 ? std::to_chars(buffer, buffer + sizeof buffer, rounded, std::chars_format::scientific)
                                                : std::to_chars(buffer, buffer + sizeof buffer, rounded, std::chars_format::fixed, 0);
  return std::string(buffer, result.ptr);
}

std::optional<double> projectWorldLengthToPixels(const ViewPose& pose, double aspect, const Vec3& origin, const Vec3& axisUnit,
                                                 double worldLength, double viewportHeightPx) {
  if (!std::isfinite(worldLength) || worldLength <= 0 || !std::isfinite(viewportHeightPx) || viewportHeightPx <= 0 ||
      !std::isfinite(aspect) || aspect <= 0)
    return std::nullopt;

  const CameraBasis basis = pose.basis();
  const Vec3 eye = pose.position();
  const double f = 1.0 / std::tan(pose.verticalFovDegrees() * 3.14159265358979323846 / 360.0);
  // three.js Vector3.project: view space, then the perspective matrix and the divide by w (= the depth along the view).
  const auto ndc = [&](const Vec3& p, double& x, double& y) {
    const Vec3 d = p - eye;
    const double depth = d.dot(basis.forward);
    x = (f / aspect) * d.dot(basis.right) / depth;
    y = f * d.dot(basis.up) / depth;
  };
  double sx, sy, ex, ey;
  ndc(origin, sx, sy);
  ndc(origin + axisUnit * worldLength, ex, ey);
  if (!std::isfinite(sx) || !std::isfinite(sy) || !std::isfinite(ex) || !std::isfinite(ey)) return std::nullopt;
  return std::hypot(ex - sx, ey - sy) * (viewportHeightPx / 2);
}

void GroundPlaneRuler::setGrid(double size, double minorStep) {
  size_ = size;
  minorStep_ = minorStep;
  dirty_ = true;
}

bool GroundPlaneRuler::update(const ViewPose& pose, double aspect, double viewportHeightPx) {
  const double height = viewportHeightPx > 0 ? viewportHeightPx : 600;
  const std::optional<double> ppu = projectWorldLengthToPixels(pose, aspect, {0, 0, 0}, {1, 0, 0}, 1, height);
  if (!ppu) return false;

  const RulerStepBounds bounds = rulerStepBounds(minorStep_, size_);
  const std::optional<double> step = selectRulerLabelStep({*ppu, bounds.minStep, bounds.maxStep, currentStep_});
  if (!step || (currentStep_ && *step == *currentStep_ && !dirty_)) return false;

  currentStep_ = step;
  dirty_ = false;

  const double halfExtent = size_ / 2;
  const RulerLayout layout = computeGroundPlaneRulerLayout(halfExtent, *step);
  const double majorLength = kRulerMajorTickPixels / *ppu, minorLength = kRulerMinorTickPixels / *ppu;
  const double labelOffset = kRulerLabelOffsetPixels / *ppu, labelHeight = kRulerLabelPixelHeight / *ppu;

  RulerGeometry g;
  g.step = *step;
  g.pixelsPerWorldUnit = *ppu;
  const float h = static_cast<float>(halfExtent), z = static_cast<float>(kRulerAxisZ);
  g.axes = {-h, 0, z, h, 0, z, 0, -h, z, 0, h, z};
  for (const RulerTick& tick : layout.ticks) {
    const float p = static_cast<float>(tick.position), half = static_cast<float>((tick.major ? majorLength : minorLength) / 2);
    g.ticks.insert(g.ticks.end(), {p, -half, z, p, half, z, -half, p, z, half, p, z});
  }
  for (const RulerLabelPosition& label : layout.labels) {
    const std::string text = formatRulerLabel(label.value);
    g.labels.push_back({text, label.position, -labelOffset, labelHeight});
    if (label.position != 0) g.labels.push_back({text, -labelOffset, label.position, labelHeight});
  }
  geometry_ = std::move(g);
  return true;
}

}  // namespace craft
