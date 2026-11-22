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
#include "model/PartOrientation.h"
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
  Quaternion orientation;  ///< Flip / Auto orient: applied to sourceSoup, then grounded (identity = as imported)
  Bounds3 groundedBounds;
  Point3 groundingTranslation;
  std::string geometryVersion;
  double loadMs = 0;
};

/// Builds the loaded model (grounding, grounded copy, geometry version) from parsed STL triangles. Throws CodedError.
/// Shared by STL import and project open so both produce identical models.
/// `orientation` (normalised by the caller) is applied to the soup before grounding; the identity gives exactly the model as imported.
LoadedModel buildLoadedModel(TriangleSoup soup, stl::Encoding encoding, quint64 requestId, const QString& fileName, const QString& sourcePath,
                             qint64 fileSizeBytes, const Quaternion& orientation = kIdentityOrientation);

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
  // "high" (the reference's only mode: its store starts there and has no setter) or "standard" (faster, coarser). A session setting.
  Q_PROPERTY(QString cavityQuality READ cavityQuality WRITE setCavityQuality NOTIFY moldInputsChanged)
  Q_PROPERTY(double minMoldClearanceMm READ minMoldClearanceMm CONSTANT)
  Q_PROPERTY(double maxMoldClearanceMm READ maxMoldClearanceMm CONSTANT)
  Q_PROPERTY(QVariantList cutFaces READ cutFaces NOTIFY moldInputsChanged)
  Q_PROPERTY(QString moldPhase READ moldPhase NOTIFY moldChanged)
  /// A mold generation that was cancelled (or superseded) is still ending its last step in the background: a new one has to wait.
  Q_PROPERTY(bool moldWindingDown READ moldWindingDown NOTIFY moldChanged)
  Q_PROPERTY(QString moldError READ moldError NOTIFY moldChanged)
  Q_PROPERTY(QVariantMap moldSummary READ moldSummary NOTIFY moldChanged)
  Q_PROPERTY(QVariantList moldIssues READ moldIssues NOTIFY moldChanged)

  Q_PROPERTY(QVariantMap masterMold READ masterMold NOTIFY masterMoldChanged)
  /// The reference's Molds browser: every mold body on the scene and the original model, each with its visibility (MoldBodiesBrowser.tsx).
  Q_PROPERTY(QVariantMap moldBrowser READ moldBrowser NOTIFY moldBrowserChanged)
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
  /// The glass mold appearance (the reference's MoldAppearanceToggle, mode "glass"): every mold body is drawn as translucent glass in the outer
  /// mold's colour instead of in its role colours. Runtime only, like the reference's store (D-112).
  Q_PROPERTY(bool moldGlass READ moldGlass WRITE setMoldGlass NOTIFY viewOptionsChanged)
  Q_PROPERTY(QVariantMap gridInfo READ gridInfo NOTIFY gridChanged)

  Q_PROPERTY(QString tool READ tool WRITE setTool NOTIFY toolChanged)
  /// {x, y, z, w, isIdentity, available, reason}: the part orientation and whether Flip / Auto orient may change it now.
  Q_PROPERTY(QVariantMap orientationState READ orientationState NOTIFY orientationChanged)
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
  /// Drag and drop of files onto the window (the reference: Viewport.tsx handleDrop -> validateLocalStlFiles). True when exactly one non-empty
  /// .stl file was dropped (the caller then imports it, after the unsaved-changes prompt); otherwise the status line says why and nothing is
  /// imported. The reference's messages are kept; the 25 MiB limit is not (native's is the importer's own, 512 MiB).
  Q_INVOKABLE bool acceptDroppedStl(const QList<QUrl>& urls);
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
  QString cavityQuality() const { return cavityQuality_ == CavityQualityMode::High ? QStringLiteral("high") : QStringLiteral("standard"); }
  void setCavityQuality(const QString& value);
  double maxCavityClearanceMm() const { return 5.0; }  // MAX_CAVITY_CLEARANCE_MM in the reference
  double minMoldClearanceMm() const { return kMinReferenceMoldClearanceMm; }
  double maxMoldClearanceMm() const { return kMaxReferenceMoldClearanceMm; }
  QVariantList cutFaces() const;
  QVariantMap moldBrowser() const;
  /// Shows or hides a mold body or the original model by id. Not an undo step (D-073). Hidden bodies stay hidden when the same mold is rebuilt;
  /// importing a model shows everything again, as in the reference.
  Q_INVOKABLE void setBodyVisible(const QString& id, bool visible);
  Q_INVOKABLE void setCutFaceEnabled(const QString& face, bool enabled);
  Q_INVOKABLE void setCutFacePosition(const QString& face, double normalizedPosition);
  Q_INVOKABLE void resetCutFacePosition(const QString& face);
  QString moldPhase() const { return moldPhase_; }
  bool moldWindingDown() const { return moldOrphans_ > 0; }
  QString moldError() const { return moldError_; }
  QVariantMap moldSummary() const;
  QVariantList moldIssues() const;
  const Held<MoldGenerationResult>& moldResult() const { return moldResult_; }
  Q_INVOKABLE void generateMold();
  /// Writes one binary STL per mold body into `folder`.
  Q_INVOKABLE void exportMoldBodies(const QUrl& folder);
  void exportMoldBodiesTo(const QString& folderPath);
  /// Writes every mold body into ONE 3MF file (millimetres, Z-up, the same frame as the STL export), then reads the file back
  /// with the independent validator; the export only reports success when the read-back passes. Emits exportFinished.
  Q_INVOKABLE void exportMoldBodies3mf(const QUrl& file);
  void exportMoldBodies3mfTo(const QString& filePath);

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
  /// Stops the save, open or import that is running (nothing happens when none is): the file stays as it was, or the document stays as it is.
  Q_INVOKABLE void cancelProjectOperation();
  /// Writes the autosave now (only when there are unsaved changes). The timer calls this every autosaveIntervalMs.
  void autosaveNow();
  void setAutosaveIntervalMs(int ms);
  /// Where the controller asks how much memory is free (default: the operating system). Tests inject their own; 0 means unknown.
  void setMemoryProbe(std::function<std::uint64_t()> probe) { memoryProbe_ = std::move(probe); }
  /// How long a Master Mold run may take before the UI gives up on it (tests shorten it).
  void setMasterMoldTimeoutMs(int ms) { masterTimeoutMs_ = ms; }
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

  // --- part orientation (Flip, Auto orient) -------------------------------------------------------------------------------------------
  QVariantMap orientationState() const;
  /// The reference's getPartOrientationCapability: needs a ready model; refused once geometry has been generated from it (mold, sprues,
  /// segmentation pieces, Master Mold pieces) and while any engineering operation runs. `reason` is the reference's wording.
  struct OrientationCapability {
    bool available = false;
    QString reason;
  };
  OrientationCapability orientationCapability() const;
  /// Flip about a world axis: "left", "right", "forward", "backward" or "upside-down". False when refused (the reason is shown).
  Q_INVOKABLE bool flipPart(const QString& direction);
  /// Commits the best of the six axis-aligned candidates (largest flat support, then footprint, then lowest height) and frames the part.
  Q_INVOKABLE bool autoOrientPart();
  Q_INVOKABLE bool resetPartOrientation();
  /// Commits an orientation (normalised first). Rebuilds the grounded part, clears the Cut by Face session and history like a new model
  /// does, and keeps the clearances. False when refused or degenerate.
  bool commitPartOrientation(const Quaternion& orientation, bool frameCamera);
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
  /// The committed mold as the reference's last committed final result (D-111): its final bodies, cavity, resolved sprues and generated
  /// registration features. nullopt without a mold; not current while it is being generated.
  std::optional<CommittedMoldSource> committedMoldSource() const;

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
  bool moldGlass() const { return moldGlass_; }
  void setMoldOpacity(double value);
  void setMoldGlass(bool value);
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
  void orientationChanged();
  void selectionChanged();
  void selectionOverlayChanged();
  void sprueGlassChanged();
  void sprueGizmoChanged();
  void cutPlanesChanged();
  void moldBrowserChanged();
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
  /// Installs a model: every derived result of the previous one is dropped. `replacement` is false for a re-orientation of the same
  /// model (keeps the camera unless `fitCamera`, and does not report "Loaded ...").
  void applyModel(LoadedModel model, bool fitCamera = true, bool announce = true);
  void refreshOrientation();
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
  void showSegmentationBodies(bool refit = true);
  void startSegmentationPreviewRegistration();
  double effectiveMoldClearanceMm() const;
  void editSprues(const std::function<bool(std::vector<SprueOperationDefinition>&)>& edit);
  std::optional<std::string> masterLiveIdentity() const;
  void refreshMasterStaleness();
  void showMasterBodies();
  void clearMasterRun(bool resetStore);
  void abandonMasterRun(const QString& message, bool failTheStore);
  void abandonMoldRun();
  void connectReports();
  void initProject();
  void refreshDirty();
  void refreshRuler();
  void scheduleDirtyCheck();
  void refreshRecovery();
  void removeStaleAutosaveTemps();
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
    CavityQualityMode cavityQuality = CavityQualityMode::High;
    std::vector<SprueOperationDefinition> sprueIntents;
    int nextSprueNumber = 1;
    QString moldPhase, moldError, moldErrorCode;
    Held<MoldGenerationResult> moldResult;
    Held<SprueEvaluation> sprueEvaluation;
    Held<DerivedRegistrationState> registration;
    std::vector<std::pair<Axis, double>> segmentationExtensions;   // the extension boundaries of the segmentation plan (D-110)
    QSet<QString> hiddenBodies;                                    // the mold bodies the user hid (the reference's bodyVisibility, D-113)
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
  /// The segmentation's extension boundaries are drawn (and dragged, and erased) as cutting planes: while a plan with at least one is
  /// shown, and nothing has been adopted. They then take the place of the Cut by Face planes (the reference's Segmentation tab owns the
  /// planes while it is open) (D-110).
  bool extensionPlanesShown() const;
  /// Sets the extension list from an undo/redo snapshot: axes the plan no longer leaves free are dropped, then the plan is rebuilt.
  void restoreSegmentationExtensions(const std::vector<std::pair<Axis, double>>& extensions);
  /// Shows every mold body again: the reference's invalidateCommittedTopology resets its bodyVisibility whenever a plane is chosen, moved or
  /// removed (a clearance change keeps it). The step before it is already on the undo stack (D-113).
  void resetBodyVisibility();
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
  CavityQualityMode cavityQuality_ = CavityQualityMode::High;
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
    // The keyed preview of the plan (segmentationPreview.ts): registration run in the background over the unkeyed section bodies.
    // "none" | "running" | "keyed" | "unkeyed" (the registration did not generate keys: the sections stay as planned) | "failed".
    QString previewState = QStringLiteral("none");
    QString previewReason;
    std::size_t previewKeyCount = 0;
    quint64 previewRevision = 0;
  } segmentation_;
  std::optional<Point3> printerVolume_;

  // master mold
  MasterMoldStore masterStore_;
  bool masterShown_ = false;
  bool masterTimedOut_ = false;
  // A Master Mold run that timed out, was cancelled or was reset is released from the UI at once, but its worker thread cannot be interrupted inside a
  // Boolean and runs on until it returns; its result is then discarded. `masterAbandon_` belongs to the run in progress, `masterOrphans_` counts the
  // threads still ending.
  std::shared_ptr<bool> masterAbandon_;
  // The same for the mold: a generation that is cancelled, superseded by a change of inputs or undone is released from the UI at once and its thread
  // (which cannot be interrupted inside a Boolean) ends on its own with its result ignored.
  std::shared_ptr<bool> moldAbandon_;
  int moldOrphans_ = 0;
  int masterOrphans_ = 0;
  int masterRunGeneration_ = 0;
  int masterTimeoutMs_ = 180000;  // DEFAULT_MASTER_MOLD_WORKER_TIMEOUT_MS
  bool masterRunning_ = false;
  std::vector<std::string> masterUnportedPaths_;
  QString masterTimeoutMessage_;
  bool masterExporting_ = false;
  QVariantMap lastMasterExport_;

  // sprues
  std::vector<SprueOperationDefinition> sprueIntents_;
  Held<SprueEvaluation> sprueEvaluation_;
  // The per-sprue memo of the derived evaluation (evaluateDerivedMold.ts): shared with the worker jobs, dropped with the model.
  std::shared_ptr<SprueResultCache> sprueCache_ = std::make_shared<SprueResultCache>();
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
  // The running save or open: its cancellation, and what it reports (stage and 0..1) for the progress bar.
  CancellationToken projectCancel_, importCancel_;
  std::function<std::uint64_t()> memoryProbe_;
  QString projectStage_;
  double projectProgress_ = 0;
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
  bool moldGlass_ = false;
  QString tool_ = QStringLiteral("select");
  QVariantMap selection_;
  QVariantMap measurement_;
  std::vector<Vec3> measurePoints_;
};

}  // namespace craft::app
