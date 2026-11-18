// Project save/load in the application controller: capturing the document from the
// live state, async save/open jobs, restoring inputs, dirty tracking, autosave and
// crash recovery. The format itself lives in io/project (ProjectFile.h); the
// document model in core/project (ProjectDocument.h).
//
// What is saved is what the user decided (see ProjectDocument.h). Derived stages --
// the mold, segmentation pieces -- are rebuilt on open from those inputs, because
// the pipelines are deterministic; Master Mold sets and analysis reports are not
// rebuilt automatically (they are expensive and on demand).

#include <QDateTime>
#include <QDir>
#include <QDirIterator>
#include <QFileInfo>
#include <QLoggingCategory>
#include <QSaveFile>
#include <QUuid>

#include <algorithm>
#include <cmath>

#include "AppController.h"
#include "AppPaths.h"
#include "mold/ReferenceMold.h"
#include "project/ProjectFile.h"

Q_DECLARE_LOGGING_CATEGORY(lcApp)

namespace craft::app {

namespace {

QString nowIso() { return QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs); }

QString axisKey(Axis axis) { return axis == Axis::X ? QStringLiteral("x") : axis == Axis::Y ? QStringLiteral("y") : QStringLiteral("z"); }

project::Vec3 toVec(const Point3& p) { return {p.x, p.y, p.z}; }
Point3 toPoint(const project::Vec3& v) { return {v.x, v.y, v.z}; }

std::optional<project::SprueScalarRecord> scalarRecord(const std::optional<SprueScalarDesign>& d) {
  if (!d) return std::nullopt;
  return project::SprueScalarRecord{d->valueMm, d->unconstrainedValueMm, sprueDesignSourceName(d->source)};
}

std::optional<SprueScalarDesign> scalarDesign(const std::optional<project::SprueScalarRecord>& r) {
  if (!r) return std::nullopt;
  SprueScalarDesign d;
  d.valueMm = r->valueMm;
  d.unconstrainedValueMm = r->unconstrainedValueMm;
  d.source = r->source == "minimum-limit" ? SprueDesignSource::MinimumLimit : r->source == "maximum-limit" ? SprueDesignSource::MaximumLimit : SprueDesignSource::Equation;
  return d;
}

project::SprueRecord toRecord(const SprueOperationDefinition& s) {
  project::SprueRecord r;
  r.operationId = s.operationId;
  r.creationOrder = s.creationOrder;
  r.position = toVec(s.position);
  r.inwardDirection = toVec(s.inwardDirection);
  r.mainDiameterMm = s.profileDesign.profile.mainDiameterMm;
  r.entryNeckDiameterMm = s.profileDesign.profile.entryNeckDiameterMm;
  r.entryNeckLengthMm = s.profileDesign.profile.entryNeckLengthMm;
  r.designSource = s.profileDesign.source;
  r.mainSection = scalarRecord(s.profileDesign.mainSection);
  r.entryNeck = scalarRecord(s.profileDesign.entryNeckDiameter);
  r.entryNeckLength = scalarRecord(s.profileDesign.entryNeckLength);
  r.designWarnings = s.profileDesign.warnings;
  r.validationStatus = s.validation.status;
  r.validationReasonCode = s.validation.reasonCode;
  r.validationMessage = s.validation.message;
  return r;
}

SprueOperationDefinition fromRecord(const project::SprueRecord& r) {
  SprueOperationDefinition s;
  s.operationId = r.operationId;
  s.creationOrder = r.creationOrder;
  s.position = toPoint(r.position);
  s.inwardDirection = toPoint(r.inwardDirection);
  s.profileDesign.profile = {r.mainDiameterMm, r.entryNeckDiameterMm, r.entryNeckLengthMm};
  s.profileDesign.source = r.designSource;
  s.profileDesign.mainSection = scalarDesign(r.mainSection);
  s.profileDesign.entryNeckDiameter = scalarDesign(r.entryNeck);
  s.profileDesign.entryNeckLength = scalarDesign(r.entryNeckLength);
  s.profileDesign.warnings = r.designWarnings;
  // Whatever the saved validation said, the next evaluation decides again against the regenerated mold.
  s.validation = {"pending", {}, {}};
  return s;
}

/// Encodes the source triangles as the project's canonical binary STL and fills the model record's size and hash.
QByteArray embedModel(project::Document& document, const TriangleSoup& soup) {
  const std::vector<std::uint8_t> encoded = stl::encodeBinary(soup);
  QByteArray bytes(reinterpret_cast<const char*>(encoded.data()), static_cast<qsizetype>(encoded.size()));
  document.model->storage = "embedded";
  document.model->assetId = "model";
  document.model->sizeBytes = static_cast<std::uint64_t>(bytes.size());
  document.model->sha256 = project::sha256Hex(bytes);
  return bytes;
}

/// The Python analysis reads models from disk: an embedded model is materialized once per content hash.
QString materializeModel(const QByteArray& bytes, const std::string& sha256) {
  const QString path = QDir(AppPaths::modelCacheDirectory()).filePath(QString::fromStdString(sha256) + QStringLiteral(".stl"));
  if (QFileInfo(path).size() == bytes.size()) return path;
  QSaveFile file(path);
  if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() || !file.commit()) return {};
  return path;
}

}  // namespace

