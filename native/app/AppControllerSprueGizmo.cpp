// The Sprue resize gizmo in the application controller: the rings at each sprue opening, hover, press-drag-release to
// resize, double click to type a diameter, Escape to cancel, and the viewport cursors.
//
// Behaviour of the reference's sprueResizeRuntime.ts (interaction states idle / rim-hover / resizing / numeric-edit,
// the commit on release only when the diameter changed, hover hides the bodies the sprue cuts). The arithmetic,
// picking and presentation precedence live in core/mold/SprueGizmo and are compared with the real runtime by
// tst_sprue_gizmo_equivalence.

#include <QCursor>
#include <QPainter>
#include <QPainterPath>
#include <QPixmap>
#include <QQuickItem>

#include <algorithm>
#include <cstdio>

#include "AppController.h"

namespace craft::app {

namespace {

constexpr const char* kStateIdle = "idle";
constexpr const char* kStateRimHover = "rim-hover";
constexpr const char* kStateResizing = "resizing";
constexpr const char* kStateNumericEdit = "numeric-edit";

/// The reference's funnel cursor (an SVG path), drawn directly: a funnel outline with its hot spot at the rim.
QCursor funnelCursor() {
  QPixmap pixmap(28, 28);
  pixmap.fill(Qt::transparent);
  QPainter painter(&pixmap);
  painter.setRenderHint(QPainter::Antialiasing);
  QPainterPath path;  // M5 5h18l-7 9v8l-4 2V14L5 5Z
  path.moveTo(5, 5);
  path.lineTo(23, 5);
  path.lineTo(16, 14);
  path.lineTo(16, 22);
  path.lineTo(12, 24);
  path.lineTo(12, 14);
  path.closeSubpath();
  painter.setPen(QPen(QColor("#111827"), 1.5, Qt::SolidLine, Qt::FlatCap, Qt::RoundJoin));
  painter.setBrush(QColor("#f3f4f6"));
  painter.drawPath(path);
  painter.end();
  return QCursor(pixmap, 14, 7);
}

}  // namespace

// --- state ---------------------------------------------------------------------------------------------------------

const char* AppController::sprueGizmoState() const {
  if (gizmoDrag_) return kStateResizing;
  if (gizmoEditing_) return kStateNumericEdit;
  return gizmoHover_ >= 0 ? kStateRimHover : kStateIdle;
}

QVariantMap AppController::sprueGizmo() const {
  const bool dragging = gizmoDrag_.has_value();
  return {{"active", sprueGlass_},
          {"state", QString::fromLatin1(sprueGizmoState())},
          // ew-resize over a ring or while dragging, the funnel cursor otherwise (in the Sprue tool).
          {"cursor", (dragging || gizmoHover_ >= 0) ? QStringLiteral("resize") : QStringLiteral("funnel")},
          {"dragging", dragging},
          {"editing", gizmoEditing_},
          {"cancellable", dragging || gizmoEditing_},
          {"labelVisible", dragging},
          {"labelText", gizmoLabel_},
          {"labelWarns", gizmoLabelWarns_},
          {"editError", gizmoEditError_}};
}

void AppController::setGizmoHover(int index) {
  if (index == gizmoHover_) return;
  if (gizmoHover_ >= 0 && !(gizmoDrag_ && gizmoDrag_->handle == gizmoHover_)) sprueHandles_.setVisual(gizmoHover_, SprueHandleVisual::Idle);
  gizmoHover_ = index;
  if (gizmoHover_ >= 0) sprueHandles_.setVisual(gizmoHover_, gizmoDrag_ && gizmoDrag_->handle == gizmoHover_ ? SprueHandleVisual::Active : SprueHandleVisual::Hover);

  // Hovering a resolved ring hides the mold bodies the sprue cuts, so the ring behind them shows (restored on leave).
  QStringList hidden;
  if (gizmoHover_ >= 0) {
    for (const std::string& id : gizmoHandles_[static_cast<std::size_t>(gizmoHover_)].targetBodyIds) hidden << QString::fromStdString(id);
  }
  scene_.setGizmoHiddenBodies(hidden);
  emit sprueGizmoChanged();
}

void AppController::resetSprueGizmoInteraction() {
  const bool changed = gizmoDrag_ || gizmoEditing_ || gizmoHover_ >= 0;
  if (gizmoDrag_) {
    sprueHandles_.setGroupScale(gizmoDrag_->handle, 1);
    gizmoDrag_.reset();
  }
  gizmoEditing_ = false;
  gizmoEditError_.clear();
  gizmoLabel_.clear();
  if (gizmoHover_ >= 0) {
    sprueHandles_.setVisual(gizmoHover_, SprueHandleVisual::Idle);
    gizmoHover_ = -1;
  }
  scene_.setGizmoHiddenBodies({});
  if (changed) emit sprueGizmoChanged();
}

void AppController::refreshSprueGizmo() {
  if (!sprueGlass_) {  // the Sprue tool is not active on a complete mold: no rings
    if (!gizmoHandles_.empty() || gizmoHover_ >= 0 || gizmoDrag_ || gizmoEditing_) {
      resetSprueGizmoInteraction();
      gizmoHandles_.clear();
      gizmoSignature_.clear();
      sprueHandles_.clear();
      emit sprueGizmoChanged();
    }
    return;
  }
  const std::vector<SprueDefinition> none;
  const auto presentations = presentSprues(sprueIntents_, sprueEvaluation_ ? sprueEvaluation_->resolvedSprues : none);
  std::string signature;
  char buffer[256];
  for (const SpruePresentation& p : presentations) {
    std::snprintf(buffer, sizeof buffer, "%s|%s|%.9g,%.9g,%.9g|%.9g,%.9g,%.9g|%.9g,%.9g,%.9g|%.9g|", p.operationId.c_str(), p.status.c_str(), p.position.x, p.position.y,
                  p.position.z, p.inwardDirection.x, p.inwardDirection.y, p.inwardDirection.z, p.profile.mainDiameterMm, p.profile.entryNeckDiameterMm,
                  p.profile.entryNeckLengthMm, p.depthMm.value_or(-1));
    signature += buffer;
    if (p.targetBodyIds) for (const std::string& id : *p.targetBodyIds) signature += id + ",";
    signature += ";";
  }
  if (signature == gizmoSignature_ && (!gizmoHandles_.empty() || presentations.empty())) return;
  gizmoSignature_ = signature;

  // Like setSprues in the reference: a new definition ends any drag or numeric edit (and the preview proxy with it).
  resetSprueGizmoInteraction();
  gizmoHandles_ = buildSprueHandles(presentations);
  sprueHandles_.setHandles(gizmoHandles_);
  emit sprueGizmoChanged();
}

// --- pointer interaction -------------------------------------------------------------------------------------------

namespace {
std::optional<int> pickHandle(const viewport::ViewportCamera& camera, const std::vector<SprueHandle>& handles, qreal x, qreal y, qreal w, qreal h) {
  const auto pick = pickSprueHandle(camera.pose().rayThroughPixel(x, y, w, h), handles);
  if (!pick) return std::nullopt;
  return pick->handle;
}
}  // namespace

bool AppController::sprueGizmoHoverAt(qreal x, qreal y, qreal w, qreal h) {
  if (!sprueGlass_ || gizmoDrag_) return gizmoDrag_.has_value();
  if (gizmoEditing_) return true;  // while the editor is open the pointer is not for the preview either
  camera_.setViewportSize(w, h);
  const auto handle = pickHandle(camera_, gizmoHandles_, x, y, w, h);
  setGizmoHover(handle.value_or(-1));
  if (handle) clearSprueCandidate();  // no preview funnel under a ring
  return handle.has_value();
}

void AppController::sprueGizmoLeave() {
  if (!gizmoDrag_ && !gizmoEditing_) setGizmoHover(-1);
}

bool AppController::sprueGizmoPressAt(qreal x, qreal y, qreal w, qreal h) {
  if (!sprueGlass_ || gizmoEditing_ || gizmoDrag_) return false;
  camera_.setViewportSize(w, h);
  const auto handle = pickHandle(camera_, gizmoHandles_, x, y, w, h);
  if (!handle) return false;
  clearSprueCandidate();
  gizmoDrag_ = GizmoDrag{*handle, x, y, gizmoHandles_[static_cast<std::size_t>(*handle)].diameterMm(), gizmoHandles_[static_cast<std::size_t>(*handle)].diameterMm()};
  setGizmoHover(*handle);
  sprueHandles_.setVisual(*handle, SprueHandleVisual::Active);
  emit sprueGizmoChanged();
  return true;
}

void AppController::sprueGizmoDragTo(qreal x, qreal y, bool shiftHeld) {
  if (!gizmoDrag_) return;
  const SprueHandle& handle = gizmoHandles_[static_cast<std::size_t>(gizmoDrag_->handle)];
  const auto diameter = dragDiameter(handle, x - gizmoDrag_->startX, y - gizmoDrag_->startY, shiftHeld);
  if (!diameter) return;
  gizmoDrag_->preview = *diameter;
  sprueHandles_.setGroupScale(gizmoDrag_->handle, *diameter / handle.diameterMm());  // the ring follows the pointer
  sprueHandles_.setVisual(gizmoDrag_->handle, SprueHandleVisual::Active);
  gizmoLabel_ = QString::fromStdString(diameterLabel(*diameter));
  gizmoLabelWarns_ = diameterLabelWarns(handle, *diameter);
  emit sprueGizmoChanged();
}

void AppController::sprueGizmoRelease() {
  if (!gizmoDrag_) return;
  const GizmoDrag drag = *gizmoDrag_;
  gizmoDrag_.reset();
  gizmoLabel_.clear();
  const SprueHandle handle = gizmoHandles_[static_cast<std::size_t>(drag.handle)];
  sprueHandles_.setVisual(drag.handle, gizmoHover_ == drag.handle ? SprueHandleVisual::Hover : SprueHandleVisual::Idle);
  emit sprueGizmoChanged();
  // A release commits; the ring stays at the requested size until the new definition replaces it (or is rebuilt below
  // when the commit changes nothing).
  if (drag.preview == drag.original) {
    sprueHandles_.setGroupScale(drag.handle, 1);
    return;
  }
  commitSprueDiameter(handle, drag.preview);
}

void AppController::commitSprueDiameter(const SprueHandle& handle, double diameterMm) {
  const std::string before = gizmoSignature_;
  const QString id = QString::fromStdString(handle.operationId);
  if (handle.opening == SprueHandleOpening::Top) resizeSprue(id, diameterMm);
  else resizeSprueEntryNeck(id, diameterMm);
  refreshSprueGizmo();  // normally rebuilds the rings from the new (pending) definition
  if (gizmoSignature_ == before) {  // the commit changed nothing: drop the preview proxy
    for (int row = 0; row < static_cast<int>(gizmoHandles_.size()); ++row) sprueHandles_.setGroupScale(row, 1);
  }
}

bool AppController::sprueGizmoCancel() {
  if (gizmoDrag_) {
    const int row = gizmoDrag_->handle;
    gizmoDrag_.reset();
    gizmoLabel_.clear();
    sprueHandles_.setGroupScale(row, 1);
    sprueHandles_.setVisual(row, gizmoHover_ == row ? SprueHandleVisual::Hover : SprueHandleVisual::Idle);
    emit sprueGizmoChanged();
    return true;
  }
  if (gizmoEditing_) {
    sprueGizmoCloseEditor();
    return true;
  }
  return false;
}

QVariantMap AppController::sprueGizmoEditAt(qreal x, qreal y, qreal w, qreal h) {
  if (!sprueGlass_ || gizmoDrag_) return {};
  camera_.setViewportSize(w, h);
  const auto handle = pickHandle(camera_, gizmoHandles_, x, y, w, h);
  if (!handle) return {};
  const SprueHandle& target = gizmoHandles_[static_cast<std::size_t>(*handle)];
  clearSprueCandidate();
  gizmoEditing_ = true;
  gizmoEditHandle_ = target.id();
  gizmoEditError_.clear();
  char text[32];
  std::snprintf(text, sizeof text, "%.2f", target.diameterMm());
  emit sprueGizmoChanged();
  return {{"operationId", QString::fromStdString(target.operationId)},
          {"opening", target.opening == SprueHandleOpening::Top ? QStringLiteral("top") : QStringLiteral("bottom")},
          {"text", QString::fromLatin1(text)},
          {"min", kMinSprueDiameterMm},
          {"max", target.maximumDiameterMm()},
          {"step", kSprueDiameterSnapMm}};
}

bool AppController::sprueGizmoCommitEdit(const QString& text) {
  if (!gizmoEditing_) return false;
  const auto it = std::find_if(gizmoHandles_.begin(), gizmoHandles_.end(), [&](const SprueHandle& h) { return h.id() == gizmoEditHandle_; });
  if (it == gizmoHandles_.end()) {  // the sprue is gone (the mold changed under the editor)
    sprueGizmoCloseEditor();
    return false;
  }
  // The reference's input is a browser number field: anything that is not a number reads as 0 and clamps to the minimum.
  bool ok = false;
  double value = text.trimmed().toDouble(&ok);
  if (!ok) value = 0;
  const auto normalized = normalizeHandleDiameter(*it, value);
  if (!normalized) {
    gizmoEditError_ = QStringLiteral("Enter a finite diameter in millimeters.");
    emit sprueGizmoChanged();
    return false;
  }
  const SprueHandle handle = *it;
  sprueGizmoCloseEditor();
  commitSprueDiameter(handle, *normalized);
  return true;
}

void AppController::sprueGizmoCloseEditor() {
  if (!gizmoEditing_) return;
  gizmoEditing_ = false;
  gizmoEditError_.clear();
  gizmoEditHandle_.clear();
  emit sprueGizmoChanged();
}

// --- cursors --------------------------------------------------------------------------------------------------------

void AppController::applyViewportCursor(QObject* object, const QString& name) {
  auto* item = qobject_cast<QQuickItem*>(object);
  if (!item) return;
  if (name == QLatin1String("funnel")) item->setCursor(funnelCursor());
  else if (name == QLatin1String("resize")) item->setCursor(QCursor(Qt::SizeHorCursor));
  else if (name == QLatin1String("hand")) item->setCursor(QCursor(Qt::PointingHandCursor));
  else if (name == QLatin1String("cross")) item->setCursor(QCursor(Qt::CrossCursor));
  else item->unsetCursor();
}

}  // namespace craft::app
