// The Cut by Face planes in the viewport and the Eraser tool, in the application controller.
//
// Behaviour of the reference's cuttingPlane3dRuntime.ts and of the removal actions in split-face/splitFace.store.ts
// (removeSplitFace): the enabled planes are drawn as thin amber slabs while the mold is being set up (and, once the
// mold is complete, only while the Eraser tool is active); under the Eraser the plane the pointer is over turns red and
// a click removes it; nothing is removed while the mold is generating or for a plane that is not there. The slab
// geometry and the picking are in core/mold/CuttingPlaneSlabs, compared with the real runtime by
// tst_cutplane_equivalence.

#include <algorithm>
#include <cstdio>

#include "AppController.h"

namespace craft::app {

// --- availability --------------------------------------------------------------------------------------------------

bool AppController::hasCutPlanes() const {
  if (!model_ || segmentation_.adopted) return false;  // an adopted segmentation replaces Cut by Face
  return std::any_of(cutFaces_.begin(), cutFaces_.end(), [](const CutFaceState& s) { return s.enabled; });
}

// The reference makes mutating tools unavailable while an evaluation runs.
bool AppController::eraserAvailable() const { return hasCutPlanes() && moldPhase_ != QLatin1String("generating"); }

// Planes show while the mold is being set up; a complete mold hides them unless the Eraser needs them.
bool AppController::cutPlanesVisible() const { return hasCutPlanes() && (moldPhase_ != QLatin1String("complete") || tool_ == QLatin1String("eraser")); }

QVariantMap AppController::cutPlanes() const {
  return {{"visible", cutPlanesVisible()},
          {"eraserAvailable", eraserAvailable()},
          {"eraserActive", tool_ == QLatin1String("eraser")},
          {"hoveredFace", eraserHover_ ? QString::fromLatin1(faceIdName(*eraserHover_)) : QString()},
          {"planeCount", static_cast<int>(cutSlabs_.size())}};
}

// --- slabs ----------------------------------------------------------------------------------------------------------

void AppController::refreshCutPlanes() {
  // The Eraser needs planes: when they vanish (a face unchecked, a segmentation adopted, a new model) it falls back to Select.
  if (tool_ == QLatin1String("eraser") && !hasCutPlanes()) setTool(QStringLiteral("select"));
  if (tool_ != QLatin1String("eraser") && eraserHover_) setEraserHover(std::nullopt);

  std::vector<PlaneSlab> slabs;
  if (cutPlanesVisible()) {
    const auto k1 = partBoxBounds();
    const auto k2 = k1 ? createReferenceMoldBlockBounds(*k1, moldClearanceMm_) : std::nullopt;
    if (k1 && k2) {
      std::vector<CuttingPlane> planes;
      for (FaceId face : kFaceIds) {
        const CutFaceState& s = cutFaces_[static_cast<std::size_t>(face)];
        if (!s.enabled) continue;
        CuttingPlane plane = createCuttingPlane(face, s.position);
        plane.enabled = true;
        planes.push_back(plane);
      }
      slabs = buildPlaneSlabs(*k1, *k2, planes);
    }
  }

  // Rebuild the rows only when something they are made from changed.
  std::string signature;
  char buffer[256];
  for (const PlaneSlab& s : slabs) {
    std::snprintf(buffer, sizeof buffer, "%s|%.9g|%.9g,%.9g,%.9g|%.9g,%.9g,%.9g;", faceIdName(s.face), s.coordinate, s.center.x, s.center.y, s.center.z, s.size.x, s.size.y, s.size.z);
    signature += buffer;
  }
  if (signature != cutSlabSignature_) {
    cutSlabSignature_ = signature;
    eraserHover_.reset();
    cutSlabs_ = slabs;
    cutPlaneSlabs_.setSlabs(slabs);
  }
  emit cutPlanesChanged();
}

// --- eraser ---------------------------------------------------------------------------------------------------------

void AppController::setEraserHover(std::optional<FaceId> face) {
  if (face == eraserHover_) return;
  if (eraserHover_) cutPlaneSlabs_.setVisual(cutPlaneSlabs_.rowOf(*eraserHover_), CutPlaneVisual::Idle);
  eraserHover_ = face;
  if (eraserHover_) cutPlaneSlabs_.setVisual(cutPlaneSlabs_.rowOf(*eraserHover_), CutPlaneVisual::EraseHover);
  emit cutPlanesChanged();
}

bool AppController::eraserHoverAt(qreal x, qreal y, qreal w, qreal h) {
  if (tool_ != QLatin1String("eraser")) {
    eraserLeave();
    return false;
  }
  camera_.setViewportSize(w, h);
  const auto pick = pickPlaneSlab(camera_.pose().rayThroughPixel(x, y, w, h), cutSlabs_);
  setEraserHover(pick ? std::optional<FaceId>(cutSlabs_[static_cast<std::size_t>(pick->slab)].face) : std::nullopt);
  return pick.has_value();
}

void AppController::eraserLeave() { setEraserHover(std::nullopt); }

bool AppController::eraseAt(qreal x, qreal y, qreal w, qreal h) {
  camera_.setViewportSize(w, h);
  const auto pick = pickPlaneSlab(camera_.pose().rayThroughPixel(x, y, w, h), cutSlabs_);
  if (!pick) return false;
  return removeCutFace(QString::fromLatin1(faceIdName(cutSlabs_[static_cast<std::size_t>(pick->slab)].face)));
}

bool AppController::removeCutFace(const QString& faceName) {
  // The reference's guards: nothing while the mold is being generated, nothing for a plane that is not there.
  if (moldPhase_ == QLatin1String("generating")) {
    setStatus(QStringLiteral("Wait for the mold to finish generating before removing a cutting plane."));
    return false;
  }
  if (segmentation_.adopted) return false;
  const auto face = faceIdFromName(faceName.toStdString());
  if (!face) return false;
  CutFaceState& state = cutFaces_[static_cast<std::size_t>(*face)];
  if (!state.enabled) return false;

  setEraserHover(std::nullopt);
  pushHistory();
  state = {};  // the plane is gone, with its position: choosing the face again starts from the face's own default
  invalidateMoldInputs();  // the mold built with it is dropped; sprue intents survive, as in the reference
  setStatus(QStringLiteral("Removed the %1 cutting plane.").arg(faceName));
  return true;
}

}  // namespace craft::app