// --- document capture -----------------------------------------------------------------------------------------------------

project::Document AppController::captureDocument(bool forFingerprint) const {
  project::Document d;
  d.projectId = projectId_;
  d.createdAt = projectCreatedAt_;
  d.modifiedAt = nowIso().toStdString();
  d.appVersion = applicationVersion().toStdString();
  if (model_) {
    project::ModelReference m;
    m.fileName = model_->fileName.toStdString();
    m.storage = "embedded";
    m.assetId = "model";
    m.triangleCount = model_->sourceSoup->triangleCount();
    m.sourceEncoding = model_->encoding.toStdString();
    m.geometryVersion = model_->geometryVersion;
    // The content hash is computed by the save job (it hashes the encoded bytes); the dirty check only needs identity.
    if (forFingerprint) m.sha256 = model_->geometryVersion;
    d.model = m;
  }
  d.mold.moldClearanceMm = moldClearanceMm_;
  d.mold.cavityClearanceMm = cavityClearanceMm_;
  for (FaceId face : kFaceIds) {
    const CutFaceState& s = cutFaces_[static_cast<std::size_t>(face)];
    d.mold.cutFaces.push_back({faceIdName(face), s.enabled, s.position});
  }
  for (const SprueOperationDefinition& s : sprueIntents_) d.sprues.push_back(toRecord(s));
  d.nextSprueNumber = nextSprueNumber_;
  if (printerVolume_) d.segmentation.printerVolumeMm = toVec(*printerVolume_);
  for (const auto& e : segmentation_.extensions) d.segmentation.extensions.emplace_back(axisKey(e.first).toStdString(), e.second);
  d.view.theme = theme_.toStdString();
  d.view.showGrid = showGrid_;
  d.view.showAxes = showAxes_;
  d.view.showEdges = showEdges_;
  d.view.moldOpacity = moldOpacity_;
  const Vec3 eye = camera_.pose().position(), target = camera_.pose().target();
  d.view.camera = project::CameraPose{{eye.x, eye.y, eye.z}, {target.x, target.y, target.z}};
  d.workflow.segmentationPlanned = segmentation_.basePlan.has_value() || segmentation_.adopted;
  d.workflow.segmentationExecuted = segmentation_.adopted;
  d.workflow.moldGenerated = moldPhase_ == QLatin1String("complete") && !segmentation_.adopted;
  return d;
}

// --- state for the UI --------------------------------------------------------------------------------------------------------

