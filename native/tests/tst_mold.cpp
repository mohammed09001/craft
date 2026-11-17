// Mold-domain tests: reference mold block, Cut by Face partition, part-solid
// validation, and real cavity subtraction through native Manifold. Every
// geometric expectation is checked numerically (volumes, bounds, topology),
// never through rendered output.

#include <QtTest/QtTest>

#include <cmath>

#include "ManifoldMeshEngine.h"
#include "TestMeshes.h"
#include "geometry/MeshAnalysis.h"
#include "geometry/SignedDistance.h"
#include "mold/CavityGeneration.h"
#include "mold/PartSolid.h"
#include "mold/ReferenceMold.h"

using namespace craft;
using craft::test::box;

namespace {
/// Forwards everything to a real engine, but fails Minkowski offsets, to
/// exercise the direct -> distance-field fallback.
class FailingMinkowskiEngine final : public IMeshGeometryEngine {
 public:
  explicit FailingMinkowskiEngine(IMeshGeometryEngine& inner) : inner_(inner) {}
  std::string implementation() const override { return inner_.implementation(); }
  SolidPtr solidFromMesh(const MeshPayload& m, double t, const std::string& o) override { return inner_.solidFromMesh(m, t, o); }
  SolidPtr box(const Bounds3& b) override { return inner_.box(b); }
  SolidPtr asOriginal(const SolidPtr& s) override { return inner_.asOriginal(s); }
  SolidPtr cylinder(double r, double h, int n, const Point3& a, const Point3& o) override { return inner_.cylinder(r, h, n, a, o); }
  SolidPtr unionOf(const std::vector<SolidPtr>& s) override { return inner_.unionOf(s); }
  std::pair<SolidPtr, SolidPtr> splitByPlane(const SolidPtr& s, const Point3& n, double o) override { return inner_.splitByPlane(s, n, o); }
  SolidPtr subtract(const SolidPtr& a, const SolidPtr& b) override { return inner_.subtract(a, b); }
  SolidPtr intersect(const SolidPtr& a, const SolidPtr& b) override { return inner_.intersect(a, b); }
  std::vector<SolidPtr> decompose(const SolidPtr& s) override { return inner_.decompose(s); }
  SolidPtr simplify(const SolidPtr& s, double t) override { return inner_.simplify(s, t); }
  SolidPtr minkowskiSphere(const SolidPtr&, double, int) override {
    throw CodedError("mesh_kernel_error", "Cavity offset failed: injected.");
  }
  SolidPtr levelSet(const std::function<double(const Point3&)>& f, const Bounds3& b, double e, double l, double t) override {
    return inner_.levelSet(f, b, e, l, t);
  }
  MeshPayload meshFromSolid(const SolidPtr& s, const std::map<std::int64_t, FaceRole>& r, const std::string& o) override {
    return inner_.meshFromSolid(s, r, o);
  }
 private:
  IMeshGeometryEngine& inner_;
};

MeshPayload twoCubes() {
  MeshPayload mesh = test::cubeMesh(box(-30, -10, 0, -10, 10, 20));
  const MeshPayload second = test::cubeMesh(box(10, -10, 0, 30, 10, 20));
  const auto offset = static_cast<std::uint32_t>(mesh.vertexCount());
  mesh.positions.insert(mesh.positions.end(), second.positions.begin(), second.positions.end());
  for (std::uint32_t i : second.indices) mesh.indices.push_back(i + offset);
  return mesh;
}
}  // namespace

namespace {

MoldGenerationRequest requestFor(const MeshPayload& groundedPart) {
  MoldGenerationRequest request;
  request.modelId = "1:test.stl:1234";
  auto soup = std::make_shared<TriangleSoup>(test::soupFromMesh(groundedPart));
  request.partGeometryVersion = partGeometryVersion(*soup);
  request.groundedPart = std::move(soup);
  request.moldClearanceMm = 10;
  request.generationVersion = 1;
  return request;
}

std::string codeOf(const std::function<void()>& callable) {
  try {
    callable();
  } catch (const CodedError& error) {
    return error.code();
  }
  return {};
}

std::vector<std::uint32_t> sequentialIndices(std::size_t count) {
  std::vector<std::uint32_t> indices(count);
  for (std::size_t i = 0; i < count; ++i) indices[i] = static_cast<std::uint32_t>(i);
  return indices;
}

PartSolidValidationResult validateSoupOf(const MeshPayload& mesh) {
  const TriangleSoup soup = test::soupFromMesh(mesh);
  const std::vector<double> positions(soup.positions.begin(), soup.positions.end());
  return validateAndPreparePartSolid(positions, sequentialIndices(positions.size() / 3), Transform{},
                                     buildGeometryTolerancePolicy(box(-20, -20, 0, 20, 20, 40), 0));
}

bool approx(double actual, double expected, double tolerance) {
  return std::fabs(actual - expected) <= tolerance;
}

}  // namespace

class MoldTest : public QObject {
  Q_OBJECT

 private:
  std::unique_ptr<IMeshGeometryEngine> engine_ = createManifoldMeshEngine();
  const Bounds3 groundedCube_ = box(-10, -10, 0, 10, 10, 20);

 private slots:
  // referenceMoldBlock.geometry.ts ------------------------------------------
  void referenceFrameLiftsPartAndRestsBlockOnZero() {
    const auto frame = createReferenceMoldFrameBounds(groundedCube_, 10);
    QVERIFY(frame.has_value());
    QCOMPARE(frame->partOffset, (Point3{0, 0, 10}));
    QCOMPARE(frame->selectionBoxBounds, box(-10, -10, 10, 10, 10, 30));
    QCOMPARE(frame->referenceMoldBlockBounds, box(-20, -20, 0, 20, 20, 40));
  }

