#pragma once

// Application controller: the single object QML talks to.
//
// It owns the document state (imported model, mold inputs, mold result,
// analysis report), runs heavy work through JobRunner / the analysis bridge,
// and publishes plain serialisable values (strings, numbers, QVariantMaps) to
// the UI. QML holds no engineering logic and never sees an engine type.
//
// Stale-result protection: every asynchronous operation captures a generation
// number; a completion whose generation is no longer current is dropped.

#include <QObject>
#include <QQuick3DGeometry>
#include <QUrl>
#include <QVariantList>
#include <QVariantMap>

#include <array>
#include <functional>
#include <memory>
#include <optional>

#include "AnalysisWorkerClient.h"
#include "IMeshGeometryEngine.h"
#include "JobRunner.h"
#include "SceneModel.h"
#include "ViewportCamera.h"
#include "model/ModelGrounding.h"
#include "mold/CavityGeneration.h"
#include "mold/DerivedMold.h"
#include "mold/SprueGeneration.h"

namespace craft::app {

/// An imported model. The source triangles are kept exactly as read; the
/// grounded copy (XY-centred, resting on Z = 0) is the canonical part
/// geometry every downstream operation uses.
struct LoadedModel {
  std::string modelId;
  QString sourcePath;
  QString fileName;
  qint64 fileSizeBytes = 0;
  QString encoding;
  std::shared_ptr<const TriangleSoup> sourceSoup;
  std::shared_ptr<const TriangleSoup> groundedSoup;
  Bounds3 sourceBounds;
  Bounds3 groundedBounds;
  Point3 groundingTranslation;
  std::string geometryVersion;
  double loadMs = 0;
};

class AppController : public QObject {
  Q_OBJECT

  Q_PROPERTY(QString modelPhase READ modelPhase NOTIFY modelChanged)
  Q_PROPERTY(QString modelMessage READ modelMessage NOTIFY modelChanged)
  Q_PROPERTY(QVariantMap modelInfo READ modelInfo NOTIFY modelChanged)

  Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)
  Q_PROPERTY(QString busyStage READ busyStage NOTIFY busyChanged)
  Q_PROPERTY(double busyProgress READ busyProgress NOTIFY busyChanged)
  Q_PROPERTY(QString statusText READ statusText NOTIFY statusTextChanged)

  Q_PROPERTY(double moldClearanceMm READ moldClearanceMm WRITE setMoldClearanceMm NOTIFY moldInputsChanged)
  Q_PROPERTY(double cavityClearanceMm READ cavityClearanceMm WRITE setCavityClearanceMm NOTIFY moldInputsChanged)
  Q_PROPERTY(double maxCavityClearanceMm READ maxCavityClearanceMm CONSTANT)
  Q_PROPERTY(double minMoldClearanceMm READ minMoldClearanceMm CONSTANT)
  Q_PROPERTY(double maxMoldClearanceMm READ maxMoldClearanceMm CONSTANT)
  Q_PROPERTY(QVariantList cutFaces READ cutFaces NOTIFY moldInputsChanged)
  Q_PROPERTY(QString moldPhase READ moldPhase NOTIFY moldChanged)
  Q_PROPERTY(QString moldError READ moldError NOTIFY moldChanged)
  Q_PROPERTY(QVariantMap moldSummary READ moldSummary NOTIFY moldChanged)
  Q_PROPERTY(QVariantList moldIssues READ moldIssues NOTIFY moldChanged)

  Q_PROPERTY(QVariantList sprues READ sprues NOTIFY spruesChanged)
  Q_PROPERTY(QVariantMap sprueCandidate READ sprueCandidate NOTIFY spruesChanged)
  Q_PROPERTY(QString spruePhase READ spruePhase NOTIFY spruesChanged)
  Q_PROPERTY(QString analysisPhase READ analysisPhase NOTIFY analysisChanged)
  Q_PROPERTY(QString analysisError READ analysisError NOTIFY analysisChanged)
  Q_PROPERTY(QString analysisStage READ analysisStage NOTIFY analysisChanged)
  Q_PROPERTY(QVariantMap analysisReport READ analysisReport NOTIFY analysisChanged)
  Q_PROPERTY(QString analysisRuntime READ analysisRuntime NOTIFY analysisChanged)

