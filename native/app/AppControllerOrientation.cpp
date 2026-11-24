// Part orientation: Flip and Auto orient (the reference's partOrientation.store and automatic orientation).
#include "AppController.h"


#include <array>


namespace craft::app {

namespace {

// The reference's wording (partOrientation.store.ts).
constexpr const char* kNoModelReason = "Import a valid model before changing its orientation.";
constexpr const char* kLockedReason =
    "Model orientation is locked after mold generation. Return to the pre-mold stage to change the model orientation.";
constexpr const char* kBusyReason = "Model orientation is unavailable while an engineering operation is active.";

}  // namespace

AppController::OrientationCapability AppController::orientationCapability() const {
  if (!model_ || modelPhase_ != QLatin1String("ready")) return {false, QString::fromLatin1(kNoModelReason)};
  // Geometry generated from the model (mold bodies, cavity, sprues, segmentation pieces) was built for this orientation.
  const bool generated = moldResult_.has_value() || !sprueIntents_.empty() || segmentation_.adopted;
  if (generated) return {false, QString::fromLatin1(kLockedReason)};
  const bool processActive = busy_ || masterRunning_ || moldPhase_ == QLatin1String("generating") || spruePhase_ == QLatin1String("evaluating") ||
                             segmentation_.phase == QLatin1String("executing");
  if (processActive) return {false, QString::fromLatin1(kBusyReason)};
  return {true, QString()};
}

QVariantMap AppController::orientationState() const {
  const Quaternion q = model_ ? model_->orientation : kIdentityOrientation;
  const OrientationCapability capability = orientationCapability();
  return {{"x", q.x},
          {"y", q.y},
          {"z", q.z},
          {"w", q.w},
          {"isIdentity", q == kIdentityOrientation},
          {"available", capability.available},
          {"reason", capability.reason}};
}

void AppController::refreshOrientation() {
  // A tool whose capability is gone falls back to Select (the reference's viewportTool.capabilities).
  if (tool_ == QLatin1String("orientation") && !orientationCapability().available) setTool(QStringLiteral("select"));
  emit orientationChanged();
}

bool AppController::flipPart(const QString& direction) {
  const auto parsed = parseFlipDirection(direction.toStdString());
  if (!parsed) {
    setStatus(QStringLiteral("Unknown flip direction: %1").arg(direction));
    return false;
  }
  if (const OrientationCapability c = orientationCapability(); !c.available) {
    setStatus(c.reason);
    return false;
  }
  const bool done = commitPartOrientation(composePartFlip(model_->orientation, *parsed), false);
  if (done) setStatus(QStringLiteral("Flipped the part (%1).").arg(direction));
  return done;
}

bool AppController::autoOrientPart() {
  if (const OrientationCapability c = orientationCapability(); !c.available) {
    setStatus(c.reason);
    return false;
  }
  // Candidates are scored on the model as imported (the reference scores its source geometry, not the current orientation).
  const auto best = automaticOrientation(*model_->sourceSoup);
  if (!best) {
    emit errorOccurred(QStringLiteral("Auto orient"), QStringLiteral("The model could not be oriented."), QStringLiteral("orientation_failed"));
    return false;
  }
  const bool done = commitPartOrientation(best->rotation, true);
  if (done) setStatus(QStringLiteral("Oriented automatically (%1).").arg(QString::fromStdString(best->id)));
  return done;
}

bool AppController::resetPartOrientation() {
  if (const OrientationCapability c = orientationCapability(); !c.available) {
    setStatus(c.reason);
    return false;
  }
  const bool done = commitPartOrientation(kIdentityOrientation, false);
  if (done) setStatus(QStringLiteral("Part orientation reset."));
  return done;
}

bool AppController::commitPartOrientation(const Quaternion& requested, bool frameCamera) {
  if (!orientationCapability().available) return false;
  const auto normalized = normalizeOrientation(requested);
  if (!normalized) return false;
  if (*normalized == model_->orientation) {
    if (frameCamera) camera_.fit();
    return true;  // already there: nothing to rebuild, no history, no reset
  }
  LoadedModel next;
  try {
    // The same model, the same source triangles: only the orientation differs. Cheap bookkeeping stays with the model.
    const LoadedModel& current = *model_;
    TriangleSoup source = *current.sourceSoup;
    next = buildLoadedModel(std::move(source), current.encoding == QLatin1String("ASCII") ? stl::Encoding::Ascii : stl::Encoding::Binary, 0,
                            current.fileName, current.sourcePath, current.fileSizeBytes, *normalized);
    next.modelId = current.modelId;
    next.encoding = current.encoding;
    next.loadMs = current.loadMs;
  } catch (const CodedError& error) {
    emit errorOccurred(QStringLiteral("Orientation"), QString::fromUtf8(error.what()), QString::fromStdString(error.code()));
    return false;
  }
  // The reference's clearForOrientationChange: the Cut by Face session (faces, planes, history) starts over; clearances stay.
  cutFaces_ = {};
  applyModel(std::move(next), frameCamera, false);
  invalidateMoldInputs();
  scheduleDirtyCheck();
  return true;
}

}  // namespace craft::app
