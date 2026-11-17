// Mold-domain tests: reference mold block, Cut by Face partition, part-solid
// validation, and real cavity subtraction through native Manifold. Every
// geometric expectation is checked numerically (volumes, bounds, topology),
// never through rendered output.

#include <QtTest/QtTest>

#include <cmath>

#include "ManifoldMeshEngine.h"
#include "TestMeshes.h"
#include "geometry/MeshAnalysis.h"
#include "mold/CavityGeneration.h"
#include "mold/PartSolid.h"
#include "mold/ReferenceMold.h"

using namespace craft;
using craft::test::box;

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
    offset.cavityClearanceMm = 0.4;
    QCOMPARE(codeOf([&] { generateMold(*engine_, offset); }), std::string("cavity_offset_not_ported"));

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
             std::string("cavity_outer_breakthrough"));
  }
};

QTEST_APPLESS_MAIN(MoldTest)
#include "tst_mold.moc"