QVariantMap AppController::project() const {
  QString name = projectPath_.isEmpty() ? (model_ ? QFileInfo(model_->fileName).completeBaseName() : QStringLiteral("Untitled"))
                                        : QFileInfo(projectPath_).completeBaseName();
  if (name.isEmpty()) name = QStringLiteral("Untitled");
  return {{"name", name},
          {"path", projectPath_},
          {"hasPath", !projectPath_.isEmpty()},
          {"hasModel", model_.has_value()},
          {"dirty", projectDirty_},
          {"saving", projectSaving_},
          {"opening", projectOpening_},
          {"title", name + (projectDirty_ ? QStringLiteral(" *") : QString())},
          {"recoveredFrom", projectRecoveredFrom_},
          {"lastSavedAt", projectLastSavedAt_},
          {"lastAutosaveAt", lastAutosaveAt_},
          {"projectId", QString::fromStdString(projectId_)}};
}

// --- dirty tracking ---------------------------------------------------------------------------------------------------------

void AppController::initProject() {
  startNewProject();
  dirtyTimer_.setSingleShot(true);
  dirtyTimer_.setInterval(200);
  connect(&dirtyTimer_, &QTimer::timeout, this, [this] { refreshDirty(); });
  autosaveTimer_.setInterval(60 * 1000);
  connect(&autosaveTimer_, &QTimer::timeout, this, [this] { autosaveNow(); });
  autosaveTimer_.start();
  for (const auto signal : {&AppController::modelChanged, &AppController::moldInputsChanged, &AppController::spruesChanged, &AppController::segmentationChanged,
                            &AppController::viewOptionsChanged})
    connect(this, signal, this, [this] { scheduleDirtyCheck(); });
  refreshRecovery();
}

void AppController::setAutosaveIntervalMs(int ms) {
  autosaveTimer_.setInterval(std::max(50, ms));
  autosaveTimer_.start();
}

void AppController::scheduleDirtyCheck() { dirtyTimer_.start(); }

void AppController::refreshDirty() {
  bool dirty = false;
  if (model_) dirty = projectPath_.isEmpty() ? true : project::inputsFingerprint(captureDocument(true)) != baselineFingerprint_;
  if (dirty == projectDirty_) return;
  projectDirty_ = dirty;
  emit projectChanged();
}

void AppController::startNewProject() {
  projectPath_.clear();
  projectId_ = QUuid::createUuid().toString(QUuid::WithoutBraces).toStdString();
  projectCreatedAt_ = nowIso().toStdString();
  baselineFingerprint_.clear();
  projectLastSavedAt_.clear();
  projectRecoveredFrom_.clear();
  projectDirty_ = false;
  emit projectChanged();
}

void AppController::adoptProjectIdentity(const QString& path, const project::Document& document, const QString& recoveredFrom) {
  projectPath_ = path;
  projectId_ = document.projectId;
  projectCreatedAt_ = document.createdAt;
  projectRecoveredFrom_ = recoveredFrom;
  projectLastSavedAt_ = path.isEmpty() ? QString() : QString::fromStdString(document.modifiedAt);
  baselineFingerprint_ = path.isEmpty() ? std::string() : project::inputsFingerprint(captureDocument(true));
  projectDirty_ = path.isEmpty();
  emit projectChanged();
}

QString AppController::autosavePathForCurrentProject() const {
  return QDir(AppPaths::autosaveDirectory()).filePath(QString::fromStdString(projectId_) + QStringLiteral(".craft"));
}

void AppController::removeAutosaveFile() {
  QFile::remove(autosavePathForCurrentProject());
  refreshRecovery();
}

// --- save -----------------------------------------------------------------------------------------------------------------------

void AppController::saveProject() {
  if (!model_) {
    emit errorOccurred(QStringLiteral("Save project"), QStringLiteral("There is nothing to save: import a model first."), QStringLiteral("no_model"));
    return;
  }
  if (projectPath_.isEmpty()) {
    emit saveAsRequested();
    return;
  }
  saveProjectToFile(projectPath_);
}

void AppController::saveProjectAs(const QUrl& fileUrl) {
  QString path = fileUrl.toLocalFile();
  if (path.isEmpty()) return;
  if (QFileInfo(path).suffix().isEmpty()) path += QStringLiteral(".craft");
  saveProjectToFile(path);
}

