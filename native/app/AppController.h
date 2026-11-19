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
#include <QTimer>
#include <QQuick3DGeometry>
#include <QUrl>
#include <QVariantList>
#include <QVariantMap>

#include <array>
#include <deque>
#include <functional>
#include <memory>
#include <optional>

#include "AnalysisWorkerClient.h"
#include "IMeshGeometryEngine.h"
#include "JobRunner.h"
#include "SceneModel.h"
#include "ViewportCamera.h"
#include "model/ModelGrounding.h"
#include "project/ProjectDocument.h"
#include "stl/Stl.h"
#include "mold/CavityGeneration.h"
#include "mold/DerivedMold.h"
#include "master/MasterMoldStore.h"
#include "tooling/MasterToolingExport.h"
#include "view/SelectionBox.h"
#include "view/GroundPlaneRuler.h"
#include "view/ViewportLook.h"
#include "mold/SpruePreview.h"
#include "Held.h"
#include "SprueHandleModel.h"
#include "CutPlaneModel.h"
#include "mold/CuttingPlaneDrag.h"
#include "mold/CuttingPlaneSlabs.h"
#include "mold/Segmentation.h"
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

/// Builds the loaded model (grounding, grounded copy, geometry version) from parsed STL triangles. Throws CodedError.
/// Shared by STL import and project open so both produce identical models.
LoadedModel buildLoadedModel(TriangleSoup soup, stl::Encoding encoding, quint64 requestId, const QString& fileName, const QString& sourcePath,
                             qint64 fileSizeBytes);

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

  Q_PROPERTY(QVariantMap masterMold READ masterMold NOTIFY masterMoldChanged)
  Q_PROPERTY(QVariantMap engineeringReports READ engineeringReports NOTIFY engineeringReportsChanged)
  Q_PROPERTY(QVariantMap project READ project NOTIFY projectChanged)
  Q_PROPERTY(QVariantMap recovery READ recovery NOTIFY recoveryChanged)
  Q_PROPERTY(QVariantMap segmentation READ segmentation NOTIFY segmentationChanged)
  Q_PROPERTY(QVariantMap printerVolume READ printerVolume NOTIFY segmentationChanged)
  Q_PROPERTY(QVariantList sprues READ sprues NOTIFY spruesChanged)
  Q_PROPERTY(QVariantMap sprueCandidate READ sprueCandidate NOTIFY spruesChanged)
  /// The 3D funnel/stem/neck preview at the pointer (scene coordinates); shown while sprueCandidate.onTopFace.
  Q_PROPERTY(QQuick3DGeometry* spruePreviewGeometry READ spruePreviewGeometry CONSTANT)
  /// The Sprue tool is active on a complete mold: bodies are drawn as glass with an edge outline.
  Q_PROPERTY(bool sprueGlass READ sprueGlass NOTIFY sprueGlassChanged)
  Q_PROPERTY(QVariantMap sprueStyle READ sprueStyle CONSTANT)
  /// The resize rings at each sprue opening (see AppControllerSprueGizmo.cpp) and the gizmo's interaction state.
  Q_PROPERTY(craft::app::SprueHandleModel* sprueHandles READ sprueHandles CONSTANT)
  Q_PROPERTY(QVariantMap sprueGizmo READ sprueGizmo NOTIFY sprueGizmoChanged)
  /// Undo/redo over the mold inputs and the results built from them (see AppControllerHistory.cpp).
  Q_PROPERTY(QVariantMap history READ history NOTIFY historyChanged)
  /// The Cut by Face planes as translucent slabs, and the Eraser tool (see AppControllerCutPlanes.cpp).
  Q_PROPERTY(craft::app::CutPlaneModel* cutPlaneSlabs READ cutPlaneSlabs CONSTANT)
  Q_PROPERTY(QQuick3DGeometry* cutPlaneEdgeGeometry READ cutPlaneEdgeGeometry CONSTANT)
  Q_PROPERTY(QVariantMap cutPlanes READ cutPlanes NOTIFY cutPlanesChanged)
  Q_PROPERTY(bool eraserAvailable READ eraserAvailable NOTIFY cutPlanesChanged)
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
  /// The ground-plane ruler (the Axes option shows it): axes and ticks as lines, the labels as camera-facing quads.
  Q_PROPERTY(QQuick3DGeometry* rulerAxesGeometry READ rulerAxesGeometry CONSTANT)
  Q_PROPERTY(QQuick3DGeometry* rulerTicksGeometry READ rulerTicksGeometry CONSTANT)
  Q_PROPERTY(QVariantList rulerLabels READ rulerLabels NOTIFY rulerChanged)
  Q_PROPERTY(QVariantMap ruler READ rulerInfo NOTIFY rulerChanged)
  /// The part's selection box (dashed edges), the hovered box face and the faces selected for Cut by Face, as scene
  /// geometry in scene coordinates; selectionBox says which of them to show.
  Q_PROPERTY(QQuick3DGeometry* selectionBoxGeometry READ selectionBoxGeometry CONSTANT)
  Q_PROPERTY(QQuick3DGeometry* hoverFaceGeometry READ hoverFaceGeometry CONSTANT)
  Q_PROPERTY(QQuick3DGeometry* selectedFacesGeometry READ selectedFacesGeometry CONSTANT)
  Q_PROPERTY(QVariantMap selectionBox READ selectionBox NOTIFY selectionOverlayChanged)
  Q_PROPERTY(QVariantMap selectionStyle READ selectionStyle NOTIFY themeChanged)
  /// How the viewport looks (background, grid, edge style, the lighting rig), from the reference (core/view/ViewportLook).
  Q_PROPERTY(QVariantMap viewLook READ viewLook NOTIFY themeChanged)
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
  const Held<MoldGenerationResult>& moldResult() const { return moldResult_; }
  Q_INVOKABLE void generateMold();
  /// Writes one binary STL per mold body into `folder`.
  Q_INVOKABLE void exportMoldBodies(const QUrl& folder);
  void exportMoldBodiesTo(const QString& folderPath);

  // --- master mold -----------------------------------------------------------------
  /// Everything the Master Mold panel shows: status, derived UI state, banner, summary, sets and pieces.
  QVariantMap masterMold() const;
  QVariantMap engineeringReports() const;

  // --- project (.craft) ------------------------------------------------------------
  /// name, path, dirty, saving, opening, title, recoveredFrom, lastSavedAt ... (see AppControllerProject.cpp).
  QVariantMap project() const;
  /// Autosave files left by an unclean exit: { available, items: [{path, name, modifiedAt, originalPath}] }.
  QVariantMap recovery() const { return recovery_; }
  /// Saves to the project's file; a project that was never saved emits saveAsRequested() instead.
  Q_INVOKABLE void saveProject();
  Q_INVOKABLE void saveProjectAs(const QUrl& fileUrl);
  void saveProjectToFile(const QString& path);
  Q_INVOKABLE void openProject(const QUrl& fileUrl);
  /// `relinkedModelPath` replaces the path of a linked model that moved.
  void openProjectFile(const QString& path, const QString& relinkedModelPath = {});
  Q_INVOKABLE void openProjectRelinked(const QString& projectPath, const QUrl& modelUrl);
  /// Opens an autosave file as an unsaved project (its original location is remembered for the Save As suggestion).
  Q_INVOKABLE void recoverProject(const QString& autosavePath);
  Q_INVOKABLE void discardRecovery();
  /// Writes the autosave now (only when there are unsaved changes). The timer calls this every autosaveIntervalMs.
  void autosaveNow();
  void setAutosaveIntervalMs(int ms);
  bool isDirty() const { return projectDirty_; }
  /// Current inputs as a project document (the model bytes are added by the save job).
  project::Document captureDocument(bool forFingerprint = false) const;
  /// Runs the Python detailed mold analysis and shows its engineering report (pull direction, undercut, draft, moldability).
  Q_INVOKABLE void runMoldabilityAnalysis();
  Q_INVOKABLE void cancelMoldabilityAnalysis();
  /// Plans and verifies printable master tooling straight from the imported part (no mold, cut or cavity needed).
  Q_INVOKABLE void generateMasterMold();
  Q_INVOKABLE void resetMasterMold();
  Q_INVOKABLE void toggleMasterPiece(const QString& pieceKey);
  Q_INVOKABLE void isolateMasterSet(const QString& moldPartId);
  Q_INVOKABLE void showAllMasterPieces();
  /// Exports every piece of every current tooling set as a binary STL, plus manifest.json, into a NEW sub-folder of
  /// the chosen folder (nothing is overwritten). Runs on a worker thread; the outcome is in masterMold.lastExport and
  /// exportFinished.
  Q_INVOKABLE void exportMasterTooling(const QUrl& folder);
  void exportMasterToolingTo(const QString& folderPath);
  /// A local path as a file:// URL (for opening a folder in the system file browser from QML).
  Q_INVOKABLE QUrl fileUrl(const QString& path) const { return QUrl::fromLocalFile(path); }
  const MasterMoldStore& masterMoldStore() const { return masterStore_; }

  // --- segmentation --------------------------------------------------------------
  QVariantMap segmentation() const;
  QVariantMap printerVolume() const;
  /// Printer build volume in millimeters; any change invalidates the plan.
  Q_INVOKABLE void setPrinterVolume(double x, double y, double z);
  /// Plans printer-fit sections of the automatic (>= 100 mm clearance) reference block.
  Q_INVOKABLE void planSegmentation();
  Q_INVOKABLE void addSegmentationExtension(const QString& axis);
  Q_INVOKABLE void moveSegmentationExtension(const QString& axis, double coordinateMm);
  Q_INVOKABLE void removeSegmentationExtension(const QString& axis);
  /// Cuts the block along the plan and keys the pieces; the result becomes the mold bodies.
  Q_INVOKABLE void executeSegmentation();
  Q_INVOKABLE void resetSegmentation();
  bool segmentationAdopted() const { return segmentation_.adopted; }
  const SegmentationPlan* segmentationPlan() const { return segmentation_.plan ? &*segmentation_.plan : nullptr; }
  const std::vector<MoldBody>& segmentationBodies() const { return segmentation_.shownBodies; }

  // --- sprues ----------------------------------------------------------------
  QVariantList sprues() const;
  QVariantMap sprueCandidate() const { return sprueCandidate_; }
  QString spruePhase() const { return spruePhase_; }
  /// Placement preview under a viewport pixel (status/inspector only).
  Q_INVOKABLE void clearSprueCandidate();

  // --- undo / redo (reference: the split-face store's history, snap/undo/redo) ----------------------------------------
  QVariantMap history() const;
  /// Restores the state before the last edit (cut faces and positions, mold clearance, sprues, and the mold built from
  /// them, which comes back as it was, not recomputed). A running mold generation or sprue evaluation is cancelled.
  Q_INVOKABLE void undo();
  Q_INVOKABLE void redo();
  /// Edits between begin and end (a slider drag) share a single history entry.
  Q_INVOKABLE void beginHistoryGesture();
  Q_INVOKABLE void endHistoryGesture();

  // --- cutting planes and the Eraser (reference: cuttingPlane3dRuntime.ts, removeSplitFace) ---------------------------
  CutPlaneModel* cutPlaneSlabs() { return &cutPlaneSlabs_; }
  QQuick3DGeometry* cutPlaneEdgeGeometry() { return &cutPlaneEdges_; }
  QVariantMap cutPlanes() const;
  bool eraserAvailable() const;
  /// Eraser tool hover: the plane under the pointer turns red. True when over a plane.
  Q_INVOKABLE bool eraserHoverAt(qreal x, qreal y, qreal viewportWidth, qreal viewportHeight);
  Q_INVOKABLE void eraserLeave();
  /// Removes a plane (the face stops being cut): refused while the mold is generating or when the face is not cut.
  /// The mold built with it is dropped; sprue intents are kept.
  Q_INVOKABLE bool removeCutFace(const QString& face);
  /// Dragging a plane with the right button (reference: cuttingPlane3dRuntime.ts). A press on a plane starts it (false: not on
  /// a plane, or the Eraser is the tool, so the press pans as usual); the plane follows the pointer along its own axis once the
  /// pointer is 4 px from the press; releasing commits the position as one undo step, or cancels when it never moved.
  Q_INVOKABLE bool cutPlaneDragBegin(qreal x, qreal y, qreal viewportWidth, qreal viewportHeight);
  Q_INVOKABLE void cutPlaneDragTo(qreal x, qreal y, qreal viewportWidth, qreal viewportHeight);
  /// True when the release committed a new position.
  Q_INVOKABLE bool cutPlaneDragEnd();
  Q_INVOKABLE void cutPlaneDragCancel();
  /// Hover outside the Eraser: the plane under the pointer brightens and the cursor becomes a hand. True when over a plane.
  Q_INVOKABLE bool cutPlaneHoverAt(qreal x, qreal y, qreal viewportWidth, qreal viewportHeight);
  Q_INVOKABLE void cutPlaneLeave();

  // --- sprue resize gizmo (rings at the sprue openings; reference: sprueResizeRuntime.ts) -----------------------------
  SprueHandleModel* sprueHandles() { return &sprueHandles_; }
  QVariantMap sprueGizmo() const;
  /// Pointer hover (Sprue tool, no button): highlights the ring under the pointer. True when over a ring: the caller
  /// then skips the placement preview.
  Q_INVOKABLE bool sprueGizmoHoverAt(qreal x, qreal y, qreal viewportWidth, qreal viewportHeight);
  /// Left press: starts resizing the ring under the pointer. False when there is none (the press is an ordinary one).
  /// The pointer left the viewport: clears the ring hover (unless a drag or the editor owns the pointer).
  Q_INVOKABLE void sprueGizmoLeave();
  Q_INVOKABLE bool sprueGizmoPressAt(qreal x, qreal y, qreal viewportWidth, qreal viewportHeight);
  Q_INVOKABLE void sprueGizmoDragTo(qreal x, qreal y, bool shiftHeld);
  /// Left release: commits the previewed diameter when it differs from the original.
  Q_INVOKABLE void sprueGizmoRelease();
  /// Escape: cancels a drag (reverting the preview) or closes the numeric editor. True when there was something to cancel.
  Q_INVOKABLE bool sprueGizmoCancel();
  /// Double click on a ring: opens the numeric editor. Returns its description (empty when not over a ring).
  Q_INVOKABLE QVariantMap sprueGizmoEditAt(qreal x, qreal y, qreal viewportWidth, qreal viewportHeight);
  /// Enter in the editor. False (editor stays open, sprueGizmo.editError set) for a non-finite diameter.
  Q_INVOKABLE bool sprueGizmoCommitEdit(const QString& text);
  Q_INVOKABLE void sprueGizmoCloseEditor();
  /// Sets a named cursor on a QML item: arrow, hand, cross, resize (horizontal), funnel (the Sprue tool's).
  Q_INVOKABLE void applyViewportCursor(QObject* item, const QString& name);
  QQuick3DGeometry* spruePreviewGeometry() { return &spruePreview_; }
  bool sprueGlass() const { return sprueGlass_; }
  QVariantMap sprueStyle() const;
  Q_INVOKABLE void previewSprueAt(qreal x, qreal y, qreal viewportWidth, qreal viewportHeight);
  /// Creates a sprue where the pixel meets the mold top face over the cavity.
  Q_INVOKABLE bool placeSprueAt(qreal x, qreal y, qreal viewportWidth, qreal viewportHeight);
  Q_INVOKABLE void removeSprue(const QString& operationId);
  Q_INVOKABLE void resizeSprue(const QString& operationId, double diameterMm);
  Q_INVOKABLE void resizeSprueEntryNeck(const QString& operationId, double diameterMm);
  Q_INVOKABLE void moveSprue(const QString& operationId, double x, double y);
  const std::vector<SprueOperationDefinition>& sprueIntents() const { return sprueIntents_; }
  const Held<SprueEvaluation>& sprueEvaluation() const { return sprueEvaluation_; }
  const Held<DerivedRegistrationState>& registrationState() const { return registration_; }
  /// Mold bodies as displayed/exported: cavity bodies with sprues applied.
  std::vector<MoldBody> finalBodies() const;

  // --- analysis ------------------------------------------------------------
  QString analysisPhase() const { return analysisPhase_; }
  QString analysisError() const { return analysisError_; }
  QString analysisStage() const { return analysisStage_; }
  QVariantMap analysisReport() const { return analysisReport_; }
  QString analysisRuntime() const;
  /// The running worker's hello (protocol, engine name/version, Python version); empty until a worker has started.
  QVariantMap analysisWorkerInfo() const { return analysis_.workerInfo().toVariantMap(); }
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
  AdaptiveGridConfig gridConfig() const { return grid_; }
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
  /// Pointer hover in the "select" tool: highlights the selection-box face under the pointer (only while the part is
  /// selected). Returns whether the pointer is over the part (or its box), for the cursor.
  Q_INVOKABLE bool hoverAt(qreal x, qreal y, qreal viewportWidth, qreal viewportHeight);
  Q_INVOKABLE void clearHover();

  SceneModel* scene() { return &scene_; }
  viewport::ViewportCamera* camera() { return &camera_; }
  QQuick3DGeometry* gridMinorGeometry() { return &gridMinor_; }
  QQuick3DGeometry* gridMajorGeometry() { return &gridMajor_; }
  QQuick3DGeometry* rulerAxesGeometry() { return &rulerAxes_; }
  QQuick3DGeometry* rulerTicksGeometry() { return &rulerTicks_; }
  QVariantList rulerLabels() const { return rulerLabels_; }
  QVariantMap rulerInfo() const;
  QQuick3DGeometry* selectionBoxGeometry() { return &selectionBoxLines_; }
  QQuick3DGeometry* hoverFaceGeometry() { return &hoverFaceQuad_; }
  QQuick3DGeometry* selectedFacesGeometry() { return &selectedFaceQuads_; }
  QVariantMap selectionBox() const;
  QVariantMap selectionStyle() const;
  QVariantMap viewLook() const;
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
  void segmentationChanged();
  void masterMoldChanged();
  void engineeringReportsChanged();
  void projectChanged();
  void recoveryChanged();
  /// The user asked to save a project that has no file yet.
  void saveAsRequested();
  /// A project could not be opened because its linked model is missing or changed (code, path of the project).
  void projectModelNeedsRelink(const QString& projectPath, const QString& code, const QString& message);
  void themeChanged();
  void viewOptionsChanged();
  void gridChanged();
  void rulerChanged();
  void toolChanged();
  void selectionChanged();
  void selectionOverlayChanged();
  void sprueGlassChanged();
  void sprueGizmoChanged();
  void cutPlanesChanged();
  void historyChanged();
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
  void applyChromeScheme();
  std::vector<CuttingPlane> activeCuttingPlanes() const;
  /// The part's bounds in scene coordinates (display offset applied); nullopt without a visible part.
  std::optional<Bounds3> partBoxBounds() const;
  bool partSelected() const;
  /// The box shows while the part is selected and the mold is neither generating nor complete (the reference's rule).
  bool selectionBoxVisible() const;
  /// Clicking a box face toggles that Cut by Face plane: only while the box shows and no segmentation owns the part.
  bool cutFaceSelectionActive() const;
  void refreshSelectionOverlay();
  void connectAnalysis();
  void rebuildSegmentationPlan();
  void invalidateSegmentation(const QString& message);
  void showSegmentationBodies();
  double effectiveMoldClearanceMm() const;
  void editSprues(const std::function<bool(std::vector<SprueOperationDefinition>&)>& edit);
  std::optional<std::string> masterLiveIdentity() const;
  void refreshMasterStaleness();
  void showMasterBodies();
  void clearMasterRun(bool resetStore);
  void connectReports();
  void initProject();
  void refreshDirty();
  void refreshRuler();
  void scheduleDirtyCheck();
  void refreshRecovery();
  void restoreProjectInputs(const project::Document& document);
  void adoptProjectIdentity(const QString& path, const project::Document& document, const QString& recoveredFrom);
  void startNewProject();
  void removeAutosaveFile();
  QString autosavePathForCurrentProject() const;
  void clearEngineeringReports();
  void startSprueEvaluation();
  void showFinalBodies(bool refit);
  std::optional<SpruePlacement> placementAt(qreal x, qreal y, qreal w, qreal h) const;
  void refreshSprueGlass();
  void refreshSprueGizmo();
  struct HistoryEntry {
    std::array<CutFaceState, 6> cutFaces{};
    double moldClearanceMm = 0, cavityClearanceMm = 0;
    std::vector<SprueOperationDefinition> sprueIntents;
    int nextSprueNumber = 1;
    QString moldPhase, moldError, moldErrorCode;
    Held<MoldGenerationResult> moldResult;
    Held<SprueEvaluation> sprueEvaluation;
    Held<DerivedRegistrationState> registration;
  };
  HistoryEntry captureHistory() const;
  /// Records `before` (the state an edit is about to change) as an undo step, unless a gesture already did.
  void pushHistoryEntry(HistoryEntry before);
  void pushHistory() { pushHistoryEntry(captureHistory()); }
  void restoreHistory(const HistoryEntry& entry);
  void clearHistory();
  bool canUndo() const;
  bool canRedo() const;
  bool hasCutPlanes() const;
  bool cutPlanesVisible() const;
  void refreshCutPlanes();
  void setEraserHover(std::optional<FaceId> face);
  bool eraseAt(qreal x, qreal y, qreal viewportWidth, qreal viewportHeight);
  void resetSprueGizmoInteraction();
  void setGizmoHover(int index);
  void commitSprueDiameter(const SprueHandle& handle, double diameterMm);
  const char* sprueGizmoState() const;
  void setSprueCandidate(QVariantMap candidate, const std::optional<SpruePreviewGeometry>& geometry);

  std::shared_ptr<IMeshGeometryEngine> engine_;
  analysis::WorkerClient analysis_;
  analysis::WorkerConfig analysisConfig_;

  SceneModel scene_;
  viewport::ViewportCamera camera_;
  viewport::LineGeometry gridMinor_, gridMajor_, measureLine_, rulerAxes_, rulerTicks_;
  GroundPlaneRuler ruler_;
  QVariantList rulerLabels_;
  viewport::LineGeometry selectionBoxLines_;
  viewport::MeshGeometry hoverFaceQuad_, selectedFaceQuads_;
  std::optional<SelectionBoxFace> hoverFace_;
  std::string selectionOverlayKey_;  // what the overlay geometry was last built from (skips redundant GPU uploads)
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
  Held<MoldGenerationResult> moldResult_;
  quint64 moldInputsRevision_ = 0;
  quint64 moldGeneration_ = 0;
  int moldGenerationVersion_ = 0;

  // segmentation
  struct SegmentationUi {
    QString phase = QStringLiteral("idle");  // idle | planned | not-required | failed | executing | executed
    QString message;
    std::optional<PreliminarySource> source;
    std::optional<SegmentationPlan> basePlan;
    std::vector<std::pair<Axis, double>> extensions;
    std::optional<SegmentationPlan> plan;  // effective plan (extensions merged)
    std::vector<MoldBody> executedBodies;  // Segmentation output, before registration
    std::vector<MoldBody> shownBodies;     // planned sections or keyed executed bodies
    std::optional<DerivedRegistrationState> registration;
    std::optional<SegmentationExecutionResult> execution;
    bool adopted = false;
    quint64 generation = 0;
  } segmentation_;
  std::optional<Point3> printerVolume_;

  // master mold
  MasterMoldStore masterStore_;
  bool masterShown_ = false;
  bool masterTimedOut_ = false;
  bool masterRunning_ = false;
  std::vector<std::string> masterUnportedPaths_;
  QString masterTimeoutMessage_;
  bool masterExporting_ = false;
  QVariantMap lastMasterExport_;

  // sprues
  std::vector<SprueOperationDefinition> sprueIntents_;
  Held<SprueEvaluation> sprueEvaluation_;
  Held<DerivedRegistrationState> registration_;
  QString spruePhase_ = QStringLiteral("idle");
  QVariantMap sprueCandidate_;
  viewport::MeshGeometry spruePreview_;
  bool sprueGlass_ = false;

  // undo / redo
  std::deque<HistoryEntry> undoStack_, redoStack_;
  bool historyGestureActive_ = false, historyGesturePushed_ = false;
  bool historyPaused_ = false;               // opening a project applies its inputs through the setters: no entries
  bool suppressGenerationHistory_ = false;   // the mold rebuilt on open is not an undoable step

  // cutting-plane slabs and the Eraser
  CutPlaneModel cutPlaneSlabs_;
  viewport::LineGeometry cutPlaneEdges_;  // the twelve edges of a unit box, scaled per slab in QML
  std::vector<PlaneSlab> cutSlabs_;
  std::string cutSlabSignature_;
  std::optional<FaceId> eraserHover_;
  std::optional<CutPlaneDrag> cutPlaneDrag_;  // a plane being dragged (right button)
  std::optional<FaceId> planeHover_;          // the plane under the pointer outside the Eraser
  void setPlaneHover(std::optional<FaceId> face);
  void abortCutPlaneDrag();

  // sprue resize gizmo
  struct GizmoDrag {
    int handle = -1;
    double startX = 0, startY = 0, original = 0, preview = 0;
  };
  SprueHandleModel sprueHandles_;
  std::vector<SprueHandle> gizmoHandles_;
  std::string gizmoSignature_;      // what the rings were last built from (skips rebuilds on unrelated changes)
  int gizmoHover_ = -1;
  std::optional<GizmoDrag> gizmoDrag_;
  bool gizmoEditing_ = false;
  std::string gizmoEditHandle_;     // the ring being edited numerically ("<operationId>:top|bottom")
  QString gizmoEditError_, gizmoLabel_;
  bool gizmoLabelWarns_ = false;
  quint64 sprueGeneration_ = 0;
  int nextSprueNumber_ = 1;

  // analysis
  // project
  QString projectPath_;
  std::string projectId_, projectCreatedAt_;
  std::string baselineFingerprint_;
  bool projectDirty_ = false;
  bool projectSaving_ = false, projectOpening_ = false;
  QString projectLastSavedAt_, projectRecoveredFrom_, lastAutosaveAt_;
  QTimer dirtyTimer_, autosaveTimer_;
  QVariantMap recovery_;
  bool autosaving_ = false;

  // engineering reports (moldability analysis job)
  QString reportsPhase_ = QStringLiteral("idle");
  QString reportsStage_;
  QString reportsError_;
  QVariantMap reportsResult_;
  QString reportsJobId_;

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