  void clearanceLimitsMatchReference() {
    QCOMPARE(clampReferenceMoldClearance(0), 1.0);
    QCOMPARE(clampReferenceMoldClearance(500), 225.0);
    QCOMPARE(clampReferenceMoldClearance(NAN), 10.0);
    QVERIFY(!createReferenceMoldBlockBounds(groundedCube_, 0.5));
    QVERIFY(!createReferenceMoldBlockBounds(groundedCube_, 226));
    QVERIFY(!createReferenceMoldBlockBounds(box(0, 0, 0, 0, 1, 1), 10));
  }

  // splitFace.geometry.ts ----------------------------------------------------
  void defaultCuttingPlanesSitOnTheirFace() {
    const Bounds3 k1 = box(-10, -10, 10, 10, 10, 30);
    const CuttingPlane top = createCuttingPlane(FaceId::Top);
    QCOMPARE(top.axis, Axis::Z);
    QCOMPARE(top.normal, (Point3{0, 0, 1}));
    QCOMPARE(top.normalizedPosition, 1 - 1e-6);
    QCOMPARE(top.creationOrder, 4);
    QCOMPARE(normalizedToWorldCoordinate(k1, Axis::Z, top.normalizedPosition), 10 + 20 * (1 - 1e-6));

    const CuttingPlane left = createCuttingPlane(FaceId::Left);
    QCOMPARE(left.axis, Axis::X);
    QCOMPARE(left.normalizedPosition, 1e-6);
  }

  void normalizedPositionIsClampedInsideK1() {
    const Bounds3 k1 = box(-10, -10, 10, 10, 10, 30);
    QCOMPARE(clampNormalizedPosition(-5, k1, Axis::Z), 1e-6);
    QCOMPARE(clampNormalizedPosition(5, k1, Axis::Z), 1 - 1e-6);
    QVERIFY_THROWS_EXCEPTION(std::invalid_argument, clampNormalizedPosition(NAN, k1, Axis::Z));
    QVERIFY_THROWS_EXCEPTION(std::invalid_argument,
                             safeNormalizedInterval(box(0, 0, 0, 1, 1, 1e-6), Axis::Z));
  }

  void cutPlanesAreOrderedByCreationOrderAndSkipDisabled() {
    const Bounds3 k1 = box(-10, -10, 10, 10, 10, 30);
    CuttingPlane disabled = createCuttingPlane(FaceId::Front);
    disabled.enabled = false;
    const auto planes = cuttingPlanesToCutPlaneData(
        k1, {createCuttingPlane(FaceId::Top, 0.5), disabled, createCuttingPlane(FaceId::Right, 0.5)});
    QCOMPARE(planes.size(), std::size_t{2});
    QCOMPARE(planes[0].sourceFace, FaceId::Right);
    QCOMPARE(planes[0].coordinate, 0.0);
    QCOMPARE(planes[1].sourceFace, FaceId::Top);
    QCOMPARE(planes[1].coordinate, 20.0);
    QCOMPARE(planes[1].sourceSketchId, std::string("cutting-plane:top"));
  }

  // orthogonalMold.ts --------------------------------------------------------
  void wholeMoldBodyIsAClosedBox() {
    const MoldBody body = createWholeMoldBody(box(-20, -20, 0, 20, 20, 40), "def:mold:1", "Mold 1");
    QCOMPARE(body.triangleCount, std::size_t{12});
    QCOMPARE(body.mesh.vertexCount(), std::size_t{8});
    QCOMPARE(body.volumeMm3, 64000.0);
    QCOMPARE(signedVolume(body.mesh), 64000.0);
    QVERIFY(meshTopology(body.mesh).closedManifold());
    QCOMPARE(body.centroid, (Point3{0, 0, 20}));
  }

  void partitionByMidPlaneGivesTwoEqualClosedBodies() {
    ReferenceMoldDefinition definition;
    definition.definitionId = "def";
    definition.selectionBoxBounds = box(-10, -10, 10, 10, 10, 30);
    definition.referenceMoldBlockBounds = box(-20, -20, 0, 20, 20, 40);
    const auto planes = cuttingPlanesToCutPlaneData(definition.selectionBoxBounds,
                                                    {createCuttingPlane(FaceId::Top, 0.5)});
    const MoldPartitionResult result = partitionOrthogonalMold(definition, planes);
    QCOMPARE(result.bodies.size(), std::size_t{2});
    QCOMPARE(result.sourceSolidVolumeMm3, 64000.0);
    QCOMPARE(result.partitionedVolumeMm3, 64000.0);
    // Sorted by centre: the lower half is "Mold 1".
    QCOMPARE(result.bodies[0].id, std::string("def:mold:1"));
    QCOMPARE(result.bodies[0].name, std::string("Mold 1"));
    QCOMPARE(result.bodies[0].bounds, box(-20, -20, 0, 20, 20, 20));
    QCOMPARE(result.bodies[1].bounds, box(-20, -20, 20, 20, 20, 40));
    for (const MoldBody& body : result.bodies) {
      QCOMPARE(body.volumeMm3, 32000.0);
      QVERIFY(approx(signedVolume(body.mesh), 32000.0, 1e-6));
      QVERIFY(meshTopology(body.mesh).closedManifold());
      QCOMPARE(body.sourceSelectedFaceSignature, std::string("top"));
    }
  }

  void partitionByTwoAxesGivesFourBodies() {
    ReferenceMoldDefinition definition;
    definition.definitionId = "def";
    definition.selectionBoxBounds = box(-10, -10, 10, 10, 10, 30);
    definition.referenceMoldBlockBounds = box(-20, -20, 0, 20, 20, 40);
    const auto planes = cuttingPlanesToCutPlaneData(
        definition.selectionBoxBounds,
        {createCuttingPlane(FaceId::Top, 0.5), createCuttingPlane(FaceId::Right, 0.5)});
    const MoldPartitionResult result = partitionOrthogonalMold(definition, planes);
    QCOMPARE(result.bodies.size(), std::size_t{4});
    for (const MoldBody& body : result.bodies) {
      QCOMPARE(body.volumeMm3, 16000.0);
      QVERIFY(meshTopology(body.mesh).closedManifold());
    }
    QCOMPARE(result.bodies[0].sourceSelectedFaceSignature, std::string("right:top"));
  }