void AppController::saveProjectToFile(const QString& path) {
  if (!model_) {
    emit errorOccurred(QStringLiteral("Save project"), QStringLiteral("There is nothing to save: import a model first."), QStringLiteral("no_model"));
    return;
  }
  if (projectSaving_ || projectOpening_) {
    setStatus(QStringLiteral("Wait for the current project operation to finish."));
    return;
  }
  projectSaving_ = true;
  emit projectChanged();
  setStatus(QStringLiteral("Saving %1…").arg(QFileInfo(path).fileName()));

  project::Document document = captureDocument(false);
  const std::string fingerprint = project::inputsFingerprint(captureDocument(true));
  const auto soup = model_->sourceSoup;
  const std::string projectId = projectId_;
  struct Saved {
    QString path;
    std::string fingerprint;
    QString savedAt;
  };
  runJob<Saved>(
      this, CancellationToken(),
      [path, document, fingerprint, soup](const CancellationToken&, const ProgressCallback&) mutable {
        const QByteArray bytes = embedModel(document, *soup);
        try {
          project::writeProject(path, document, bytes);
        } catch (const project::ProjectIoError& error) {
          throw CodedError(error.code(), error.what());
        }
        return Saved{path, fingerprint, QString::fromStdString(document.modifiedAt)};
      },
      [this, projectId](JobOutcome<Saved> outcome) {
        projectSaving_ = false;
        if (outcome.state == JobState::Succeeded && outcome.result) {
          if (projectId == projectId_) {  // the document may have been replaced while the save ran
            projectPath_ = outcome.result->path;
            baselineFingerprint_ = outcome.result->fingerprint;
            projectLastSavedAt_ = outcome.result->savedAt;
            projectRecoveredFrom_.clear();
            removeAutosaveFile();
            refreshDirty();
          }
          setStatus(QStringLiteral("Saved %1").arg(QFileInfo(outcome.result->path).fileName()));
          emit projectChanged();
          return;
        }
        emit projectChanged();
        setStatus(QStringLiteral("Saving the project failed: %1").arg(outcome.errorMessage));
        emit errorOccurred(QStringLiteral("Save failed"), outcome.errorMessage, outcome.errorCode);
      });
}

// --- autosave and recovery ------------------------------------------------------------------------------------------------

void AppController::autosaveNow() {
  if (!model_ || !projectDirty_ || autosaving_ || projectSaving_ || projectOpening_) return;
  autosaving_ = true;
  project::Document document = captureDocument(false);
  document.autosaveOriginalPath = projectPath_.toStdString();
  const auto soup = model_->sourceSoup;
  const QString path = autosavePathForCurrentProject();
  runJob<QString>(
      this, CancellationToken(),
      [path, document, soup](const CancellationToken&, const ProgressCallback&) mutable {
        const QByteArray bytes = embedModel(document, *soup);
        try {
          project::WriteOptions options;
          options.keepBackup = false;  // an autosave is itself the safety net
          project::writeProject(path, document, bytes, options);
        } catch (const project::ProjectIoError& error) {
          throw CodedError(error.code(), error.what());
        }
        return QString::fromStdString(document.modifiedAt);
      },
      [this](JobOutcome<QString> outcome) {
        autosaving_ = false;
        if (outcome.state == JobState::Succeeded && outcome.result) {
          lastAutosaveAt_ = *outcome.result;
          refreshRecovery();
          emit projectChanged();
        } else {
          qCWarning(lcApp) << "Autosave failed:" << outcome.errorCode << outcome.errorMessage;
        }
      });
}

