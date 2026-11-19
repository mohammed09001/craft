// Master Mold in the application controller: the worker (a thread-pool job with
// a timeout and cooperative cancellation), the store plumbing, scene display
// and the model the QML panel binds to. The product logic itself lives in the
// Qt-free core (master/MasterMoldStore).

#include <QDateTime>
#include <QDir>
#include <QFileInfo>
#include <QLoggingCategory>
#include <QTimer>

#include <algorithm>
#include <map>

#include "AppController.h"
#include "master/MasterPlanning.h"

Q_DECLARE_LOGGING_CATEGORY(lcApp)

namespace craft::app {

namespace {

constexpr int kMasterMoldTimeoutMs = 180000;  // DEFAULT_MASTER_MOLD_WORKER_TIMEOUT_MS

/// User-facing progress labels (internal stage names stay in the engine contract).
QString progressLabel(const std::string& stage) {
  static const std::map<std::string, QString> labels{
      {"analyzing_geometry", QStringLiteral("Analyzing part…")},
      {"building_accessibility", QStringLiteral("Finding release regions…")},
      {"optimizing_working_mold", QStringLiteral("Choosing mold-piece count…")},
      {"constructing_working_mold", QStringLiteral("Building working mold…")},
      {"planning_master_tooling", QStringLiteral("Planning Master cases…")},
      {"verifying_release", QStringLiteral("Verifying release…")},
      {"finalizing", QStringLiteral("Finalizing…")}};
  const auto it = labels.find(stage);
  return it == labels.end() ? QString::fromStdString(stage) : it->second;
}

QString plural(int n, const char* singular, const char* pluralForm) {
  return QStringLiteral("%1 %2").arg(n).arg(QLatin1String(n == 1 ? singular : pluralForm));
}

const std::vector<QColor>& setPalette() {
  static const std::vector<QColor> p{QColor("#4f8cc9"), QColor("#c98a4f"), QColor("#6fb06f"), QColor("#b06fb0"), QColor("#c9c04f"), QColor("#4fc9b8")};
  return p;
}

}  // namespace

// --- identity / seed -----------------------------------------------------------------------------------------------------

std::optional<std::string> AppController::masterLiveIdentity() const {
  if (!model_) return std::nullopt;
  const MasterCastingProcessProfile profile;
  const MasterPlanningPreferences preferences;
  const std::array<double, 16> identity{1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
  return masterSeedStalenessIdentity(masterSourceGeometryVersion(model_->geometryVersion, model_->groundedBounds, identity), printerVolume_, profile, preferences);
}

// --- generate / reset -------------------------------------------------------------------------------------------------------

void AppController::generateMasterMold() {
  if (!model_) {
    emit errorOccurred(QStringLiteral("Master Mold"), QStringLiteral("Import an STL model first."), QStringLiteral("no_model"));
    return;
  }
  if (busy_) return;

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
  masterUnportedPaths_.clear();
  lastMasterExport_.clear();  // it described the previous generation
  emit masterMoldChanged();
  setBusy(true, QStringLiteral("master-mold"), 0);
  setStatus(QStringLiteral("Planning master tooling…"));

  CancellationToken cancel;
  activeCancel_ = cancel;
  QTimer::singleShot(kMasterMoldTimeoutMs, this, [this, cancel, generation] {
    if (masterRunning_ && masterStore_.generationVersion() == generation) {
      masterTimedOut_ = true;
      cancel.cancel();
    }
  });

  auto engine = engine_;
  const MasterMoldRequest request = *start.request;
  runJob<MasterMoldResult>(
      this, cancel,
      [engine, request](const CancellationToken& token, const ProgressCallback& progress) {
        MasterMoldEngineHooks hooks;
        hooks.cancel = token;
        hooks.onStage = [progress](const MasterMoldProgressStage& stage) {
          if (progress) progress(stage.stage, (stage.stageIndex + 1.0) / stage.stageCount);
        };
        return evaluateMasterMoldGeneration(*engine, request, hooks);
      },
      [this, generation](JobOutcome<MasterMoldResult> outcome) {
        activeCancel_.reset();
        setBusy(false);
        const bool wasRunning = masterRunning_;
        masterRunning_ = false;
        if (outcome.state == JobState::Succeeded && outcome.result) {
          const std::vector<std::string> unported = outcome.result->unportedPaths;
          if (!masterStore_.commitGeneration(generation, std::move(*outcome.result), masterLiveIdentity())) return;  // superseded or reset
          masterUnportedPaths_ = unported;
          showMasterBodies();
          const auto ui = deriveMasterMoldUiState(masterStore_.status(), masterStore_.sets(), masterStore_.lastError());
          setStatus(ui.kind == "success" ? QStringLiteral("Master Mold tooling generated.")
                    : ui.kind == "stale"  ? QStringLiteral("Master Mold finished, but the part or printer context changed meanwhile.")
                                          : QStringLiteral("Master Mold finished with blocked parts."));
          emit masterMoldChanged();
          return;
        }
        QString message = outcome.errorMessage;
        if (masterTimedOut_) message = QStringLiteral("Master Mold generation exceeded %1 ms.").arg(kMasterMoldTimeoutMs);
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
      },
      [this, generation](QString stage, double) {
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
      });
}

void AppController::clearMasterRun(bool resetStore) {
  if (masterRunning_ && activeCancel_) activeCancel_->cancel();
  masterRunning_ = false;
  if (resetStore) masterStore_.reset();
  masterUnportedPaths_.clear();
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

void AppController::isolateMasterSet(const QString& moldPartId) {
  masterStore_.isolateToolingSet(moldPartId.toStdString());
  showMasterBodies();
  emit masterMoldChanged();
}

void AppController::showAllMasterPieces() {
  masterStore_.showAllPieces();
  showMasterBodies();
  emit masterMoldChanged();
}

void AppController::showMasterBodies() {
  const auto renderable = selectRenderableMasterMoldBodies(masterStore_.sets(), masterStore_.pieceVisibility());
  if (renderable.empty()) {
    if (masterShown_) {
      scene_.clearMoldBodies();
      masterShown_ = false;
      refreshSceneFrame(false);
    }
    return;
  }
  std::map<std::string, std::size_t> setIndex;
  for (const auto& entry : masterStore_.sets()) setIndex.emplace(entry.moldPartId, setIndex.size());
  std::vector<SceneModel::BodyInput> inputs;
  std::vector<QColor> palette;
  for (const MasterMoldRenderableBody& body : renderable) {
    inputs.push_back({QString::fromStdString(body.id), QString::fromStdString(body.name), std::make_shared<MeshPayload>(*body.mesh), body.bounds, body.volumeMm3});
    const std::string partId = body.id.substr(0, body.id.find(':'));
    palette.push_back(setPalette()[setIndex[partId] % setPalette().size()]);  // a stale piece keeps its own colour and is ghosted instead
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

  // The job owns a copy of the sets (shared, not copied again), so regenerating or resetting while it runs is safe.
  const auto sets = std::make_shared<const std::vector<MasterToolingSetState>>(masterStore_.sets());
  toolingexport::MasterExportOptions options;
  options.modelName = model_ ? model_->fileName.toStdString() : std::string("part");
  options.appVersion = applicationVersion().toStdString();
  options.exportedAtUtc = QDateTime::currentDateTimeUtc().toString(Qt::ISODate).toStdString();
  options.generationVersion = masterStore_.generationVersion();
  options.unportedPathsReached = !masterUnportedPaths_.empty();
  options.unportedPaths = masterUnportedPaths_;

  struct Exported {
    QString folder;
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
      [sets, options, folderPath](const CancellationToken& cancel, const ProgressCallback&) {
        const toolingexport::MasterExportPlan plan = toolingexport::planMasterToolingExport(*sets, options.modelName);
        const toolingexport::MasterExportResult written =
            toolingexport::writeMasterToolingExport(plan, std::filesystem::path(folderPath.toStdWString()), options, cancel);
        Exported out;
        out.folder = QString::fromStdWString(written.folder.wstring());
        for (const auto& file : written.files) out.files << QString::fromStdWString(file.wstring());
        for (const std::string& warning : written.warnings) out.warnings << QString::fromStdString(warning);
        for (const toolingexport::ExcludedItem& item : written.excluded) {
          out.excluded << QStringLiteral("%1%2: %3")
                              .arg(QString::fromStdString(item.moldPartName),
                                   item.pieceId.empty() ? QString() : QStringLiteral(" / ") + QString::fromStdString(item.pieceId),
                                   QString::fromStdString(item.reason));
        }
        out.bytes = written.totalBytes;
        return out;
      },
      [this](JobOutcome<Exported> outcome) {
        masterExporting_ = false;
        if (outcome.state == JobState::Succeeded && outcome.result) {
          const Exported& r = *outcome.result;
          lastMasterExport_ = QVariantMap{{"folder", r.folder},
                                          {"fileCount", static_cast<int>(r.files.size())},
                                          {"totalBytes", r.bytes},
                                          {"warnings", r.warnings},
                                          {"excluded", r.excluded}};
          emit masterMoldChanged();
          const QString message = QStringLiteral("Exported %1 Master tooling piece(s) to %2").arg(r.files.size()).arg(r.folder);
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
  const MasterMoldUiState ui = deriveMasterMoldUiState(store.status(), store.sets(), store.lastError());
  QVariantMap m{{"status", QString::fromStdString(store.status())},
                {"uiKind", QString::fromStdString(ui.kind)},
                {"generating", store.status() == "generating"},
                {"canGenerate", model_.has_value() && !busy_}};

  QString progress;
  if (store.progressStage()) progress = progressLabel(store.progressStage()->stage);
  m.insert("progressLabel", progress);

  const bool complete = ui.kind == "success";
  QString firstBlocked;
  if ((ui.kind == "partial-success" || ui.kind == "blocked") && !ui.blockedMessages.empty()) firstBlocked = QString::fromStdString(ui.blockedMessages.front());
  QString lastError;
  bool hasError = false;
  if (ui.kind == "error") {
    lastError = QString::fromStdString(ui.message.value_or("Master Mold generation failed."));
    hasError = true;
  } else if (!firstBlocked.isEmpty()) {
    lastError = firstBlocked;
    hasError = true;
  }
  QString partial;
  if (ui.kind == "partial-success") {
    partial = QStringLiteral("%1 of %2 working mold part(s) could not be tooled; the rest remain valid. %3")
                  .arg(ui.blockedSetCount).arg(ui.validSetCount + ui.blockedSetCount).arg(firstBlocked);
  }
  QString banner;
  if (hasError) banner = partial.isEmpty() ? lastError : partial;
  else if (ui.kind == "stale") banner = QStringLiteral("Master Mold needs regeneration: the part or printer context changed since it was generated.");
  m.insert("banner", banner);
  m.insert("bannerIsError", hasError);

  QStringList summaryLines;
  if (store.summary() && complete && store.summary()->allReleasesVerified) {
    const MasterMoldSummary& s = *store.summary();
    summaryLines << QStringLiteral("Working mold: %1").arg(plural(s.workingMoldPieceCount, "part", "parts"))
                 << QStringLiteral("Master tooling: %1").arg(plural(s.masterToolingPieceCount, "printable piece", "printable pieces"))
                 << QStringLiteral("%1, %2 multi-panel").arg(plural(s.onePieceCases, "one-piece case", "one-piece cases")).arg(s.multiPieceCases)
                 << (s.warningCount > 0 ? plural(s.warningCount, "recommendation", "recommendations") : QStringLiteral("All release sequences verified"));
  }
  m.insert("summaryLines", summaryLines);

  const bool inspectable = ui.kind == "success" || ui.kind == "partial-success" || ui.kind == "stale";
  QVariantList sets;
  for (const MasterToolingSetState& entry : store.sets()) {
    QVariantList pieces;
    if (entry.set) {
      for (const MasterToolingPiece& piece : entry.set->assembly.pieces) {
        const std::string key = masterMoldPieceKey(entry.moldPartId, piece.pieceId);
        const auto it = store.pieceVisibility().find(key);
        pieces << QVariantMap{{"key", QString::fromStdString(key)},
                              {"name", QString::fromStdString(piece.name)},
                              {"visible", it == store.pieceVisibility().end() || it->second},
                              {"volumeMm3", piece.volumeMm3},
                              {"triangleCount", piece.triangleCount}};
      }
    }
    sets << QVariantMap{{"id", QString::fromStdString(entry.moldPartId)},
                        {"name", QString::fromStdString(entry.moldPartName)},
                        {"status", QString::fromStdString(entry.status)},
                        {"releaseMode", entry.set ? QString::fromStdString(entry.set->releaseMode) : QString()},
                        {"failureMessage", entry.failureMessage ? QString::fromStdString(*entry.failureMessage) : QString()},
                        {"pieces", pieces},
                        {"canIsolate", entry.set && !entry.set->assembly.pieces.empty()}};
  }
  m.insert("sets", sets);
  m.insert("showPieces", hasRenderableToolingGeometry(store.sets()) && ui.kind != "blocked" && ui.kind != "error" && inspectable);
  m.insert("workingMoldPieceCount", store.plan() ? static_cast<int>(store.plan()->moldPieces.size()) : 0);
  m.insert("generationVersion", store.generationVersion());

  // Exportable = some tooling set is current and has pieces. Stale or blocked sets are never exported (they are listed
  // in the export's manifest as excluded).
  bool exportable = false;
  int exportablePieces = 0;
  for (const MasterToolingSetState& entry : store.sets()) {
    if (entry.status == "current" && entry.set) exportablePieces += static_cast<int>(entry.set->assembly.pieces.size());
  }
  exportable = exportablePieces > 0 && store.status() != "generating" && !masterExporting_;
  m.insert("canExport", exportable);
  m.insert("exportablePieceCount", exportablePieces);
  m.insert("exporting", masterExporting_);
  m.insert("lastExport", lastMasterExport_);

  // Honest scope notice: strategies of the reference that this build does not have.
  m.insert("incomplete", !masterUnportedPaths_.empty());
  QStringList unported;
  for (const auto& p : masterUnportedPaths_) unported << QString::fromStdString(p);
  m.insert("incompleteNote", unported.isEmpty() ? QString() : QStringLiteral("This result may be missing options the full planner would try: %1.").arg(unported.join(QStringLiteral("; "))));
  return m;
}

}  // namespace craft::app