  void defaultTopPlaneSplitsOffALid() {
    ReferenceMoldDefinition definition;
    definition.definitionId = "def";
    definition.selectionBoxBounds = box(-10, -10, 10, 10, 10, 30);
    definition.referenceMoldBlockBounds = box(-20, -20, 0, 20, 20, 40);
    const auto planes = cuttingPlanesToCutPlaneData(definition.selectionBoxBounds,
                                                    {createCuttingPlane(FaceId::Top)});
    const MoldPartitionResult result = partitionOrthogonalMold(definition, planes);
    QCOMPARE(result.bodies.size(), std::size_t{2});
    const double cut = 10 + 20 * (1 - 1e-6);
    QCOMPARE(result.bodies[0].bounds.max.z, cut);
    QCOMPARE(result.bodies[1].bounds.min.z, cut);
    QVERIFY(approx(result.bodies[0].volumeMm3 + result.bodies[1].volumeMm3, 64000.0, 1e-6));
  }

  void partitionRejectsInvalidInput() {
    ReferenceMoldDefinition definition;
    definition.selectionBoxBounds = box(-10, -10, 10, 10, 10, 30);
    definition.referenceMoldBlockBounds = box(-20, -20, 0, 20, 20, 40);
    QVERIFY_THROWS_EXCEPTION(std::invalid_argument, partitionOrthogonalMold(definition, {}));
    definition.selectionBoxBounds = definition.referenceMoldBlockBounds;  // no shell thickness
    QVERIFY_THROWS_EXCEPTION(
        std::invalid_argument,
        partitionOrthogonalMold(definition, {CutPlaneData{Axis::Z, 20, {0, 0, 1}, "p", FaceId::Top, 4}}));
  }

  void coverageCheckDetectsMissingVolume() {
    const Bounds3 outer = box(0, 0, 0, 10, 10, 10);
    MoldBody body;
    body.volumeMm3 = 999;
    QCOMPARE(codeOf([&] { validateMoldPartitionCoverage(outer, {body}); }),
             std::string("mold_partition_incomplete"));
    body.volumeMm3 = 1000;
    QCOMPARE(validateMoldPartitionCoverage(outer, {body}).partitionedVolumeMm3, 1000.0);
  }

  // partSolid.validator.ts ---------------------------------------------------
  void validatorWeldsSoupIntoClosedSolid() {
    const auto result = validateSoupOf(test::cubeMesh(groundedCube_));
    QVERIFY(result.ok);
    QCOMPARE(result.prepared.mesh.vertexCount(), std::size_t{8});
    QCOMPARE(result.prepared.triangleCount, std::size_t{12});
    QCOMPARE(result.prepared.connectedComponentCount, std::size_t{1});
    QCOMPARE(result.prepared.volumeMm3, 8000.0);
    QCOMPARE(result.prepared.bounds, groundedCube_);
    QVERIFY(result.warnings.empty());
    QVERIFY(meshTopology(result.prepared.mesh).closedManifold());
  }

  void validatorNormalisesInwardWinding() {
    MeshPayload inverted = test::cubeMesh(groundedCube_);
    for (std::size_t i = 0; i < inverted.indices.size(); i += 3) {
      std::swap(inverted.indices[i + 1], inverted.indices[i + 2]);
    }
    QCOMPARE(signedVolume(inverted), -8000.0);
    const auto result = validateSoupOf(inverted);
    QVERIFY(result.ok);
    QCOMPARE(signedVolume(result.prepared.mesh), 8000.0);
  }

  void validatorRemovesDuplicateAndDegenerateFaces() {
    MeshPayload mesh = test::cubeMesh(groundedCube_);
    mesh.indices.insert(mesh.indices.end(), {0, 1, 2});  // exact duplicate
    mesh.indices.insert(mesh.indices.end(), {0, 0, 1});  // degenerate
    const auto result = validateSoupOf(mesh);
    QVERIFY(result.ok);
    QCOMPARE(result.prepared.triangleCount, std::size_t{12});
    QCOMPARE(result.warnings.size(), std::size_t{2});
    QCOMPARE(result.warnings[0].reasonCode, std::string("part_solid_degenerate_faces_removed"));
    QCOMPARE(result.warnings[1].reasonCode, std::string("part_solid_duplicate_faces_removed"));
  }

  void validatorBlocksOppositeDuplicateFaces() {
    MeshPayload mesh = test::cubeMesh(groundedCube_);
    mesh.indices.insert(mesh.indices.end(), {0, 2, 1});  // same face, flipped
    const auto result = validateSoupOf(mesh);
    QVERIFY(!result.ok);
    QCOMPARE(result.blockers.front().reasonCode, std::string("part_solid_opposite_duplicate_faces"));
  }

  void validatorRepairsSingleTriangularHole() {
    MeshPayload mesh = test::cubeMesh(groundedCube_);
    mesh.indices.resize(mesh.indices.size() - 3);
    const auto result = validateSoupOf(mesh);
    QVERIFY(result.ok);
    QCOMPARE(result.prepared.triangleCount, std::size_t{12});
    QCOMPARE(result.prepared.volumeMm3, 8000.0);
    QCOMPARE(result.warnings.back().reasonCode, std::string("part_solid_triangular_holes_repaired"));
  }

