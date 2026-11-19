#include "mold/SprueGeneration.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <limits>
#include <set>

#include "contracts/Operation.h"
#include "geometry/MeshAnalysis.h"

namespace craft {

namespace {

struct V3 {
  double x, y, z;
};
V3 sub(const V3& a, const V3& b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
V3 add(const V3& a, const V3& b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
V3 scale(const V3& a, double s) { return {a.x * s, a.y * s, a.z * s}; }
double dot(const V3& a, const V3& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
V3 cross(const V3& a, const V3& b) {
  return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}
V3 v3(const Point3& p) { return {p.x, p.y, p.z}; }
Point3 p3(const V3& v) { return {v.x, v.y, v.z}; }
bool finite(const Point3& p) { return std::isfinite(p.x) && std::isfinite(p.y) && std::isfinite(p.z); }

SprueGenerationResult failure(const char* code, std::string message) {
  SprueGenerationResult result;
  result.failure = {code, std::move(message)};
  return result;
}

bool validateMesh(const MeshPayload& mesh) {
  if (mesh.positions.size() < 12 || mesh.positions.size() % 3 != 0 || mesh.indices.size() < 12 ||
      mesh.indices.size() % 3 != 0) {
    return false;
  }
  for (double v : mesh.positions) {
    if (!std::isfinite(v)) return false;
  }
  const std::size_t vertices = mesh.positions.size() / 3;
  for (std::uint32_t i : mesh.indices) {
    if (i >= vertices) return false;
  }
  return true;
}

double maximumProjectedCoordinate(const MeshPayload& mesh, const V3& origin, const V3& direction,
                                  double initialMaximum) {
  double maximum = initialMaximum;
  for (std::size_t i = 0; i + 2 < mesh.positions.size(); i += 3) {
    const double projection = (mesh.positions[i] - origin.x) * direction.x +
                              (mesh.positions[i + 1] - origin.y) * direction.y +
                              (mesh.positions[i + 2] - origin.z) * direction.z;
    maximum = std::max(maximum, projection);
  }
  return maximum;
}

/// Port of firstMeshIntersectionDistance(): nearest double-sided hit beyond
/// `minimumDistance`; negative when the ray misses.
double firstMeshIntersectionDistance(const MeshPayload& mesh, const V3& origin, const V3& direction,
                                     double minimumDistance) {
  double closest = std::numeric_limits<double>::infinity();
  for (std::size_t i = 0; i + 2 < mesh.indices.size(); i += 3) {
    const auto vertex = [&](int o) {
      const std::size_t p = mesh.indices[i + o] * 3ull;
      return V3{mesh.positions[p], mesh.positions[p + 1], mesh.positions[p + 2]};
    };
    const V3 a = vertex(0);
    const V3 edge1 = sub(vertex(1), a), edge2 = sub(vertex(2), a);
    const V3 h = cross(direction, edge2);
    const double determinant = dot(edge1, h);
    if (std::fabs(determinant) <= 1e-12) continue;
    const double inverse = 1 / determinant;
    const V3 fromA = sub(origin, a);
    const double u = inverse * dot(fromA, h);
    if (u < 0 || u > 1) continue;
    const V3 q = cross(fromA, edge1);
    const double v = inverse * dot(direction, q);
    if (v < 0 || u + v > 1) continue;
    const double distance = inverse * dot(edge2, q);
    if (distance > minimumDistance && distance < closest) closest = distance;
  }
  return std::isfinite(closest) ? closest : -1;
}

SolidPtr createCylinder(IMeshGeometryEngine& engine, double radius, double depth, const V3& axis,
                        const V3& origin) {
  return engine.cylinder(radius, depth, kSprueCircularSegments, p3(axis), p3(origin));
}

SolidPtr createProfileTool(IMeshGeometryEngine& engine, const SprueProfileDimensions& profile,
                           double totalDepth, double materialDepth, const V3& axis, const V3& origin,
                           double radialExpansionMm = 0) {
  const double entryNeckLength = std::min(profile.entryNeckLengthMm, materialDepth);
  const double mainSectionDepth = totalDepth - entryNeckLength;
  const SolidPtr mainSection =
      createCylinder(engine, profile.mainDiameterMm / 2 + radialExpansionMm, mainSectionDepth, axis, origin);
  const SolidPtr entryNeck =
      createCylinder(engine, profile.entryNeckDiameterMm / 2 + radialExpansionMm, entryNeckLength, axis,
                     add(origin, scale(axis, mainSectionDepth)));
  const SolidPtr tool = engine.unionOf({mainSection, entryNeck});
  if (!tool->isValid()) throw CodedError("mesh_kernel_error", "Sprue profile construction failed: invalid solid.");
  return tool;
}

std::string bodyVersion(const MoldBody& body, const SprueGenerationInput& input) {
  char buffer[512];
  std::snprintf(buffer, sizeof(buffer), "|%.17g,%.17g,%.17g|%.17g,%.17g,%.17g|", input.position.x,
                input.position.y, input.position.z, input.profileDesign.profile.mainDiameterMm,
                input.profileDesign.profile.entryNeckDiameterMm,
                input.profileDesign.profile.entryNeckLengthMm);
  std::uint32_t hash = hashText(body.geometryVersion);
  hash = hashText(input.operationId, hash);
  hash = hashText(buffer, hash);
  hash = hashText(std::to_string(input.profileDesign.profile.entryNeckLengthMm), hash);
  hash = hashText(input.moldRevision, hash);
  return "sprue:" + finishHash(hash);
}

MoldBody toleranceBody(const std::vector<MoldBody>& bodies) {
  MoldBody aggregate = bodies.front();
  aggregate.bounds = emptyBounds();
  aggregate.volumeMm3 = 0;
  for (const MoldBody& body : bodies) {
    for (int a = 0; a < 3; ++a) {
      aggregate.bounds.min[a] = std::min(aggregate.bounds.min[a], body.bounds.min[a]);
      aggregate.bounds.max[a] = std::max(aggregate.bounds.max[a], body.bounds.max[a]);
    }
    aggregate.volumeMm3 += body.volumeMm3;
  }
  return aggregate;
}

std::optional<SprueFailure> validateInput(const SprueGenerationInput& input) {
  if (input.targetBodies.empty()) {
    return SprueFailure{"SPRUE_TARGET_BODY_MISSING", "No mold bodies exist for Sprue generation."};
  }
  std::set<std::string> ids;
  for (const MoldBody& body : input.targetBodies) ids.insert(body.id);
  if (ids.size() != input.targetBodies.size()) {
    return SprueFailure{"SPRUE_RESULT_INVALID", "Sprue target mold body IDs must be unique."};
  }
  for (const MoldBody& body : input.targetBodies) {
    if (!validateMesh(body.mesh) || !std::isfinite(body.volumeMm3) || body.volumeMm3 <= 0) {
      return SprueFailure{"SPRUE_RESULT_INVALID", "One or more mold body geometries are unusable."};
    }
  }
  if (!validateMesh(input.cavity)) {
    return SprueFailure{"SPRUE_CAVITY_MISSING", "Cavity geometry does not exist or is unusable."};
  }
  if (!finite(input.position)) {
    return SprueFailure{"SPRUE_INVALID_PLACEMENT", "Sprue placement coordinates must be finite."};
  }
  if (!isValidSprueProfile(input.profileDesign.profile)) {
    return SprueFailure{"SPRUE_INVALID_PROFILE", "Sprue engineering profile must be finite and valid."};
  }
  if (!finite(input.zAxis)) {
    return SprueFailure{"SPRUE_INVALID_PLACEMENT", "The mold coordinate frame is invalid."};
  }
  return std::nullopt;
}

}  // namespace

SprueTolerancePolicy buildSprueTolerancePolicy(const MoldBody& body, double requestedToleranceMm) {
  const Point3 d = body.bounds.size();
  const double dims[3] = {d.x, d.y, d.z};
  for (double v : dims) {
    if (!std::isfinite(v) || v <= 0) throw std::invalid_argument("Sprue tolerance inputs are invalid.");
  }
  if (!std::isfinite(requestedToleranceMm) || requestedToleranceMm <= 0) {
    throw std::invalid_argument("Sprue tolerance inputs are invalid.");
  }
  const double diagonal = std::hypot(dims[0], dims[1], dims[2]);
  SprueTolerancePolicy policy;
  policy.linearToleranceMm = std::max(requestedToleranceMm, diagonal * 1e-8);
  policy.areaToleranceMm2 = policy.linearToleranceMm * policy.linearToleranceMm;
  policy.volumeToleranceMm3 = policy.areaToleranceMm2 * policy.linearToleranceMm;
  policy.meaningfulVolumeMm3 = std::max(policy.volumeToleranceMm3 * 64, body.volumeMm3 * 1e-12);
  policy.surfaceToleranceMm = policy.linearToleranceMm * 4;
  policy.outsideMarginMm = std::max(policy.linearToleranceMm * 8, diagonal * 1e-6);
  policy.beyondMarginMm = std::max(policy.linearToleranceMm * 16, diagonal * 2e-6);
  return policy;
}

SprueGenerationResult generateSprue(IMeshGeometryEngine& engine, const SprueGenerationInput& input) {
  if (const auto invalid = validateInput(input)) {
    SprueGenerationResult result;
    result.failure = *invalid;
    return result;
  }
  const std::vector<MoldBody>& bodies = input.targetBodies;
  const MeshPayload& cavity = input.cavity;

  SprueTolerancePolicy tolerance;
  try {
    tolerance = buildSprueTolerancePolicy(toleranceBody(bodies), input.geometryToleranceMm);
  } catch (const std::exception&) {
    return failure("SPRUE_RESULT_INVALID", "Sprue tolerance policy could not be resolved.");
  }
  const SprueProfileDimensions& profile = input.profileDesign.profile;
  if (profile.mainDiameterMm < tolerance.linearToleranceMm * 8 ||
      profile.entryNeckDiameterMm < tolerance.linearToleranceMm * 8) {
    return failure("SPRUE_INVALID_PROFILE", "Sprue profile is too small for the geometry tolerance.");
  }

  const V3 zAxis = v3(input.zAxis);
  const double zLength = std::sqrt(dot(zAxis, zAxis));
  const V3 top = scale(zAxis, 1 / zLength);
  const V3 inward = scale(top, -1);
  double topCoordinate = -std::numeric_limits<double>::infinity();
  for (const MoldBody& body : bodies) {
    topCoordinate = maximumProjectedCoordinate(body.mesh, {0, 0, 0}, top, topCoordinate);
  }
  const V3 position = v3(input.position);
  if (std::fabs(dot(position, top) - topCoordinate) > tolerance.surfaceToleranceMm) {
    return failure("SPRUE_NOT_ON_TOP_FACE", "Sprue placement is not on the canonical top exterior surface.");
  }

  const double mainRadius = profile.mainDiameterMm / 2;
  const V3 start = add(position, scale(top, tolerance.outsideMarginMm));
  const double cavityEntryDistance =
      firstMeshIntersectionDistance(cavity, position, inward, tolerance.surfaceToleranceMm);
  const bool reachesCavity = cavityEntryDistance >= 0;

  double validationDepth = -std::numeric_limits<double>::infinity();
  for (const MoldBody& body : bodies) {
    validationDepth = maximumProjectedCoordinate(body.mesh, start, inward, validationDepth);
  }
  validationDepth = maximumProjectedCoordinate(cavity, start, inward, validationDepth);
  validationDepth += tolerance.beyondMarginMm;
  const double toolDepth =
      !reachesCavity ? validationDepth : tolerance.outsideMarginMm + cavityEntryDistance;
  if (!std::isfinite(toolDepth) || toolDepth <= tolerance.outsideMarginMm) {
    return failure("SPRUE_INVALID_PLACEMENT", "A deterministic inward sprue depth could not be derived.");
  }

  try {
    std::vector<SolidPtr> bodySolids;
    for (const MoldBody& body : bodies) {
      bodySolids.push_back(engine.solidFromMesh(body.mesh, tolerance.linearToleranceMm, "Mesh preparation"));
    }
    const SolidPtr cavitySolid = engine.solidFromMesh(cavity, tolerance.linearToleranceMm, "Mesh preparation");
    const SolidPtr tool = createProfileTool(engine, profile, toolDepth, toolDepth - tolerance.outsideMarginMm,
                                            inward, start);

    // The whole inlet circle must sit on mold material (>= 98% filled).
    const double probeDepth = std::max(tolerance.surfaceToleranceMm * 8, mainRadius * 0.05);
    const V3 probeOrigin = add(position, scale(inward, tolerance.surfaceToleranceMm));
    const SolidPtr inletProbe = createCylinder(engine, mainRadius, probeDepth, inward, probeOrigin);
    double inletMaterialVolume = 0;
    for (const SolidPtr& bodySolid : bodySolids) {
      inletMaterialVolume += engine.intersect(inletProbe, bodySolid)->volume();
    }
    const double fillRatio = inletMaterialVolume / inletProbe->volume();
    if (!std::isfinite(fillRatio) || fillRatio < 0.98) {
      return failure("SPRUE_INLET_OUTSIDE_BODY", "The complete sprue inlet circle must fit inside the top face.");
    }

    std::vector<std::size_t> affected;
    for (std::size_t i = 0; i < bodySolids.size(); ++i) {
      if (engine.intersect(tool, bodySolids[i])->volume() > tolerance.meaningfulVolumeMm3) affected.push_back(i);
    }
    if (affected.empty()) {
      return failure("SPRUE_DOES_NOT_ENTER_BODY", "The proposed sprue does not enter mold material.");
    }

    if (!reachesCavity) {
      if (engine.intersect(tool, cavitySolid)->volume() <= tolerance.meaningfulVolumeMm3) {
        const SolidPtr expanded = createProfileTool(engine, profile, toolDepth, toolDepth - tolerance.outsideMarginMm,
                                                    inward, start, tolerance.surfaceToleranceMm);
        if (engine.intersect(expanded, cavitySolid)->volume() > tolerance.volumeToleranceMm3) {
          return failure("SPRUE_TANGENTIAL_CAVITY_CONTACT", "The sprue only grazes the cavity within tolerance.");
        }
      }
      return failure("SPRUE_DOES_NOT_REACH_CAVITY",
                     "The proposed sprue axis does not reach the actual cavity geometry.");
    }

    const SolidPtr taggedTool = engine.asOriginal(tool);
    const std::map<std::int64_t, FaceRole> roles{{taggedTool->originalId(), FaceRole::SprueFunnel}};
    SprueGenerationResult result;
    for (std::size_t index : affected) {
      const MoldBody& body = bodies[index];
      const SolidPtr& bodySolid = bodySolids[index];
      const SolidPtr updated = engine.subtract(bodySolid, taggedTool);
      if (!updated->isValid()) {
        throw CodedError("mesh_kernel_error", "Sprue subtraction failed: invalid solid.");
      }
      const double volume = updated->volume();
      if (updated->isEmpty() || !std::isfinite(volume) || volume <= tolerance.meaningfulVolumeMm3 ||
          bodySolid->volume() - volume <= tolerance.meaningfulVolumeMm3) {
        return failure("SPRUE_RESULT_INVALID", "Sprue subtraction produced unusable geometry.");
      }
      MeshPayload mesh = engine.meshFromSolid(updated, roles, "Mesh export");
      if (!validateMesh(mesh)) {
        return failure("SPRUE_RESULT_INVALID", "Sprue subtraction produced non-finite or invalid mesh data.");
      }
      MoldBody next = body;
      next.bounds = updated->bounds();
      next.centroid = next.bounds.center();
      next.mesh = std::move(mesh);
      next.triangleCount = updated->triangleCount();
      next.volumeMm3 = volume;
      next.geometryVersion = bodyVersion(body, input);
      next.sprueOperationId = input.operationId;
      result.updatedBodies.push_back(std::move(next));
      result.replacedBodyIds.push_back(body.id);
    }
    result.success = true;
    result.sprue.operationId = input.operationId;
    result.sprue.targetBodyIds = result.replacedBodyIds;
    result.sprue.position = input.position;
    result.sprue.inwardDirection = p3(inward);
    result.sprue.profile = profile;
    result.sprue.depthMm = cavityEntryDistance;
    result.sprue.moldFrameId = input.moldFrameId;
    result.sprue.tolerancePolicy = tolerance;
    return result;
  } catch (const std::exception& error) {
    return failure("SPRUE_BOOLEAN_FAILED", error.what());
  }
}

std::optional<SprueGenerationResult> SprueResultCache::find(const std::string& operationId, const std::string& key) const {
  const std::lock_guard<std::mutex> lock(mutex_);
  const auto it = entries_.find(operationId);
  if (it == entries_.end() || it->second.key != key) return std::nullopt;
  return it->second.result;
}
void SprueResultCache::replaceAll(std::map<std::string, Entry> entries) {
  const std::lock_guard<std::mutex> lock(mutex_);
  entries_ = std::move(entries);
}
void SprueResultCache::clear() {
  const std::lock_guard<std::mutex> lock(mutex_);
  entries_.clear();
}
std::size_t SprueResultCache::size() const {
  const std::lock_guard<std::mutex> lock(mutex_);
  return entries_.size();
}

std::string sprueCacheKey(const std::string& moldRevision, const std::string& moldFrameId, const SprueOperationDefinition& definition) {
  char numbers[512];
  const SprueProfileDimensions& p = definition.profileDesign.profile;
  std::snprintf(numbers, sizeof(numbers), "|%.17g,%.17g,%.17g|%.17g,%.17g,%.17g|%.17g,%.17g,%.17g", definition.position.x, definition.position.y,
                definition.position.z, definition.inwardDirection.x, definition.inwardDirection.y, definition.inwardDirection.z, p.mainDiameterMm,
                p.entryNeckDiameterMm, p.entryNeckLengthMm);
  // The operation id stays in the key so a record can never be read as another operation's.
  return moldRevision + "|" + moldFrameId + "|" + definition.operationId + numbers;
}

SprueEvaluation evaluateSprues(IMeshGeometryEngine& engine, const std::vector<MoldBody>& cavityBodies,
                               const MeshPayload& cavityTool, const std::string& cavitySourceSignature,
                               const std::string& moldFrameId,
                               std::vector<SprueOperationDefinition> definitions, SprueResultCache* cache) {
  SprueEvaluation evaluation;
  evaluation.bodies = cavityBodies;
  for (MoldBody& body : evaluation.bodies) {
    if (body.geometryVersion.empty()) body.geometryVersion = "base:" + body.id;
  }
  std::stable_sort(definitions.begin(), definitions.end(),
                   [](const auto& a, const auto& b) { return a.creationOrder < b.creationOrder; });

  std::map<std::string, SprueResultCache::Entry> nextCache;
  for (SprueOperationDefinition& definition : definitions) {
    std::string moldRevision = cavitySourceSignature + ":";
    for (std::size_t i = 0; i < evaluation.bodies.size(); ++i) {
      if (i > 0) moldRevision += "|";
      moldRevision += evaluation.bodies[i].id + ":" + evaluation.bodies[i].geometryVersion;
    }
    const std::string key = sprueCacheKey(moldRevision, moldFrameId, definition);
    std::optional<SprueGenerationResult> cached;
    if (cache) cached = cache->find(definition.operationId, key);
    SprueGenerationResult result;
    if (cached) {
      result = std::move(*cached);
      ++evaluation.cacheHits;
    } else {
      SprueGenerationInput input;
      input.operationId = definition.operationId;
      input.position = definition.position;
      input.profileDesign = definition.profileDesign;
      input.moldRevision = moldRevision;
      input.targetBodies = evaluation.bodies;
      input.cavity = cavityTool;
      input.moldFrameId = moldFrameId;
      input.geometryToleranceMm = kMoldGeometryToleranceMm;
      result = generateSprue(engine, input);
      ++evaluation.cacheMisses;
    }
    if (cache) nextCache[definition.operationId] = {key, result};
    if (!result.success) {
      evaluation.warnings.push_back(definition.operationId + ": " + result.failure.message);
      definition.validation = {"invalid", result.failure.reasonCode, result.failure.message};
      evaluation.definitions.push_back(definition);
      continue;
    }
    for (const MoldBody& updated : result.updatedBodies) {
      for (MoldBody& body : evaluation.bodies) {
        if (body.id == updated.id) body = updated;
      }
    }
    evaluation.resolvedSprues.push_back(result.sprue);
    definition.validation = {"resolved", {}, {}};
    evaluation.definitions.push_back(definition);
  }
  if (cache) cache->replaceAll(std::move(nextCache));
  return evaluation;
}

std::optional<SpruePlacement> computeSpruePlacement(const Ray& ray, const std::vector<MoldBody>& bodies,
                                                    double moldTopZ, const SprueCavityFacts& cavity) {
  std::optional<PickHit> best;
  const MoldBody* bestBody = nullptr;
  for (const MoldBody& body : bodies) {
    if (!body.visible) continue;
    const auto hit = pickMesh(body.mesh, ray);
    if (hit && (!best || hit->distance < best->distance)) {
      best = hit;
      bestBody = &body;
    }
  }
  if (!best || bestBody == nullptr) return std::nullopt;
  const bool isTopPlane = std::fabs(best->point.z - moldTopZ) <= kSprueSurfaceToleranceMm;
  const bool isTopNormal = best->normal.z >= kSprueTopNormalMinDot;
  if (!isTopPlane || !isTopNormal) return std::nullopt;

  const auto design = [&](double stemLength) {
    SprueGeometryContextInput in;
    if (cavity.mesh != nullptr) {
      const Point3 s = cavity.bounds.size();
      in.cavityVolumeMm3 = cavity.volumeMm3;
      in.cavityBounds = {s.x, s.y, s.z};
    }
    in.totalSprueLengthMm = stemLength;
    return resolveSprueIntegration(in).design;
  };

  SpruePlacement placement;
  placement.topPoint = {best->point.x, best->point.y, best->point.z};
  const V3 inward{0, 0, -1};
  if (cavity.mesh != nullptr) {
    const V3 origin = add(V3{best->point.x, best->point.y, best->point.z}, scale(inward, kSprueRayOriginOffsetMm));
    const double distance = firstMeshIntersectionDistance(*cavity.mesh, origin, inward, kSprueSurfaceToleranceMm);
    if (distance >= 0) {
      const V3 hit = add(origin, scale(inward, distance));
      placement.valid = true;
      placement.cavityPoint = p3(hit);
      placement.stemLengthMm = placement.topPoint.z - hit.z;
      placement.profileDesign = design(placement.stemLengthMm);
      return placement;
    }
  }
  placement.valid = false;
  placement.stemLengthMm = placement.topPoint.z - bestBody->bounds.min.z;
  placement.profileDesign = design(placement.stemLengthMm);
  return placement;
}

}  // namespace craft
