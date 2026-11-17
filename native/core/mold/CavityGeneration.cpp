#include "mold/CavityGeneration.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <set>

#include "geometry/MeshAnalysis.h"

namespace craft {

namespace {

using Clock = std::chrono::steady_clock;

double elapsedMs(Clock::time_point since) {
  return std::chrono::duration<double, std::milli>(Clock::now() - since).count();
}

Issue warning(std::string code, std::string message) {
  return {IssueSeverity::Warning, std::move(code), std::move(message)};
}
Issue blocker(std::string code, std::string message) {
  return {IssueSeverity::Blocker, std::move(code), std::move(message)};
}

bool overlaps(const Bounds3& a, const Bounds3& b, double t) {
  return a.min.x < b.max.x - t && a.max.x > b.min.x + t && a.min.y < b.max.y - t &&
         a.max.y > b.min.y + t && a.min.z < b.max.z - t && a.max.z > b.min.z + t;
}
bool containedBy(const Bounds3& inner, const Bounds3& outer, double t) {
  return inner.min.x >= outer.min.x - t && inner.min.y >= outer.min.y - t &&
         inner.min.z >= outer.min.z - t && inner.max.x <= outer.max.x + t &&
         inner.max.y <= outer.max.y + t && inner.max.z <= outer.max.z + t;
}
bool boundsMatch(const Bounds3& l, const Bounds3& r, double t) {
  for (int axis = 0; axis < 3; ++axis) {
    if (std::fabs(l.min[axis] - r.min[axis]) > t || std::fabs(l.max[axis] - r.max[axis]) > t) {
      return false;
    }
  }
  return true;
}

double wallDistance(const Bounds3& tool, const Bounds3& k2) {
  return std::min({tool.min.x - k2.min.x, k2.max.x - tool.max.x, tool.min.y - k2.min.y,
                   k2.max.y - tool.max.y, tool.min.z - k2.min.z, k2.max.z - tool.max.z});
}

std::string formatFixed3(double value) {
  char buffer[64];
  std::snprintf(buffer, sizeof(buffer), "%.3f", value);
  return buffer;
}
std::string formatPrecision4(double value) {
  char buffer[64];
  std::snprintf(buffer, sizeof(buffer), "%.4g", value);
  return buffer;
}

struct FragmentIdentity {
  std::string id;
  std::string name;
};

// Port of buildFragmentBodyIdentity().
FragmentIdentity fragmentIdentity(const std::string& parentId, const std::string& parentName,
                                  std::size_t componentIndex, std::size_t componentCount) {
  if (parentId.empty() || parentName.empty() || componentCount < 1 ||
      componentIndex >= componentCount) {
    throw CodedError("cavity_boolean_failed", "Fragment body identity inputs are invalid.");
  }
  if (componentCount == 1) return {parentId, parentName};
  const std::string partNumber = std::to_string(componentIndex + 1);
  return {parentId + ":cavity-component:" + partNumber,
          parentName + " \xE2\x80\x94 Part " + partNumber};  // em dash, as in the reference
}

void throwIfCancelled(const CancellationToken& cancel) {
  if (cancel.isCancelled()) {
    throw CodedError("cavity_cancelled", "Cavity generation was cancelled.");
  }
}

}  // namespace

CavityContainment validateCavityContainment(const CavityGenerationInput& input,
                                            const CavityTool& tool) {
  CavityContainment containment;
  containment.distance = wallDistance(tool.solid.bounds, input.referenceMoldBlockBounds);
  if (containment.distance <= input.geometryToleranceMm) {
    containment.blockers.push_back(blocker(
        "cavity_outer_breakthrough",
        "Cavity extends outside or touches the mold outer surface. Increase outer mold clearance."));
  } else if (containment.distance < input.minimumWallMm) {
    containment.warnings.push_back(
        warning("cavity_thin_wall", "Conservative outer-wall clearance is " +
                                        formatFixed3(containment.distance) + " mm."));
  }
  return containment;
}

void assertCavityCoordinateAlignment(const CavityGenerationInput& input, const CavityTool& tool) {
  const double tolerance = input.tolerancePolicy.linearToleranceMm;
  if (!containedBy(input.partBoundingBox, input.referenceMoldBlockBounds, tolerance)) {
    throw CodedError("cavity_coordinate_mismatch",
                     "K1 reference bounds are not contained by K2 bounds.");
  }
  if (!overlaps(tool.solid.bounds, input.partBoundingBox, tolerance)) {
    throw CodedError("cavity_coordinate_mismatch",
                     "Cavity tool bounds do not overlap the K1 reference envelope.");
  }
  if (!boundsMatch(boundsOfPositions(tool.solid.mesh.positions), tool.solid.bounds, tolerance)) {
    throw CodedError("cavity_coordinate_mismatch",
                     "Cavity tool mesh bounds do not match its declared bounds.");
  }
  bool anyOverlap = false;
  for (const MoldBody& source : input.moldBodies) {
    if (!boundsMatch(boundsOfPositions(source.mesh.positions), source.bounds, tolerance)) {
      throw CodedError("cavity_coordinate_mismatch",
                       source.name + " mesh bounds do not match its declared bounds.");
    }
    anyOverlap = anyOverlap || overlaps(source.bounds, tool.solid.bounds, tolerance);
  }
  if (!anyOverlap) {
    throw CodedError("cavity_no_material_intersection",
                     "The cavity tool did not intersect any mold material. Verify mold-body "
                     "construction and coordinate alignment.");
  }
}

CavityGenerationResult generateCavityBodies(IMeshGeometryEngine& engine,
                                            const CavityGenerationInput& input,
                                            const CavityTool& tool,
                                            const CancellationToken& cancel) {
  assertCavityCoordinateAlignment(input, tool);
  const CavityContainment containment = validateCavityContainment(input, tool);
  if (!containment.blockers.empty()) {
    throw CodedError(containment.blockers.front().reasonCode, containment.blockers.front().message);
  }

  const GeometryTolerancePolicy& policy = input.tolerancePolicy;
  const double geometryTolerance = input.geometryToleranceMm;
  const double geometryToleranceCubed = geometryTolerance * geometryTolerance * geometryTolerance;

  const SolidPtr toolSolid = engine.asOriginal(
      engine.solidFromMesh(tool.solid.mesh, geometryTolerance, "Mesh preparation"));
  const std::map<std::int64_t, FaceRole> cavityRoles{{toolSolid->originalId(), FaceRole::CavitySurface}};

  CavityGenerationResult result;
  result.operationId = input.operationId;
  result.generationVersion = input.generationVersion;
  result.sourceSignature = input.upstreamInputSignature;
  result.implementation = engine.implementation();
  result.cavityTool = tool;
  result.warnings = containment.warnings;

  double originalVolumeTotal = 0;
  std::set<std::string> affectedSourceBodyIds;

  for (const MoldBody& source : input.moldBodies) {
    throwIfCancelled(cancel);
    const bool candidate = overlaps(source.bounds, tool.solid.bounds, geometryTolerance);
    const SolidPtr sourceSolid =
        engine.solidFromMesh(source.mesh, policy.booleanToleranceMm, "Mesh preparation");
    const SolidPtr subtracted = candidate ? engine.subtract(sourceSolid, toolSolid) : sourceSolid;

    if (!subtracted->isValid() || subtracted->isEmpty()) {
      throw CodedError("cavity_boolean_failed", "Boolean subtraction failed for " + source.name + ".");
    }
    const double resultVolume = subtracted->volume();
    const double sourceVolume = sourceSolid->volume();
    originalVolumeTotal += sourceVolume;
    const double volumeTolerance = policy.affectedVolumeToleranceMm3;
    if (resultVolume > sourceVolume + volumeTolerance) {
      throw CodedError("cavity_boolean_failed",
                       "Boolean subtraction increased material volume for " + source.name + ".");
    }

    const bool affected = sourceVolume - resultVolume > volumeTolerance;
    if (!affected) {
      const MeshTopologyCounts topo = meshTopology(source.mesh);
      CavityMoldBody unchanged;
      unchanged.body = source;
      unchanged.body.visible = true;
      unchanged.parentBodyId = source.id;
      unchanged.cavityAffected = false;
      unchanged.validation.bodyId = source.id;
      unchanged.validation.bodyName = source.name;
      unchanged.validation.parentBodyId = source.id;
      unchanged.validation.volumeMm3 = source.volumeMm3;
      unchanged.validation.triangleCount = source.triangleCount;
      unchanged.validation.watertight = source.watertight;
      unchanged.validation.manifold = source.watertight;
      unchanged.validation.openEdgeCount = topo.openEdgeCount;
      unchanged.validation.nonManifoldEdgeCount = topo.nonManifoldEdgeCount;
      unchanged.validation.minimumWallMm = containment.distance;
      unchanged.validation.warnings = containment.warnings;
      unchanged.validation.reasonCodes = {"cavity_no_intersection", "cavity_source_geometry_preserved"};
      result.bodies.push_back(std::move(unchanged));
      continue;
    }
    affectedSourceBodyIds.insert(source.id);

    // A fully enclosed cavity decomposes into an outer shell plus a
    // negative-volume inner shell; the reference keeps such a body whole.
    struct Entry {
      SolidPtr solid;
      double volume;
      Bounds3 bounds;
    };
    const std::vector<SolidPtr> components = engine.decompose(subtracted);
    bool containsInnerShell = false;
    for (const SolidPtr& component : components) {
      containsInnerShell = containsInnerShell || component->volume() < -policy.volumeToleranceMm3;
    }
    std::vector<Entry> entries;
    if (containsInnerShell) {
      entries.push_back({subtracted, resultVolume, subtracted->bounds()});
    } else {
      for (const SolidPtr& component : components) {
        entries.push_back({component, component->volume(), component->bounds()});
      }
    }

    const double minimumFragmentVolume =
        std::max(policy.minimumFragmentVolumeMm3, sourceVolume * 1e-10);
    std::vector<double> componentVolumes;
    for (const Entry& entry : entries) componentVolumes.push_back(entry.volume);
    FragmentVolumeClassification classification;
    try {
      classification = classifyFragmentVolumes(componentVolumes, minimumFragmentVolume);
    } catch (const std::invalid_argument& error) {
      throw CodedError("cavity_boolean_failed", error.what());
    }

    std::vector<Entry> meaningful;
    for (const Entry& entry : entries) {
      if (entry.volume > minimumFragmentVolume) meaningful.push_back(entry);
    }
    std::stable_sort(meaningful.begin(), meaningful.end(), [&](const Entry& l, const Entry& r) {
      return compareComponentDescriptors({l.volume, l.bounds}, {r.volume, r.bounds},
                                         geometryTolerance) < 0;
    });
    if (meaningful.empty()) {
      throw CodedError("cavity_boolean_failed",
                       source.name + " has no meaningful material solid after cavity subtraction.");
    }
    if (!classification.discardedVolumes.empty()) {
      const std::size_t discarded = classification.discardedVolumes.size();
      result.warnings.push_back(warning(
          "cavity_negligible_fragments_discarded",
          source.name + ": " + std::to_string(discarded) + " negligible fragment" +
              (discarded == 1 ? " was" : "s were") + " discarded; largest was " +
              formatPrecision4(classification.discardedVolumes.front()) + " mm\xC2\xB3."));
    }
    if (meaningful.size() > 1) {
      result.warnings.push_back(warning("cavity_material_fragmentation",
                                        source.name + " separated into " +
                                            std::to_string(meaningful.size()) +
                                            " meaningful material components."));
    }

    for (std::size_t componentIndex = 0; componentIndex < meaningful.size(); ++componentIndex) {
      const Entry& entry = meaningful[componentIndex];
      const FragmentIdentity identity =
          fragmentIdentity(source.id, source.name, componentIndex, meaningful.size());
      MeshPayload mesh = engine.meshFromSolid(entry.solid, cavityRoles, "Mesh export");
      const MeshTopologyCounts topo = meshTopology(mesh);

      std::string failure;
      const std::size_t vertexCount = mesh.vertexCount();
      const bool finite =
          std::all_of(mesh.positions.begin(), mesh.positions.end(),
                      [](double v) { return std::isfinite(v); }) &&
          std::all_of(mesh.indices.begin(), mesh.indices.end(),
                      [&](std::uint32_t i) { return i < vertexCount; });
      if (!finite) {
        failure = "Boolean result contains non-finite geometry.";
      } else if (!containedBy(entry.bounds, input.referenceMoldBlockBounds,
                              policy.containmentToleranceMm)) {
        failure = "Boolean result extends outside the reference mold bounds.";
      } else if (entry.volume <= geometryToleranceCubed) {
        failure = "Boolean result has no positive volume.";
      } else if (!topo.closedManifold()) {
        failure = "Boolean result is not a closed manifold.";
      }
      if (!failure.empty()) {
        throw CodedError("cavity_boolean_failed", identity.name + ": " + failure);
      }

      CavityMoldBody generated;
      generated.body = source;
      generated.body.id = identity.id;
      generated.body.name = identity.name;
      generated.body.visible = true;
      generated.body.bounds = entry.bounds;
      generated.body.centroid = entry.bounds.center();
      generated.body.triangleCount = mesh.triangleCount();
      generated.body.volumeMm3 = entry.volume;
      generated.body.watertight = true;
      generated.body.geometryVersion = meshGeometryVersion(identity.id, mesh, entry.bounds);
      generated.body.mesh = std::move(mesh);
      generated.parentBodyId = source.id;
      generated.cavityAffected = true;
      generated.validation.bodyId = identity.id;
      generated.validation.bodyName = identity.name;
      generated.validation.parentBodyId = source.id;
      generated.validation.cavityAffected = true;
      generated.validation.volumeMm3 = entry.volume;
      generated.validation.triangleCount = generated.body.triangleCount;
      generated.validation.openEdgeCount = topo.openEdgeCount;
      generated.validation.nonManifoldEdgeCount = topo.nonManifoldEdgeCount;
      generated.validation.minimumWallMm = containment.distance;
      generated.validation.warnings = containment.warnings;
      generated.validation.reasonCodes = {
          "cavity_subtracted",
          meaningful.size() > 1 ? "cavity_component_separated" : "cavity_single_component"};
      result.bodies.push_back(std::move(generated));
    }
  }

  // --- aggregate validation ----------------------------------------------
  double resultVolumeTotal = 0;
  for (const CavityMoldBody& body : result.bodies) resultVolumeTotal += body.body.volumeMm3;
  const double removedVolumeTotal = originalVolumeTotal - resultVolumeTotal;
  const double affectedVolumeTolerance = policy.affectedVolumeToleranceMm3;

  if (affectedSourceBodyIds.empty() || removedVolumeTotal <= affectedVolumeTolerance) {
    throw CodedError("cavity_no_material_intersection",
                     "The cavity tool did not intersect any mold material. Verify mold-body "
                     "construction and coordinate alignment.");
  }
  if (!std::isfinite(originalVolumeTotal) || originalVolumeTotal <= 0 ||
      !std::isfinite(resultVolumeTotal) || resultVolumeTotal <= 0 ||
      resultVolumeTotal > originalVolumeTotal + affectedVolumeTolerance) {
    throw CodedError("cavity_result_volume_invalid",
                     "Cavity subtraction produced invalid aggregate material volume.");
  }
  std::set<std::string> ids;
  for (const CavityMoldBody& body : result.bodies) {
    if (!body.validation.finiteGeometry || !body.validation.watertight || !body.validation.manifold ||
        !containedBy(body.body.bounds, input.referenceMoldBlockBounds, policy.containmentToleranceMm)) {
      throw CodedError("cavity_result_invalid", "Cavity subtraction produced an invalid mold body.");
    }
    ids.insert(body.body.id);
  }
  if (ids.size() != result.bodies.size()) {
    throw CodedError("cavity_duplicate_body_id",
                     "Cavity subtraction produced duplicate mold-body IDs.");
  }
  for (std::size_t l = 0; l < result.bodies.size(); ++l) {
    for (std::size_t r = l + 1; r < result.bodies.size(); ++r) {
      throwIfCancelled(cancel);
      const MoldBody& left = result.bodies[l].body;
      const MoldBody& right = result.bodies[r].body;
      if (!overlaps(left.bounds, right.bounds, policy.linearToleranceMm)) continue;
      const SolidPtr intersection = engine.intersect(
          engine.solidFromMesh(left.mesh, policy.booleanToleranceMm, "Mesh preparation"),
          engine.solidFromMesh(right.mesh, policy.booleanToleranceMm, "Mesh preparation"));
      if (!intersection->isValid() || std::fabs(intersection->volume()) > affectedVolumeTolerance) {
        throw CodedError("cavity_result_overlap",
                         "Cavity subtraction produced unexpectedly overlapping mold bodies.");
      }
    }
  }

  result.subtraction.sourceBodyCount = input.moldBodies.size();
  result.subtraction.affectedBodyCount = affectedSourceBodyIds.size();
  result.subtraction.unaffectedBodyCount = input.moldBodies.size() - affectedSourceBodyIds.size();
  result.subtraction.originalVolumeMm3 = originalVolumeTotal;
  result.subtraction.resultVolumeMm3 = resultVolumeTotal;
  result.subtraction.removedVolumeMm3 = removedVolumeTotal;
  result.subtraction.cavityToolVolumeMm3 = tool.solid.volumeMm3;
  return result;
}

MoldGenerationResult generateMold(IMeshGeometryEngine& engine, const MoldGenerationRequest& request,
                                  const CancellationToken& cancel,
                                  const ProgressCallback& progress) {
  const auto totalStarted = Clock::now();
  const auto report = [&](const char* stage, double fraction) {
    if (progress) progress(stage, fraction);
  };

  if (!request.groundedPart || request.groundedPart->positions.size() < 9) {
    throw CodedError("part_solid_empty", "Uploaded model has no valid triangles.");
  }
  if (!std::isfinite(request.cavityClearanceMm) || request.cavityClearanceMm < 0) {
    throw CodedError("cavity_offset_failed",
                     "Cavity clearance must be a non-negative millimeter value.");
  }
  if (request.cavityClearanceMm > 0) {
    throw CodedError("cavity_offset_not_ported",
                     "A positive cavity clearance needs the Minkowski / distance-field offset "
                     "engines, which are not ported to the native application yet. Use 0 mm.");
  }

  report("validating", 0.05);
  const auto validationStarted = Clock::now();

  // Reference mold frame: the grounded part is lifted by the clearance so the
  // mold bottom rests on Z = 0.
  const Bounds3 groundedBounds = boundsOfSoup(*request.groundedPart);
  const auto frame = createReferenceMoldFrameBounds(groundedBounds, request.moldClearanceMm);
  if (!frame) {
    throw CodedError("reference_mold_invalid",
                     "The reference mold block could not be defined. The mold clearance must be "
                     "between 1 mm and 225 mm and the part must have a positive size.");
  }

  MoldGenerationResult result;
  ReferenceMoldDefinition& definition = result.definition;
  definition.definitionId = "reference-mold:" + request.modelId;
  definition.modelId = request.modelId;
  definition.partOffset = frame->partOffset;
  definition.selectionBoxBounds = frame->selectionBoxBounds;
  definition.clearanceMm = request.moldClearanceMm;
  definition.referenceMoldBlockBounds = frame->referenceMoldBlockBounds;

  try {
    result.cutPlanes =
        cuttingPlanesToCutPlaneData(definition.selectionBoxBounds, request.cuttingPlanes);
    for (const CutPlaneData& plane : result.cutPlanes) definition.usedFaces.push_back(plane.sourceFace);
    if (result.cutPlanes.empty()) {
      // Same identity the reference gives the unsplit block (splitFace.store.ts).
      definition.moldBodies.push_back(createWholeMoldBody(
          definition.referenceMoldBlockBounds, definition.definitionId + ":whole", "Mold"));
    } else {
      definition.moldBodies = partitionOrthogonalMold(definition, result.cutPlanes).bodies;
    }
    validateMoldPartitionCoverage(definition.referenceMoldBlockBounds, definition.moldBodies);
  } catch (const std::invalid_argument& error) {
    throw CodedError("reference_mold_invalid", error.what());
  }

  CavityGenerationInput input;
  input.generationVersion = request.generationVersion;
  input.partBoundingBox = definition.selectionBoxBounds;
  input.referenceMoldBlockBounds = definition.referenceMoldBlockBounds;
  input.moldBodies = definition.moldBodies;
  input.cavityClearanceMm = request.cavityClearanceMm;
  input.tolerancePolicy =
      buildGeometryTolerancePolicy(definition.referenceMoldBlockBounds, request.cavityClearanceMm);
  input.geometryToleranceMm = input.tolerancePolicy.booleanToleranceMm;
  input.minimumWallMm = kDefaultMinimumWallMm;

  // Upstream signature: everything that determines the result. A result whose
  // signature differs from the current inputs is stale.
  {
    std::uint32_t hash = hashText(request.partGeometryVersion);
    const Bounds3& k1 = definition.selectionBoxBounds;
    const Bounds3& k2 = definition.referenceMoldBlockBounds;
    hash = hashNumericArray({k1.min.x, k1.min.y, k1.min.z, k1.max.x, k1.max.y, k1.max.z,
                             k2.min.x, k2.min.y, k2.min.z, k2.max.x, k2.max.y, k2.max.z,
                             request.moldClearanceMm, request.cavityClearanceMm},
                            hash);
    for (const CutPlaneData& plane : result.cutPlanes) {
      hash = hashText(plane.sourceSketchId, hash);
      hash = hashNumericArray({plane.coordinate}, hash);
    }
    for (const MoldBody& body : definition.moldBodies) hash = hashText(body.geometryVersion, hash);
    hash = hashText(kCavityTolerancePolicyVersion, hash);
    input.upstreamInputSignature = "cavity:" + finishHash(hash);
    input.operationId = "cavity-operation:" + std::to_string(request.generationVersion) + ":" +
                        input.upstreamInputSignature;
  }

  // Part solid in the mold frame.
  std::vector<double> positions(request.groundedPart->positions.begin(),
                                request.groundedPart->positions.end());
  std::vector<std::uint32_t> indices(positions.size() / 3);
  for (std::size_t i = 0; i < indices.size(); ++i) indices[i] = static_cast<std::uint32_t>(i);
  const Transform localToMold =
      Transform::translation(definition.partOffset.x, definition.partOffset.y, definition.partOffset.z);
  PartSolidValidationResult validation =
      validateAndPreparePartSolid(positions, indices, localToMold, input.tolerancePolicy);
  if (!validation.ok) {
    const Issue& first = validation.blockers.empty()
                             ? Issue{IssueSeverity::Blocker, "a3_invalid",
                                     "Uploaded model is not a subtractable solid."}
                             : validation.blockers.front();
    throw CodedError(first.reasonCode, first.message);
  }
  result.validationWarnings = validation.warnings;
  const double validationMs = elapsedMs(validationStarted);
  throwIfCancelled(cancel);

  // Offset stage: exact-zero-clearance engine (createCavityTool with 0 mm).
  report("auditing", 0.2);
  report("building-offset", 0.3);
  const auto offsetStarted = Clock::now();
  CavityTool tool;
  {
    const SolidPtr toolSolid = engine.solidFromMesh(validation.prepared.mesh,
                                                    input.tolerancePolicy.booleanToleranceMm,
                                                    "Mesh preparation");
    tool.solid = validation.prepared;
    tool.solid.mesh = engine.meshFromSolid(toolSolid, {}, "Mesh export");
    tool.solid.bounds = toolSolid->bounds();
    tool.solid.volumeMm3 = toolSolid->volume();
    tool.solid.triangleCount = tool.solid.mesh.triangleCount();
    tool.clearanceMm = request.cavityClearanceMm;
  }
  const double offsetMs = elapsedMs(offsetStarted);
  throwIfCancelled(cancel);

  report("subtracting-body", 0.65);
  const auto booleanStarted = Clock::now();
  result.cavity = generateCavityBodies(engine, input, tool, cancel);
  if (result.cavity.subtraction.affectedBodyCount < 1 ||
      result.cavity.subtraction.removedVolumeMm3 <=
          input.tolerancePolicy.affectedVolumeToleranceMm3) {
    throw CodedError("cavity_no_material_intersection",
                     "The cavity tool did not intersect any mold material. Verify mold-body "
                     "construction and coordinate alignment.");
  }
  throwIfCancelled(cancel);

  report("validating-results", 0.9);
  result.cavity.timings = {validationMs, offsetMs, elapsedMs(booleanStarted), elapsedMs(totalStarted)};
  report("complete", 1.0);
  return result;
}

}  // namespace craft