  void validatorBlocksOpenMesh() {
    MeshPayload mesh = test::cubeMesh(groundedCube_);
    mesh.indices.resize(mesh.indices.size() - 6);  // a whole quad face: a 4-vertex loop
    const auto result = validateSoupOf(mesh);
    QVERIFY(!result.ok);
    QCOMPARE(result.openEdgeCount, std::size_t{4});
    QCOMPARE(result.blockers.front().reasonCode, std::string("part_solid_open_mesh"));
    QCOMPARE(result.blockers.front().message,
             std::string("Uploaded model is not a closed solid. Open edges: 4. Boundary loops: 1. "
                         "Loop sizes: 4."));
  }

  void validatorBlocksNestedComponents() {
    MeshPayload mesh = test::cubeMesh(groundedCube_);
    const MeshPayload inner = test::cubeMesh(box(-2, -2, 5, 2, 2, 9));
    const auto offset = static_cast<std::uint32_t>(mesh.vertexCount());
    mesh.positions.insert(mesh.positions.end(), inner.positions.begin(), inner.positions.end());
    for (std::uint32_t index : inner.indices) mesh.indices.push_back(index + offset);
    const auto result = validateSoupOf(mesh);
    QVERIFY(!result.ok);
    QCOMPARE(result.blockers.front().reasonCode, std::string("part_solid_overlapping_components"));
  }

  void validatorRejectsTooFewTriangles() {
    MeshPayload mesh;
    mesh.positions = {0, 0, 0, 1, 0, 0, 0, 1, 0};
    mesh.indices = {0, 1, 2};
    const auto result = validateSoupOf(mesh);
    QVERIFY(!result.ok);
    QCOMPARE(result.blockers.front().reasonCode, std::string("part_solid_no_meaningful_volume"));
  }

  // native Manifold behind IMeshGeometryEngine --------------------------------
  void engineBuildsSolidsAndReportsVolumeAndBounds() {
    const SolidPtr cube = engine_->solidFromMesh(test::cubeMesh(groundedCube_), 1e-6, "Mesh preparation");
    QVERIFY(cube->isValid());
    QVERIFY(!cube->isEmpty());
    QCOMPARE(cube->volume(), 8000.0);
    QCOMPARE(cube->bounds(), groundedCube_);
    QCOMPARE(engine_->box(groundedCube_)->volume(), 8000.0);
  }

  void engineRejectsOpenMeshWithReferenceWording() {
    MeshPayload open = test::cubeMesh(groundedCube_);
    open.indices.resize(open.indices.size() - 3);
    try {
      engine_->solidFromMesh(open, 1e-6, "Mesh preparation");
      QFAIL("An open mesh must not become a solid.");
    } catch (const CodedError& error) {
      QCOMPARE(error.code(), std::string("mesh_not_manifold"));
      QCOMPARE(std::string(error.what()), std::string("Mesh preparation failed: NotManifold."));
    }
  }

  void engineBooleansAreVolumeExactOnBoxes() {
    const SolidPtr block = engine_->box(box(0, 0, 0, 10, 10, 10));
    const SolidPtr tool = engine_->box(box(5, 5, 5, 15, 15, 15));
    QCOMPARE(engine_->subtract(block, tool)->volume(), 875.0);
    QCOMPARE(engine_->intersect(block, tool)->volume(), 125.0);
    const SolidPtr slab = engine_->box(box(-1, -1, 4, 11, 11, 6));
    QCOMPARE(engine_->decompose(engine_->subtract(block, slab)).size(), std::size_t{2});
  }

  // cavityBody.generator.ts through generateMold() ----------------------------
  void enclosedCubeCavityInWholeBlock() {
    const MoldGenerationResult result = generateMold(*engine_, requestFor(test::cubeMesh(groundedCube_)));
    QCOMPARE(result.definition.referenceMoldBlockBounds, box(-20, -20, 0, 20, 20, 40));
    QCOMPARE(result.definition.moldBodies.size(), std::size_t{1});
    QCOMPARE(result.cavity.implementation, std::string("manifold-cpp-3.5.1"));
    QCOMPARE(result.cavity.cavityTool.implementationMethod, std::string("exact-watertight-part-solid"));

    // A fully enclosed cavity stays one body (outer shell + inner shell).
    QCOMPARE(result.cavity.bodies.size(), std::size_t{1});
    const CavityMoldBody& body = result.cavity.bodies.front();
    QVERIFY(body.cavityAffected);
    QCOMPARE(body.body.id, std::string("reference-mold:1:test.stl:1234:whole"));
    QCOMPARE(body.body.name, std::string("Mold"));
    QCOMPARE(body.body.volumeMm3, 56000.0);
    QCOMPARE(body.body.bounds, box(-20, -20, 0, 20, 20, 40));
    QVERIFY(meshTopology(body.body.mesh).closedManifold());
    QVERIFY(approx(signedVolume(body.body.mesh), 56000.0, 1e-6));
    QCOMPARE(body.validation.minimumWallMm, 10.0);

    const auto& diagnostics = result.cavity.subtraction;
    QCOMPARE(diagnostics.sourceBodyCount, std::size_t{1});
    QCOMPARE(diagnostics.affectedBodyCount, std::size_t{1});
    QCOMPARE(diagnostics.originalVolumeMm3, 64000.0);
    QCOMPARE(diagnostics.resultVolumeMm3, 56000.0);
    QCOMPARE(diagnostics.removedVolumeMm3, 8000.0);
    QCOMPARE(diagnostics.cavityToolVolumeMm3, 8000.0);

    // The cavity tool sits in the mold frame: lifted by the clearance.
    QCOMPARE(result.cavity.cavityTool.solid.bounds, box(-10, -10, 10, 10, 10, 30));
  }