void AppController::refreshRecovery() {
  struct Item {
    QVariantMap map;
    std::string modifiedAt;
  };
  std::vector<Item> items;
  QDirIterator it(AppPaths::autosaveDirectory(), {QStringLiteral("*.craft")}, QDir::Files);
  while (it.hasNext()) {
    const QString path = it.next();
    // The autosave of the project that is open right now is not "recoverable work": it is the live document's safety net.
    if (QFileInfo(path).completeBaseName().toStdString() == projectId_ && model_) continue;
    try {
      const project::ProjectSummary s = project::inspectProject(path);
      items.push_back({{{"path", path},
                        {"name", QString::fromStdString(s.modelFileName)},
                        {"modifiedAt", QString::fromStdString(s.modifiedAt)},
                        {"originalPath", QString::fromStdString(s.autosaveOriginalPath.value_or(""))}},
                       s.modifiedAt});
    } catch (const project::ProjectIoError&) {
      qCWarning(lcApp) << "Ignoring an unreadable autosave file:" << path;
    }
  }
  std::sort(items.begin(), items.end(), [](const Item& a, const Item& b) { return a.modifiedAt > b.modifiedAt; });
  QVariantList list;
  for (const Item& item : items) list.append(item.map);
  const QVariantMap next{{"available", !list.isEmpty()}, {"items", list}};
  if (next == recovery_) return;
  recovery_ = next;
  emit recoveryChanged();
}

void AppController::recoverProject(const QString& autosavePath) {
  openProjectFile(autosavePath);
}

void AppController::discardRecovery() {
  for (const QVariant& item : recovery_.value("items").toList()) QFile::remove(item.toMap().value("path").toString());
  refreshRecovery();
}

// --- open -------------------------------------------------------------------------------------------------------------------------

void AppController::openProject(const QUrl& fileUrl) { openProjectFile(fileUrl.toLocalFile()); }

void AppController::openProjectRelinked(const QString& projectPath, const QUrl& modelUrl) { openProjectFile(projectPath, modelUrl.toLocalFile()); }

void AppController::openProjectFile(const QString& path, const QString& relinkedModelPath) {
  if (busy_ || projectSaving_ || projectOpening_) {
    setStatus(QStringLiteral("Wait for the current operation to finish before opening a project."));
    return;
  }
  const quint64 generation = ++importGeneration_;
  const quint64 requestId = ++nextImportRequestId_;
  projectOpening_ = true;
  emit projectChanged();
  setStatus(QStringLiteral("Opening %1…").arg(QFileInfo(path).fileName()));

  struct Opened {
    project::ProjectBundle bundle;
    std::optional<LoadedModel> model;
    std::vector<std::string> warnings;
  };
  runJob<Opened>(
      this, CancellationToken(),
      [path, relinkedModelPath, requestId](const CancellationToken&, const ProgressCallback&) {
        Opened opened;
        try {
          opened.bundle = project::readProject(path);
          const project::Document& doc = opened.bundle.document;
          if (!doc.model) throw CodedError("project_has_no_model", "The project contains no model, so there is nothing to open.");
          QByteArray bytes;
          QString sourcePath;
          if (doc.model->storage == "embedded") {
            bytes = opened.bundle.embeddedModelBytes;
            sourcePath = materializeModel(bytes, doc.model->sha256);
          } else {
            sourcePath = relinkedModelPath.isEmpty() ? QString::fromStdString(doc.model->linkedPath) : relinkedModelPath;
            bytes = project::loadLinkedModel(*doc.model, relinkedModelPath);
          }
          const auto read = stl::parse({reinterpret_cast<const std::uint8_t*>(bytes.constData()), static_cast<std::size_t>(bytes.size())});
          LoadedModel model = buildLoadedModel(read.soup, read.encoding, requestId, QString::fromStdString(doc.model->fileName), sourcePath, bytes.size());
          if (!doc.model->sourceEncoding.empty()) model.encoding = QString::fromStdString(doc.model->sourceEncoding);
          if (!doc.model->geometryVersion.empty() && doc.model->geometryVersion != model.geometryVersion)
            opened.warnings.push_back("The model's geometry fingerprint differs from the one saved in the project; results may differ from the saved session.");
          opened.model = std::move(model);
          opened.warnings.insert(opened.warnings.end(), opened.bundle.warnings.begin(), opened.bundle.warnings.end());
        } catch (const project::ProjectIoError& error) {
          throw CodedError(error.code(), error.what());
        }
        return opened;
      },
      [this, generation, path](JobOutcome<Opened> outcome) {
        projectOpening_ = false;
        if (generation != importGeneration_) {  // a newer import or open superseded this one
          emit projectChanged();
          return;
        }
        if (outcome.state != JobState::Succeeded || !outcome.result || !outcome.result->model) {
          emit projectChanged();
          setStatus(QStringLiteral("Opening the project failed: %1").arg(outcome.errorMessage));
          if (outcome.errorCode == QLatin1String("project_asset_missing") || outcome.errorCode == QLatin1String("project_asset_changed"))
            emit projectModelNeedsRelink(path, outcome.errorCode, outcome.errorMessage);
          emit errorOccurred(QStringLiteral("Open project failed"), outcome.errorMessage, outcome.errorCode);
          return;
        }
        Opened& opened = *outcome.result;
        const project::Document document = opened.bundle.document;
        const bool isAutosave = document.autosaveOriginalPath.has_value();
        applyModel(std::move(*opened.model));
        restoreProjectInputs(document);
        if (isAutosave) {
          // An autosave is unsaved work: it has no file of its own, and Save As suggests where it came from.
          adoptProjectIdentity(QString(), document, QString::fromStdString(*document.autosaveOriginalPath));
        } else {
          adoptProjectIdentity(path, document, QString());
        }
        refreshRecovery();
        if (!opened.warnings.empty()) setStatus(QString::fromStdString(opened.warnings.front()));
        else setStatus(QStringLiteral("Opened %1").arg(QFileInfo(path).fileName()));
      });
}