  Q_PROPERTY(QString theme READ theme WRITE setTheme NOTIFY themeChanged)
  Q_PROPERTY(bool showGrid READ showGrid WRITE setShowGrid NOTIFY viewOptionsChanged)
  Q_PROPERTY(bool showAxes READ showAxes WRITE setShowAxes NOTIFY viewOptionsChanged)
  Q_PROPERTY(bool showEdges READ showEdges WRITE setShowEdges NOTIFY viewOptionsChanged)
  Q_PROPERTY(double moldOpacity READ moldOpacity WRITE setMoldOpacity NOTIFY viewOptionsChanged)
  Q_PROPERTY(QVariantMap gridInfo READ gridInfo NOTIFY gridChanged)

  Q_PROPERTY(QString tool READ tool WRITE setTool NOTIFY toolChanged)
  Q_PROPERTY(QVariantMap selection READ selection NOTIFY selectionChanged)
  Q_PROPERTY(QVariantMap measurement READ measurement NOTIFY selectionChanged)

  Q_PROPERTY(craft::app::SceneModel* scene READ scene CONSTANT)
  Q_PROPERTY(craft::viewport::ViewportCamera* camera READ camera CONSTANT)
  Q_PROPERTY(QQuick3DGeometry* gridMinorGeometry READ gridMinorGeometry CONSTANT)
  Q_PROPERTY(QQuick3DGeometry* gridMajorGeometry READ gridMajorGeometry CONSTANT)
  Q_PROPERTY(QQuick3DGeometry* axisXGeometry READ axisXGeometry CONSTANT)
  Q_PROPERTY(QQuick3DGeometry* axisYGeometry READ axisYGeometry CONSTANT)
  Q_PROPERTY(QQuick3DGeometry* axisZGeometry READ axisZGeometry CONSTANT)
  Q_PROPERTY(QQuick3DGeometry* selectionGeometry READ selectionGeometry CONSTANT)
  Q_PROPERTY(QQuick3DGeometry* measureLineGeometry READ measureLineGeometry CONSTANT)

  Q_PROPERTY(QString applicationVersion READ applicationVersion CONSTANT)
  Q_PROPERTY(QString logFilePath READ logFilePath CONSTANT)

 public:
  /// `engine` performs every Boolean; `analysisConfig` locates the Python
  /// worker. Both are injected so tests can substitute them.
  AppController(std::shared_ptr<IMeshGeometryEngine> engine, analysis::WorkerConfig analysisConfig,
                QObject* parent = nullptr);
  ~AppController() override;

  // --- model ---------------------------------------------------------------
  QString modelPhase() const { return modelPhase_; }
  QString modelMessage() const { return modelMessage_; }
  QVariantMap modelInfo() const;
  const std::optional<LoadedModel>& model() const { return model_; }
  Q_INVOKABLE void importStl(const QUrl& fileUrl);
  void importStlFile(const QString& path);

  // --- jobs ----------------------------------------------------------------
  bool busy() const { return busy_; }
  QString busyStage() const { return busyStage_; }
  double busyProgress() const { return busyProgress_; }
  QString statusText() const { return statusText_; }
  Q_INVOKABLE void cancelCurrentJob();

  // --- mold ----------------------------------------------------------------
  double moldClearanceMm() const { return moldClearanceMm_; }
  void setMoldClearanceMm(double value);
  double cavityClearanceMm() const { return cavityClearanceMm_; }
  void setCavityClearanceMm(double value);
  double maxCavityClearanceMm() const { return 5.0; }  // MAX_CAVITY_CLEARANCE_MM in the reference
  double minMoldClearanceMm() const { return kMinReferenceMoldClearanceMm; }
  double maxMoldClearanceMm() const { return kMaxReferenceMoldClearanceMm; }
  QVariantList cutFaces() const;
  Q_INVOKABLE void setCutFaceEnabled(const QString& face, bool enabled);
  Q_INVOKABLE void setCutFacePosition(const QString& face, double normalizedPosition);
  Q_INVOKABLE void resetCutFacePosition(const QString& face);
  QString moldPhase() const { return moldPhase_; }
  QString moldError() const { return moldError_; }
  QVariantMap moldSummary() const;
  QVariantList moldIssues() const;
  const std::optional<MoldGenerationResult>& moldResult() const { return moldResult_; }
  Q_INVOKABLE void generateMold();
  /// Writes one binary STL per mold body into `folder`.
  Q_INVOKABLE void exportMoldBodies(const QUrl& folder);
  void exportMoldBodiesTo(const QString& folderPath);