  void cavityFacesAreTaggedAsCavitySurface() {
    const MoldGenerationResult result = generateMold(*engine_, requestFor(test::cubeMesh(groundedCube_)));
    const MeshPayload& mesh = result.cavity.bodies.front().body.mesh;
    std::size_t cavityTriangles = 0, outerTriangles = 0;
    for (const MeshFaceRun& run : mesh.faceRuns) {
      (run.role == FaceRole::CavitySurface ? cavityTriangles : outerTriangles) += run.triangleCount;
    }
    QCOMPARE(cavityTriangles, std::size_t{12});
    QCOMPARE(outerTriangles, std::size_t{12});
    QCOMPARE(cavityTriangles + outerTriangles, mesh.triangleCount());
  }

  void midPlaneSplitGivesTwoOpenCavityHalves() {
    MoldGenerationRequest request = requestFor(test::cubeMesh(groundedCube_));
    request.cuttingPlanes = {createCuttingPlane(FaceId::Top, 0.5)};
    const MoldGenerationResult result = generateMold(*engine_, request);
    QCOMPARE(result.cutPlanes.size(), std::size_t{1});
    QCOMPARE(result.cutPlanes.front().coordinate, 20.0);
    QCOMPARE(result.cavity.bodies.size(), std::size_t{2});
    for (const CavityMoldBody& body : result.cavity.bodies) {
      QVERIFY(body.cavityAffected);
      QVERIFY(approx(body.body.volumeMm3, 28000.0, 1e-6));
      QVERIFY(meshTopology(body.body.mesh).closedManifold());
      QVERIFY(approx(signedVolume(body.body.mesh), 28000.0, 1e-6));
      QCOMPARE(body.validation.reasonCodes.front(), std::string("cavity_subtracted"));
    }
    QCOMPARE(result.cavity.bodies[0].body.bounds, box(-20, -20, 0, 20, 20, 20));
    QCOMPARE(result.cavity.bodies[1].body.bounds, box(-20, -20, 20, 20, 20, 40));
    QCOMPARE(result.cavity.subtraction.removedVolumeMm3, 8000.0);
    QCOMPARE(result.cavity.subtraction.affectedBodyCount, std::size_t{2});
  }

  void defaultTopPlaneSplitsOffALidBody() {
    // The default plane sits one inset (K1 span * 1e-6 = 0.00002 mm) below the
    // part's top face, exactly as in the reference, so the lid still loses a
    // sliver of that thickness to the cavity tool.
    MoldGenerationRequest request = requestFor(test::cubeMesh(groundedCube_));
    request.cuttingPlanes = {createCuttingPlane(FaceId::Top)};
    const MoldGenerationResult result = generateMold(*engine_, request);
    QCOMPARE(result.cavity.bodies.size(), std::size_t{2});
    for (const CavityMoldBody& body : result.cavity.bodies) {
      QVERIFY(meshTopology(body.body.mesh).closedManifold());
    }
    QVERIFY(approx(result.cavity.subtraction.removedVolumeMm3, 8000.0, 1e-2));
    QVERIFY(approx(result.cavity.bodies[1].body.bounds.min.z, 10 + 20 * (1 - 1e-6), 1e-5));
    QVERIFY(approx(result.cavity.bodies[1].body.volumeMm3, 40.0 * 40 * (10 + 20e-6) - 400 * 20e-6, 1e-2));
  }

  void bodiesTheToolDoesNotReachArePreserved() {
    CavityGenerationInput input;
    input.partBoundingBox = box(-10, -10, 10, 10, 10, 30);
    input.referenceMoldBlockBounds = box(-20, -20, 0, 60, 20, 40);
    input.tolerancePolicy = buildGeometryTolerancePolicy(input.referenceMoldBlockBounds, 0);
    input.geometryToleranceMm = input.tolerancePolicy.booleanToleranceMm;
    const MoldBody nearBody = createWholeMoldBody(box(-20, -20, 0, 20, 20, 40), "near", "Mold 1");
    const MoldBody farBody = createWholeMoldBody(box(20, -20, 0, 60, 20, 40), "far", "Mold 2");
    input.moldBodies = {nearBody, farBody};

    CavityTool tool;
    tool.solid.mesh = test::cubeMesh(box(-10, -10, 10, 10, 10, 30));
    tool.solid.bounds = box(-10, -10, 10, 10, 10, 30);
    tool.solid.volumeMm3 = 8000;

    const CavityGenerationResult result = generateCavityBodies(*engine_, input, tool);
    QCOMPARE(result.bodies.size(), std::size_t{2});
    QCOMPARE(result.subtraction.affectedBodyCount, std::size_t{1});
    QCOMPARE(result.subtraction.unaffectedBodyCount, std::size_t{1});
    const CavityMoldBody& untouched = result.bodies[1];
    QVERIFY(!untouched.cavityAffected);
    QCOMPARE(untouched.body.geometryVersion, farBody.geometryVersion);
    QCOMPARE(untouched.body.mesh.positions, farBody.mesh.positions);
    QCOMPARE(untouched.validation.reasonCodes,
             (std::vector<std::string>{"cavity_no_intersection", "cavity_source_geometry_preserved"}));
  }

