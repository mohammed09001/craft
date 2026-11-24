// The Constructed Cutting Plan session (the reference's cuttingWorkflow.store.ts and CuttingSessionPanel.tsx).
//
// In the reference the cut faces and the segmentation are edited inside a temporary session: opening it remembers the cut faces, Cancel brings them
// back, Done commits the tab that is open (Cutting by Face keeps the planes and goes on to the parts; Segmentation executes the accepted plan and
// replaces the mold with its sections). Here the same two controls (the faces in the inspector or on the box, and the segmentation section) edit their
// state at once, so the session is a transaction over them: a snapshot on open, a rollback on Cancel, and Done that either just ends the session or starts
// the segmentation and ends the session when it has worked. While it is open the tools that would change what it edits (Flip, Mold Scale) and the jobs
// that would build on it (the mold, Master Mold) are refused, as in the reference.

#include "AppController.h"

namespace craft::app {

namespace {
// The printer volume the inspector shows until the user changes it (the same fallbacks as its fields): used when the Segmentation tab is opened first.
constexpr double kDefaultPrinterX = 220, kDefaultPrinterY = 220, kDefaultPrinterZ = 250;
}  // namespace

QVariantMap AppController::cuttingSession() const {
  return {{"open", cuttingSession_.open},
          {"tab", cuttingSession_.tab},
          {"committing", cuttingSession_.committing},
          {"blockedReason", cuttingSession_.blockedReason}};
}

bool AppController::openCuttingSession() {
  if (cuttingSession_.open) return true;
  if (!model_ || modelPhase_ != QLatin1String("ready")) {
    setStatus(QStringLiteral("Import a model before cutting it."));
    return false;
  }
  if (busy_ || spruePhase_ == QLatin1String("evaluating") || moldPhase_ == QLatin1String("generating") || segmentation_.phase == QLatin1String("executing")) {
    setStatus(QStringLiteral("Wait for the current job to finish before starting a cutting session."));
    return false;
  }
  // The reference's "reopen blocked" rule, in this application's terms: sections that were cut replace the mold and are not a plan any more.
  if (segmentation_.adopted) {
    setStatus(QStringLiteral("The mold was cut into sections: reset the segmentation to plan the cuts again."));
    return false;
  }
  cuttingSession_ = CuttingSession{};
  cuttingSession_.open = true;
  cuttingSession_.before = captureHistory();
  cuttingSession_.undoAtOpen = undoStack_;
  cuttingSession_.redoAtOpen = redoStack_;
  cuttingSession_.segmentationWasIdle = segmentation_.phase == QLatin1String("idle");
  if (tool_ != QLatin1String("select")) setTool(QStringLiteral("select"));   // a session starts with the pointer, as the reference resets its tool
  setStatus(QStringLiteral("Cutting session open: choose faces to cut by, or open the Segmentation tab. Done keeps the changes, Cancel puts everything back."));
  emit cuttingSessionChanged();
  return true;
}

void AppController::setCuttingSessionTab(const QString& tab) {
  if (!cuttingSession_.open || cuttingSession_.committing) return;
  if (tab != QLatin1String("cutByFace") && tab != QLatin1String("segmentation")) return;
  if (tab == cuttingSession_.tab) return;
  cuttingSession_.blockedReason.clear();
  cuttingSession_.tab = tab;
  if (tool_ != QLatin1String("select")) setTool(QStringLiteral("select"));
  if (tab == QLatin1String("segmentation") && (segmentation_.phase == QLatin1String("idle") || segmentation_.phase == QLatin1String("failed") ||
                                              segmentation_.phase == QLatin1String("not-required"))) {
    // The reference plans as the tab opens (requestPlan). The printer volume is the inspector's, or its default when the user never set one.
    if (!printerVolume_) setPrinterVolume(kDefaultPrinterX, kDefaultPrinterY, kDefaultPrinterZ);
    planSegmentation();
    if (segmentation_.phase != QLatin1String("planned")) cuttingSession_.blockedReason = segmentation_.message;
  }
  emit cuttingSessionChanged();
}

void AppController::commitCuttingSession() {
  if (!cuttingSession_.open || cuttingSession_.committing) return;
  cuttingSession_.blockedReason.clear();
  if (cuttingSession_.tab == QLatin1String("cutByFace")) {
    int planes = 0;
    for (const CutFaceState& face : cutFaces_) planes += face.enabled ? 1 : 0;
    if (planes == 0) {   // the reference's Done is disabled with no plane
      cuttingSession_.blockedReason = QStringLiteral("Choose at least one face to cut by, or Cancel.");
      emit cuttingSessionChanged();
      return;
    }
    closeCuttingSession();
    setStatus(planes == 1 ? QStringLiteral("Cutting plan set: 1 plane.") : QStringLiteral("Cutting plan set: %1 planes.").arg(planes));
    return;
  }
  // Segmentation: only a plan that is valid can be cut.
  if (segmentation_.phase != QLatin1String("planned") || !segmentation_.plan || segmentation_.plan->validation.status != "planning-valid") {
    cuttingSession_.blockedReason = segmentation_.phase == QLatin1String("planned")
                                        ? QStringLiteral("The current extension plane position is invalid -- move it to a valid location before committing.")
                                        : (segmentation_.message.isEmpty() ? QStringLiteral("There is no segmentation plan to cut.") : segmentation_.message);
    emit cuttingSessionChanged();
    return;
  }
  cuttingSession_.committing = true;
  emit cuttingSessionChanged();
  executeSegmentation();                  // finishCuttingSessionCommit() hears how it ended
  if (cuttingSession_.committing && segmentation_.phase != QLatin1String("executing")) finishCuttingSessionCommit();   // refused to start
}

void AppController::finishCuttingSessionCommit() {
  if (!cuttingSession_.open || !cuttingSession_.committing) return;
  if (segmentation_.phase == QLatin1String("executed")) {
    closeCuttingSession();
    return;
  }
  cuttingSession_.committing = false;   // it did not work: the session stays open with the reason
  cuttingSession_.blockedReason = segmentation_.message.isEmpty() ? QStringLiteral("The segmentation could not be cut.") : segmentation_.message;
  emit cuttingSessionChanged();
}

void AppController::cancelCuttingSession() {
  if (!cuttingSession_.open || cuttingSession_.committing) return;   // the cuts under way are cancelled with the job's own Cancel
  if (cuttingSession_.before) {
    HistoryEntry before = std::move(*cuttingSession_.before);
    std::deque<HistoryEntry> undoAtOpen = std::move(cuttingSession_.undoAtOpen), redoAtOpen = std::move(cuttingSession_.redoAtOpen);
    const bool dropPlan = cuttingSession_.segmentationWasIdle;
    closeCuttingSession();
    restoreHistory(before);               // the cut faces, the extensions, the mold and everything else the history holds
    undoStack_ = std::move(undoAtOpen);   // and the session leaves no steps behind
    redoStack_ = std::move(redoAtOpen);
    emit historyChanged();
    if (dropPlan && segmentation_.phase != QLatin1String("idle")) invalidateSegmentation(QString());   // a plan the session made goes with it
  } else {
    closeCuttingSession();
  }
  setStatus(QStringLiteral("Cutting session cancelled: the cuts are as they were."));
}

void AppController::closeCuttingSession() {
  cuttingSession_ = CuttingSession{};
  emit cuttingSessionChanged();
}

}  // namespace craft::app
