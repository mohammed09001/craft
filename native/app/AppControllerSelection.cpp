// Selection in the application controller: picking, the model highlight, the selection box with its hoverable faces,
// and toggling Cut by Face planes by clicking a box face.
//
// Behaviour of the reference viewport (modelSelectionRuntime.ts, modelSelectionHighlight.ts,
// objectSelectionBoxRuntime.ts): clicking the part selects it (the part is drawn in the highlight colour and a dashed
// box appears around it); clicking empty space or pressing Escape clears the selection; while the part is selected the
// box face nearest to the pointer is highlighted, and while Cut by Face is available a click on it toggles that face's
// cutting plane instead of re-selecting. The pure parts (face picking, dash pattern, colour rule) are in
// core/view/SelectionBox and compared with the real reference by tst_selection_equivalence.

#include <QColor>
#include <QVector3D>

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "AppController.h"

namespace craft::app {

namespace {

constexpr const char* kPartKindName = "part";
// The viewport clear colours (also used by ViewportView.qml through selectionStyle.background).
constexpr const char* kDarkBackground = "#0b1118";   // the reference viewport's backgrounds (core/view/ViewportLook)
constexpr const char* kLightBackground = "#f7f9fb";

QVariantMap pointMap(const Point3& p) { return {{"x", p.x}, {"y", p.y}, {"z", p.z}}; }

QVector3D toQ(const Vec3& v) { return QVector3D(static_cast<float>(v.x), static_cast<float>(v.y), static_cast<float>(v.z)); }

QColor colorFromRgb(unsigned rgb) { return QColor::fromRgb((rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff); }

std::string faceKey(const std::optional<SelectionBoxFace>& face) { return face ? selectionBoxFaceName(*face) : ""; }

}  // namespace

// --- state ---------------------------------------------------------------------------------------------------------

std::optional<Bounds3> AppController::partBoxBounds() const {
  for (const SceneItem& item : scene_.items()) {
    if (item.kind != QLatin1String(kPartKindName) || !item.visible) continue;
    Bounds3 b = item.bounds;
    b.min.x += item.offset.x(); b.max.x += item.offset.x();
    b.min.y += item.offset.y(); b.max.y += item.offset.y();
    b.min.z += item.offset.z(); b.max.z += item.offset.z();
    return b;
  }
  return std::nullopt;
}

bool AppController::partSelected() const { return model_ && selection_.value("kind").toString() == QLatin1String(kPartKindName); }

bool AppController::selectionBoxVisible() const {
  return partSelected() && partBoxBounds() && moldPhase_ != QLatin1String("generating") && moldPhase_ != QLatin1String("complete");
}

bool AppController::cutFaceSelectionActive() const { return selectionBoxVisible() && tool_ == QLatin1String("select") && !segmentation_.adopted && !extensionPlanesShown(); }

// --- picking -------------------------------------------------------------------------------------------------------

bool AppController::pickAt(qreal x, qreal y, qreal w, qreal h) {
  camera_.setViewportSize(w, h);
  if (tool_ == "sprue") return placeSprueAt(x, y, w, h);
  if (tool_ == "eraser") return eraseAt(x, y, w, h);  // a click on a plane removes it; elsewhere it does nothing
  const Ray ray = camera_.pose().rayThroughPixel(x, y, w, h);

  // With the part selected the box faces are pickable too (the reference raycasts the model together with its box).
  std::optional<SelectionBoxHit> boxHit;
  if (tool_ == "select" && selectionBoxVisible()) boxHit = pickSelectionBoxFace(ray, *partBoxBounds());
  const auto hit = scene_.pick(ray);

  const auto recordPick = [&] {
    const SceneItem& item = scene_.items()[static_cast<std::size_t>(hit->row)];
    const Vec3 p = hit->hit.point;
    selection_ = {{"id", item.id}, {"name", item.name}, {"kind", item.kind},
                  {"triangle", static_cast<qulonglong>(hit->hit.triangleIndex)},
                  {"point", pointMap({p.x, p.y, p.z})},
                  {"normal", pointMap({hit->hit.normal.x, hit->hit.normal.y, hit->hit.normal.z})},
                  {"distanceMm", hit->hit.distance}};
  };

  if (boxHit && cutFaceSelectionActive()) {
    // Like the reference, a click on the box toggles that face's Cut by Face plane instead of re-selecting. (The picked
    // point is still reported when the click also landed on the part: the inspector shows it.)
    const std::string name = selectionBoxFaceName(boxHit->face);
    for (FaceId face : kFaceIds) {
      if (name != faceIdName(face)) continue;
      setCutFaceEnabled(QString::fromStdString(name), !cutFaces_[static_cast<std::size_t>(face)].enabled);
      break;
    }
    if (hit && scene_.items()[static_cast<std::size_t>(hit->row)].kind == QLatin1String(kPartKindName)) recordPick();
    refreshSelectionOverlay();
    emit selectionChanged();
    return true;
  }

  if (!hit) {
    if (tool_ == "select") {
      if (boxHit) return true;  // a click inside the box's silhouette keeps the selection
      clearSelection();
    }
    return false;
  }
  const SceneItem& item = scene_.items()[static_cast<std::size_t>(hit->row)];
  const Vec3 p = hit->hit.point;
  if (tool_ == "measure") {
    if (measurePoints_.size() >= 2) measurePoints_.clear();
    measurePoints_.push_back(p);
    QVariantMap m{{"points", static_cast<qulonglong>(measurePoints_.size())}};
    if (measurePoints_.size() == 2) {
      const Vec3 d = measurePoints_[1] - measurePoints_[0];
      m.insert("distanceMm", d.length());
      m.insert("dx", d.x); m.insert("dy", d.y); m.insert("dz", d.z);
      measureLine_.setBuffers(viewport::buildSegmentBuffers(
          {float(measurePoints_[0].x), float(measurePoints_[0].y), float(measurePoints_[0].z)},
          {float(p.x), float(p.y), float(p.z)}));
    } else {
      measureLine_.clearBuffers();
    }
    measurement_ = m;
  } else {
    recordPick();
    scene_.setSelectedId(item.id);  // only the part is highlighted (a mold body's pick is reported, not highlighted)
    refreshSelectionOverlay();
  }
  emit selectionChanged();
  return true;
}

void AppController::clearSelection() {
  selection_.clear();
  measurement_.clear();
  measurePoints_.clear();
  measureLine_.clearBuffers();
  hoverFace_.reset();
  scene_.setSelectedId({});
  refreshSelectionOverlay();
  emit selectionChanged();
}

bool AppController::hoverAt(qreal x, qreal y, qreal w, qreal h) {
  if (tool_ != "select" || !model_) {
    clearHover();
    return false;
  }
  camera_.setViewportSize(w, h);
  const Ray ray = camera_.pose().rayThroughPixel(x, y, w, h);

  std::optional<SelectionBoxFace> face;
  bool overPart = false;
  if (selectionBoxVisible()) {
    if (const auto hit = pickSelectionBoxFace(ray, *partBoxBounds())) {
      face = hit->face;
      overPart = true;
    }
  }
  if (!overPart) {
    const auto hit = scene_.pick(ray);
    overPart = hit && scene_.items()[static_cast<std::size_t>(hit->row)].kind == QLatin1String(kPartKindName);
  }
  if (face != hoverFace_) {
    hoverFace_ = face;
    refreshSelectionOverlay();
  }
  return overPart;
}

void AppController::clearHover() {
  if (!hoverFace_) return;
  hoverFace_.reset();
  refreshSelectionOverlay();
}

// --- overlay -------------------------------------------------------------------------------------------------------

QVariantMap AppController::selectionBox() const {
  QStringList selectedFaces;
  if (cutFaceSelectionActive()) {
    for (FaceId face : kFaceIds) {
      if (cutFaces_[static_cast<std::size_t>(face)].enabled) selectedFaces << QString::fromLatin1(faceIdName(face));
    }
  }
  return {{"visible", selectionBoxVisible()},
          {"partSelected", partSelected()},
          {"hoverFace", QString::fromStdString(faceKey(selectionBoxVisible() ? hoverFace_ : std::nullopt))},
          {"selectedFaces", selectedFaces},
          {"cutSelectionActive", cutFaceSelectionActive()}};
}

QVariantMap AppController::selectionStyle() const {
  const QString background = QLatin1String(theme_ == "dark" ? kDarkBackground : kLightBackground);
  const unsigned rgb = highlightColorRgb(background.toStdString());
  // The reference's emissive is the highlight colour at intensity 0.18 in linear space.
  const QVector3D emissive(static_cast<float>(srgbChannelToLinear(((rgb >> 16) & 0xff) / 255.0) * kHighlightEmissiveIntensity),
                           static_cast<float>(srgbChannelToLinear(((rgb >> 8) & 0xff) / 255.0) * kHighlightEmissiveIntensity),
                           static_cast<float>(srgbChannelToLinear((rgb & 0xff) / 255.0) * kHighlightEmissiveIntensity));
  return {{"background", background},
          {"highlightColor", colorFromRgb(rgb)},
          {"highlightEmissive", emissive},
          {"highlightRoughness", kHighlightMaxRoughness},
          {"boxColor", colorFromRgb(kSelectionBoxColorRgb)},
          {"boxOpacity", kSelectionBoxLineOpacity},
          {"hoverOpacity", kSelectionBoxHoverOpacity},
          {"selectedOpacity", kSelectionBoxSelectedOpacity},
          {"clickDragThresholdPx", kClickDragThresholdPx}};
}

void AppController::refreshSelectionOverlay() {
  const bool visible = selectionBoxVisible();
  const std::optional<Bounds3> bounds = partBoxBounds();

  std::vector<SelectionBoxFace> selectedFaces;
  if (visible && cutFaceSelectionActive()) {
    for (FaceId face : kFaceIds) {
      if (!cutFaces_[static_cast<std::size_t>(face)].enabled) continue;
      if (const auto boxFace = selectionBoxFaceFromName(faceIdName(face))) selectedFaces.push_back(*boxFace);
    }
  }
  const std::optional<SelectionBoxFace> hover = visible ? hoverFace_ : std::nullopt;

  // Rebuild the GPU geometry only when something it is made from changed.
  std::string key = std::string(partSelected() ? "p1" : "p0") + (visible ? "|v1" : "|v0") + (cutFaceSelectionActive() ? "|c1" : "|c0");
  if (visible && bounds) {
    char buffer[160];
    std::snprintf(buffer, sizeof buffer, "|%.9g,%.9g,%.9g,%.9g,%.9g,%.9g", bounds->min.x, bounds->min.y, bounds->min.z, bounds->max.x, bounds->max.y, bounds->max.z);
    key += buffer;
    key += "|h" + faceKey(hover) + "|s";
    for (SelectionBoxFace face : selectedFaces) key += selectionBoxFaceName(face) + std::string(",");
  }
  if (key == selectionOverlayKey_) return;
  selectionOverlayKey_ = key;

  if (!visible || !bounds) {
    selectionBoxLines_.clearBuffers();
    hoverFaceQuad_.clearBuffers();
    selectedFaceQuads_.clearBuffers();
    emit selectionOverlayChanged();
    return;
  }

  // Dashed box edges (the reference's dash/gap, the pattern running on from edge to edge).
  std::vector<std::array<QVector3D, 2>> segments;
  for (const Segment3& dash : selectionBoxDashes(*bounds, kSelectionBoxDashMm, kSelectionBoxGapMm)) segments.push_back({toQ(dash.from), toQ(dash.to)});
  selectionBoxLines_.setBuffers(viewport::buildSegmentListBuffers(segments));

  // Face overlays sit a hair outside the box: the reference uses a polygon offset to keep them from z-fighting with
  // part faces that lie exactly on the box; Qt Quick 3D has no such state, so the quad is moved along its normal.
  const Vec3 size{bounds->max.x - bounds->min.x, bounds->max.y - bounds->min.y, bounds->max.z - bounds->min.z};
  const double lift = std::max(0.005, 0.0005 * size.length());
  const auto quadOf = [&](SelectionBoxFace face, double factor) {
    std::array<QVector3D, 4> quad;
    const Vec3 shift = selectionBoxFaceNormal(face) * (lift * factor);
    const auto quads = selectionBoxFaceQuads(*bounds);
    for (std::size_t i = 0; i < 4; ++i) quad[i] = toQ(quads[static_cast<std::size_t>(face)].corners[i] + shift);
    return quad;
  };
  std::vector<std::array<QVector3D, 4>> hoverQuads, selectedQuads;
  if (hover) hoverQuads.push_back(quadOf(*hover, 1.5));
  for (SelectionBoxFace face : selectedFaces) selectedQuads.push_back(quadOf(face, 1.0));
  if (hoverQuads.empty()) hoverFaceQuad_.clearBuffers(); else hoverFaceQuad_.setBuffers(viewport::buildQuadBuffers(hoverQuads));
  if (selectedQuads.empty()) selectedFaceQuads_.clearBuffers(); else selectedFaceQuads_.setBuffers(viewport::buildQuadBuffers(selectedQuads));
  emit selectionOverlayChanged();
}

}  // namespace craft::app
