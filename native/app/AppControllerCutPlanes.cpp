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

namespace {
// The reference's CANONICAL_FACE_FOR_AXIS: the face a segmentation extension plane is filed under (splitFace.geometry.ts).
FaceId canonicalFaceForAxis(Axis axis) { return axis == Axis::X ? FaceId::Right : axis == Axis::Y ? FaceId::Back : FaceId::Top; }
}  // namespace

bool AppController::extensionPlanesShown() const {
  return model_ && !segmentation_.adopted && segmentation_.basePlan && segmentation_.source && !segmentation_.extensions.empty();
}

bool AppController::hasCutPlanes() const {
  if (!model_ || segmentation_.adopted) return false;  // an adopted segmentation replaces Cut by Face
  if (extensionPlanesShown()) return true;             // the segmentation's extension planes are the planes while a plan shows them
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
          {"dragging", cutPlaneDrag_.has_value()},
          {"dragFace", cutPlaneDrag_ ? QString::fromLatin1(faceIdName(cutPlaneDrag_->face)) : QString()},
          {"planeHoverFace", planeHover_ ? QString::fromLatin1(faceIdName(*planeHover_)) : QString()},
          // The reference's cursors for a plane: a closed hand while it is dragged, an open one over it.
          {"cursor", cutPlaneDrag_ ? QStringLiteral("grabbing") : planeHover_ ? QStringLiteral("grab") : QString()},
          {"planeCount", static_cast<int>(cutSlabs_.size())}};
}

// --- slabs ----------------------------------------------------------------------------------------------------------