  void sphereCavityRemovesTheToolVolume() {
    const MeshPayload sphere = test::sphereMesh({0, 0, 10}, 10, 48, 24);
    MoldGenerationRequest request = requestFor(sphere);
    request.cuttingPlanes = {createCuttingPlane(FaceId::Top, 0.5)};
    const MoldGenerationResult result = generateMold(*engine_, request);

    const double toolVolume = result.cavity.cavityTool.solid.volumeMm3;
    QVERIFY(approx(toolVolume, signedVolume(sphere), signedVolume(sphere) * 1e-5));
    // Polyhedral sphere: a little under the analytic 4/3 pi r^3.
    QVERIFY(toolVolume < 4.0 / 3.0 * M_PI * 1000 && toolVolume > 0.98 * 4.0 / 3.0 * M_PI * 1000);

    QCOMPARE(result.cavity.bodies.size(), std::size_t{2});
    double remaining = 0;
    for (const CavityMoldBody& body : result.cavity.bodies) {
      QVERIFY(meshTopology(body.body.mesh).closedManifold());
      QVERIFY(approx(signedVolume(body.body.mesh), body.body.volumeMm3, body.body.volumeMm3 * 1e-9));
      remaining += body.body.volumeMm3;
    }
    QVERIFY(approx(64000.0 - remaining, toolVolume, 1e-3));
    QVERIFY(approx(result.cavity.subtraction.removedVolumeMm3, toolVolume, 1e-3));
    // Symmetric part, symmetric split: both halves hold the same material.
    QVERIFY(approx(result.cavity.bodies[0].body.volumeMm3, result.cavity.bodies[1].body.volumeMm3, 1e-2));
  }

  void resultIsDeterministic() {
    MoldGenerationRequest request = requestFor(test::sphereMesh({0, 0, 10}, 10));
    request.cuttingPlanes = {createCuttingPlane(FaceId::Top, 0.5)};
    const MoldGenerationResult first = generateMold(*engine_, request);
    const MoldGenerationResult second = generateMold(*engine_, request);
    QCOMPARE(first.cavity.sourceSignature, second.cavity.sourceSignature);
    QCOMPARE(first.cavity.operationId, second.cavity.operationId);
    QCOMPARE(first.cavity.bodies.size(), second.cavity.bodies.size());
    for (std::size_t i = 0; i < first.cavity.bodies.size(); ++i) {
      QCOMPARE(first.cavity.bodies[i].body.geometryVersion, second.cavity.bodies[i].body.geometryVersion);
    }
  }

  void signatureTracksInputs() {
    MoldGenerationRequest request = requestFor(test::cubeMesh(groundedCube_));
    const std::string base = generateMold(*engine_, request).cavity.sourceSignature;
    request.moldClearanceMm = 12;
    QVERIFY(generateMold(*engine_, request).cavity.sourceSignature != base);
    request.moldClearanceMm = 10;
    request.cuttingPlanes = {createCuttingPlane(FaceId::Top, 0.5)};
    QVERIFY(generateMold(*engine_, request).cavity.sourceSignature != base);
  }

  void moldClearanceScalesTheBlock() {
    MoldGenerationRequest request = requestFor(test::cubeMesh(groundedCube_));
    request.moldClearanceMm = 25;
    const MoldGenerationResult result = generateMold(*engine_, request);
    QCOMPARE(result.definition.referenceMoldBlockBounds, box(-35, -35, 0, 35, 35, 70));
    QCOMPARE(result.cavity.subtraction.originalVolumeMm3, 70.0 * 70 * 70);
    QCOMPARE(result.cavity.subtraction.resultVolumeMm3, 70.0 * 70 * 70 - 8000);
  }

  void failuresCarryReferenceCodes() {
    MoldGenerationRequest request = requestFor(test::cubeMesh(groundedCube_));

    MoldGenerationRequest open = request;
    MeshPayload openMesh = test::cubeMesh(groundedCube_);
    openMesh.indices.resize(openMesh.indices.size() - 6);
    open.groundedPart = std::make_shared<TriangleSoup>(test::soupFromMesh(openMesh));
    QCOMPARE(codeOf([&] { generateMold(*engine_, open); }), std::string("part_solid_open_mesh"));

    MoldGenerationRequest thin = request;
    thin.moldClearanceMm = 0.5;
    QCOMPARE(codeOf([&] { generateMold(*engine_, thin); }), std::string("reference_mold_invalid"));

    MoldGenerationRequest offset = request;
    offset.cavityClearanceMm = -1;
    QCOMPARE(codeOf([&] { generateMold(*engine_, offset); }), std::string("cavity_offset_failed"));

    MoldGenerationRequest empty = request;
    empty.groundedPart = std::make_shared<TriangleSoup>();
    QCOMPARE(codeOf([&] { generateMold(*engine_, empty); }), std::string("part_solid_empty"));
  }

  void cancellationStopsTheOperation() {
    CancellationToken cancel;
    cancel.cancel();
    QCOMPARE(codeOf([&] {
               generateMold(*engine_, requestFor(test::cubeMesh(groundedCube_)), cancel);
             }),
             std::string("cavity_cancelled"));
  }

  void progressReportsReferenceStagesInOrder() {
    std::vector<std::string> stages;
    double last = -1;
    bool monotonic = true;
    generateMold(*engine_, requestFor(test::cubeMesh(groundedCube_)), {},
                 [&](const std::string& stage, double fraction) {
                   stages.push_back(stage);
                   monotonic = monotonic && fraction >= last;
                   last = fraction;
                 });
    QCOMPARE(stages, (std::vector<std::string>{"validating", "auditing", "building-offset",
                                               "subtracting-body", "validating-results", "complete"}));
    QVERIFY(monotonic);
    QCOMPARE(last, 1.0);
  }


  // --- positive cavity clearance (cavityEngine.selector.ts and engines) -----
  void selectorMatchesReferenceRules() {
    CavityComplexityMetrics m;
    m.triangleCount = 12; m.connectedComponentCount = 1; m.boundsDiagonalMm = 34.6;
    m.smallestDimensionMm = 20; m.volumeMm3 = 8000;
    m.requestedClearanceMm = 0;
    QCOMPARE(selectCavityOffsetEngine(m).engine, OffsetEngineKind::ExactZeroClearance);
    m.requestedClearanceMm = 0.5;
    auto d = selectCavityOffsetEngine(m);
    QCOMPARE(d.engine, OffsetEngineKind::DirectMinkowski);
    QCOMPARE(d.reasonCodes.front(), std::string("positive_clearance_requested"));
    QCOMPARE(d.reasonCodes.back(), std::string("complexity_score_direct"));
    m.connectedComponentCount = 2;
    QCOMPARE(selectCavityOffsetEngine(m).engine, OffsetEngineKind::DistanceField);
    m.connectedComponentCount = 1; m.triangleCount = 50'001;
    QCOMPARE(selectCavityOffsetEngine(m).engine, OffsetEngineKind::DistanceField);
    m.triangleCount = 12; m.smallestDimensionMm = 1;  // diagonal/smallest = 34.6 > 20
    d = selectCavityOffsetEngine(m);
    QCOMPARE(d.engine, OffsetEngineKind::DistanceField);
    QVERIFY(std::find(d.reasonCodes.begin(), d.reasonCodes.end(), "extreme_aspect_ratio") != d.reasonCodes.end());
  }

