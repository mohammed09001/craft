#include "AppController.h"
#include "SystemMemory.h"

#include <QLocale>

#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QElapsedTimer>
#include <QFileInfo>
#include <QGuiApplication>
#include <QStyleHints>
#include <QJsonObject>
#include <QLoggingCategory>

#include <cmath>
#include <filesystem>

#include "AppPaths.h"
#include "AnalysisProtocol.h"
#include "geometry/MeshAnalysis.h"
#include "mold/Segmentation.h"
#include "stl/Stl.h"
#include "path/ExtendedPath.h"
#include "threemf/ThreeMf.h"

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
      analysisConfig_(std::move(analysisConfig)),
      memoryProbe_(&availablePhysicalMemoryBytes) {
  camera_.setSceneBounds(std::nullopt);
  // The ruler follows the camera and the viewport size (the label step is chosen from the on-screen scale).
  connect(&camera_, &viewport::ViewportCamera::poseChanged, this, &AppController::refreshRuler);
  connect(&camera_, &viewport::ViewportCamera::viewportChanged, this, &AppController::refreshRuler);
  rebuildGrid();
  applySceneColors();
  connectAnalysis();
  connectReports();
  // Flip / Auto orient availability follows the model, the mold, sprues, segmentation and running jobs.
  for (auto signal : {&AppController::modelChanged, &AppController::moldChanged, &AppController::spruesChanged, &AppController::segmentationChanged,
                      &AppController::busyChanged, &AppController::masterMoldChanged})
    connect(this, signal, this, &AppController::refreshOrientation);
  initProject();
  applyChromeScheme();  // the chrome starts in the app's theme (dark), not the operating system's
  connect(&scene_, &SceneModel::sceneChanged, this, [this] { refreshSceneFrame(false); });
  // The selection box follows the part (offset, visibility) and the states that show or hide it.
  for (auto signal : {&AppController::moldChanged, &AppController::moldInputsChanged, &AppController::segmentationChanged,
                      &AppController::themeChanged}) {
    connect(this, signal, this, &AppController::refreshSelectionOverlay);
  }
  connect(&scene_, &SceneModel::sceneChanged, this, &AppController::refreshSelectionOverlay);
  // The list models follow the lists they mirror: the same signals the QVariantList properties notify with.
  connect(this, &AppController::moldInputsChanged, this, [this] { cutFaceModel_.setItems(cutFaces()); });
  connect(this, &AppController::spruesChanged, this, [this] { sprueModel_.setItems(sprues()); });
  connect(this, &AppController::segmentationChanged, this, [this] { extensionModel_.setItems(segmentation().value(QStringLiteral("extensions")).toList()); });
  connect(this, &AppController::masterMoldChanged, this, [this] { masterSetModel_.setItems(masterMold().value(QStringLiteral("sets")).toList()); });
  cutFaceModel_.setItems(cutFaces());

  // The Sprue tool's glass look and preview follow the tool and the mold.
  // Cutting-plane slabs follow the faces, the mold, the tool and the part.
  for (auto signal : {&AppController::moldChanged, &AppController::moldInputsChanged, &AppController::segmentationChanged,
                      &AppController::toolChanged, &AppController::modelChanged}) {
    connect(this, signal, this, &AppController::refreshCutPlanes);
  }
  connect(&scene_, &SceneModel::sceneChanged, this, &AppController::refreshCutPlanes);
  // Master Mold's availability (`canGenerate`) is a model and not-busy state: its panel and its toolbar button must be told when either changes.
  connect(this, &AppController::modelChanged, this, &AppController::masterMoldChanged);
  connect(this, &AppController::busyChanged, this, &AppController::masterMoldChanged);
  // The Molds browser follows the scene and the states that decide whether it is shown.
  for (auto signal : {&AppController::moldChanged, &AppController::masterMoldChanged, &AppController::segmentationChanged}) {
    connect(this, signal, this, &AppController::moldBrowserChanged);
  }
  connect(&scene_, &SceneModel::sceneChanged, this, &AppController::moldBrowserChanged);
  connect(&scene_, &SceneModel::countChanged, this, &AppController::moldBrowserChanged);
  {
    std::vector<std::array<QVector3D, 2>> unitEdges;
    for (const Segment3& edge : selectionBoxEdges({{-0.5, -0.5, -0.5}, {0.5, 0.5, 0.5}})) {
      unitEdges.push_back({QVector3D(float(edge.from.x), float(edge.from.y), float(edge.from.z)), QVector3D(float(edge.to.x), float(edge.to.y), float(edge.to.z))});
    }
    cutPlaneEdges_.setBuffers(viewport::buildSegmentListBuffers(unitEdges));
  }
  connect(this, &AppController::spruesChanged, this, &AppController::refreshSprueGizmo);
  connect(this, &AppController::sprueGlassChanged, this, &AppController::refreshSprueGizmo);
  connect(this, &AppController::toolChanged, this, &AppController::refreshSprueGlass);
  connect(this, &AppController::moldChanged, this, &AppController::refreshSprueGlass);
}

