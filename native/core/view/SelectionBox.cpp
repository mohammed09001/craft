#include "view/SelectionBox.h"

#include "geometry/ThreeRayTriangle.h"

#include <algorithm>
#include <cmath>
#include <optional>

namespace craft {

namespace {

constexpr std::array<const char*, 6> kNames{"front", "back", "left", "right", "top", "bottom"};


std::optional<unsigned> parseCssHex(std::string_view text) {
  if (text.size() != 4 && text.size() != 7) return std::nullopt;
  if (text.front() != '#') return std::nullopt;
  const auto digit = [](char c) -> int {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
  };
  unsigned value = 0;
  if (text.size() == 4) {
    for (std::size_t i = 1; i < 4; ++i) {
      const int d = digit(text[i]);
      if (d < 0) return std::nullopt;
      value = (value << 8) | static_cast<unsigned>(d * 17);
    }
  } else {
    for (std::size_t i = 1; i < 7; ++i) {
      const int d = digit(text[i]);
      if (d < 0) return std::nullopt;
      value = (value << 4) | static_cast<unsigned>(d);
    }
  }
  return value;
}

}  // namespace

double srgbChannelToLinear(double c) { return c < 0.04045 ? c * 0.0773993808049536 : std::pow(c * 0.9478672985781991 + 0.0521327014218009, 2.4); }

Vec3 selectionBoxFaceNormal(SelectionBoxFace face) {
  switch (face) {
    case SelectionBoxFace::Front: return {0, 1, 0};
    case SelectionBoxFace::Back: return {0, -1, 0};
    case SelectionBoxFace::Left: return {-1, 0, 0};
    case SelectionBoxFace::Right: return {1, 0, 0};
    case SelectionBoxFace::Top: return {0, 0, 1};
    case SelectionBoxFace::Bottom: return {0, 0, -1};
  }
  return {0, 0, 0};
}

const char* selectionBoxFaceName(SelectionBoxFace face) { return kNames[static_cast<std::size_t>(face)]; }

std::optional<SelectionBoxFace> selectionBoxFaceFromName(std::string_view name) {
  for (SelectionBoxFace face : kSelectionBoxFaces) {
    if (name == kNames[static_cast<std::size_t>(face)]) return face;
  }
  return std::nullopt;
}

std::array<SelectionBoxFaceQuad, 6> selectionBoxFaceQuads(const Bounds3& b) {
  const Vec3 v000{b.min.x, b.min.y, b.min.z}, v100{b.max.x, b.min.y, b.min.z}, v110{b.max.x, b.max.y, b.min.z},
      v010{b.min.x, b.max.y, b.min.z}, v001{b.min.x, b.min.y, b.max.z}, v101{b.max.x, b.min.y, b.max.z},
      v111{b.max.x, b.max.y, b.max.z}, v011{b.min.x, b.max.y, b.max.z};
  return {{{SelectionBoxFace::Front, {v010, v110, v111, v011}},
           {SelectionBoxFace::Back, {v000, v001, v101, v100}},
           {SelectionBoxFace::Left, {v000, v010, v011, v001}},
           {SelectionBoxFace::Right, {v100, v101, v111, v110}},
           {SelectionBoxFace::Top, {v001, v011, v111, v101}},
           {SelectionBoxFace::Bottom, {v000, v100, v110, v010}}}};
}

std::vector<SelectionBoxHit> pickSelectionBoxFaces(const Ray& ray, const Bounds3& bounds) {
  std::vector<SelectionBoxHit> hits;
  for (const SelectionBoxFaceQuad& quad : selectionBoxFaceQuads(bounds)) {
    const auto& c = quad.corners;
    // The reference splits each quad into (a,b,c) and (a,c,d).
    for (int half = 0; half < 2; ++half) {
      const auto t = half == 0 ? intersectTriangleThree(ray, c[0], c[1], c[2], false) : intersectTriangleThree(ray, c[0], c[2], c[3], false);
      if (!t || *t < 0) continue;
      hits.push_back({quad.face, *t, ray.origin + ray.direction * *t});
    }
  }
  std::stable_sort(hits.begin(), hits.end(), [](const SelectionBoxHit& l, const SelectionBoxHit& r) { return l.distance < r.distance; });
  return hits;
}

std::optional<SelectionBoxHit> pickSelectionBoxFace(const Ray& ray, const Bounds3& bounds) {
  const auto hits = pickSelectionBoxFaces(ray, bounds);
  if (hits.empty()) return std::nullopt;
  return hits.front();
}

std::array<Segment3, 12> selectionBoxEdges(const Bounds3& b) {
  const Vec3 mn{b.min.x, b.min.y, b.min.z}, mx{b.max.x, b.max.y, b.max.z};
  return {{{{mn.x, mn.y, mn.z}, {mx.x, mn.y, mn.z}},
           {{mx.x, mn.y, mn.z}, {mx.x, mx.y, mn.z}},
           {{mx.x, mx.y, mn.z}, {mn.x, mx.y, mn.z}},
           {{mn.x, mx.y, mn.z}, {mn.x, mn.y, mn.z}},

           {{mn.x, mn.y, mx.z}, {mx.x, mn.y, mx.z}},
           {{mx.x, mn.y, mx.z}, {mx.x, mx.y, mx.z}},
           {{mx.x, mx.y, mx.z}, {mn.x, mx.y, mx.z}},
           {{mn.x, mx.y, mx.z}, {mn.x, mn.y, mx.z}},

           {{mn.x, mn.y, mn.z}, {mn.x, mn.y, mx.z}},
           {{mx.x, mn.y, mn.z}, {mx.x, mn.y, mx.z}},
           {{mx.x, mx.y, mn.z}, {mx.x, mx.y, mx.z}},
           {{mn.x, mx.y, mn.z}, {mn.x, mx.y, mx.z}}}};
}

std::vector<Segment3> dashEdge(const Segment3& edge, double dashMm, double gapMm, double startDistance, std::size_t maxDashes) {
  std::vector<Segment3> out;
  const Vec3 delta = edge.to - edge.from;
  const double length = delta.length();
  if (!(length > 0) || !(dashMm > 0) || !(gapMm >= 0)) return out;
  double dash = dashMm, gap = gapMm, offset = startDistance;
  double period = dash + gap;
  if (length / period > static_cast<double>(maxDashes)) {
    const double scale = length / (static_cast<double>(maxDashes) * period);
    dash *= scale;
    gap *= scale;
    offset *= scale;
    period = dash + gap;
  }
  const Vec3 direction = delta * (1.0 / length);
  // Walk the periods that overlap [offset, offset + length] in accumulated distance; the dash of period k covers
  // [k * period, k * period + dash].
  for (double k = std::floor(offset / period);; k += 1) {
    const double dashStart = k * period, dashEnd = dashStart + dash;
    if (dashStart >= offset + length) break;
    const double from = std::max(dashStart, offset) - offset;
    const double to = std::min(dashEnd, offset + length) - offset;
    if (to > from) out.push_back({edge.from + direction * from, edge.from + direction * to});
  }
  return out;
}

std::vector<Segment3> selectionBoxDashes(const Bounds3& bounds, double dashMm, double gapMm) {
  std::vector<Segment3> out;
  double distance = 0;  // accumulated along the edges in order, as three.js LineSegments.computeLineDistances
  for (const Segment3& edge : selectionBoxEdges(bounds)) {
    const auto pieces = dashEdge(edge, dashMm, gapMm, distance);
    out.insert(out.end(), pieces.begin(), pieces.end());
    distance += (edge.to - edge.from).length();
  }
  return out;
}

bool isLightBackground(std::string_view cssHex) {
  const auto rgb = parseCssHex(cssHex);
  if (!rgb) return false;
  const double r = srgbChannelToLinear(((*rgb >> 16) & 0xff) / 255.0);
  const double g = srgbChannelToLinear(((*rgb >> 8) & 0xff) / 255.0);
  const double b = srgbChannelToLinear((*rgb & 0xff) / 255.0);
  const double lightness = (std::max({r, g, b}) + std::min({r, g, b})) / 2.0;  // HSL lightness
  return lightness > 0.5;
}

unsigned highlightColorRgb(std::string_view backgroundCssHex) {
  return isLightBackground(backgroundCssHex) ? kHighlightOnLightRgb : kHighlightOnDarkRgb;
}

}  // namespace craft