  void adaptivePolicyAndProfileMatchReference() {
    auto p = buildAdaptiveClearancePolicy(1000, 2, 1e-6, CavityQualityMode::Standard);
    QVERIFY(!p.simplify); QCOMPARE(p.sphereSegments, 16);
    p = buildAdaptiveClearancePolicy(1000, 2, 1e-6, CavityQualityMode::High);
    QCOMPARE(p.sphereSegments, 32);
    p = buildAdaptiveClearancePolicy(60'000, 2, 1e-6, CavityQualityMode::Standard);
    QVERIFY(p.simplify); QCOMPARE(p.simplificationToleranceMm, 1.0); QCOMPARE(p.sphereSegments, 8);

    WatertightPartSolid solid; solid.bounds = box(0, 0, 0, 20, 20, 20);
    const auto profile = buildDistanceFieldQualityProfile(solid, 1.0, CavityQualityMode::Standard, 1e-6);
    QCOMPARE(profile.targetEdgeLengthMm, 1.0);
    QCOMPARE(profile.effectiveEdgeLengthMm, 1.0);
    QCOMPARE(profile.boundsPaddingMm, 3.0);
    QCOMPARE(profile.bounds, box(-3, -3, -3, 23, 23, 23));
    QCOMPARE(profile.estimatedGridCellCount, 26.0 * 26 * 26);
    QCOMPARE(profile.surfaceToleranceMm, 0.25);
    QVERIFY(!profile.exceedsGridBudget);
  }

  void signedDistanceOfCube() {
    SignedDistanceField field(test::cubeMesh(box(0, 0, 0, 10, 10, 10)));
    QVERIFY(std::fabs(field.signedDistance({5, 5, 5}) - 5.0) < 1e-9);    // inside: positive
    QVERIFY(std::fabs(field.signedDistance({5, 5, 12}) + 2.0) < 1e-9);   // outside: negative
    QVERIFY(std::fabs(field.signedDistance({13, 14, 10}) + 5.0) < 1e-9); // edge distance 3-4-5
    QCOMPARE(field.signedDistance({5, 5, 10}), 0.0);                     // on the surface
    QVERIFY(field.isInside({1, 1, 1}));
    QVERIFY(!field.isInside({-1, 5, 5}));
  }

  void bandedSignedDistanceAgreesWithinTheBand() {
    SignedDistanceField field(test::cubeMesh(box(0, 0, 0, 10, 10, 10)));
    QCOMPARE(field.signedDistanceBanded({5, 5, 12}, 4.0), field.signedDistance({5, 5, 12}));  // inside band: exact
    QCOMPARE(field.signedDistanceBanded({5, 5, 5}, 4.0), 4.0);     // deep inside: +band
    QCOMPARE(field.signedDistanceBanded({5, 5, 30}, 4.0), -4.0);   // far outside: -band
    QCOMPARE(field.signedDistanceBanded({5, 5, 10}, 4.0), 0.0);    // surface
  }

  void minkowskiOffsetMatchesAnalyticVolume() {
    const auto prepared = validateSoupOf(test::cubeMesh(box(-10, -10, 0, 10, 10, 20)));
    QVERIFY(prepared.ok);
    const CavityTool tool = createCavityTool(*engine_, prepared.prepared, 2.0, CavityQualityMode::Standard, 1e-6);
    QCOMPARE(tool.implementationMethod, std::string("manifold-minkowski-sphere"));
    // a^3 + 6 a^2 r + 3 pi a r^2 + 4/3 pi r^3, a = 20, r = 2 (a 16-segment sphere is a bit smaller).
    const double analytic = 8000 + 4800 + 3 * M_PI * 20 * 4 + 4.0 / 3 * M_PI * 8;
    QVERIFY(tool.solid.volumeMm3 < analytic && tool.solid.volumeMm3 > 0.97 * analytic);
    QCOMPARE(tool.solid.bounds, box(-12, -12, -2, 12, 12, 22));
    QVERIFY(meshTopology(tool.solid.mesh).closedManifold());
  }

  void moldWithPositiveClearanceRemovesTheOffsetTool() {
    MoldGenerationRequest request = requestFor(test::cubeMesh(groundedCube_));
    request.cavityClearanceMm = 2.0;
    request.cuttingPlanes = {createCuttingPlane(FaceId::Top, 0.5)};
    const MoldGenerationResult result = generateMold(*engine_, request);
    QCOMPARE(result.cavity.selectedEngine, std::string("direct-minkowski"));
    QCOMPARE(result.cavity.cavityTool.implementationMethod, std::string("manifold-minkowski-sphere"));
    QVERIFY(!result.cavity.usedFallback);
    QCOMPARE(result.cavity.offsetAttempts.size(), std::size_t{1});
    QVERIFY(result.cavity.subtraction.removedVolumeMm3 > 8000);
    QVERIFY(approx(result.cavity.subtraction.removedVolumeMm3, result.cavity.cavityTool.solid.volumeMm3, 1e-3));
    QCOMPARE(result.cavity.cavityTool.solid.bounds, box(-12, -12, 8, 12, 12, 32));
    for (const CavityMoldBody& body : result.cavity.bodies) {
      QVERIFY(meshTopology(body.body.mesh).closedManifold());
      QVERIFY(approx(signedVolume(body.body.mesh), body.body.volumeMm3, body.body.volumeMm3 * 1e-9));
    }
  }

  void cavityBreakingThroughTheBlockIsRejected() {
    MoldGenerationRequest request = requestFor(test::cubeMesh(groundedCube_));
    request.moldClearanceMm = 3;
    request.cavityClearanceMm = 3;  // tool reaches the block wall
    QCOMPARE(codeOf([&] { generateMold(*engine_, request); }), std::string("cavity_boolean_failed"));
  }

  void multiComponentPartUsesTheDistanceField() {
    MoldGenerationRequest request = requestFor(twoCubes());
    request.moldClearanceMm = 20;
    request.cavityClearanceMm = 1.0;
    const MoldGenerationResult result = generateMold(*engine_, request);
    QCOMPARE(result.cavity.selectedEngine, std::string("distance-field"));
    QCOMPARE(result.cavity.cavityTool.implementationMethod, std::string("manifold-level-set-sdf"));
    QCOMPARE(result.cavity.cavityTool.solid.connectedComponentCount, std::size_t{2});
    QVERIFY(result.cavity.hasDistanceFieldProfile);
    // Offset volume of two separated 20x20x20 cubes by 1 mm (analytic ~ 2 * 10 100 mm^3);
    // the 1 mm level-set grid should land within a few percent.
    const double analytic = 2 * (8000 + 6 * 400 * 1 + 3 * M_PI * 20 + 4.0 / 3 * M_PI);
    QVERIFY(approx(result.cavity.cavityTool.solid.volumeMm3, analytic, 0.05 * analytic));
    QVERIFY(meshTopology(result.cavity.cavityTool.solid.mesh).closedManifold());
    for (const CavityMoldBody& body : result.cavity.bodies) {
      QVERIFY(meshTopology(body.body.mesh).closedManifold());
    }
  }

  void directFailureFallsBackToTheDistanceField() {
    FailingMinkowskiEngine failing(*engine_);
    MoldGenerationRequest request = requestFor(test::cubeMesh(groundedCube_));
    request.cavityClearanceMm = 1.0;
    const MoldGenerationResult result = generateMold(failing, request);
    QVERIFY(result.cavity.usedFallback);
    QCOMPARE(result.cavity.selectedEngine, std::string("direct-minkowski"));
    QCOMPARE(result.cavity.offsetAttempts.size(), std::size_t{2});
    QVERIFY(!result.cavity.offsetAttempts[0].succeeded);
    QVERIFY(result.cavity.offsetAttempts[1].succeeded);
    QCOMPARE(result.cavity.cavityTool.implementationMethod, std::string("manifold-level-set-sdf"));
    QVERIFY(result.cavity.subtraction.removedVolumeMm3 > 8000);
  }

  void distanceFieldCanBeCancelled() {
    WatertightPartSolid prepared = validateSoupOf(twoCubes()).prepared;
    CancellationToken cancel;
    cancel.cancel();
    QCOMPARE(codeOf([&] {
               createDistanceFieldCavityTool(*engine_, prepared, 1.0, CavityQualityMode::Standard, 1e-6, cancel);
             }),
             std::string("cavity_cancelled"));
  }

  void distanceFieldRefusesAnOversizedGrid() {
    WatertightPartSolid prepared;
    prepared.bounds = box(0, 0, 0, 5000, 5000, 5000);  // 256-cell cap -> too many cells
    prepared.watertight = prepared.manifold = true;
    prepared.mesh = test::cubeMesh(prepared.bounds);
    prepared.triangleCount = 12;
    const auto profile = buildDistanceFieldQualityProfile(prepared, 1.0, CavityQualityMode::Standard, 1e-6);
    QVERIFY(profile.estimatedGridCellCount > 0);
    // 5000 mm / 256 = 19.5 mm cells -> ~260^3 = 17.6 M cells > 12 M budget.
    QVERIFY(profile.exceedsGridBudget);
    QCOMPARE(codeOf([&] {
               createDistanceFieldCavityTool(*engine_, prepared, 1.0, CavityQualityMode::Standard, 1e-6);
             }),
             std::string("cavity_offset_failed"));
  }
  void misalignedToolIsRejected() {
    // Direct generator call with a tool outside the block.
    CavityGenerationInput input;
    input.partBoundingBox = box(-10, -10, 10, 10, 10, 30);
    input.referenceMoldBlockBounds = box(-20, -20, 0, 20, 20, 40);
    input.tolerancePolicy = buildGeometryTolerancePolicy(input.referenceMoldBlockBounds, 0);
    input.geometryToleranceMm = input.tolerancePolicy.booleanToleranceMm;
    input.moldBodies = {createWholeMoldBody(input.referenceMoldBlockBounds, "b", "Mold 1")};

    CavityTool tool;
    tool.solid.mesh = test::cubeMesh(box(100, 100, 100, 110, 110, 110));
    tool.solid.bounds = box(100, 100, 100, 110, 110, 110);
    QCOMPARE(codeOf([&] { generateCavityBodies(*engine_, input, tool); }),
             std::string("cavity_coordinate_mismatch"));

    // Touching the outer wall is a breakthrough.
    tool.solid.mesh = test::cubeMesh(box(-20, -10, 10, 10, 10, 30));
    tool.solid.bounds = box(-20, -10, 10, 10, 10, 30);
    QCOMPARE(codeOf([&] { generateCavityBodies(*engine_, input, tool); }),
             std::string("cavity_boolean_failed"));
  }
};

QTEST_APPLESS_MAIN(MoldTest)
#include "tst_mold.moc"