  // --- sprues ----------------------------------------------------------------
  QVariantList sprues() const;
  QVariantMap sprueCandidate() const { return sprueCandidate_; }
  QString spruePhase() const { return spruePhase_; }
  /// Placement preview under a viewport pixel (status/inspector only).
  Q_INVOKABLE void previewSprueAt(qreal x, qreal y, qreal viewportWidth, qreal viewportHeight);
  /// Creates a sprue where the pixel meets the mold top face over the cavity.
  Q_INVOKABLE bool placeSprueAt(qreal x, qreal y, qreal viewportWidth, qreal viewportHeight);
  Q_INVOKABLE void removeSprue(const QString& operationId);
  Q_INVOKABLE void resizeSprue(const QString& operationId, double diameterMm);
  Q_INVOKABLE void resizeSprueEntryNeck(const QString& operationId, double diameterMm);
  Q_INVOKABLE void moveSprue(const QString& operationId, double x, double y);
  const std::vector<SprueOperationDefinition>& sprueIntents() const { return sprueIntents_; }
  const std::optional<SprueEvaluation>& sprueEvaluation() const { return sprueEvaluation_; }
  const std::optional<DerivedRegistrationState>& registrationState() const { return registration_; }
  /// Mold bodies as displayed/exported: cavity bodies with sprues applied.
  std::vector<MoldBody> finalBodies() const;

  // --- analysis ------------------------------------------------------------
  QString analysisPhase() const { return analysisPhase_; }
  QString analysisError() const { return analysisError_; }
  QString analysisStage() const { return analysisStage_; }
  QVariantMap analysisReport() const { return analysisReport_; }
  QString analysisRuntime() const;
  Q_INVOKABLE void runImportAnalysis();
  Q_INVOKABLE void cancelAnalysis();

  // --- view ----------------------------------------------------------------
  QString theme() const { return theme_; }
  void setTheme(const QString& theme);
  bool showGrid() const { return showGrid_; }
  void setShowGrid(bool value);
  bool showAxes() const { return showAxes_; }
  void setShowAxes(bool value);
  bool showEdges() const { return showEdges_; }
  void setShowEdges(bool value);
  double moldOpacity() const { return moldOpacity_; }
  void setMoldOpacity(double value);
  QVariantMap gridInfo() const;
  Q_INVOKABLE void fitView();
  Q_INVOKABLE void resetView();

  QString tool() const { return tool_; }
  void setTool(const QString& tool);
  QVariantMap selection() const { return selection_; }
  QVariantMap measurement() const { return measurement_; }
  /// Picks the scene at a viewport pixel. In "measure" mode the first two
  /// picks define a distance; a third starts a new measurement.
  Q_INVOKABLE bool pickAt(qreal x, qreal y, qreal viewportWidth, qreal viewportHeight);
  Q_INVOKABLE void clearSelection();

  SceneModel* scene() { return &scene_; }
  viewport::ViewportCamera* camera() { return &camera_; }
  QQuick3DGeometry* gridMinorGeometry() { return &gridMinor_; }
  QQuick3DGeometry* gridMajorGeometry() { return &gridMajor_; }
  QQuick3DGeometry* axisXGeometry() { return &axisX_; }
  QQuick3DGeometry* axisYGeometry() { return &axisY_; }
  QQuick3DGeometry* axisZGeometry() { return &axisZ_; }
  QQuick3DGeometry* selectionGeometry() { return &selectionGeometry_; }
  QQuick3DGeometry* measureLineGeometry() { return &measureLine_; }

  QString applicationVersion() const;
  QString logFilePath() const;

