// Master Mold in the application controller: the worker (a thread-pool job with
// a timeout and cooperative cancellation), the store plumbing, scene display
// and the model the QML panel binds to. The product logic itself lives in the
// Qt-free core (master/MasterMoldStore).

#include <QDateTime>
#include <QDir>
#include <QFileInfo>
#include <QLocale>
#include <QLoggingCategory>
#include <QTimer>

#include <algorithm>
#include <map>

#include "AppController.h"
#include "master/MasterPlanning.h"
#include "master/MasterWire.h"

Q_DECLARE_LOGGING_CATEGORY(lcApp)

namespace craft::app {

namespace {


/// User-facing progress labels (internal stage names stay in the engine contract).
QString progressLabel(const std::string& stage) {
  static const std::map<std::string, QString> labels{
      {"analyzing_geometry", QStringLiteral("Analyzing part…")},
      {"searching_release_axes", QStringLiteral("Searching release directions…")},
      {"choosing_seam", QStringLiteral("Choosing the parting seam…")},
      {"building_working_halves", QStringLiteral("Building the two working halves…")},
      {"inverting_masters", QStringLiteral("Inverting each half into its master…")},
      {"verifying_release", QStringLiteral("Verifying release…")},
      {"finalizing", QStringLiteral("Finalizing…")}};
  const auto it = labels.find(stage);
  return it == labels.end() ? QString::fromStdString(stage) : it->second;
}

QString plural(int n, const char* singular, const char* pluralForm) {
  return QStringLiteral("%1 %2").arg(n).arg(QLatin1String(n == 1 ? singular : pluralForm));
}

/// Master A and Master B keep one colour each; their virtual working halves are drawn in the same colour as the master they are cast in.
QColor bodyColour(const std::string& key) {
  return key == "master-a" || key == "half-a" ? QColor("#4f8cc9") : QColor("#c98a4f");
}

/// Gap between bodies laid out side by side in the viewport.
constexpr double kDisplayGapMm = 15;

}  // namespace

// --- identity / seed -----------------------------------------------------------------------------------------------------

std::optional<std::string> AppController::masterLiveIdentity() const {
  if (!model_) return std::nullopt;
  const MasterProcessProfile profile;
  const std::array<double, 16> identity{1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
  return masterSeedStalenessIdentity(masterSourceGeometryVersion(model_->geometryVersion, model_->groundedBounds, identity), printerVolume_, profile);
}

// --- generate / reset -------------------------------------------------------------------------------------------------------

void AppController::generateMasterMold() {
  if (cuttingSession_.open) {
    setStatus(QStringLiteral("Finish the cutting session (Done or Cancel) before generating the Master Mold."));
    return;
  }
  if (!model_) {
    emit errorOccurred(QStringLiteral("Master Mold"), QStringLiteral("Import an STL model first."), QStringLiteral("no_model"));
    return;
  }
  if (busy_) return;

  // Like the mold: refused before any work when the part's tooling cannot fit in the memory that is free (estimateMasterMoldPeakBytes).
  {
    const std::uint64_t available = memoryProbe_ ? memoryProbe_() : 0;
    const std::uint64_t triangles = model_->sourceSoup->triangleCount();
    const std::uint64_t needed = estimateMasterMoldPeakBytes(triangles);
    if (available != 0 && needed > available) {
      const auto gib = [](std::uint64_t bytes) { return QLocale().toString(static_cast<double>(bytes) / (1024.0 * 1024.0 * 1024.0), 'f', 1); };
      emit errorOccurred(QStringLiteral("Master Mold"),
                         QStringLiteral("This model has %1 triangles. Planning its Master Mold needs about %2 GiB of memory and about %3 GiB is free. "
                                        "Close other applications, or use a model with fewer triangles, and try again.")
                             .arg(QLocale().toString(static_cast<qulonglong>(triangles)), gib(needed), gib(available)),
                         QStringLiteral("master_memory_insufficient"));
      return;
    }
  }

  MasterSeedSnapshot seed;
  try {
    MasterSeedInput input;
    MasterSeedGeometryInput& g = input.sourcePartGeometry;
    g.modelId = model_->modelId;
    g.positions.assign(model_->groundedSoup->positions.begin(), model_->groundedSoup->positions.end());
    g.indices.resize(g.positions.size() / 3);
    for (std::size_t i = 0; i < g.indices.size(); ++i) g.indices[i] = static_cast<std::uint32_t>(i);  // an STL is a triangle soup: identity index
    g.transform = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
    g.localBounds = model_->groundedBounds;
    g.geometryVersion = model_->geometryVersion;
    g.sourceSignature = model_->geometryVersion;
    input.printerBuildVolume = printerVolume_;
    input.projectRevision = model_->geometryVersion;
    seed = buildMasterMoldSeedSnapshot(input);
  } catch (const std::exception& error) {
    masterStore_.reportGenerationFailure(error.what());
    emit masterMoldChanged();
    return;
  }

  const MasterMoldGenerateStart start = masterStore_.beginGenerate(seed, masterLiveIdentity());
  if (start.reused) {
    showMasterBodies();
    emit masterMoldChanged();
    setStatus(QStringLiteral("Master Mold is up to date."));
    return;
  }
  const int generation = start.generationVersion;
  masterRunning_ = true;
  masterTimedOut_ = false;
  lastMasterExport_.clear();  // it described the previous generation
  emit masterMoldChanged();
  setBusy(true, QStringLiteral("master-mold"), 0);
  setStatus(QStringLiteral("Planning master tooling…"));

  CancellationToken cancel;
  activeCancel_ = cancel;
  masterRunGeneration_ = generation;
  const auto abandoned = std::make_shared<bool>(false);
  masterAbandon_ = abandoned;
  // The timeout (and a cancel, and a reset) release the UI at once: the engine cannot be interrupted inside a Boolean, which for a large part can run
  // for minutes, and until it returned the whole application stayed busy. The thread finishes in the background and its result is discarded.
  const int timeoutMs = masterTimeoutMs_;
  QTimer::singleShot(timeoutMs, this, [this, generation, abandoned, timeoutMs] {
    if (masterRunning_ && !*abandoned && masterStore_.generationVersion() == generation) {
      masterTimedOut_ = true;
      abandonMasterRun(QStringLiteral("Master Mold generation exceeded %1 ms.").arg(timeoutMs), true);
    }
  });

  auto engine = engine_;
  const MasterMoldRequest request = *start.request;
  const auto done =
      [this, generation, abandoned, timeoutMs](JobOutcome<MasterMoldResult> outcome) {
        if (*abandoned) {  // the run was given up (timeout, cancel, reset): the UI has moved on, nothing here may touch it
          emit masterMoldChanged();
          return;
        }
        activeCancel_.reset();
        masterAbandon_.reset();
        setBusy(false);
        const bool wasRunning = masterRunning_;
        masterRunning_ = false;
        if (outcome.state == JobState::Succeeded && outcome.result) {
          if (!masterStore_.commitGeneration(generation, std::move(*outcome.result), masterLiveIdentity())) return;  // superseded or reset
          showMasterBodies();
          const auto ui = deriveMasterMoldUiState(masterStore_.status(), masterStore_.failure(), masterStore_.lastError());
          setStatus(ui.kind == "success" ? QStringLiteral("Master A and Master B generated.")
                    : ui.kind == "stale"  ? QStringLiteral("Master Mold finished, but the part or printer context changed meanwhile.")
                                          : QStringLiteral("No two-master plan was found: %1").arg(QString::fromStdString(ui.message.value_or(std::string()))));
          emit masterMoldChanged();
          return;
        }
        QString message = outcome.errorMessage;
        if (masterTimedOut_) message = QStringLiteral("Master Mold generation exceeded %1 ms.").arg(timeoutMs);
        else if (outcome.state == JobState::Cancelled) message = QStringLiteral("Master Mold generation was cancelled.");
        if (message.isEmpty()) message = QStringLiteral("Master Mold generation failed.");
        if (!masterStore_.failGeneration(generation, message.toStdString())) return;  // reset or superseded: stay quiet
        (void)wasRunning;
        setStatus(message);
        emit masterMoldChanged();
        if (outcome.state == JobState::Failed && !masterTimedOut_) {
          emit errorOccurred(QStringLiteral("Master Mold failed"), message, outcome.errorCode);
          qCWarning(lcApp) << "Master Mold failed:" << outcome.errorCode << message;
        }
      };
  const auto onProgress =
      [this, generation, abandoned](QString stage, double) {
        if (*abandoned) return;  // an abandoned run's last reports must not touch the footer while other work runs
        const std::string name = stage.toStdString();
        MasterMoldProgressStage s;
        s.stage = name;
        s.stageCount = static_cast<int>(kMasterProgressStages.size());
        for (int i = 0; i < s.stageCount; ++i) if (name == kMasterProgressStages[static_cast<std::size_t>(i)]) s.stageIndex = i;
        masterStore_.setProgress(generation, s);
        busyStage_ = progressLabel(name);
        busyProgress_ = (s.stageIndex + 1.0) / s.stageCount;
        emit busyChanged();
        emit masterMoldChanged();
      };
  if (workerExecutable_.isEmpty()) {   // the geometry always runs in its own process (P0-5); only a host that never set one (a bug) gets here
    JobOutcome<MasterMoldResult> failed;
    failed.state = JobState::Failed;
    failed.errorCode = QStringLiteral("worker_unavailable");
    failed.errorMessage = QStringLiteral("The Master Mold process is not configured.");
    done(std::move(failed));
    return;
  }
  {
    masterWorker_ = std::make_unique<WorkerProcess>(workerExecutable_, this);
    WorkerProcess* worker = masterWorker_.get();
    connect(worker, &WorkerProcess::progress, this, [onProgress](QString stage, double fraction) { onProgress(stage, fraction); });
    connect(worker, &WorkerProcess::stageLine, this, [](QString line) { qCInfo(lcApp).noquote() << "Master Mold stage" << line; });
    connect(worker, &WorkerProcess::finished, this, [this, worker, done](WorkerOutcome outcome) {
      JobOutcome<MasterMoldResult> job;
      switch (outcome.state) {
        case WorkerOutcome::State::Succeeded:
          try {
            job.result = decodeMasterMoldResult({reinterpret_cast<const std::uint8_t*>(outcome.result.constData()), static_cast<std::size_t>(outcome.result.size())});
            job.state = JobState::Succeeded;
          } catch (const WireError& error) {
            job.state = JobState::Failed;
            job.errorCode = QStringLiteral("worker_wire_error");
            job.errorMessage = QString::fromUtf8(error.what());
          }
          break;
        case WorkerOutcome::State::Cancelled:
          job.state = JobState::Cancelled;
          break;
        case WorkerOutcome::State::Crashed:
          job.state = JobState::Failed;
          job.errorCode = QStringLiteral("worker_crashed");
          job.errorMessage = QStringLiteral("The Master Mold process stopped unexpectedly (it may have run out of memory). ") + outcome.message;
          break;
        case WorkerOutcome::State::Failed:
          job.state = JobState::Failed;
          job.errorCode = outcome.errorCode.isEmpty() ? QStringLiteral("worker_failed") : outcome.errorCode;
          job.errorMessage = outcome.message;
          break;
      }
      if (masterWorker_.get() == worker) masterWorker_.release()->deleteLater();   // finished: nothing left to kill
      done(std::move(job));
    });
    const std::vector<std::uint8_t> payload = encodeMasterMoldRequest(request);
    if (!worker->start(QByteArray(R"({"kind":"master-mold"})"), QByteArray(reinterpret_cast<const char*>(payload.data()), static_cast<qsizetype>(payload.size())))) {
      masterWorker_.release()->deleteLater();
      JobOutcome<MasterMoldResult> failed;
      failed.state = JobState::Failed;
      failed.errorCode = QStringLiteral("worker_start_failed");
      failed.errorMessage = QStringLiteral("The Master Mold process could not be started.");
      done(std::move(failed));
    }
    return;
  }}
// Gives up the Master Mold run in progress: the UI is released now, the worker thread is left to end on its own (cancelled, so it stops at its next check
// and otherwise at the end of the Boolean it is in) and its result will be ignored.
void AppController::abandonMasterRun(const QString& message, bool failTheStore) {
  if (!masterRunning_ || !masterAbandon_) return;
  *masterAbandon_ = true;
  masterAbandon_.reset();
  if (masterWorker_) {   // the run is a separate process: stop it for real, so nothing keeps running and nothing is left to wait for
    masterWorker_->cancel();
    masterWorker_.release()->deleteLater();
  }
  if (activeCancel_) {
    activeCancel_->cancel();
    activeCancel_.reset();
  }
  masterRunning_ = false;
  setBusy(false);
  if (failTheStore) {
    masterStore_.failGeneration(masterRunGeneration_, message.toStdString());
    setStatus(message);
  }
  emit masterMoldChanged();
}

void AppController::clearMasterRun(bool resetStore) {
  abandonMasterRun(QString(), false);
  masterRunning_ = false;
  if (resetStore) masterStore_.reset();
  lastMasterExport_.clear();
  if (masterShown_) {
    scene_.clearMoldBodies();
    masterShown_ = false;
  }
  emit masterMoldChanged();
}

void AppController::resetMasterMold() {
  clearMasterRun(true);
  refreshSceneFrame(false);
  setStatus(QStringLiteral("Master Mold reset."));
}

void AppController::refreshMasterStaleness() {
  if (!model_ || !masterStore_.seedIdentity() || masterStore_.status() == "generating") return;
  const auto identity = masterLiveIdentity();
  if (!identity) return;
  const std::string before = masterStore_.status();
  masterStore_.markMasterMoldStale({*identity, model_->geometryVersion});
  if (masterStore_.status() != before) {
    showMasterBodies();  // stale pieces stay visible, drawn as a ghosted holdover
    emit masterMoldChanged();
    setStatus(QStringLiteral("Master Mold needs regeneration: the part or printer context changed."));
  }
}

// --- piece presentation -------------------------------------------------------------------------------------------------------

void AppController::toggleMasterPiece(const QString& pieceKey) {
  masterStore_.togglePieceVisibility(pieceKey.toStdString());
  showMasterBodies();
  emit masterMoldChanged();
}

void AppController::isolateMasterSet(const QString& setId) {
  masterStore_.isolateSet(setId.toStdString());
  showMasterBodies();
  emit masterMoldChanged();
}

void AppController::showAllMasterPieces() {
  masterStore_.showAllPieces();
  showMasterBodies();
  emit masterMoldChanged();
}

void AppController::showMasterBodies() {
  const auto renderable = selectRenderableMasterMoldBodies(masterStore_.status(), masterStore_.plan().get(), masterStore_.visibility());
  if (renderable.empty()) {
    if (masterShown_) {
      scene_.clearMoldBodies();
      masterShown_ = false;
      refreshSceneFrame(false);
    }
    return;
  }
  // The masters are in their own print frames (bed on z = 0, all near the origin): lay them side by side beside the part so they never overlap it or each
  // other. The virtual working halves are in the part's frame and stay where the part is.
  const Bounds3 partBounds = model_ ? model_->groundedBounds : Bounds3{{0, 0, 0}, {0, 0, 0}};
  double nextX = partBounds.max.x + kDisplayGapMm;
  std::vector<SceneModel::BodyInput> inputs;
  std::vector<QColor> palette;
  for (const MasterMoldRenderableBody& body : renderable) {
    auto mesh = std::make_shared<MeshPayload>(*body.mesh);
    Bounds3 bounds = body.bounds;
    if (body.inPrintFrame) {
      const double dx = nextX - body.bounds.min.x, dy = partBounds.min.y - body.bounds.min.y;
      for (std::size_t i = 0; i < mesh->vertexCount(); ++i) {
        mesh->positions[3 * i] += dx;
        mesh->positions[3 * i + 1] += dy;
      }
      bounds.min.x += dx; bounds.max.x += dx; bounds.min.y += dy; bounds.max.y += dy;
      nextX += (body.bounds.max.x - body.bounds.min.x) + kDisplayGapMm;
    }
    inputs.push_back({QString::fromStdString(body.id), QString::fromStdString(body.name), std::move(mesh), bounds, body.volumeMm3});
    palette.push_back(bodyColour(body.id));  // a stale body keeps its own colour and is ghosted instead
  }
  scene_.setMoldBodies(inputs);
  scene_.setPartOffset({0, 0, 0});
  scene_.recolor(QColor::fromRgb(referenceLook(true).partRgb), palette);
  QStringList ghosts;
  for (const MasterMoldRenderableBody& body : renderable)
    if (body.stale) ghosts << QString::fromStdString(body.id);
  scene_.setGhostBodies(ghosts);
  const auto& items = scene_.items();
  for (const MasterMoldRenderableBody& body : renderable) {
    for (std::size_t row = 0; row < items.size(); ++row) {
      if (items[row].kind == QLatin1String("mold-body") && items[row].id == QString::fromStdString(body.id)) {
        scene_.setItemVisible(static_cast<int>(row), body.visible);
        break;
      }
    }
  }
  masterShown_ = true;
  refreshSceneFrame(true);
}

// --- export ------------------------------------------------------------------------------------------------------------------------

void AppController::exportMasterTooling(const QUrl& folder) { exportMasterToolingTo(folder.toLocalFile()); }

void AppController::exportMasterToolingTo(const QString& folderPath) {
  if (masterExporting_) {
    setStatus(QStringLiteral("A Master tooling export is already running."));
    return;
  }
  if (masterStore_.status() == "generating") {
    setStatus(QStringLiteral("Wait for the Master Mold to finish generating before exporting."));
    return;
  }
  if (folderPath.isEmpty()) {
    emit errorOccurred(QStringLiteral("Export Master tooling"), QStringLiteral("No export folder was chosen."), QStringLiteral("master_export_write_failed"));
    return;
  }

  // The job shares the result it was started with, so regenerating or resetting while it runs is safe.
  const auto source = std::make_shared<const toolingexport::MasterExportSource>(
      toolingexport::MasterExportSource{masterStore_.status(), masterStore_.plan(), masterStore_.failure() ? masterStore_.failure()->message : std::string()});
  toolingexport::MasterExportOptions options;
  options.modelName = model_ ? model_->fileName.toStdString() : std::string("part");
  options.appVersion = applicationVersion().toStdString();
  options.exportedAtUtc = QDateTime::currentDateTimeUtc().toString(Qt::ISODate).toStdString();
  options.generationVersion = masterStore_.generationVersion();
  options.write3mf = true;   // one 3MF with both masters beside the two STL files (D-109)

  struct Exported {
    QString folder, threeMf;
    QStringList files;
    QStringList warnings;
    QStringList excluded;
    qulonglong bytes = 0;
  };
  masterExporting_ = true;
  emit masterMoldChanged();
  setStatus(QStringLiteral("Exporting Master tooling…"));
  runJob<Exported>(
      this, CancellationToken(),
      [source, options, folderPath](const CancellationToken& cancel, const ProgressCallback&) {
        const toolingexport::MasterExportPlan plan = toolingexport::planMasterToolingExport(*source, options.modelName);
        const toolingexport::MasterExportResult written =
            toolingexport::writeMasterToolingExport(plan, std::filesystem::path(folderPath.toStdWString()), options, cancel);
        Exported out;
        out.folder = QString::fromStdWString(written.folder.wstring());
        for (const auto& file : written.files) out.files << QString::fromStdWString(file.wstring());
        for (const std::string& warning : written.warnings) out.warnings << QString::fromStdString(warning);
        for (const toolingexport::ExcludedItem& item : written.excluded)
          out.excluded << QStringLiteral("%1: %2").arg(QString::fromStdString(item.name), QString::fromStdString(item.reason));
        if (!written.threeMf.empty()) out.threeMf = QString::fromStdWString(written.threeMf.wstring());
        out.bytes = written.totalBytes;
        return out;
      },
      [this](JobOutcome<Exported> outcome) {
        masterExporting_ = false;
        if (outcome.state == JobState::Succeeded && outcome.result) {
          const Exported& r = *outcome.result;
          lastMasterExport_ = QVariantMap{{"folder", r.folder},
                                          {"fileCount", static_cast<int>(r.files.size())},   // the per-piece STL files
                                          {"threeMf", r.threeMf},                              // the combined 3MF package; empty when none was written
                                          {"totalBytes", r.bytes},
                                          {"warnings", r.warnings},
                                          {"excluded", r.excluded}};
          emit masterMoldChanged();
          const QString message = r.threeMf.isEmpty() ? QStringLiteral("Exported Master A and Master B to %1").arg(r.folder)
                                                      : QStringLiteral("Exported Master A and Master B as two STL files and one 3MF to %1").arg(r.folder);
          setStatus(message);
          emit exportFinished(true, message, r.files);
          return;
        }
        emit masterMoldChanged();
        const QString message = outcome.state == JobState::Cancelled ? QStringLiteral("The Master tooling export was cancelled.") : outcome.errorMessage;
        setStatus(QStringLiteral("Master tooling export failed: %1").arg(message));
        emit exportFinished(false, message, {});
        if (outcome.state != JobState::Cancelled) emit errorOccurred(QStringLiteral("Export Master tooling"), message, outcome.errorCode);
      });
}

// --- panel model -----------------------------------------------------------------------------------------------------------------

QVariantMap AppController::masterMold() const {
  const MasterMoldStore& store = masterStore_;
  const MasterMoldUiState ui = deriveMasterMoldUiState(store.status(), store.failure(), store.lastError());
  QVariantMap m{{"status", QString::fromStdString(store.status())},
                {"uiKind", QString::fromStdString(ui.kind)},
                {"generating", store.status() == "generating"},
                {"canGenerate", model_.has_value() && !busy_}};

  QString progress;
  if (store.progressStage()) progress = progressLabel(store.progressStage()->stage);
  m.insert("progressLabel", progress);

  // The banner: why there is no result, or that it is out of date. The code and release stage of a failure are shown with it.
  QString banner;
  bool hasError = false;
  if (ui.kind == "error") {
    banner = QString::fromStdString(ui.message.value_or("Master Mold generation failed."));
    hasError = true;
  } else if (ui.kind == "blocked" && store.failure()) {
    const MasterFailure& f = *store.failure();
    banner = QString::fromStdString(f.message);
    if (f.stage != MasterReleaseStage::None) banner += QStringLiteral(" (stage: %1)").arg(QString::fromLatin1(masterReleaseStageName(f.stage)));
    if (!f.diagnostics.empty()) banner += QStringLiteral(" ") + QString::fromStdString(f.diagnostics.front());
    hasError = true;
  } else if (ui.kind == "stale") {
    banner = QStringLiteral("Master Mold needs regeneration: the part or printer context changed since it was generated.");
  }
  m.insert("banner", banner);
  m.insert("bannerIsError", hasError);
  m.insert("failureCode", store.failure() ? QString::fromLatin1(masterOutcomeCodeName(store.failure()->code)) : QString());

  QStringList summaryLines;
  const MasterMoldPlan* plan = store.plan().get();
  if (plan && ui.kind == "success" && store.summary()) {
    const MasterMoldSummary& s = *store.summary();
    summaryLines << QStringLiteral("Master A and Master B: two independent printable tools")
                 << QStringLiteral("Mold-making material to fill: %1 and %2 cm³ (+%3% waste)")
                        .arg(QString::number(plan->masters[0].fillVolumeMm3 / 1000.0, 'f', 1), QString::number(plan->masters[1].fillVolumeMm3 / 1000.0, 'f', 1),
                             QString::number(plan->materials[0].wasteMargin * 100.0, 'f', 0))
                 << (s.allReleasesVerified ? QStringLiteral("All release checks verified (digital model only)") : QStringLiteral("Some release checks are not verified"));
    for (const MasterMaterialEstimate& e : plan->materials)
      if (e.massG) summaryLines << QStringLiteral("%1 working half: about %2 g of mold-making material").arg(QString::fromLatin1(masterToolName(e.id)), QString::number(*e.massG, 'f', 0));
    if (s.warningCount > 0) summaryLines << QStringLiteral("%1 recommendation(s)").arg(s.warningCount);
  }
  m.insert("summaryLines", summaryLines);
  QStringList warnings;
  QStringList uncertainty;
  if (plan) {
    for (const std::string& w : plan->warnings) warnings << QString::fromStdString(w);
    for (const std::string& u : plan->residualUncertainty) uncertainty << QString::fromStdString(u);
  }
  m.insert("warnings", warnings);
  m.insert("residualUncertainty", uncertainty);

  // Two groups the panel lists: the printable masters, and the virtual working halves (a preview, never exported).
  const bool inspectable = ui.kind == "success" || ui.kind == "stale";
  QVariantList sets;
  if (plan && inspectable) {
    QVariantList masters, halves;
    for (const MasterTool& t : plan->masters) {
      const std::string key = masterBodyKey(t.id);
      masters << QVariantMap{{"key", QString::fromStdString(key)}, {"name", QString::fromStdString(t.name)}, {"visible", store.visible(key)},
                             {"volumeMm3", t.facts.volumeMm3}, {"triangleCount", t.facts.triangleCount}};
    }
    for (const VirtualWorkingHalf& h : plan->halves) {
      const std::string key = halfBodyKey(h.id);
      halves << QVariantMap{{"key", QString::fromStdString(key)}, {"name", QString::fromStdString(h.name) + QStringLiteral(" (virtual)")}, {"visible", store.visible(key)},
                            {"volumeMm3", h.facts.volumeMm3}, {"triangleCount", h.facts.triangleCount}};
    }
    sets << QVariantMap{{"id", QString::fromLatin1(kMasterSetMasters)}, {"name", QStringLiteral("Printable masters")}, {"status", QString::fromStdString(store.status())},
                        {"releaseMode", QStringLiteral("export")}, {"failureMessage", QString()}, {"pieces", masters}, {"canIsolate", true}};
    sets << QVariantMap{{"id", QString::fromLatin1(kMasterSetHalves)}, {"name", QStringLiteral("Working-mold halves")}, {"status", QString::fromStdString(store.status())},
                        {"releaseMode", QStringLiteral("preview only")}, {"failureMessage", QString()}, {"pieces", halves}, {"canIsolate", true}};
  }
  m.insert("sets", sets);
  m.insert("showPieces", plan != nullptr && inspectable);
  m.insert("masterCount", plan ? kMasterToolCount : 0);
  m.insert("generationVersion", store.generationVersion());
  m.insert("contractVersion", kMasterContractVersion);

  // Exportable = the current result. A stale or blocked result is never exported.
  const bool exportable = plan != nullptr && store.status() == "current" && !masterExporting_;
  m.insert("canExport", exportable);
  m.insert("exporting", masterExporting_);
  m.insert("lastExport", lastMasterExport_);
  return m;
}

}  // namespace craft::app