AppController::~AppController() {
  // A clean exit leaves no autosave behind; unsaved work keeps its autosave so the next start can offer recovery.
  refreshDirty();
  if (!projectDirty_ && !projectId_.empty()) QFile::remove(autosavePathForCurrentProject());
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

// Gives up the mold generation in progress: the UI is released now, the worker thread is left to end on its own (cancelled, so it stops at its next check and
// otherwise at the end of the Boolean it is in) and its result will be ignored. The caller sets the phase and the state that follows.
void AppController::abandonMoldRun() {
  if (moldPhase_ != QStringLiteral("generating") || !moldAbandon_) return;
  *moldAbandon_ = true;
  moldAbandon_.reset();
  ++moldOrphans_;
  if (activeCancel_) {
    activeCancel_->cancel();
    activeCancel_.reset();
  }
  setBusy(false);
}

void AppController::cancelCurrentJob() {
  // A Master Mold run cannot be interrupted inside a Boolean, so cancelling it releases the UI at once and lets the thread end on its own.
  if (masterRunning_) {
    abandonMasterRun(QStringLiteral("Master Mold generation was cancelled."), true);
    return;
  }
  if (moldPhase_ == QStringLiteral("generating") && moldAbandon_) {
    ++moldGeneration_;
    abandonMoldRun();
    moldResult_.reset();
    scene_.clearMoldBodies();
    moldPhase_ = QStringLiteral("ready");
    setStatus(QStringLiteral("Mold generation cancelled."));
    emit moldChanged();
    return;
  }
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

LoadedModel buildLoadedModel(TriangleSoup soup, stl::Encoding encoding, quint64 requestId, const QString& fileName, const QString& sourcePath, qint64 fileSizeBytes,
                             const Quaternion& orientation) {
  const Bounds3 bounds = stl::validateDisplayable(soup);
  if (orientation != kIdentityOrientation) {
    // Flip / Auto orient (applyPartOrientation): rotate the source triangles, then ground the rotated bounds. The grounding translation is applied
    // in double precision and stored as float32, as the reference's geometry.translate does.
    TriangleSoup rotated = rotateSoup(soup, orientation);
    Bounds3 rb = emptyBounds();
    for (std::size_t i = 0; i + 2 < rotated.positions.size(); i += 3) {
      rb.min = {std::min(rb.min.x, double(rotated.positions[i])), std::min(rb.min.y, double(rotated.positions[i + 1])), std::min(rb.min.z, double(rotated.positions[i + 2]))};
      rb.max = {std::max(rb.max.x, double(rotated.positions[i])), std::max(rb.max.y, double(rotated.positions[i + 1])), std::max(rb.max.z, double(rotated.positions[i + 2]))};
    }
    const auto g = calculateModelGroundingTransform(rb);
    if (!g) throw CodedError("stl_invalid_geometry", "The STL file has an invalid bounding box.");
    for (std::size_t i = 0; i + 2 < rotated.positions.size(); i += 3) {
      rotated.positions[i] = static_cast<float>(double(rotated.positions[i]) + g->translation.x);
      rotated.positions[i + 1] = static_cast<float>(double(rotated.positions[i + 1]) + g->translation.y);
      rotated.positions[i + 2] = static_cast<float>(double(rotated.positions[i + 2]) + g->translation.z);
    }
    LoadedModel m;
    m.modelId = QStringLiteral("%1:%2:%3").arg(requestId).arg(fileName).arg(fileSizeBytes).toStdString();
    m.sourcePath = sourcePath;
    m.fileName = fileName;
    m.fileSizeBytes = fileSizeBytes;
    m.encoding = encoding == stl::Encoding::Ascii ? "ASCII" : "Binary";
    m.sourceBounds = bounds;
    m.orientation = orientation;
    m.groundingTranslation = g->translation;
    m.groundedBounds = g->groundedBounds;
    m.groundedSoup = std::make_shared<TriangleSoup>(std::move(rotated));
    m.sourceSoup = std::make_shared<TriangleSoup>(std::move(soup));
    m.geometryVersion = partGeometryVersion(*m.groundedSoup);
    return m;
  }
  const auto grounding = calculateModelGroundingTransform(bounds);
  if (!grounding) throw CodedError("stl_invalid_geometry", "The STL file has an invalid bounding box.");

  LoadedModel m;
  m.modelId = QStringLiteral("%1:%2:%3").arg(requestId).arg(fileName).arg(fileSizeBytes).toStdString();
  m.sourcePath = sourcePath;
  m.fileName = fileName;
  m.fileSizeBytes = fileSizeBytes;
  m.encoding = encoding == stl::Encoding::Ascii ? "ASCII" : "Binary";
  m.sourceBounds = bounds;
  m.groundingTranslation = grounding->translation;
  m.groundedBounds = grounding->groundedBounds;
  auto grounded = std::make_shared<TriangleSoup>(soup);
  for (std::size_t i = 0; i + 2 < grounded->positions.size(); i += 3) {
    grounded->positions[i] += static_cast<float>(grounding->translation.x);
    grounded->positions[i + 1] += static_cast<float>(grounding->translation.y);
    grounded->positions[i + 2] += static_cast<float>(grounding->translation.z);
  }
  m.sourceSoup = std::make_shared<TriangleSoup>(std::move(soup));
  m.groundedSoup = std::move(grounded);
  m.geometryVersion = partGeometryVersion(*m.groundedSoup);
  return m;
}

void AppController::importStl(const QUrl& fileUrl) { importStlFile(fileUrl.toLocalFile()); }

bool AppController::acceptDroppedStl(const QList<QUrl>& urls) {
  if (urls.size() != 1 || !urls.front().isLocalFile()) {
    setStatus(QStringLiteral("Choose exactly one STL file."));
    return false;
  }
  const QFileInfo info(urls.front().toLocalFile());
  if (!info.fileName().endsWith(QLatin1String(".stl"), Qt::CaseInsensitive)) {
    setStatus(QStringLiteral("Only .stl files are supported."));
    return false;
  }
  if (info.exists() && info.size() == 0) {
    setStatus(QStringLiteral("The STL file is empty."));
    return false;
  }
  return true;
}

void AppController::importStlFile(const QString& path) {
  sprueCache_->clear();
  const quint64 generation = ++importGeneration_;
  const quint64 requestId = ++nextImportRequestId_;
  modelPhase_ = QStringLiteral("loading");
  modelMessage_ = QFileInfo(path).fileName();
  emit modelChanged();
  setStatus(QStringLiteral("Loading %1…").arg(QFileInfo(path).fileName()));

  struct Loaded {
    LoadedModel model;
  };
  importCancel_ = CancellationToken();
  projectStage_ = QStringLiteral("reading");
  projectProgress_ = 0;
  runJob<Loaded>(
      this, importCancel_,
      [path, requestId](const CancellationToken& cancel, const ProgressCallback& progress) {
        QElapsedTimer timer;
        timer.start();
        // Reading the file is the bulk (a 512 MiB file is the limit) and reports as it goes; parsing and building the model are single calls and
        // are only checked for a stop in between.
        const auto stopIfCancelled = [&cancel] {
          if (cancel.isCancelled()) throw CodedError("stl_cancelled", "Loading the STL file was cancelled.");
        };
        const std::vector<std::uint8_t> bytes = stl::readFileBytes(
            std::filesystem::path(path.toStdWString()), stl::kNativeMaxFileBytes, [&cancel] { return cancel.isCancelled(); },
            [&progress](double f) {
              if (progress) progress("reading", 0.7 * f);
            });
        stopIfCancelled();
        if (progress) progress("parsing", 0.7);
        auto read = stl::parse(bytes);
        stopIfCancelled();
        if (progress) progress("preparing", 0.9);
        const QFileInfo info(path);
        LoadedModel m = buildLoadedModel(std::move(read.soup), read.encoding, requestId, info.fileName(), path, info.size());
        m.loadMs = timer.elapsed();
        return Loaded{std::move(m)};
      },
      [this, generation, path](JobOutcome<Loaded> outcome) {
        if (generation != importGeneration_) return;  // a newer import superseded this one
        // Stopped before the model was loaded: whatever was open stays open, exactly as it was. (A stop that came when the work had already
        // finished is no stop: there is a result, and it is loaded.)
        if (outcome.state == JobState::Cancelled && !outcome.result) {
          modelPhase_ = model_ ? QStringLiteral("ready") : QStringLiteral("empty");
          modelMessage_ = model_ ? model_->fileName : QString();
          emit modelChanged();
          setStatus(QStringLiteral("Loading %1 was cancelled.").arg(QFileInfo(path).fileName()));
          return;
        }
        if ((outcome.state == JobState::Succeeded || outcome.state == JobState::Cancelled) && outcome.result) {
          applyModel(std::move(outcome.result->model));
          startNewProject();  // importing a model starts a new, unsaved project
          refreshDirty();
          refreshRecovery();
          return;
        }
        // Keep the previous model on failure, exactly like the reference viewport.
        modelPhase_ = model_ ? QStringLiteral("ready") : QStringLiteral("error");
        modelMessage_ = outcome.errorMessage;
        emit modelChanged();
        setStatus(outcome.errorMessage);
        emit errorOccurred(QStringLiteral("Import failed"), outcome.errorMessage, outcome.errorCode);
        qCWarning(lcApp) << "STL import failed:" << path << outcome.errorCode << outcome.errorMessage;
      },
      [this](QString stage, double fraction) {
        if (modelPhase_ != QLatin1String("loading")) return;  // a report that arrives after the job has ended
        projectStage_ = stage;
        projectProgress_ = fraction;
        emit projectChanged();
      });
}

void AppController::applyModel(LoadedModel model, bool fitCamera, bool announce) {
  clearMasterRun(true);
  invalidateSegmentation(QString());
  clearEngineeringReports();
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
  if (announce) scene_.clearHidden();   // a new model: everything is shown again (the reference resets its model and body visibility on import)
  scene_.setPart(QString::fromStdString(model_->modelId), model_->fileName, model_->groundedSoup,
                 QColor::fromRgb(referenceLook(true).partRgb));
  scene_.setPartOffset({0, 0, 0});
  grid_ = deriveAdaptiveGridConfig(model_->groundedBounds);
  rebuildGrid();
  clearSelection();
  clearHistory();
  // Like the reference (localStlImport: fitCameraToModel), a new model is fitted from the current view direction; only the
  // Reset View command goes back to the fixed direction.
  refreshSceneFrame(false);
  if (fitCamera) camera_.fit();
  emit modelChanged();
  emit moldInputsChanged();
  if (!announce) return;  // a re-orientation of the same model: the caller sets its own status
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
  pushHistory();
  moldClearanceMm_ = clamped;
  // The segmentation block is sized from this clearance: a plan made with another value is stale.
  if (segmentation_.phase != QStringLiteral("idle")) {
    invalidateSegmentation(QStringLiteral("Mold clearance changed; plan the segmentation again."));
  }
  invalidateMoldInputs();
}

void AppController::setCavityClearanceMm(double value) {
  const double clamped = std::isfinite(value) ? std::clamp(value, 0.0, maxCavityClearanceMm()) : 0.0;
  if (clamped == cavityClearanceMm_) return;
  pushHistory();
  cavityClearanceMm_ = clamped;
  invalidateMoldInputs();
}

void AppController::setCavityQuality(const QString& value) {
  const CavityQualityMode mode = value == QLatin1String("standard") ? CavityQualityMode::Standard : CavityQualityMode::High;
  if (mode == cavityQuality_) return;
  pushHistory();
  cavityQuality_ = mode;
  invalidateMoldInputs();
}

// The reference's Molds browser (MoldBodiesBrowser.tsx): every mold body with an eye toggle, and the original model. It lists what is on the
// scene, so it follows the working mold and an adopted segmentation; generated Master Mold tooling has its own pieces list and is left out.
QVariantMap AppController::moldBrowser() const {
  QVariantList bodies;
  QVariantMap model;
  for (const SceneItem& item : scene_.items()) {
    const QVariantMap row{{"id", item.id}, {"name", item.name}, {"visible", item.visible}};
    if (item.kind == QLatin1String("mold-body")) bodies << row;
    else if (item.kind == QLatin1String("part")) model = row;
  }
  return {{"available", !bodies.isEmpty() && !masterShown_}, {"bodies", bodies}, {"model", model}};
}

void AppController::resetBodyVisibility() { scene_.setHiddenBodyIds({}); }

void AppController::setBodyVisible(const QString& id, bool visible) {
  // Hiding or showing a mold body is one undoable step, as in the reference (setBodyVisibility records history); the part's own toggle is a
  // view option and an unchanged value is no edit (D-113).
  if (!scene_.isPartId(id) && scene_.isHidden(id) == visible) pushHistory();
  scene_.setVisibleById(id, visible);
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
  if (segmentation_.adopted) {
    setStatus(QStringLiteral("Reset segmentation to use Cut by Face."));
    return;
  }
  const auto id = faceIdFromName(face.toStdString());
  if (!id) return;
  CutFaceState& state = cutFaces_[static_cast<std::size_t>(*id)];
  if (state.enabled != enabled) {  // choosing or dropping a face is one undoable step, and shows every body again
    pushHistory();
    resetBodyVisibility();
  }
  state.enabled = enabled;
  invalidateMoldInputs();
}

void AppController::setCutFacePosition(const QString& face, double normalizedPosition) {
  if (segmentation_.adopted) return;
  const auto id = faceIdFromName(face.toStdString());
  if (!id || !std::isfinite(normalizedPosition)) return;
  CutFaceState& state = cutFaces_[static_cast<std::size_t>(*id)];
  const double next = std::clamp(normalizedPosition, 1e-6, 1 - 1e-6);
  if (createCuttingPlane(*id, state.position).normalizedPosition != next) {  // a slider drag is one gesture
    pushHistory();
    resetBodyVisibility();
  }
  state.position = next;
  invalidateMoldInputs();
}

void AppController::resetCutFacePosition(const QString& face) {
  const auto id = faceIdFromName(face.toStdString());
  if (!id) return;
  CutFaceState& state = cutFaces_[static_cast<std::size_t>(*id)];
  if (state.position) {
    pushHistory();
    resetBodyVisibility();
  }
  state.position.reset();
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
    if (moldPhase_ == QStringLiteral("generating")) abandonMoldRun();
    else if (activeCancel_) activeCancel_->cancel();
    clearMold(model_ ? QStringLiteral("ready") : QStringLiteral("unavailable"));
  }
  emit moldInputsChanged();
}

void AppController::clearMold(const QString& phase) {
  ++sprueGeneration_;
  sprueEvaluation_.reset();
  registration_.reset();
  spruePhase_ = QStringLiteral("idle");
  for (SprueOperationDefinition& intent : sprueIntents_) {
    intent.validation = {"pending", {}, "Mold changed; sprue requires revalidation."};
  }
  moldResult_.reset();
  moldError_.clear();
  moldErrorCode_.clear();
  moldPhase_ = phase;
  scene_.clearMoldBodies();
  masterShown_ = false;
  scene_.setPartOffset({0, 0, 0});
  if (segmentation_.adopted) showSegmentationBodies();  // the keyed pieces stay visible without a mold
  else if (masterStore_.seedIdentity()) showMasterBodies();  // so do generated master tooling pieces
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
  if (moldOrphans_ > 0) {
    setStatus(QStringLiteral("The previous mold generation is still ending its last step (it cannot be interrupted). Try again in a moment."));
    emit moldChanged();
    return;
  }
  // A part so large that the mold cannot fit in the memory that is free is refused before any work starts, with the numbers: the alternative is a
  // process that grows until the machine stalls or the process dies (a 10.7M-triangle part, the file limit, passed 9 GiB; estimateMoldPeakBytes).
  const std::uint64_t available = memoryProbe_ ? memoryProbe_() : 0;
  const std::uint64_t needed = estimateMoldPeakBytes(model_->sourceSoup->triangleCount());
  if (available != 0 && needed > available) {
    const auto gib = [](std::uint64_t bytes) { return QLocale().toString(static_cast<double>(bytes) / (1024.0 * 1024.0 * 1024.0), 'f', 1); };
    emit errorOccurred(QStringLiteral("Generate mold"),
                       QStringLiteral("This model has %1 triangles. Generating its mold needs about %2 GiB of memory and about %3 GiB is free. "
                                      "Close other applications, or use a model with fewer triangles, and try again.")
                           .arg(QLocale().toString(static_cast<qulonglong>(model_->sourceSoup->triangleCount())), gib(needed), gib(available)),
                       QStringLiteral("mold_memory_insufficient"));
    return;
  }
  // A pending (not executed) segmentation plan is superseded by generating a mold directly.
  if (!segmentation_.adopted && segmentation_.phase != QStringLiteral("idle")) invalidateSegmentation(QString());
  const bool recordHistory = !suppressGenerationHistory_;
  suppressGenerationHistory_ = false;
  const quint64 generation = ++moldGeneration_;
  const quint64 inputs = moldInputsRevision_;

  MoldGenerationRequest request;
  request.modelId = model_->modelId;
  request.partGeometryVersion = model_->geometryVersion;
  request.groundedPart = model_->groundedSoup;
  request.moldClearanceMm = effectiveMoldClearanceMm();
  request.cavityClearanceMm = cavityClearanceMm_;
  request.qualityMode = cavityQuality_;
  if (segmentation_.adopted) {
    request.segmentedBodies = segmentation_.executedBodies;  // Segmentation replaces Cut by Face
  } else {
    request.cuttingPlanes = activeCuttingPlanes();
  }
  request.generationVersion = ++moldGenerationVersion_;

  moldPhase_ = QStringLiteral("generating");
  moldError_.clear();
  emit moldChanged();
  setBusy(true, QStringLiteral("validating"), 0);
  setStatus(QStringLiteral("Generating mold…"));

  CancellationToken cancel;
  activeCancel_ = cancel;
  const auto abandoned = std::make_shared<bool>(false);
  moldAbandon_ = abandoned;
  auto engine = engine_;
  struct MoldJobResult {
    MoldGenerationResult mold;
    DerivedMoldEvaluation derived;
  };
  runJob<MoldJobResult>(
      this, cancel,
      [engine, request, intents = sprueIntents_, cache = sprueCache_](const CancellationToken& token, const ProgressCallback& progress) {
        MoldJobResult job;
        job.mold = craft::generateMold(*engine, request, token, progress);
        job.derived = evaluateDerivedMold(*engine, job.mold, intents, progress, cache.get());
        return job;
      },
      [this, generation, inputs, recordHistory, abandoned, before = captureHistory()](JobOutcome<MoldJobResult> outcome) {
        if (*abandoned) {  // given up (cancel, a change of inputs, undo): the UI has moved on, nothing here may touch it
          --moldOrphans_;
          emit moldChanged();
          return;
        }
        activeCancel_.reset();
        moldAbandon_.reset();
        setBusy(false);
        if (generation != moldGeneration_ || inputs != moldInputsRevision_) return;  // stale
        if (outcome.state == JobState::Succeeded && outcome.result) {
          applyMoldResult(std::move(outcome.result->mold), std::move(outcome.result->derived));
          if (recordHistory) pushHistoryEntry(before);  // undo returns to the state before the mold was generated
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
      [this, abandoned](QString stage, double fraction) {
        if (*abandoned) return;  // an abandoned run's last reports must not touch the footer while other work runs
        busyStage_ = stage;
        busyProgress_ = fraction;
        emit busyChanged();
      });
}

std::vector<MoldBody> AppController::finalBodies() const {
  if (registration_ && !registration_->bodies.empty()) return registration_->bodies;
  if (sprueEvaluation_) return sprueEvaluation_->bodies;
  std::vector<MoldBody> bodies;
  if (moldResult_) {
    for (const CavityMoldBody& body : moldResult_->cavity.bodies) bodies.push_back(body.body);
  }
  return bodies;
}

void AppController::showFinalBodies(bool refit) {
  masterShown_ = false;
  std::vector<SceneModel::BodyInput> bodies;
  for (const MoldBody& body : finalBodies()) {
    bodies.push_back({QString::fromStdString(body.id), QString::fromStdString(body.name),
                      std::make_shared<MeshPayload>(body.mesh), body.bounds, body.volumeMm3});
  }
  scene_.setMoldBodies(bodies);
  applySceneColors();
  applySceneColors();
  refreshSceneFrame(refit);
}

void AppController::applyMoldResult(MoldGenerationResult result, DerivedMoldEvaluation derived) {
  moldResult_ = std::move(result);
  sprueEvaluation_ = std::move(derived.sprues);
  registration_ = std::move(derived.registration);
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
  if (registration_ && registration_->status == "generated") {
    status += QStringLiteral(", %1 registration key(s)").arg(registration_->report->features.size());
  }
  setStatus(status);
}
QVariantMap AppController::moldSummary() const {
  if (!moldResult_) return {};
  const MoldGenerationResult& r = *moldResult_;
  QVariantList bodies;
  const std::vector<MoldBody> shownBodies = finalBodies();
  for (const CavityMoldBody& cb : r.cavity.bodies) {
    const MoldBody* shown = &cb.body;
    for (const MoldBody& s : shownBodies) {
      if (s.id == cb.body.id) shown = &s;
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
  QVariantMap registration{{"status", QStringLiteral("unavailable")}};
  if (registration_ && registration_->report) {
    const RegistrationReport& rr = *registration_->report;
    registration = {{"status", QString::fromStdString(registration_->status)},
                    {"reasonCode", QString::fromStdString(rr.reasonCode)},
                    {"message", QString::fromStdString(rr.message)},
                    {"interfaceCount", static_cast<qulonglong>(rr.interfaces.size())},
                    {"featureCount", static_cast<qulonglong>(rr.features.size())},
                    {"keyed", registration_->status == "generated"}};
  }
  return {{"registration", registration},
          {"sprueCount", static_cast<qulonglong>(sprueEvaluation_ ? sprueEvaluation_->resolvedSprues.size() : 0)},
          {"sprueCacheHits", static_cast<qulonglong>(sprueEvaluation_ ? sprueEvaluation_->cacheHits : 0)},
          {"sprueCacheMisses", static_cast<qulonglong>(sprueEvaluation_ ? sprueEvaluation_->cacheMisses : 0)},
          {"implementation", QString::fromStdString(r.cavity.implementation)},
          {"offsetEngine", QString::fromStdString(r.cavity.selectedEngine)},
          {"offsetMethod", QString::fromStdString(r.cavity.cavityTool.implementationMethod)},
          {"usedFallback", r.cavity.usedFallback},
          {"cavityClearanceMm", r.cavity.cavityTool.clearanceMm},
          {"cavityQuality", QString::fromLatin1(qualityModeName(r.cavity.cavityTool.qualityMode))},
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
  // Same rule as the reference: any registration that is not generated is a warning.
  if (registration_ && registration_->report && registration_->status != "generated") {
    list.push_back(QVariantMap{{"severity", "warning"},
                               {"code", QString::fromStdString(registration_->report->reasonCode)},
                               {"message", QString::fromStdString(registration_->report->message)}});
  }
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

void AppController::exportMoldBodies3mf(const QUrl& file) { exportMoldBodies3mfTo(file.toLocalFile()); }

void AppController::exportMoldBodies3mfTo(const QString& requestedPath) {
  if (!moldResult_) {
    emit exportFinished(false, QStringLiteral("Generate a mold before exporting."), {});
    return;
  }
  QString filePath = requestedPath;
  if (QFileInfo(filePath).suffix().compare(QStringLiteral("3mf"), Qt::CaseInsensitive) != 0) filePath += QStringLiteral(".3mf");
  const std::filesystem::path path(filePath.toStdWString());
  try {
    const std::vector<MoldBody> bodies = finalBodies();
    std::vector<threemf::Object> objects;
    objects.reserve(bodies.size());
    for (const MoldBody& body : bodies) objects.push_back({body.name.empty() ? body.id : body.name, &body.mesh});
    threemf::write(path, objects, QFileInfo(model_ ? model_->fileName : QStringLiteral("part")).completeBaseName().toStdString());
    // Export validation: read the written file back and check it as a third party would.
    const threemf::Report report = threemf::validateFile(path);
    if (!report.ok || report.objects.size() != objects.size()) {
      std::error_code ec;
      std::filesystem::remove(io::extendedLength(path), ec);  // never leave a file we could not verify
      throw CodedError("threemf_validation_failed",
                       "The 3MF file did not pass read-back validation: " + (report.problem.empty() ? std::string("object count differs") : report.problem));
    }
  } catch (const CodedError& error) {
    emit exportFinished(false, QString::fromUtf8(error.what()), {});
    emit errorOccurred(QStringLiteral("Export failed"), QString::fromUtf8(error.what()), QString::fromStdString(error.code()));
    return;
  }
  setStatus(QStringLiteral("Exported 3MF to %1").arg(filePath));
  emit exportFinished(true, QStringLiteral("Exported 1 3MF file."), QStringList{filePath});
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
      {{"sourcePath", AppPaths::pathForWorker(model_->sourcePath)},
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
  applyChromeScheme();
  applySceneColors();
  emit themeChanged();
}

// The menus, toolbars and panels are Qt Quick Controls (the Fusion style) and take their colours from the application's colour scheme, which
// is the operating system's unless told otherwise: the theme setting used to recolour the viewport only, so with Windows in dark mode the
// light theme gave a light viewport inside dark chrome (and the reverse). Qt 6.8 can set the scheme for the whole application.
void AppController::applyChromeScheme() {
  if (!qGuiApp) return;
  qGuiApp->styleHints()->setColorScheme(theme_ == QLatin1String("dark") ? Qt::ColorScheme::Dark : Qt::ColorScheme::Light);
}

void AppController::applySceneColors() {
  // The reference paints the imported part and every mold body in one colour each (CAD_DARK_THEME), in both themes.
  const ViewportLook look = referenceLook(true);
  scene_.recolor(QColor::fromRgb(look.partRgb), {QColor::fromRgb(look.moldRgb)});
}

namespace {

// Qt Quick 3D's light units against three.js's, to be calibrated against the reference's frames
// (VIEWPORT_COMPARISON.md): three.js divides the Lambert term by pi, so a directional intensity I corresponds to about
// I / pi here; the reference's exposure scales all light before tone mapping.
constexpr double kPi = 3.14159265358979323846;
double gDirectionalScale = 1.0 / kPi;
double gAmbientScale = 1.0 / kPi;

QColor channelsToColor(double r, double g, double b) {
  return QColor::fromRgbF(static_cast<float>(qBound(0.0, r, 1.0)), static_cast<float>(qBound(0.0, g, 1.0)),
                          static_cast<float>(qBound(0.0, b, 1.0)));
}

QVariantMap directionalLight(const LookLight& l, double exposure) {
  const QVector3D from(static_cast<float>(l.position.x), static_cast<float>(l.position.y), static_cast<float>(l.position.z));
  // Shines from its position towards the origin.
  const QQuaternion rotation = QQuaternion::rotationTo(QVector3D(0, 0, -1), (-from).normalized());
  return {{"rotation", rotation},
          {"color", QColor::fromRgb(l.colorRgb)},
          {"brightness", l.intensity * exposure * gDirectionalScale}};
}

}  // namespace

QVariantMap AppController::viewLook() const {
  const bool dark = theme_ == "dark";
  const ViewportLook look = referenceLook(dark);
  QVariantList lights;
  lights.append(directionalLight(look.key, look.exposure));
  lights.append(directionalLight(look.fill, look.exposure));
  lights.append(directionalLight(look.rim, look.exposure));

  // The hemisphere light is a sky colour above and a ground colour below: its mean is an ambient term and half its
  // difference a light from straight above.
  const auto channel = [](std::uint32_t rgb, int shift) { return ((rgb >> shift) & 0xff) / 255.0; };
  const auto mean = [&](int shift) { return (channel(look.hemisphereSkyRgb, shift) + channel(look.hemisphereGroundRgb, shift)) / 2.0; };
  const auto diff = [&](int shift) { return (channel(look.hemisphereSkyRgb, shift) - channel(look.hemisphereGroundRgb, shift)) / 2.0; };
  QVariantMap sky;
  sky.insert("rotation", QQuaternion::rotationTo(QVector3D(0, 0, -1), QVector3D(0, 0, -1)));  // shines straight down
  sky.insert("color", channelsToColor(diff(16), diff(8), diff(0)));
  sky.insert("brightness", look.hemisphereIntensity * look.exposure * gDirectionalScale);
  lights.append(sky);
  const double ambient = look.ambientIntensity + look.hemisphereIntensity * (mean(16) + mean(8) + mean(0)) / 3.0;
  const double a = ambient * look.exposure * gAmbientScale;

  return {{"background", QColor::fromRgb(look.backgroundRgb)},
          {"gridMinorColor", QColor::fromRgb(look.gridMinor.colorRgb)},
          {"gridMinorOpacity", look.gridMinor.opacity},
          {"gridMajorColor", QColor::fromRgb(look.gridMajor.colorRgb)},
          {"gridMajorOpacity", look.gridMajor.opacity},
          {"rulerLabelColor", QColor::fromRgb(look.rulerLabelRgb)},
          {"rulerAxisOpacity", kRulerAxisOpacity},
          {"rulerTickOpacity", kRulerTickOpacity},
          {"edgeColor", QColor::fromRgb(look.edgeRgb)},
          {"edgeOpacity", look.edgeOpacity},
          {"staleMasterOpacity", look.staleMasterOpacity},
          {"roughness", look.roughness},
          {"metalness", look.metalness},
          {"glass", QVariantMap{{"opacity", look.glass.opacity}, {"roughness", look.glass.roughness}, {"metalness", look.glass.metalness}}},
          {"lights", lights},
          {"ambientColor", channelsToColor(a, a, a)}};
}

void AppController::setShowGrid(bool v) { if (v != showGrid_) { showGrid_ = v; emit viewOptionsChanged(); } }
void AppController::setShowAxes(bool v) { if (v != showAxes_) { showAxes_ = v; emit viewOptionsChanged(); emit rulerChanged(); } }
void AppController::setShowEdges(bool v) { if (v != showEdges_) { showEdges_ = v; emit viewOptionsChanged(); } }
void AppController::setMoldGlass(bool v) { if (v != moldGlass_) { moldGlass_ = v; emit viewOptionsChanged(); } }
void AppController::setMoldOpacity(double v) {
  v = std::clamp(v, 0.05, 1.0);
  if (v != moldOpacity_) { moldOpacity_ = v; emit viewOptionsChanged(); }
}

QVariantMap AppController::gridInfo() const {
  return {{"majorStep", grid_.majorStep}, {"minorStep", grid_.minorStep}, {"size", grid_.size}};
}

void AppController::rebuildGrid() {
  // Both grids draw every line, as the reference does (a major line lies over a minor one).
  gridMinor_.setBuffers(viewport::buildGridBuffers(grid_.size, grid_.minorStep));
  gridMajor_.setBuffers(viewport::buildGridBuffers(grid_.size, grid_.majorStep));
  // The ruler is marked dirty by every grid, as the reference's setGridConfig does, and rebuilt on the next turn of the event loop
  // (the reference: on the next frame), after whatever else the change brings has been applied: a model import fits the camera
  // right after the grid is built, and the labels' size depends on the zoom they are built at.
  ruler_.setGrid(grid_.size, grid_.minorStep);
  QMetaObject::invokeMethod(this, &AppController::refreshRuler, Qt::QueuedConnection);
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
  if (tool == QLatin1String("eraser") && !eraserAvailable()) {  // the Eraser needs cutting planes (and no evaluation running)
    setStatus(QStringLiteral("The Eraser needs a cutting plane: choose a face to cut by first."));
    return;
  }
  if (tool == QLatin1String("orientation")) {  // the Flip tool needs a model whose geometry has not been generated yet
    if (const OrientationCapability c = orientationCapability(); !c.available) {
      setStatus(c.reason);
      return;
    }
  }
  tool_ = tool;
  measurePoints_.clear();
  measurement_.clear();
  hoverFace_.reset();  // hover belongs to the "select" tool
  refreshSelectionOverlay();
  emit toolChanged();
  emit selectionChanged();
}

// pickAt, hoverAt, clearSelection and the selection overlay live in AppControllerSelection.cpp.

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

QVariantMap AppController::sprueStyle() const {
  return {{"validColor", QColor::fromRgb(kSpruePreviewValidRgb)},
          {"invalidColor", QColor::fromRgb(kSpruePreviewInvalidRgb)},
          {"opacity", kSpruePreviewOpacity},
          {"roughness", kSpruePreviewRoughness},
          {"metalness", kSpruePreviewMetalness},
          {"glassOpacity", kSprueGlassOpacity},
          {"glassEdgeColor", QColor::fromRgb(kSprueGlassEdgeRgb)},
          {"glassEdgeOpacity", kSprueGlassEdgeOpacity}};
}

void AppController::refreshSprueGlass() {
  // Like the reference (setActive + the mold root), the glass shows only while the Sprue tool is active and a mold exists.
  const bool active = tool_ == QLatin1String("sprue") && moldPhase_ == QLatin1String("complete");
  if (active != sprueGlass_) {
    sprueGlass_ = active;
    scene_.setGlass(active);
    emit sprueGlassChanged();
  }
  if (!active) clearSprueCandidate();
}

void AppController::setSprueCandidate(QVariantMap candidate, const std::optional<SpruePreviewGeometry>& geometry) {
  if (candidate == sprueCandidate_) return;
  sprueCandidate_ = std::move(candidate);
  if (geometry) {
    std::vector<viewport::SmoothSurface> surfaces;
    for (const SpruePreviewPart& part : geometry->parts) {
      if (part.visible) surfaces.push_back({&part.surface.positions, &part.surface.normals, &part.surface.indices});
    }
    spruePreview_.setBuffers(viewport::buildSmoothSurfaceBuffers(surfaces));
  } else {
    spruePreview_.clearBuffers();
  }
  emit spruesChanged();
}

void AppController::clearSprueCandidate() { setSprueCandidate({}, std::nullopt); }

void AppController::previewSprueAt(qreal x, qreal y, qreal w, qreal h) {
  camera_.setViewportSize(w, h);
  if (tool_ != QLatin1String("sprue")) {
    clearSprueCandidate();
    return;
  }
  QVariantMap candidate;
  std::optional<SpruePreviewGeometry> geometry;
  if (const auto placement = placementAt(x, y, w, h)) {
    geometry = buildSpruePreview(*placement);  // nullopt when the stem is shorter than the tolerance
    candidate = {{"onTopFace", geometry.has_value()},
                 {"valid", placement->valid},
                 {"x", placement->topPoint.x}, {"y", placement->topPoint.y}, {"z", placement->topPoint.z},
                 {"stemLengthMm", placement->stemLengthMm},
                 {"mainDiameterMm", placement->profileDesign.profile.mainDiameterMm},
                 {"entryNeckDiameterMm", placement->profileDesign.profile.entryNeckDiameterMm},
                 {"entryNeckLengthMm", placement->profileDesign.profile.entryNeckLengthMm}};
  }
  setSprueCandidate(std::move(candidate), geometry);
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
  clearSprueCandidate();  // the mold is rebuilt with the sprue; the next pointer move previews again
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
  HistoryEntry before = captureHistory();
  // Edits made while an earlier one is still being evaluated are one burst: they share the entry the first one made.
  const bool burst = spruePhase_ == "evaluating";
  if (!edit(sprueIntents_)) return;
  if (!burst) pushHistoryEntry(std::move(before));
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

  const MoldGenerationResult moldCopy = *moldResult_;
  const quint64 moldGeneration = moldGeneration_;
  auto engine = engine_;
  CancellationToken cancel;
  activeCancel_ = cancel;
  runJob<DerivedMoldEvaluation>(
      this, cancel,
      [engine, moldCopy, intents = sprueIntents_, cache = sprueCache_](const CancellationToken&, const ProgressCallback& progress) {
        return evaluateDerivedMold(*engine, moldCopy, intents, progress, cache.get());
      },
      [this, generation, moldGeneration](JobOutcome<DerivedMoldEvaluation> outcome) {
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
        sprueEvaluation_ = std::move(outcome.result->sprues);
        registration_ = std::move(outcome.result->registration);
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

// --- segmentation -----------------------------------------------------------------

double AppController::effectiveMoldClearanceMm() const {
  return segmentation_.adopted && segmentation_.source ? segmentation_.source->definition.clearanceMm : moldClearanceMm_;
}

QVariantMap AppController::printerVolume() const {
  if (!printerVolume_) return {};
  return {{"x", printerVolume_->x}, {"y", printerVolume_->y}, {"z", printerVolume_->z}};
}

void AppController::setPrinterVolume(double x, double y, double z) {
  if (!(std::isfinite(x) && std::isfinite(y) && std::isfinite(z) && x > 0 && y > 0 && z > 0)) {
    setStatus(QStringLiteral("Printer volume must be finite and positive."));
    return;
  }
  const Point3 next{x, y, z};
  if (printerVolume_ && *printerVolume_ == next) return;
  printerVolume_ = next;
  refreshMasterStaleness();
  if (segmentation_.phase != QStringLiteral("idle")) {
    invalidateSegmentation(QStringLiteral("Printer volume changed; plan the segmentation again."));
  } else {
    emit segmentationChanged();
  }
}

void AppController::invalidateSegmentation(const QString& message) {
  const bool wasAdopted = segmentation_.adopted;
  const quint64 generation = segmentation_.generation + 1;
  segmentation_ = SegmentationUi{};
  segmentation_.generation = generation;
  segmentation_.message = message;
  if (wasAdopted && moldResult_) {
    clearMold(model_ ? QStringLiteral("ready") : QStringLiteral("unavailable"));
  } else if (!moldResult_) {
    scene_.clearMoldBodies();
    scene_.setPartOffset({0, 0, 0});
  }
  emit segmentationChanged();
  emit moldInputsChanged();
}

void AppController::showSegmentationBodies(bool refit) {
  masterShown_ = false;
  std::vector<SceneModel::BodyInput> bodies;
  for (const MoldBody& body : segmentation_.shownBodies) {
    bodies.push_back({QString::fromStdString(body.id), QString::fromStdString(body.name),
                      std::make_shared<MeshPayload>(body.mesh), body.bounds, body.volumeMm3});
  }
  scene_.setMoldBodies(bodies);
  if (segmentation_.source) {
    const Point3 o = segmentation_.source->definition.partOffset;
    scene_.setPartOffset({static_cast<float>(o.x), static_cast<float>(o.y), static_cast<float>(o.z)});
  }
  applySceneColors();
  applySceneColors();
  refreshSceneFrame(refit);
}

void AppController::rebuildSegmentationPlan() {
  if (!segmentation_.basePlan || !segmentation_.source) return;
  SegmentationPlan plan = *segmentation_.basePlan;
  for (const auto& [axis, coordinate] : segmentation_.extensions) {
    plan = mergeExtensionBoundary(plan, axis, coordinate, segmentation_.source->snapshot.protectedRegions);
  }
  segmentation_.shownBodies.clear();
  if (plan.validation.status == "planning-valid") {
    segmentation_.shownBodies = buildSegmentationPlanPreviewBodies(plan, segmentation_.source->definition);
    segmentation_.message = QStringLiteral("%1 sections planned.").arg(plan.segments.size());
  } else {
    segmentation_.message = plan.validation.blockers.empty()
                                ? QStringLiteral("The plan is not valid.")
                                : QString::fromStdString(plan.validation.blockers.front().message);
  }
  segmentation_.plan = std::move(plan);
  segmentation_.phase = QStringLiteral("planned");
  showSegmentationBodies();
  startSegmentationPreviewRegistration();
  emit segmentationChanged();
  setStatus(segmentation_.message);
}

// The viewport's plan preview shows the sections with their registration keys (segmentationPreview.ts, generateSegmentationPlanPreview): the canonical
// registration run over the unkeyed preview bodies, asynchronously because it is slow for many sections. It is display geometry only, never an execution
// result. A newer plan, a reset or an execution supersedes it; if the registration yields no keys the sections stay as planned.
void AppController::startSegmentationPreviewRegistration() {
  segmentation_.previewState = QStringLiteral("none");
  segmentation_.previewReason.clear();
  segmentation_.previewKeyCount = 0;
  const quint64 revision = ++segmentation_.previewRevision;
  if (!segmentation_.plan || !segmentation_.source || segmentation_.plan->validation.status != "planning-valid" || segmentation_.shownBodies.empty()) return;
  segmentation_.previewState = QStringLiteral("running");

  const quint64 generation = segmentation_.generation;
  auto engine = engine_;
  const SegmentationPlan plan = *segmentation_.plan;
  const SegmentationSourceSnapshot snapshot = segmentation_.source->snapshot;
  const ReferenceMoldDefinition definition = segmentation_.source->definition;
  const std::vector<MoldBody> unkeyed = segmentation_.shownBodies;
  runJob<DerivedRegistrationState>(
      this, CancellationToken(),
      [engine, plan, snapshot, definition, unkeyed](const CancellationToken&, const ProgressCallback&) {
        return generateSegmentationRegistration(*engine, plan, snapshot, definition, unkeyed, "segmentation-preview-registration");
      },
      [this, generation, revision](JobOutcome<DerivedRegistrationState> outcome) {
        // Superseded (a newer plan, a reset, an execution) or no longer showing the plan: drop it.
        if (generation != segmentation_.generation || revision != segmentation_.previewRevision || segmentation_.phase != QLatin1String("planned")) return;
        if (outcome.state != JobState::Succeeded || !outcome.result) {
          segmentation_.previewState = QStringLiteral("failed");
          segmentation_.previewReason = outcome.errorMessage;
          emit segmentationChanged();
          return;
        }
        DerivedRegistrationState& state = *outcome.result;
        if (state.status == "generated" && !state.bodies.empty()) {
          std::size_t keys = 0;
          for (const MoldBody& body : state.bodies)
            for (const MeshFaceRun& run : body.mesh.faceRuns)
              if (run.role == FaceRole::RegistrationKey) keys += run.triangleCount;
          segmentation_.previewKeyCount = keys;
          segmentation_.shownBodies = std::move(state.bodies);
          segmentation_.previewState = QStringLiteral("keyed");
          showSegmentationBodies(false);  // the same bodies with their keys: the camera stays where the user left it
        } else {
          segmentation_.previewState = QStringLiteral("unkeyed");
          segmentation_.previewReason = state.report ? QString::fromStdString(state.report->reasonCode) : QString::fromStdString(state.status);
        }
        emit segmentationChanged();
      });
}

std::optional<CommittedMoldSource> AppController::committedMoldSource() const {
  if (!moldResult_) return std::nullopt;
  CommittedMoldSource source;
  source.definition = moldResult_->definition;
  source.facts.bodies = finalBodies();
  source.facts.hasCavity = true;
  source.facts.cavityBounds = moldResult_->cavity.cavityTool.solid.bounds;
  source.facts.cavityClearanceMm = moldResult_->cavity.cavityTool.clearanceMm;
  source.facts.cavitySourceSignature = moldResult_->cavity.sourceSignature;
  if (sprueEvaluation_) source.facts.sprues = sprueEvaluation_->resolvedSprues;
  if (registration_ && registration_->report) source.facts.generatedFeatures = registration_->report->features;
  source.sourceRevision = static_cast<double>(moldInputsRevision_);
  source.sourceFingerprint = moldResult_->cavity.sourceSignature;
  source.resultRequestId = moldResult_->cavity.operationId;
  source.current = moldPhase_ == QLatin1String("complete");   // a mold that is being generated again is not what the plan would be built on
  return source;
}

void AppController::planSegmentation() {
  if (!model_) {
    emit errorOccurred(QStringLiteral("Segmentation"), QStringLiteral("Import an STL model first."), QStringLiteral("no_model"));
    return;
  }
  if (!printerVolume_) {
    emit errorOccurred(QStringLiteral("Segmentation"), QStringLiteral("Set the printer volume first."), QStringLiteral("invalid_printer_volume"));
    return;
  }
  if (busy_) return;
  // The committed mold is read before anything is dropped: its cavity, sprues and registration keys become protected regions of the plan
  // when it was built on the same block (D-111). The plan then replaces the mold, as before.
  const std::optional<CommittedMoldSource> committed = committedMoldSource();
  invalidateSegmentation(QString());

  auto preliminary = capturePreliminaryWholeBlockSnapshot(model_->groundedBounds, moldClearanceMm_, model_->modelId);
  if (!preliminary && !committed) {
    segmentation_.phase = QStringLiteral("failed");
    segmentation_.message = QStringLiteral("The imported model's bounds cannot produce a valid reference mold envelope.");
    emit segmentationChanged();
    return;
  }
  SegmentationSourceResult read = readSegmentationSource(preliminary, committed);
  if (read.status != "ready" || !read.source) {
    // A committed mold that is stale or structurally invalid blocks planning, and stays: it is not replaced by the automatic source.
    segmentation_.phase = QStringLiteral("failed");
    segmentation_.message = read.issues.empty() ? QStringLiteral("Segmentation planning failed.") : QString::fromStdString(read.issues.front().message);
    emit segmentationChanged();
    setStatus(segmentation_.message);
    return;
  }
  if (moldResult_) clearMold(QStringLiteral("ready"));
  segmentation_.source = std::move(*read.source);
  const SegmentationRequest request = createSegmentationRequest(segmentation_.source->snapshot, *printerVolume_);
  const SegmentationPlanningResult result = craft::planSegmentation(request, segmentation_.source->snapshot);
  if (result.status == "planned") {
    segmentation_.basePlan = *result.plan;
    rebuildSegmentationPlan();
    return;
  }
  if (result.status == "not-required") {
    segmentation_.phase = QStringLiteral("not-required");
    segmentation_.message = QStringLiteral("The mold block fits the printer volume; no segmentation is needed.");
  } else {
    segmentation_.phase = QStringLiteral("failed");
    segmentation_.message = result.issues.empty() ? QStringLiteral("Segmentation planning failed.")
                                                  : QString::fromStdString(result.issues.front().message);
  }
  emit segmentationChanged();
  setStatus(segmentation_.message);
}

void AppController::addSegmentationExtension(const QString& axisText) {
  if (!segmentation_.basePlan || !segmentation_.source || segmentation_.phase == QStringLiteral("executing")) return;
  const Axis axis = axisText == "x" ? Axis::X : axisText == "y" ? Axis::Y : Axis::Z;
  std::vector<Axis> userAxes;
  for (const auto& e : segmentation_.extensions) userAxes.push_back(e.first);
  const AxisOwnership ownership = deriveAxisOwnership(segmentation_.basePlan->requiredAxes, userAxes);
  if (std::find(ownership.availableAxes.begin(), ownership.availableAxes.end(), axis) == ownership.availableAxes.end()) {
    setStatus(QStringLiteral("The %1 axis is already used by the plan.").arg(axisText.toUpper()));
    return;
  }
  pushHistory();   // adding an extension boundary is one undoable step (D-110)
  segmentation_.extensions.emplace_back(axis, suggestExtensionAxisPosition(segmentation_.source->snapshot, axis));
  rebuildSegmentationPlan();
}

void AppController::moveSegmentationExtension(const QString& axisText, double coordinateMm) {
  if (!std::isfinite(coordinateMm) || segmentation_.phase == QStringLiteral("executing")) return;
  const Axis axis = axisText == "x" ? Axis::X : axisText == "y" ? Axis::Y : Axis::Z;
  for (auto& e : segmentation_.extensions) {
    if (e.first == axis) {
      if (e.second != coordinateMm) pushHistory();   // one undoable step; setting the same value is not an edit
      e.second = coordinateMm;  // an invalid position is kept and reported by the plan validation
      rebuildSegmentationPlan();
      return;
    }
  }
}

void AppController::removeSegmentationExtension(const QString& axisText) {
  if (segmentation_.phase == QStringLiteral("executing")) return;
  const Axis axis = axisText == "x" ? Axis::X : axisText == "y" ? Axis::Y : Axis::Z;
  auto& ext = segmentation_.extensions;
  const auto it = std::remove_if(ext.begin(), ext.end(), [&](const auto& e) { return e.first == axis; });
  if (it == ext.end()) return;
  const auto before = captureHistory();   // the state the removal is about to change
  ext.erase(it, ext.end());
  pushHistoryEntry(before);
  rebuildSegmentationPlan();
}

void AppController::restoreSegmentationExtensions(const std::vector<std::pair<Axis, double>>& wanted) {
  // Only while a plan exists to hold them, and never under a running execution (the controller's own edit guards).
  if (!segmentation_.basePlan || segmentation_.adopted || segmentation_.phase == QStringLiteral("executing")) return;
  std::vector<std::pair<Axis, double>> next;
  for (const auto& [axis, coordinate] : wanted) {
    std::vector<Axis> userAxes;
    for (const auto& e : next) userAxes.push_back(e.first);
    const AxisOwnership ownership = deriveAxisOwnership(segmentation_.basePlan->requiredAxes, userAxes);
    if (std::find(ownership.availableAxes.begin(), ownership.availableAxes.end(), axis) != ownership.availableAxes.end()) next.emplace_back(axis, coordinate);
  }
  if (next == segmentation_.extensions) return;
  segmentation_.extensions = std::move(next);
  rebuildSegmentationPlan();
}

void AppController::resetSegmentation() {
  if (activeCancel_ && segmentation_.phase == QStringLiteral("executing")) activeCancel_->cancel();
  invalidateSegmentation(QString());
  clearHistory();
  setStatus(QStringLiteral("Segmentation reset."));
}

void AppController::executeSegmentation() {
  if (!segmentation_.plan || !segmentation_.source || !printerVolume_ || busy_) return;
  if (segmentation_.plan->validation.status != "planning-valid") {
    emit errorOccurred(QStringLiteral("Segmentation"), segmentation_.message, QStringLiteral("invalid_plan"));
    return;
  }
  const quint64 generation = ++segmentation_.generation;  // also supersedes a preview still running
  segmentation_.previewState = QStringLiteral("none");
  segmentation_.phase = QStringLiteral("executing");
  emit segmentationChanged();
  setBusy(true, QStringLiteral("segmenting"), 0);
  setStatus(QStringLiteral("Cutting the mold block…"));

  struct SegmentationJob {
    SegmentationExecutionResult result;
    std::optional<DerivedRegistrationState> registration;
  };
  CancellationToken cancel;
  activeCancel_ = cancel;
  auto engine = engine_;
  const SegmentationPlan plan = *segmentation_.plan;
  const SegmentationSourceSnapshot snapshot = segmentation_.source->snapshot;
  const ReferenceMoldDefinition definition = segmentation_.source->definition;
  const Point3 printer = *printerVolume_;
  runJob<SegmentationJob>(
      this, cancel,
      [engine, plan, snapshot, definition, printer](const CancellationToken& token, const ProgressCallback& progress) {
        SegmentationJob job;
        const SegmentationPreflight preflight = createSegmentationExecutionRequest(plan, snapshot, printer);
        if (!preflight.ok) {
          job.result = preflight.failure;
          return job;
        }
        if (progress) progress("segmenting", 0.2);
        job.result = executePlaneSegmentation(*engine, preflight.request, token);
        if (job.result.status == "executed") {
          if (progress) progress("registration", 0.8);
          std::vector<MoldBody> bodies;
          for (const SegmentationExecutedBody& b : job.result.bodies) bodies.push_back(b.body);
          job.registration = generateSegmentationRegistration(*engine, plan, snapshot, definition, bodies, "segmentation-registration");
        }
        return job;
      },
      [this, generation](JobOutcome<SegmentationJob> outcome) {
        activeCancel_.reset();
        setBusy(false);
        if (generation != segmentation_.generation) return;  // superseded
        const auto fail = [&](const QString& code, const QString& message) {
          segmentation_.phase = QStringLiteral("failed");
          segmentation_.message = message;
          emit segmentationChanged();
          setStatus(message);
          if (code != QLatin1String("execution_cancelled")) {
            emit errorOccurred(QStringLiteral("Segmentation failed"), message, code);
          }
        };
        if (outcome.state != JobState::Succeeded || !outcome.result) {
          fail(outcome.errorCode.isEmpty() ? QStringLiteral("execution_cancelled") : outcome.errorCode,
               outcome.errorMessage.isEmpty() ? QStringLiteral("Segmentation was cancelled.") : outcome.errorMessage);
          return;
        }
        SegmentationExecutionResult& result = outcome.result->result;
        if (result.status != "executed") {
          fail(QString::fromStdString(result.reasonCode),
               result.issues.empty() ? QStringLiteral("Segmentation failed.") : QString::fromStdString(result.issues.front().message));
          return;
        }
        segmentation_.executedBodies.clear();
        for (const SegmentationExecutedBody& b : result.bodies) segmentation_.executedBodies.push_back(b.body);
        segmentation_.registration = std::move(outcome.result->registration);
        segmentation_.shownBodies = segmentation_.registration && !segmentation_.registration->bodies.empty()
                                        ? segmentation_.registration->bodies
                                        : segmentation_.executedBodies;
        segmentation_.execution = std::move(result);
        segmentation_.adopted = true;
        clearHistory();  // the keyed pieces replace the Cut by Face mold: nothing before this can be undone into
        segmentation_.phase = QStringLiteral("executed");
        const bool keyed = segmentation_.registration && segmentation_.registration->status == "generated";
        segmentation_.message = QStringLiteral("%1 mold sections cut%2.")
                                    .arg(segmentation_.executedBodies.size())
                                    .arg(keyed ? QStringLiteral(" and keyed") : QStringLiteral(""));
        showSegmentationBodies();
        emit segmentationChanged();
        emit moldInputsChanged();
        setStatus(segmentation_.message);
      },
      [this](QString stage, double fraction) {
        busyStage_ = stage;
        busyProgress_ = fraction;
        emit busyChanged();
      });
}

QVariantMap AppController::segmentation() const {
  QVariantMap m{{"phase", segmentation_.phase}, {"message", segmentation_.message}, {"adopted", segmentation_.adopted},
                {"previewState", segmentation_.previewState}, {"previewReason", segmentation_.previewReason},
                {"previewKeyTriangles", static_cast<qulonglong>(segmentation_.previewKeyCount)}};
  if (!segmentation_.source) return m;
  m.insert("moldClearanceMm", segmentation_.source->definition.clearanceMm);
  QVariantList protectedRegions;
  for (const SegmentationProtectedRegion& region : segmentation_.source->snapshot.protectedRegions) {
    protectedRegions << QVariantMap{{"id", QString::fromStdString(region.id)}, {"kind", QString::fromStdString(region.kind)}, {"hardness", QString::fromStdString(region.hardness)}};
  }
  m.insert("protectedRegions", protectedRegions);
  m.insert("blockSize", QVariantMap{{"x", segmentation_.source->snapshot.aggregateBounds.size().x},
                                    {"y", segmentation_.source->snapshot.aggregateBounds.size().y},
                                    {"z", segmentation_.source->snapshot.aggregateBounds.size().z}});
  if (!segmentation_.plan) return m;
  const SegmentationPlan& plan = *segmentation_.plan;
  QVariantList required;
  for (Axis a : plan.requiredAxes) required << QString::fromLatin1(axisName(a));
  m.insert("requiredAxes", required);
  m.insert("sectionCount", static_cast<qulonglong>(plan.segments.size()));
  m.insert("valid", plan.validation.status == "planning-valid");
  QVariantList blockers;
  for (const SegmentationIssue& i : plan.validation.blockers) blockers << QString::fromStdString(i.message);
  m.insert("blockers", blockers);
  QVariantList extensions;
  std::vector<Axis> userAxes;
  for (const auto& e : segmentation_.extensions) {
    userAxes.push_back(e.first);
    extensions << QVariantMap{{"axis", QString::fromLatin1(axisName(e.first))}, {"coordinateMm", e.second}};
  }
  m.insert("extensions", extensions);
  QVariantList available;
  if (segmentation_.basePlan) {
    for (Axis a : deriveAxisOwnership(segmentation_.basePlan->requiredAxes, userAxes).availableAxes) {
      available << QString::fromLatin1(axisName(a));
    }
  }
  m.insert("availableAxes", available);
  if (segmentation_.adopted) {
    QVariantMap execution{{"bodyCount", static_cast<qulonglong>(segmentation_.executedBodies.size())}};
    if (segmentation_.registration && segmentation_.registration->report) {
      execution.insert("registrationStatus", QString::fromStdString(segmentation_.registration->status));
      execution.insert("keyCount", static_cast<qulonglong>(segmentation_.registration->report->features.size()));
      execution.insert("registrationMessage", QString::fromStdString(segmentation_.registration->report->message));
    }
    if (segmentation_.execution && segmentation_.execution->validation) {
      execution.insert("cutCount", static_cast<qulonglong>(segmentation_.execution->validation->cuts.size()));
      execution.insert("volumeDeltaMm3", segmentation_.execution->validation->volumeDeltaMm3);
    }
    m.insert("execution", execution);
  }
  return m;
}

QVariantMap AppController::stateSummary() const {
  QVariantMap s{{"applicationVersion", applicationVersion()},
                {"modelPhase", modelPhase_},
                {"moldPhase", moldPhase_},
                {"analysisPhase", analysisPhase_},
                {"reportsPhase", reportsPhase_},
                {"project", project()},
                {"sceneItems", scene_.count()},
                {"status", statusText_}};
  s.insert("model", modelInfo());
  s.insert("mold", moldSummary());
  s.insert("moldError", moldError_);
  s.insert("sprues", sprues());
  s.insert("segmentation", segmentation());
  s.insert("masterMold", masterMold());
  s.insert("analysisError", analysisError_);
  s.insert("analysisStatus", analysisReport_.value("status"));
  return s;
}

}  // namespace craft::app