void AppController::refreshCutPlanes() {
  // The Eraser needs planes: when they vanish (a face unchecked, a segmentation adopted, a new model) it falls back to Select.
  if (tool_ == QLatin1String("eraser") && !hasCutPlanes()) setTool(QStringLiteral("select"));
  if (tool_ != QLatin1String("eraser") && eraserHover_) setEraserHover(std::nullopt);
  if (tool_ == QLatin1String("eraser")) {  // the Eraser takes the planes over: a drag in progress is cancelled, the hover cleared
    abortCutPlaneDrag();
    setPlaneHover(std::nullopt);
  }

  std::vector<PlaneSlab> slabs;
  if (cutPlanesVisible()) {
    const auto k1 = partBoxBounds();
    const auto k2 = k1 ? createReferenceMoldBlockBounds(*k1, moldClearanceMm_) : std::nullopt;
    if (k1 && k2) {
      std::vector<CuttingPlane> planes;
      if (extensionPlanesShown()) {
        // An extension boundary is a coordinate in the mold frame the segmentation plan works in (its block starts at 0), and the
        // displayed part is shifted into that same frame, so the coordinate is already a displayed coordinate: the slab is filed at the
        // part box's fraction that holds it and then drawn at the coordinate itself (D-110).
        for (const auto& [axis, coordinate] : segmentation_.extensions) {
          try {
            CuttingPlane plane = createCuttingPlane(canonicalFaceForAxis(axis), worldToNormalizedPosition(*k1, axis, coordinate));
            plane.enabled = true;
            planes.push_back(plane);
          } catch (const std::invalid_argument&) {
          }
        }
      } else {
        for (FaceId face : kFaceIds) {
          const CutFaceState& s = cutFaces_[static_cast<std::size_t>(face)];
          if (!s.enabled) continue;
          CuttingPlane plane = createCuttingPlane(face, s.position);
          plane.enabled = true;
          planes.push_back(plane);
        }
      }
      slabs = buildPlaneSlabs(*k1, *k2, planes);
      if (extensionPlanesShown()) {
        // A plane is clamped into the part box when it is filed; a boundary outside the box (a typed coordinate, a plan the validation
        // rejects) is still drawn where it is, not on the nearest face of the box.
        for (PlaneSlab& slab : slabs) {
          for (const auto& [axis, coordinate] : segmentation_.extensions) {
            if (axis != slab.axis || !std::isfinite(coordinate)) continue;
            slab.coordinate = coordinate;
            (axis == Axis::X ? slab.center.x : axis == Axis::Y ? slab.center.y : slab.center.z) = coordinate;
          }
        }
      }
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
    abortCutPlaneDrag();  // the reference's setPlanes cancels a drag in progress
    planeHover_.reset();
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
  if (extensionPlanesShown()) {
    // Erasing an extension plane removes the boundary from the plan as well as the slab. The reference's Eraser only removes the visual
    // plane and leaves the engine's boundary behind (a plane that is gone but still cuts); native keeps the two together (D-110).
    if (segmentation_.phase == QLatin1String("executing")) return false;
    for (const auto& e : segmentation_.extensions) {
      if (canonicalFaceForAxis(e.first) != *face) continue;
      setEraserHover(std::nullopt);
      removeSegmentationExtension(QString::fromLatin1(e.first == Axis::X ? "x" : e.first == Axis::Y ? "y" : "z"));
      setStatus(QStringLiteral("Removed the %1 extension plane.").arg(faceName));
      return true;
    }
    return false;
  }
  CutFaceState& state = cutFaces_[static_cast<std::size_t>(*face)];
  if (!state.enabled) return false;

  setEraserHover(std::nullopt);
  pushHistory();
  state = {};  // the plane is gone, with its position: choosing the face again starts from the face's own default
  invalidateMoldInputs();  // the mold built with it is dropped; sprue intents survive, as in the reference
  setStatus(QStringLiteral("Removed the %1 cutting plane.").arg(faceName));
  return true;
}

// --- dragging a plane (right button) --------------------------------------------------------------------------------------
//
// cuttingPlane3dRuntime.ts: a secondary-button press on a plane starts the drag (not under the Eraser); the plane is red while it
// is dragged and follows the pointer along its axis; the orbit/pan controls are off meanwhile. Releasing it commits the clamped
// position through the split-face store's commitPlaneDrag (one undo step, the mold built with the old position dropped, nothing
// at all when it is where it was); releasing it without having moved 4 px cancels. The geometry is core/mold/CuttingPlaneDrag.

void AppController::setPlaneHover(std::optional<FaceId> face) {
  if (face == planeHover_) return;
  if (planeHover_) cutPlaneSlabs_.setVisual(cutPlaneSlabs_.rowOf(*planeHover_), CutPlaneVisual::Idle);
  planeHover_ = face;
  if (planeHover_) cutPlaneSlabs_.setVisual(cutPlaneSlabs_.rowOf(*planeHover_), cutPlaneDrag_ ? CutPlaneVisual::Dragging : CutPlaneVisual::Hover);
  emit cutPlanesChanged();
}

bool AppController::cutPlaneHoverAt(qreal x, qreal y, qreal w, qreal h) {
  if (cutPlaneDrag_) return planeHover_.has_value();
  if (tool_ == QLatin1String("eraser") || cutSlabs_.empty()) {
    setPlaneHover(std::nullopt);
    return false;
  }
  camera_.setViewportSize(w, h);
  const auto pick = pickPlaneSlab(camera_.pose().rayThroughPixel(x, y, w, h), cutSlabs_);
  setPlaneHover(pick ? std::optional<FaceId>(cutSlabs_[static_cast<std::size_t>(pick->slab)].face) : std::nullopt);
  return pick.has_value();
}

void AppController::cutPlaneLeave() {
  if (!cutPlaneDrag_) setPlaneHover(std::nullopt);
}

bool AppController::cutPlaneDragBegin(qreal x, qreal y, qreal w, qreal h) {
  if (cutPlaneDrag_ || tool_ == QLatin1String("eraser") || cutSlabs_.empty() || !cutPlanesVisible()) return false;
  if (extensionPlanesShown() && segmentation_.phase == QLatin1String("executing")) return false;   // the plan is being cut: nothing to move
  if (!partBoxBounds()) return false;
  camera_.setViewportSize(w, h);
  const Ray ray = camera_.pose().rayThroughPixel(x, y, w, h);
  const auto pick = pickPlaneSlab(ray, cutSlabs_);
  if (!pick) return false;
  const PlaneSlab& slab = cutSlabs_[static_cast<std::size_t>(pick->slab)];
  // The camera's up vector is the world's: this camera is Z-up.
  const auto drag = beginCutPlaneDrag(slab, ray, camera_.pose().basis().forward, Vec3{0, 0, 1}, x, y);
  if (!drag) return false;
  setPlaneHover(std::nullopt);  // the plane under the pointer is the dragged one: it takes the dragging look below
  cutPlaneDrag_ = *drag;
  planeHover_ = drag->face;
  cutPlaneSlabs_.setVisual(cutPlaneSlabs_.rowOf(drag->face), CutPlaneVisual::Dragging);
  emit cutPlanesChanged();
  return true;
}

void AppController::cutPlaneDragTo(qreal x, qreal y, qreal w, qreal h) {
  if (!cutPlaneDrag_) return;
  const auto k1 = partBoxBounds();
  if (!k1) return;
  camera_.setViewportSize(w, h);
  if (updateCutPlaneDrag(*cutPlaneDrag_, camera_.pose().rayThroughPixel(x, y, w, h), x, y, *k1))
    cutPlaneSlabs_.setCoordinate(cutPlaneSlabs_.rowOf(cutPlaneDrag_->face), static_cast<int>(cutPlaneDrag_->axis), cutPlaneDrag_->coordinate);
}

void AppController::abortCutPlaneDrag() {
  if (!cutPlaneDrag_) return;
  const CutPlaneDrag drag = *cutPlaneDrag_;
  cutPlaneDrag_.reset();
  const int row = cutPlaneSlabs_.rowOf(drag.face);
  cutPlaneSlabs_.setCoordinate(row, static_cast<int>(drag.axis), drag.startCoordinate);
  cutPlaneSlabs_.setVisual(row, CutPlaneVisual::Idle);
  emit cutPlanesChanged();
}

void AppController::cutPlaneDragCancel() { abortCutPlaneDrag(); }

bool AppController::cutPlaneDragEnd() {
  if (!cutPlaneDrag_) return false;
  const CutPlaneDrag drag = *cutPlaneDrag_;
  const auto k1 = partBoxBounds();
  const CutPlaneDragEnd end = k1 ? finishCutPlaneDrag(drag, *k1) : CutPlaneDragEnd{};
  if (!end.commit) {  // never moved: the plane is where it was
    abortCutPlaneDrag();
    return false;
  }
  cutPlaneDrag_.reset();
  cutPlaneSlabs_.setVisual(cutPlaneSlabs_.rowOf(drag.face), CutPlaneVisual::Idle);  // the hover stays: the pointer is still over it
  if (extensionPlanesShown()) {
    // moveSegmentationExtensionAxis: the clamped position becomes the boundary's coordinate (never rejected on validity; the plan's own
    // validation reports a bad one). One undo step, nothing at all when it is where it was.
    for (const auto& e : segmentation_.extensions) {
      if (e.first != drag.axis) continue;
      const double current = worldToNormalizedPosition(*k1, e.first, e.second);
      const auto next = commitCutPlanePosition(*k1, e.first, current, end.normalized);
      emit cutPlanesChanged();
      if (!next) return false;
      moveSegmentationExtension(QString::fromLatin1(e.first == Axis::X ? "x" : e.first == Axis::Y ? "y" : "z"),
                                normalizedToWorldCoordinate(*k1, e.first, *next));
      return true;
    }
    emit cutPlanesChanged();
    return false;
  }
  CutFaceState& state = cutFaces_[static_cast<std::size_t>(drag.face)];
  const double current = createCuttingPlane(drag.face, state.position).normalizedPosition;
  const auto next = state.enabled ? commitCutPlanePosition(*k1, drag.axis, current, end.normalized) : std::nullopt;
  emit cutPlanesChanged();
  if (!next) return false;  // back where it was (within 1e-9): no undo step, the mold is kept
  pushHistory();
  state.position = *next;
  invalidateMoldInputs();  // the mold built with the old position is dropped; the slab is rebuilt there
  return true;
}

}  // namespace craft::app
