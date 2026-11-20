// Undo / redo in the application controller.
//
// Behaviour of the reference's split-face store history (snap, history(), undo, redo): a snapshot of what the user
// edited and what was built from it is pushed BEFORE each edit; undo restores the last snapshot and puts the current
// state on the redo stack, redo does the reverse; a new edit clears the redo stack; each stack keeps the last 50;
// undo/redo cancel a running mold generation or sprue evaluation first; an edit that changes nothing adds no entry; a
// gesture (a slider drag) is one entry. Undo restores the derived results (the mold, the sprue evaluation, the
// registration) as they were instead of recomputing them: the snapshots share the immutable results (Held). The steps
// are replayed against the real store by tst_app_workflow (undo-reference.json).
//
// In history: the cut faces and their positions, the mold and cavity clearance, the sprues, and the mold built from
// them. Not in history: the model, the view (camera, tool, theme, selection), segmentation (adopting or resetting one
// starts a fresh history, like the reference) and the Master Mold (its own store).

#include <algorithm>

#include "AppController.h"

namespace craft::app {

namespace {
constexpr std::size_t kMaxHistory = 50;  // the reference keeps the last 50 snapshots
}

AppController::HistoryEntry AppController::captureHistory() const {
  HistoryEntry entry;
  entry.cutFaces = cutFaces_;
  entry.moldClearanceMm = moldClearanceMm_;
  entry.cavityClearanceMm = cavityClearanceMm_;
  entry.cavityQuality = cavityQuality_;
  entry.sprueIntents = sprueIntents_;
  entry.nextSprueNumber = nextSprueNumber_;
  entry.moldResult = moldResult_;
  entry.sprueEvaluation = sprueEvaluation_;
  entry.registration = registration_;
  // A mold that is still being generated is not a state to come back to: its inputs, without the mold.
  entry.moldPhase = moldPhase_ == QLatin1String("generating") ? QStringLiteral("ready") : moldPhase_;
  entry.moldError = moldError_;
  entry.moldErrorCode = moldErrorCode_;
  return entry;
}

void AppController::pushHistoryEntry(HistoryEntry before) {
  if (historyPaused_) return;
  if (historyGestureActive_) {
    if (historyGesturePushed_) return;  // the rest of the gesture belongs to the entry it already made
    historyGesturePushed_ = true;
  }
  undoStack_.push_back(std::move(before));
  while (undoStack_.size() > kMaxHistory) undoStack_.pop_front();
  redoStack_.clear();  // a new edit ends the redo history
  emit historyChanged();
}

void AppController::beginHistoryGesture() {
  historyGestureActive_ = true;
  historyGesturePushed_ = false;
}

void AppController::endHistoryGesture() {
  historyGestureActive_ = false;
  historyGesturePushed_ = false;
}

void AppController::clearHistory() {
  if (undoStack_.empty() && redoStack_.empty()) return;
  undoStack_.clear();
  redoStack_.clear();
  emit historyChanged();
}

// The reference disables Undo/Redo while a sprue evaluation runs (generatingSprue); a running mold generation does not
// block them, undo cancels it.
bool AppController::canUndo() const { return !undoStack_.empty() && spruePhase_ != QLatin1String("evaluating"); }
bool AppController::canRedo() const { return !redoStack_.empty() && spruePhase_ != QLatin1String("evaluating"); }

QVariantMap AppController::history() const {
  return {{"canUndo", canUndo()},
          {"canRedo", canRedo()},
          {"undoDepth", static_cast<int>(undoStack_.size())},
          {"redoDepth", static_cast<int>(redoStack_.size())}};
}

void AppController::undo() {
  if (!canUndo()) return;
  HistoryEntry current = captureHistory();
  HistoryEntry target = std::move(undoStack_.back());
  undoStack_.pop_back();
  redoStack_.push_front(std::move(current));
  while (redoStack_.size() > kMaxHistory) redoStack_.pop_back();
  restoreHistory(target);
  setStatus(QStringLiteral("Undid the last change."));
  emit historyChanged();
}

void AppController::redo() {
  if (!canRedo()) return;
  HistoryEntry current = captureHistory();
  HistoryEntry target = std::move(redoStack_.front());
  redoStack_.pop_front();
  undoStack_.push_back(std::move(current));
  while (undoStack_.size() > kMaxHistory) undoStack_.pop_front();
  restoreHistory(target);
  setStatus(QStringLiteral("Redid the change."));
  emit historyChanged();
}

void AppController::restoreHistory(const HistoryEntry& entry) {
  // Like the reference, undo/redo first cancel whatever is running; jobs that finish later find their generation stale.
  ++moldGeneration_;
  ++sprueGeneration_;
  ++moldInputsRevision_;
  if (moldPhase_ == QStringLiteral("generating")) abandonMoldRun();
  if (activeCancel_) {
    activeCancel_->cancel();
    activeCancel_.reset();
  }
  setBusy(false);

  cutFaces_ = entry.cutFaces;
  moldClearanceMm_ = entry.moldClearanceMm;
  cavityClearanceMm_ = entry.cavityClearanceMm;
  cavityQuality_ = entry.cavityQuality;
  sprueIntents_ = entry.sprueIntents;
  nextSprueNumber_ = entry.nextSprueNumber;
  moldError_ = entry.moldError;
  moldErrorCode_ = entry.moldErrorCode;
  spruePhase_ = QStringLiteral("idle");

  // Take down what is shown, then put the snapshot's mold back as it was (no recomputation).
  sprueEvaluation_.reset();
  registration_.reset();
  moldResult_.reset();
  scene_.clearMoldBodies();
  masterShown_ = false;
  scene_.setPartOffset({0, 0, 0});
  if (entry.moldResult) {
    moldResult_ = entry.moldResult;
    sprueEvaluation_ = entry.sprueEvaluation;
    registration_ = entry.registration;
    const Point3 offset = moldResult_->definition.partOffset;
    scene_.setPartOffset({static_cast<float>(offset.x), static_cast<float>(offset.y), static_cast<float>(offset.z)});
    showFinalBodies(false);
    moldPhase_ = QStringLiteral("complete");
  } else {
    moldPhase_ = entry.moldPhase == QLatin1String("complete") ? QStringLiteral("ready") : entry.moldPhase;
    if (segmentation_.adopted) showSegmentationBodies();  // the keyed pieces stay visible without a mold
    else if (masterStore_.seedIdentity()) showMasterBodies();
  }
  emit moldChanged();
  emit spruesChanged();
  emit moldInputsChanged();  // the cut faces, clearances and sprue list changed: panels, planes, dirty flag follow
  refreshDirty();
}

}  // namespace craft::app
