#include "AppController.h"

#include <QCoreApplication>
#include <QDir>
#include <QElapsedTimer>
#include <QFileInfo>
#include <QJsonObject>
#include <QLoggingCategory>

#include <cmath>
#include <filesystem>

#include "AppPaths.h"
#include "AnalysisProtocol.h"
#include "geometry/MeshAnalysis.h"
#include "stl/Stl.h"

Q_LOGGING_CATEGORY(lcApp, "craft.app")

namespace craft::app {

namespace {

QVariantMap pointMap(const Point3& p) {
  return {{"x", p.x}, {"y", p.y}, {"z", p.z}};
}
QVariantMap boundsMap(const Bounds3& b) {
  const Point3 s = b.size();
  return {{"min", pointMap(b.min)}, {"max", pointMap(b.max)}, {"size", pointMap(s)}};
}
QVariantMap issueMap(const Issue& issue) {
  return {{"severity", issue.severity == IssueSeverity::Blocker ? "blocker" : "warning"},
          {"code", QString::fromStdString(issue.reasonCode)},
          {"message", QString::fromStdString(issue.message)}};
}

const std::vector<QColor>& darkPalette() {
  static const std::vector<QColor> p{QColor("#4f8cc9"), QColor("#c98a4f"), QColor("#6fb06f"),
                                     QColor("#b06fb0"), QColor("#c9c04f"), QColor("#4fc9b8")};
  return p;
}

}  // namespace

AppController::AppController(std::shared_ptr<IMeshGeometryEngine> engine,
                             analysis::WorkerConfig analysisConfig, QObject* parent)
    : QObject(parent),
      engine_(std::move(engine)),
      analysis_(analysisConfig),
      analysisConfig_(std::move(analysisConfig)) {
  camera_.setSceneBounds(std::nullopt);
  rebuildGrid();
  applySceneColors();
  connectAnalysis();
  connect(&scene_, &SceneModel::sceneChanged, this, [this] { refreshSceneFrame(false); });
}

AppController::~AppController() {
  if (activeCancel_) activeCancel_->cancel();
  analysis_.shutdown();
}

QString AppController::applicationVersion() const { return QCoreApplication::applicationVersion(); }
QString AppController::logFilePath() const { return AppPaths::logFilePath(); }
QString AppController::analysisRuntime() const { return AppPaths::analysisRuntimeSource(); }

// --- status / busy ---------------------------------------------------------

void AppController::setBusy(bool busy, const QString& stage, double progress) {
  busy_ = busy;
  busyStage_ = stage;
  busyProgress_ = progress;
  emit busyChanged();
}

void AppController::setStatus(const QString& text) {
  statusText_ = text;
  emit statusTextChanged();
}

void AppController::cancelCurrentJob() {
  if (activeCancel_) activeCancel_->cancel();
}

// --- import ----------------------------------------------------------------

QVariantMap AppController::modelInfo() const {
  if (!model_) return {};
  const LoadedModel& m = *model_;
  return {{"fileName", m.fileName},
          {"fileSizeBytes", m.fileSizeBytes},
          {"encoding", m.encoding},
          {"triangleCount", static_cast<qulonglong>(m.sourceSoup->triangleCount())},
          {"units", "millimeters (assumed; STL carries no unit information)"},
          {"sourceBounds", boundsMap(m.sourceBounds)},
          {"groundedBounds", boundsMap(m.groundedBounds)},
          {"geometryVersion", QString::fromStdString(m.geometryVersion)},
          {"loadMs", m.loadMs}};
}

void AppController::importStl(const QUrl& fileUrl) { importStlFile(fileUrl.toLocalFile()); }

void AppController::importStlFile(const QString& path) {
  const quint64 generation = ++importGeneration_;
  const quint64 requestId = ++nextImportRequestId_;
  modelPhase_ = QStringLiteral("loading");
  modelMessage_ = QFileInfo(path).fileName();
  emit modelChanged();
  setStatus(QStringLiteral("Loading %1…").arg(QFileInfo(path).fileName()));

  struct Loaded {
    LoadedModel model;
  };
  CancellationToken cancel;
  runJob<Loaded>(
      this, cancel,
      [path, requestId](const CancellationToken&, const ProgressCallback&) {
        QElapsedTimer timer;
        timer.start();
        const auto read = stl::readFile(std::filesystem::path(path.toStdWString()));
        const Bounds3 bounds = stl::validateDisplayable(read.soup);
        const auto grounding = calculateModelGroundingTransform(bounds);
        if (!grounding) throw CodedError("stl_invalid_geometry", "The STL file has an invalid bounding box.");

        LoadedModel m;
        const QFileInfo info(path);
        m.modelId = QStringLiteral("%1:%2:%3").arg(requestId).arg(info.fileName()).arg(info.size()).toStdString();
        m.sourcePath = path;
        m.fileName = info.fileName();
        m.fileSizeBytes = info.size();
        m.encoding = read.encoding == stl::Encoding::Ascii ? "ASCII" : "Binary";
        m.sourceBounds = bounds;
        m.groundingTranslation = grounding->translation;
        m.groundedBounds = grounding->groundedBounds;
        auto grounded = std::make_shared<TriangleSoup>(read.soup);
        for (std::size_t i = 0; i + 2 < grounded->positions.size(); i += 3) {
          grounded->positions[i] += static_cast<float>(grounding->translation.x);
          grounded->positions[i + 1] += static_cast<float>(grounding->translation.y);
          grounded->positions[i + 2] += static_cast<float>(grounding->translation.z);
        }
        m.sourceSoup = std::make_shared<TriangleSoup>(std::move(read.soup));
        m.groundedSoup = std::move(grounded);
        m.geometryVersion = partGeometryVersion(*m.groundedSoup);
        m.loadMs = timer.elapsed();
        return Loaded{std::move(m)};
      },
      [this, generation, path](JobOutcome<Loaded> outcome) {
        if (generation != importGeneration_) return;  // a newer import superseded this one
        if (outcome.state == JobState::Succeeded && outcome.result) {
          applyModel(std::move(outcome.result->model));
          return;
        }
        // Keep the previous model on failure, exactly like the reference viewport.
        modelPhase_ = model_ ? QStringLiteral("ready") : QStringLiteral("error");
        modelMessage_ = outcome.errorMessage;
        emit modelChanged();
        setStatus(outcome.errorMessage);
        emit errorOccurred(QStringLiteral("Import failed"), outcome.errorMessage, outcome.errorCode);
        qCWarning(lcApp) << "STL import failed:" << path << outcome.errorCode << outcome.errorMessage;
      });
}

void AppController::applyModel(LoadedModel model) {
  analysis_.cancel(analysisJobId_);
  analysisJobId_.clear();
  analysisPhase_ = QStringLiteral("idle");
  analysisReport_.clear();
  analysisError_.clear();
  emit analysisChanged();

  sprueIntents_.clear();
  nextSprueNumber_ = 1;
  sprueCandidate_.clear();
  clearMold(QStringLiteral("ready"));
  model_ = std::move(model);
  modelPhase_ = QStringLiteral("ready");
  modelMessage_ = model_->fileName;
  scene_.setPart(QString::fromStdString(model_->modelId), model_->fileName, model_->groundedSoup,
                 theme_ == "dark" ? QColor("#9fb4c7") : QColor("#5b7a99"));
  scene_.setPartOffset({0, 0, 0});
  grid_ = deriveAdaptiveGridConfig(model_->groundedBounds);
  rebuildGrid();
  clearSelection();
  refreshSceneFrame(true);
  emit modelChanged();
  emit moldInputsChanged();
  setStatus(QStringLiteral("Loaded %1: %2 triangles, %3 × %4 × %5 mm")
                .arg(model_->fileName)
                .arg(model_->sourceSoup->triangleCount())
                .arg(model_->groundedBounds.size().x, 0, 'f', 2)
                .arg(model_->groundedBounds.size().y, 0, 'f', 2)
                .arg(model_->groundedBounds.size().z, 0, 'f', 2));
}

// --- mold ------------------------------------------------------------------

void AppController::setMoldClearanceMm(double value) {
  const double clamped = clampReferenceMoldClearance(value);
  if (clamped == moldClearanceMm_) return;
  moldClearanceMm_ = clamped;
  invalidateMoldInputs();
}

void AppController::setCavityClearanceMm(double value) {
  const double clamped = std::isfinite(value) ? std::clamp(value, 0.0, maxCavityClearanceMm()) : 0.0;
  if (clamped == cavityClearanceMm_) return;
  cavityClearanceMm_ = clamped;
  invalidateMoldInputs();
}

QVariantList AppController::cutFaces() const {
  QVariantList list;
  for (FaceId face : kFaceIds) {
    const CutFaceState& s = cutFaces_[static_cast<std::size_t>(face)];
    const CuttingPlane plane = createCuttingPlane(face, s.position);
    list.push_back(QVariantMap{{"face", faceIdName(face)},
                               {"axis", axisName(plane.axis)},
                               {"enabled", s.enabled},
                               {"position", plane.normalizedPosition}});
  }
  return list;
}

void AppController::setCutFaceEnabled(const QString& face, bool enabled) {
  const auto id = faceIdFromName(face.toStdString());
  if (!id) return;
  cutFaces_[static_cast<std::size_t>(*id)].enabled = enabled;
  invalidateMoldInputs();
}

void AppController::setCutFacePosition(const QString& face, double normalizedPosition) {
  const auto id = faceIdFromName(face.toStdString());
  if (!id || !std::isfinite(normalizedPosition)) return;
  cutFaces_[static_cast<std::size_t>(*id)].position = std::clamp(normalizedPosition, 1e-6, 1 - 1e-6);
  invalidateMoldInputs();
}

void AppController::resetCutFacePosition(const QString& face) {
  const auto id = faceIdFromName(face.toStdString());
  if (!id) return;
  cutFaces_[static_cast<std::size_t>(*id)].position.reset();
  invalidateMoldInputs();
}

std::vector<CuttingPlane> AppController::activeCuttingPlanes() const {
  std::vector<CuttingPlane> planes;
  for (FaceId face : kFaceIds) {
    const CutFaceState& s = cutFaces_[static_cast<std::size_t>(face)];
    if (s.enabled) planes.push_back(createCuttingPlane(face, s.position));
  }
  return planes;
}

void AppController::invalidateMoldInputs() {
  ++moldInputsRevision_;
  // Any change to the inputs makes an existing result stale: drop it rather
  // than show geometry that no longer matches the settings.
  if (moldResult_ || moldPhase_ == QStringLiteral("generating")) {
    ++moldGeneration_;
    if (activeCancel_) activeCancel_->cancel();
    clearMold(model_ ? QStringLiteral("ready") : QStringLiteral("unavailable"));
  }
  emit moldInputsChanged();
}

void AppController::clearMold(const QString& phase) {
  ++sprueGeneration_;
  sprueEvaluation_.reset();
  spruePhase_ = QStringLiteral("idle");
  for (SprueOperationDefinition& intent : sprueIntents_) {
    intent.validation = {"pending", {}, "Mold changed; sprue requires revalidation."};
  }
  moldResult_.reset();
  moldError_.clear();
  moldErrorCode_.clear();
  moldPhase_ = phase;
  scene_.clearMoldBodies();
  scene_.setPartOffset({0, 0, 0});
  emit moldChanged();
  emit spruesChanged();
}

void AppController::generateMold() {
  if (!model_) {
    emit errorOccurred(QStringLiteral("Generate mold"), QStringLiteral("Import an STL model first."),
                       QStringLiteral("no_model"));
    return;
  }
  if (busy_) return;
  const quint64 generation = ++moldGeneration_;
  const quint64 inputs = moldInputsRevision_;

  MoldGenerationRequest request;
  request.modelId = model_->modelId;
  request.partGeometryVersion = model_->geometryVersion;
  request.groundedPart = model_->groundedSoup;
  request.moldClearanceMm = moldClearanceMm_;
  request.cavityClearanceMm = cavityClearanceMm_;
  request.cuttingPlanes = activeCuttingPlanes();
  request.generationVersion = ++moldGenerationVersion_;

  moldPhase_ = QStringLiteral("generating");
  moldError_.clear();
  emit moldChanged();
  setBusy(true, QStringLiteral("validating"), 0);
  setStatus(QStringLiteral("Generating mold…"));

  CancellationToken cancel;
  activeCancel_ = cancel;
  auto engine = engine_;
  struct MoldJobResult {
    MoldGenerationResult mold;
    std::optional<SprueEvaluation> sprues;
  };
  runJob<MoldJobResult>(
      this, cancel,
      [engine, request, intents = sprueIntents_](const CancellationToken& token, const ProgressCallback& progress) {
        MoldJobResult job;
        job.mold = craft::generateMold(*engine, request, token, progress);
        if (!intents.empty()) {
          if (progress) progress("sprues", 0.95);
          std::vector<MoldBody> bodies;
          for (const CavityMoldBody& b : job.mold.cavity.bodies) bodies.push_back(b.body);
          job.sprues = evaluateSprues(*engine, bodies, job.mold.cavity.cavityTool.solid.mesh,
                                      job.mold.cavity.sourceSignature,
                                      job.mold.definition.definitionId + ":z-up", intents);
        }
        return job;
      },
      [this, generation, inputs](JobOutcome<MoldJobResult> outcome) {
        activeCancel_.reset();
        setBusy(false);
        if (generation != moldGeneration_ || inputs != moldInputsRevision_) return;  // stale
        if (outcome.state == JobState::Succeeded && outcome.result) {
          applyMoldResult(std::move(outcome.result->mold), std::move(outcome.result->sprues));
          return;
        }
        moldResult_.reset();
        scene_.clearMoldBodies();
        if (outcome.state == JobState::Cancelled) {
          moldPhase_ = QStringLiteral("ready");
          setStatus(QStringLiteral("Mold generation cancelled."));
        } else {
          moldPhase_ = QStringLiteral("error");
          moldError_ = outcome.errorMessage;
          moldErrorCode_ = outcome.errorCode;
          setStatus(QStringLiteral("Mold generation failed: %1").arg(outcome.errorMessage));
          emit errorOccurred(QStringLiteral("Mold generation failed"), outcome.errorMessage, outcome.errorCode);
        }
        emit moldChanged();
      },
      [this](QString stage, double fraction) {
        busyStage_ = stage;
        busyProgress_ = fraction;
        emit busyChanged();
      });
}

std::vector<MoldBody> AppController::finalBodies() const {
  if (sprueEvaluation_) return sprueEvaluation_->bodies;
  std::vector<MoldBody> bodies;
  if (moldResult_) {
    for (const CavityMoldBody& body : moldResult_->cavity.bodies) bodies.push_back(body.body);
  }
  return bodies;
}

void AppController::showFinalBodies(bool refit) {
  std::vector<SceneModel::BodyInput> bodies;
  for (const MoldBody& body : finalBodies()) {
    bodies.push_back({QString::fromStdString(body.id), QString::fromStdString(body.name),
                      std::make_shared<MeshPayload>(body.mesh), body.bounds, body.volumeMm3});
  }
  scene_.setMoldBodies(bodies);
  scene_.recolor(theme_ == "dark" ? QColor("#9fb4c7") : QColor("#5b7a99"), darkPalette());
  applySceneColors();
  refreshSceneFrame(refit);
}

void AppController::applyMoldResult(MoldGenerationResult result, std::optional<SprueEvaluation> sprues) {
  moldResult_ = std::move(result);
  sprueEvaluation_ = std::move(sprues);
  if (sprueEvaluation_) {
    for (const SprueOperationDefinition& resolved : sprueEvaluation_->definitions) {
      for (SprueOperationDefinition& intent : sprueIntents_) {
        if (intent.operationId == resolved.operationId) intent.validation = resolved.validation;
      }
    }
  }
  // The part now sits inside the block, lifted by the clearance (mold frame).
  const Point3 offset = moldResult_->definition.partOffset;
  scene_.setPartOffset({static_cast<float>(offset.x), static_cast<float>(offset.y), static_cast<float>(offset.z)});
  showFinalBodies(true);
  moldPhase_ = QStringLiteral("complete");
  spruePhase_ = QStringLiteral("idle");
  emit moldChanged();
  emit spruesChanged();
  QString status = QStringLiteral("Mold generated: %1 bodies, %2 mm³ removed")
                       .arg(moldResult_->cavity.bodies.size())
                       .arg(moldResult_->cavity.subtraction.removedVolumeMm3, 0, 'f', 1);
  if (sprueEvaluation_ && !sprueEvaluation_->warnings.empty()) {
    status += QStringLiteral(" (%1 sprue warning(s))").arg(sprueEvaluation_->warnings.size());
  }
  setStatus(status);
}
QVariantMap AppController::moldSummary() const {
  if (!moldResult_) return {};
  const MoldGenerationResult& r = *moldResult_;
  QVariantList bodies;
  for (const CavityMoldBody& cb : r.cavity.bodies) {
    const MoldBody* shown = &cb.body;
    if (sprueEvaluation_) {
      for (const MoldBody& s : sprueEvaluation_->bodies) {
        if (s.id == cb.body.id) shown = &s;
      }
    }
    const CavityMoldBody& b = cb;
    bodies.push_back(QVariantMap{{"id", QString::fromStdString(shown->id)},
                                 {"name", QString::fromStdString(shown->name)},
                                 {"volumeMm3", shown->volumeMm3},
                                 {"sprueOperationId", QString::fromStdString(shown->sprueOperationId)},
                                 {"triangleCount", static_cast<qulonglong>(shown->triangleCount)},
                                 {"cavityAffected", b.cavityAffected},
                                 {"watertight", b.validation.watertight && b.validation.openEdgeCount == 0},
                                 {"minimumWallMm", b.validation.minimumWallMm},
                                 {"bounds", boundsMap(b.body.bounds)}});
  }
  const auto& d = r.cavity.subtraction;
  return {{"sprueCount", static_cast<qulonglong>(sprueEvaluation_ ? sprueEvaluation_->resolvedSprues.size() : 0)},
          {"implementation", QString::fromStdString(r.cavity.implementation)},
          {"offsetEngine", QString::fromStdString(r.cavity.selectedEngine)},
          {"offsetMethod", QString::fromStdString(r.cavity.cavityTool.implementationMethod)},
          {"usedFallback", r.cavity.usedFallback},
          {"cavityClearanceMm", r.cavity.cavityTool.clearanceMm},
          {"operationId", QString::fromStdString(r.cavity.operationId)},
          {"signature", QString::fromStdString(r.cavity.sourceSignature)},
          {"referenceBlock", boundsMap(r.definition.referenceMoldBlockBounds)},
          {"bodyCount", static_cast<qulonglong>(r.cavity.bodies.size())},
          {"originalVolumeMm3", d.originalVolumeMm3},
          {"resultVolumeMm3", d.resultVolumeMm3},
          {"removedVolumeMm3", d.removedVolumeMm3},
          {"cavityToolVolumeMm3", d.cavityToolVolumeMm3},
          {"affectedBodies", static_cast<qulonglong>(d.affectedBodyCount)},
          {"elapsedMs", r.cavity.timings.totalMs},
          {"bodies", bodies}};
}

QVariantList AppController::moldIssues() const {
  QVariantList list;
  if (!moldResult_) return list;
  for (const Issue& i : moldResult_->validationWarnings) list.push_back(issueMap(i));
  for (const Issue& i : moldResult_->cavity.warnings) list.push_back(issueMap(i));
  return list;
}

void AppController::exportMoldBodies(const QUrl& folder) { exportMoldBodiesTo(folder.toLocalFile()); }

void AppController::exportMoldBodiesTo(const QString& folderPath) {
  if (!moldResult_) {
    emit exportFinished(false, QStringLiteral("Generate a mold before exporting."), {});
    return;
  }
  QStringList files;
  try {
    QDir().mkpath(folderPath);
    int index = 1;
    for (const MoldBody& body : finalBodies()) {
      const QString name = QStringLiteral("%1_mold_%2.stl")
                               .arg(QFileInfo(model_ ? model_->fileName : QStringLiteral("part")).completeBaseName())
                               .arg(index++);
      const QString path = QDir(folderPath).filePath(name);
      stl::writeBinary(std::filesystem::path(path.toStdWString()), body.mesh,
                       "op=" + moldResult_->cavity.operationId);
      files << path;
    }
  } catch (const CodedError& error) {
    emit exportFinished(false, QString::fromUtf8(error.what()), files);
    emit errorOccurred(QStringLiteral("Export failed"), QString::fromUtf8(error.what()),
                       QString::fromStdString(error.code()));
    return;
  }
  setStatus(QStringLiteral("Exported %1 STL file(s) to %2").arg(files.size()).arg(folderPath));
  emit exportFinished(true, QStringLiteral("Exported %1 file(s).").arg(files.size()), files);
}

// --- analysis --------------------------------------------------------------

void AppController::connectAnalysis() {
  connect(&analysis_, &analysis::WorkerClient::jobProgress, this,
          [this](const QString& jobId, const QString& stage, double) {
            if (jobId != analysisJobId_) return;
            analysisStage_ = stage;
            emit analysisChanged();
          });
  connect(&analysis_, &analysis::WorkerClient::jobSucceeded, this,
          [this](const QString& jobId, const QJsonObject& message) {
            if (jobId != analysisJobId_) return;
            // Reject a result computed for a model that has since been replaced.
            if (model_ && message.value("modelId").toString().toStdString() != model_->modelId) {
              qCWarning(lcApp) << "Dropped stale analysis result for" << message.value("modelId").toString();
              return;
            }
            analysisReport_ = message.value("report").toObject().toVariantMap();
            analysisReport_.insert("elapsedMs", message.value("elapsedMs").toDouble());
            analysisPhase_ = QStringLiteral("complete");
            analysisError_.clear();
            analysisStage_.clear();
            analysisJobId_.clear();
            setBusy(false);
            emit analysisChanged();
            setStatus(QStringLiteral("Import analysis complete: %1").arg(analysisReport_.value("status").toString()));
          });
  connect(&analysis_, &analysis::WorkerClient::jobFailed, this,
          [this](const QString& jobId, const QString& code, const QString& message) {
            if (jobId != analysisJobId_) return;
            analysisPhase_ = QStringLiteral("error");
            analysisError_ = message;
            analysisJobId_.clear();
            setBusy(false);
            emit analysisChanged();
            setStatus(QStringLiteral("Analysis failed: %1").arg(message));
            emit errorOccurred(QStringLiteral("Analysis failed"), message, code);
          });
  connect(&analysis_, &analysis::WorkerClient::jobCancelled, this, [this](const QString& jobId) {
    if (jobId != analysisJobId_) return;
    analysisPhase_ = QStringLiteral("idle");
    analysisJobId_.clear();
    setBusy(false);
    emit analysisChanged();
    setStatus(QStringLiteral("Analysis cancelled."));
  });
  connect(&analysis_, &analysis::WorkerClient::workerLog, this,
          [](const QString& line) { qCInfo(lcApp) << "[analysis]" << line; });
}

void AppController::runImportAnalysis() {
  if (!model_) {
    emit errorOccurred(QStringLiteral("Import analysis"), QStringLiteral("Import an STL model first."),
                       QStringLiteral("no_model"));
    return;
  }
  if (analysis_.isBusy()) return;
  analysisPhase_ = QStringLiteral("running");
  analysisError_.clear();
  analysisReport_.clear();
  analysisStage_ = QStringLiteral("starting");
  analysisJobId_ = analysis_.startJob(
      QLatin1String(analysis::kCommandImportAnalysis),
      {{"sourcePath", model_->sourcePath},
       {"modelId", QString::fromStdString(model_->modelId)},
       {"geometryVersion", QString::fromStdString(model_->geometryVersion)}});
  setBusy(true, QStringLiteral("analysis"), 0);
  setStatus(QStringLiteral("Running Python import analysis…"));
  emit analysisChanged();
}

void AppController::cancelAnalysis() { analysis_.cancel(analysisJobId_); }

// --- view ------------------------------------------------------------------

void AppController::setTheme(const QString& theme) {
  if (theme == theme_ || (theme != "dark" && theme != "light")) return;
  theme_ = theme;
  applySceneColors();
  emit themeChanged();
}

void AppController::applySceneColors() {
  scene_.recolor(theme_ == "dark" ? QColor("#9fb4c7") : QColor("#5b7a99"), darkPalette());
}

void AppController::setShowGrid(bool v) { if (v != showGrid_) { showGrid_ = v; emit viewOptionsChanged(); } }
void AppController::setShowAxes(bool v) { if (v != showAxes_) { showAxes_ = v; emit viewOptionsChanged(); } }
void AppController::setShowEdges(bool v) { if (v != showEdges_) { showEdges_ = v; emit viewOptionsChanged(); } }
void AppController::setMoldOpacity(double v) {
  v = std::clamp(v, 0.05, 1.0);
  if (v != moldOpacity_) { moldOpacity_ = v; emit viewOptionsChanged(); }
}

QVariantMap AppController::gridInfo() const {
  return {{"majorStep", grid_.majorStep}, {"minorStep", grid_.minorStep}, {"size", grid_.size}};
}

void AppController::rebuildGrid() {
  gridMinor_.setBuffers(viewport::buildGridBuffers(grid_.size, grid_.minorStep, grid_.majorStep));
  gridMajor_.setBuffers(viewport::buildGridBuffers(grid_.size, grid_.majorStep));
  const float h = static_cast<float>(grid_.size / 2);
  axisX_.setBuffers(viewport::buildSegmentBuffers({0, 0, 0}, {h, 0, 0}));
  axisY_.setBuffers(viewport::buildSegmentBuffers({0, 0, 0}, {0, h, 0}));
  axisZ_.setBuffers(viewport::buildSegmentBuffers({0, 0, 0}, {0, 0, h}));
  emit gridChanged();
}

void AppController::refreshSceneFrame(bool refit) {
  camera_.setSceneBounds(scene_.visibleBounds());
  if (refit) camera_.reset();
}

void AppController::fitView() { camera_.fit(); }
void AppController::resetView() { camera_.reset(); }

void AppController::setTool(const QString& tool) {
  if (tool == tool_) return;
  tool_ = tool;
  measurePoints_.clear();
  measurement_.clear();
  emit toolChanged();
  emit selectionChanged();
}

bool AppController::pickAt(qreal x, qreal y, qreal w, qreal h) {
  camera_.setViewportSize(w, h);
  if (tool_ == "sprue") return placeSprueAt(x, y, w, h);
  const auto hit = scene_.pick(camera_.pose().rayThroughPixel(x, y, w, h));
  if (!hit) {
    if (tool_ == "select") clearSelection();
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
    selection_ = {{"id", item.id}, {"name", item.name}, {"kind", item.kind},
                  {"triangle", static_cast<qulonglong>(hit->hit.triangleIndex)},
                  {"point", pointMap({p.x, p.y, p.z})},
                  {"normal", pointMap({hit->hit.normal.x, hit->hit.normal.y, hit->hit.normal.z})},
                  {"distanceMm", hit->hit.distance}};
  }
  emit selectionChanged();
  return true;
}

void AppController::clearSelection() {
  selection_.clear();
  measurement_.clear();
  measurePoints_.clear();
  measureLine_.clearBuffers();
  emit selectionChanged();
}

// --- sprues ----------------------------------------------------------------

QVariantList AppController::sprues() const {
  QVariantList list;
  for (const SprueOperationDefinition& s : sprueIntents_) {
    QVariantMap m{{"operationId", QString::fromStdString(s.operationId)},
                  {"x", s.position.x}, {"y", s.position.y}, {"z", s.position.z},
                  {"mainDiameterMm", s.profileDesign.profile.mainDiameterMm},
                  {"entryNeckDiameterMm", s.profileDesign.profile.entryNeckDiameterMm},
                  {"entryNeckLengthMm", s.profileDesign.profile.entryNeckLengthMm},
                  {"status", QString::fromStdString(s.validation.status)},
                  {"reasonCode", QString::fromStdString(s.validation.reasonCode)},
                  {"message", QString::fromStdString(s.validation.message)}};
    if (sprueEvaluation_) {
      for (const SprueDefinition& resolved : sprueEvaluation_->resolvedSprues) {
        if (resolved.operationId == s.operationId) m.insert("depthMm", resolved.depthMm);
      }
    }
    list.push_back(m);
  }
  return list;
}

std::optional<SpruePlacement> AppController::placementAt(qreal x, qreal y, qreal w, qreal h) const {
  if (!moldResult_) return std::nullopt;
  const std::vector<MoldBody> bodies = finalBodies();
  const MeshPayload& cavityMesh = moldResult_->cavity.cavityTool.solid.mesh;
  const SprueCavityFacts facts{&cavityMesh, moldResult_->cavity.cavityTool.solid.volumeMm3,
                               moldResult_->cavity.cavityTool.solid.bounds};
  return computeSpruePlacement(camera_.pose().rayThroughPixel(x, y, w, h), bodies,
                               moldResult_->definition.referenceMoldBlockBounds.max.z, facts);
}

void AppController::previewSprueAt(qreal x, qreal y, qreal w, qreal h) {
  camera_.setViewportSize(w, h);
  QVariantMap candidate;
  if (const auto placement = placementAt(x, y, w, h)) {
    candidate = {{"onTopFace", true},
                 {"valid", placement->valid},
                 {"x", placement->topPoint.x}, {"y", placement->topPoint.y}, {"z", placement->topPoint.z},
                 {"stemLengthMm", placement->stemLengthMm},
                 {"mainDiameterMm", placement->profileDesign.profile.mainDiameterMm},
                 {"entryNeckDiameterMm", placement->profileDesign.profile.entryNeckDiameterMm},
                 {"entryNeckLengthMm", placement->profileDesign.profile.entryNeckLengthMm}};
  }
  if (candidate != sprueCandidate_) {
    sprueCandidate_ = candidate;
    emit spruesChanged();
  }
}

bool AppController::placeSprueAt(qreal x, qreal y, qreal w, qreal h) {
  if (moldPhase_ != "complete") {
    setStatus(QStringLiteral("Generate a mold before placing a sprue."));
    return false;
  }
  const auto placement = placementAt(x, y, w, h);
  if (!placement) {
    setStatus(QStringLiteral("Click the top face of the mold to place a sprue."));
    return false;
  }
  if (!placement->valid) {
    setStatus(QStringLiteral("The sprue axis at this point does not reach the cavity."));
    return false;
  }
  SprueOperationDefinition intent;
  intent.operationId = "sprue:" + std::to_string(nextSprueNumber_++);
  intent.position = placement->topPoint;
  intent.inwardDirection = placement->inwardDirection;
  intent.profileDesign = placement->profileDesign;
  intent.validation = {"pending", {}, {}};
  editSprues([&](std::vector<SprueOperationDefinition>& intents) {
    intent.creationOrder = static_cast<int>(intents.size());
    intents.push_back(intent);
    return true;
  });
  return true;
}

void AppController::removeSprue(const QString& operationId) {
  editSprues([&](std::vector<SprueOperationDefinition>& intents) {
    const auto it = std::remove_if(intents.begin(), intents.end(), [&](const auto& s) {
      return s.operationId == operationId.toStdString();
    });
    if (it == intents.end()) return false;
    intents.erase(it, intents.end());
    for (std::size_t i = 0; i < intents.size(); ++i) intents[i].creationOrder = static_cast<int>(i);
    return true;
  });
}

void AppController::resizeSprue(const QString& operationId, double diameterMm) {
  editSprues([&](std::vector<SprueOperationDefinition>& intents) {
    for (SprueOperationDefinition& s : intents) {
      if (s.operationId != operationId.toStdString()) continue;
      const auto normalized = normalizeSprueDiameterMm(diameterMm, s.profileDesign.profile.entryNeckDiameterMm);
      if (!normalized || *normalized == s.profileDesign.profile.mainDiameterMm) return false;
      s.profileDesign.profile.mainDiameterMm = *normalized;
      return true;
    }
    return false;
  });
}

void AppController::resizeSprueEntryNeck(const QString& operationId, double diameterMm) {
  editSprues([&](std::vector<SprueOperationDefinition>& intents) {
    for (SprueOperationDefinition& s : intents) {
      if (s.operationId != operationId.toStdString()) continue;
      const auto normalized = normalizeSprueEntryNeckDiameterMm(diameterMm, s.profileDesign.profile.mainDiameterMm);
      if (!normalized || *normalized == s.profileDesign.profile.entryNeckDiameterMm) return false;
      s.profileDesign.profile.entryNeckDiameterMm = *normalized;
      return true;
    }
    return false;
  });
}

void AppController::moveSprue(const QString& operationId, double x, double y) {
  if (!std::isfinite(x) || !std::isfinite(y) || !moldResult_) return;
  const double topZ = moldResult_->definition.referenceMoldBlockBounds.max.z;
  editSprues([&](std::vector<SprueOperationDefinition>& intents) {
    for (SprueOperationDefinition& s : intents) {
      if (s.operationId != operationId.toStdString()) continue;
      s.position = {x, y, topZ};
      return true;
    }
    return false;
  });
}

/// Applies an intent edit and re-evaluates only the sprue stage on the
/// existing cavity result (the cavity is not regenerated).
void AppController::editSprues(const std::function<bool(std::vector<SprueOperationDefinition>&)>& edit) {
  if (busy_ && spruePhase_ != "evaluating") return;
  if (!edit(sprueIntents_)) return;
  for (SprueOperationDefinition& s : sprueIntents_) s.validation = {"pending", {}, {}};
  startSprueEvaluation();
}

void AppController::startSprueEvaluation() {
  const quint64 generation = ++sprueGeneration_;
  if (!moldResult_) {
    emit spruesChanged();
    return;
  }
  if (activeCancel_ && spruePhase_ == "evaluating") activeCancel_->cancel();
  spruePhase_ = QStringLiteral("evaluating");
  emit spruesChanged();
  setBusy(true, QStringLiteral("sprues"), 0);
  setStatus(QStringLiteral("Evaluating sprues…"));

  std::vector<MoldBody> bodies;
  for (const CavityMoldBody& b : moldResult_->cavity.bodies) bodies.push_back(b.body);
  const MeshPayload cavityMesh = moldResult_->cavity.cavityTool.solid.mesh;
  const std::string signature = moldResult_->cavity.sourceSignature;
  const std::string frameId = moldResult_->definition.definitionId + ":z-up";
  const quint64 moldGeneration = moldGeneration_;
  auto engine = engine_;
  CancellationToken cancel;
  activeCancel_ = cancel;
  runJob<SprueEvaluation>(
      this, cancel,
      [engine, bodies, cavityMesh, signature, frameId, intents = sprueIntents_](const CancellationToken&,
                                                                                 const ProgressCallback&) {
        return evaluateSprues(*engine, bodies, cavityMesh, signature, frameId, intents);
      },
      [this, generation, moldGeneration](JobOutcome<SprueEvaluation> outcome) {
        activeCancel_.reset();
        setBusy(false);
        if (generation != sprueGeneration_ || moldGeneration != moldGeneration_ || !moldResult_) return;  // stale
        spruePhase_ = QStringLiteral("idle");
        if (outcome.state != JobState::Succeeded || !outcome.result) {
          setStatus(QStringLiteral("Sprue evaluation failed: %1").arg(outcome.errorMessage));
          emit errorOccurred(QStringLiteral("Sprue evaluation failed"), outcome.errorMessage, outcome.errorCode);
          emit spruesChanged();
          return;
        }
        sprueEvaluation_ = std::move(*outcome.result);
        for (const SprueOperationDefinition& resolved : sprueEvaluation_->definitions) {
          for (SprueOperationDefinition& intent : sprueIntents_) {
            if (intent.operationId == resolved.operationId) intent.validation = resolved.validation;
          }
        }
        showFinalBodies(false);
        emit moldChanged();
        emit spruesChanged();
        setStatus(sprueEvaluation_->warnings.empty()
                      ? QStringLiteral("%1 sprue(s) applied.").arg(sprueEvaluation_->resolvedSprues.size())
                      : QStringLiteral("Sprue warning: %1").arg(QString::fromStdString(sprueEvaluation_->warnings.front())));
      });
}

QVariantMap AppController::stateSummary() const {
  QVariantMap s{{"modelPhase", modelPhase_},
                {"moldPhase", moldPhase_},
                {"analysisPhase", analysisPhase_},
                {"sceneItems", scene_.count()},
                {"status", statusText_}};
  s.insert("model", modelInfo());
  s.insert("mold", moldSummary());
  s.insert("moldError", moldError_);
  s.insert("sprues", sprues());
  s.insert("analysisError", analysisError_);
  s.insert("analysisStatus", analysisReport_.value("status"));
  return s;
}

}  // namespace craft::app