void AppController::restoreProjectInputs(const project::Document& d) {
  // Mold inputs. The setters apply the same clamping the UI does, so a hand-edited file cannot exceed the reference limits.
  setMoldClearanceMm(d.mold.moldClearanceMm);
  setCavityClearanceMm(d.mold.cavityClearanceMm);
  for (const project::CutFaceInput& f : d.mold.cutFaces) {
    if (const auto id = faceIdFromName(f.face)) cutFaces_[static_cast<std::size_t>(*id)] = {f.enabled, f.position};
  }
  invalidateMoldInputs();

  // Sprue intents: restored as intents; the regenerated mold evaluates them again.
  sprueIntents_.clear();
  for (const project::SprueRecord& r : d.sprues) sprueIntents_.push_back(fromRecord(r));
  nextSprueNumber_ = d.nextSprueNumber;
  emit spruesChanged();

  // Printer volume and the segmentation plan inputs.
  if (d.segmentation.printerVolumeMm) {
    const auto& v = *d.segmentation.printerVolumeMm;
    setPrinterVolume(v.x, v.y, v.z);
  }
  if ((d.workflow.segmentationPlanned || d.workflow.segmentationExecuted) && printerVolume_) {
    planSegmentation();
    for (const auto& [axis, coordinate] : d.segmentation.extensions) {
      addSegmentationExtension(QString::fromStdString(axis));
      moveSegmentationExtension(QString::fromStdString(axis), coordinate);
    }
  }

  // View.
  setTheme(QString::fromStdString(d.view.theme));
  setShowGrid(d.view.showGrid);
  setShowAxes(d.view.showAxes);
  setShowEdges(d.view.showEdges);
  setMoldOpacity(d.view.moldOpacity);
  if (d.view.camera) {
    const auto& c = *d.view.camera;
    camera_.setLookAt(QVector3D(c.position.x, c.position.y, c.position.z), QVector3D(c.target.x, c.target.y, c.target.z));
  }

  // Derived stages are rebuilt from the inputs above (deterministic), exactly the ones that existed when the project was saved.
  if (d.workflow.segmentationExecuted && segmentation_.plan && segmentation_.plan->validation.status == "planning-valid") {
    executeSegmentation();
  } else if (d.workflow.moldGenerated) {
    generateMold();
  }
}

}  // namespace craft::app