  /// Machine-readable snapshot of the whole document state (smoke tests,
  /// diagnostics). Contains no pointers and no engine types.
  QVariantMap stateSummary() const;

 signals:
  void modelChanged();
  void busyChanged();
  void statusTextChanged();
  void moldInputsChanged();
  void moldChanged();
  void analysisChanged();
  void spruesChanged();
  void themeChanged();
  void viewOptionsChanged();
  void gridChanged();
  void toolChanged();
  void selectionChanged();
  /// A user-visible failure worth a dialog (import, mold, export, analysis).
  void errorOccurred(const QString& title, const QString& message, const QString& code);
  void exportFinished(bool ok, const QString& message, const QStringList& files);

 private:
  struct CutFaceState {
    bool enabled = false;
    std::optional<double> position;  // nullopt = the face's own default
  };

  void setBusy(bool busy, const QString& stage = {}, double progress = 0);
  void setStatus(const QString& text);
  void applyModel(LoadedModel model);
  void clearMold(const QString& phase);
  void invalidateMoldInputs();
  void applyMoldResult(MoldGenerationResult result, DerivedMoldEvaluation derived);
  void refreshSceneFrame(bool refit);
  void rebuildGrid();
  void applySceneColors();
  std::vector<CuttingPlane> activeCuttingPlanes() const;
  Bounds3 partSelectionBounds() const;
  void connectAnalysis();
  void editSprues(const std::function<bool(std::vector<SprueOperationDefinition>&)>& edit);
  void startSprueEvaluation();
  void showFinalBodies(bool refit);
  std::optional<SpruePlacement> placementAt(qreal x, qreal y, qreal w, qreal h) const;

  std::shared_ptr<IMeshGeometryEngine> engine_;
  analysis::WorkerClient analysis_;
  analysis::WorkerConfig analysisConfig_;

  SceneModel scene_;
  viewport::ViewportCamera camera_;
  viewport::LineGeometry gridMinor_, gridMajor_, axisX_, axisY_, axisZ_, measureLine_;
  viewport::MeshGeometry selectionGeometry_;
  AdaptiveGridConfig grid_;

  // model
  QString modelPhase_ = QStringLiteral("empty");
  QString modelMessage_;
  std::optional<LoadedModel> model_;
  quint64 importGeneration_ = 0;
  quint64 nextImportRequestId_ = 0;

  // jobs
  bool busy_ = false;
  QString busyStage_;
  double busyProgress_ = 0;
  QString statusText_ = QStringLiteral("Ready");
  std::optional<CancellationToken> activeCancel_;

  // mold
  double moldClearanceMm_ = kDefaultReferenceMoldClearanceMm;
  double cavityClearanceMm_ = kDefaultCavityClearanceMm;
  std::array<CutFaceState, 6> cutFaces_{};
  QString moldPhase_ = QStringLiteral("unavailable");
  QString moldError_;
  QString moldErrorCode_;
  std::optional<MoldGenerationResult> moldResult_;
  quint64 moldInputsRevision_ = 0;
  quint64 moldGeneration_ = 0;
  int moldGenerationVersion_ = 0;

  // sprues
  std::vector<SprueOperationDefinition> sprueIntents_;
  std::optional<SprueEvaluation> sprueEvaluation_;
  std::optional<DerivedRegistrationState> registration_;
  QString spruePhase_ = QStringLiteral("idle");
  QVariantMap sprueCandidate_;
  quint64 sprueGeneration_ = 0;
  int nextSprueNumber_ = 1;

  // analysis
  QString analysisPhase_ = QStringLiteral("idle");
  QString analysisError_;
  QString analysisStage_;
  QVariantMap analysisReport_;
  QString analysisJobId_;
  std::string analysisModelId_;

  // view
  QString theme_ = QStringLiteral("dark");
  bool showGrid_ = true;
  bool showAxes_ = true;
  bool showEdges_ = true;
  double moldOpacity_ = 0.55;
  QString tool_ = QStringLiteral("select");
  QVariantMap selection_;
  QVariantMap measurement_;
  std::vector<Vec3> measurePoints_;
};

}  // namespace craft::app
