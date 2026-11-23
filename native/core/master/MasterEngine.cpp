#include "master/MasterEngine.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <regex>
#include <set>
#include <stdexcept>

#include "geometry/GeometryTolerance.h"
#include "geometry/MeshAnalysis.h"
#include "master/MasterAccessibility.h"
#include "master/MasterMultiPiece.h"
#include "master/MasterRegionDirect.h"
#include "master/MasterPlanning.h"
#include "mold/Registration.h"  // jsNumberToString

namespace craft {

namespace {

constexpr int kMaxCandidateDirections = 32;
constexpr int kAbsoluteMaxWorkingMoldPieces = 6;
constexpr int kMaxExactToolingPlansPerTarget = 4;
constexpr int kMaxExactPlansPerPieceCount = 2;
constexpr int kMaxCombinationDirections = 6;
constexpr int kMaxPartingThresholdsPerDirection = 6;
constexpr int kBeamWidth = 8;

struct EngineClock {
  std::chrono::steady_clock::time_point started = std::chrono::steady_clock::now();
  double elapsedMs() const { return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started).count(); }
};

void throwIfCancelled(const MasterMoldEngineHooks& hooks) {
  if (hooks.cancel.isCancelled()) throw CodedError("cancelled", "Master Mold generation was cancelled.");
}

std::string joinMessages(const std::vector<MeshPreflightIssue>& issues) {
  std::string out;
  for (const auto& i : issues) out += (out.empty() ? "" : " ") + i.message;
  return out;
}

std::vector<MasterMoldBudgetLineItem> buildBudgetDetails(int rawDirectionCount, int finalDirectionCount,
                                                         const std::vector<WorkingMoldPieceCountDiagnostics>& diagnostics, int maxPieces,
                                                         int constructionAttempts) {
  const auto maxOf = [&](auto select) {
    int best = 0;
    for (const auto& d : diagnostics) best = std::max(best, select(d));
    return best;
  };
  const int highestPieceCount = maxOf([](const auto& d) { return d.pieceCount; });
  const int exactCapacity = static_cast<int>(diagnostics.size()) * kMaxExactPlansPerPieceCount;
  const int combinationUsed = maxOf([](const auto& d) { return d.combinationDirectionCountUsed; });
  std::vector<MasterMoldBudgetLineItem> items;
  items.push_back({"candidate_directions", kMaxCandidateDirections, finalDirectionCount, std::max(0, rawDirectionCount - finalDirectionCount),
                   std::to_string(rawDirectionCount) + " geometry-derived candidate(s) generated; " + std::to_string(finalDirectionCount) +
                       " kept after coverage-preserving pruning (LOOP 07) and adaptive discovery (LOOP 08)."});
  items.push_back({"combination_directions", kMaxCombinationDirections, combinationUsed, std::max(0, finalDirectionCount - combinationUsed),
                   "directions offered to the multi-piece (3+) prism combination search per beam level."});
  items.push_back({"parting_thresholds", kMaxPartingThresholdsPerDirection, maxOf([](const auto& d) { return d.thresholdCountUsed; }), 0,
                   "parting-plane offset candidates generated across directions at the widest attempted level (LOOP 09)."});
  items.push_back({"beam_width", kBeamWidth, maxOf([](const auto& d) { return d.beamSizeUsed; }), 0,
                   "surviving prism-prefix candidates retained per beam level (LOOP 18: diversity-aware selection, not score-only)."});
  items.push_back({"piece_count", maxPieces, highestPieceCount, 0,
                   "search escalated one piece count at a time up to " + std::to_string(highestPieceCount) + " of a " + std::to_string(maxPieces) +
                       "-piece cap (LOOP 16: automatic mode default reaches the " + std::to_string(kAbsoluteMaxWorkingMoldPieces) + "-piece safety ceiling)."});
  items.push_back({"exact_construction_attempts", exactCapacity, constructionAttempts, std::max(0, exactCapacity - constructionAttempts),
                   std::to_string(constructionAttempts) + " exact-CSG construction attempt(s) across " + std::to_string(diagnostics.size()) +
                       " piece count(s) tried (up to " + std::to_string(kMaxExactPlansPerPieceCount) +
                       " finalist(s) each). 0 here means planning itself never reached exact construction -- never an exact-CSG engine failure."});
  items.push_back({"parting_surface", 0, 0, 0,
                   "a height-field (curve-following) parting surface (Execution 08 LOOP 14) is attempted only as a fallback when the flat half-space plane fails real construction, and only per PIECE: a piece qualifies when every neighbor it borders contributes a real, non-self-intersecting parting curve (one neighbor uses a single-curve height field; several neighbors compose one independent local correction each). The catch-all piece is never substituted."});
  return items;
}

/// Cancellation must pass through the generic std::runtime_error handlers used for construction failures.
void rethrowIfCancelled(const CodedError& error) {
  if (error.code() == "cancelled") throw error;
}
std::string toolingSetInputSignature(const MasterSeedSnapshot& seed, const std::string& pieceId, const std::string& geometryVersion) {
  return stableHashOfJson("{\"seedId\":" + stableJsonQuote(seed.seedId) + ",\"pieceId\":" + stableJsonQuote(pieceId) +
                          ",\"pieceGeometryVersion\":" + stableJsonQuote(geometryVersion) +
                          ",\"processProfileId\":" + stableJsonQuote(seed.processProfile.profileId) +
                          ",\"printerBuildVolume\":" + stableJsonVolume(seed.printerBuildVolume) + "}");
}

bool fitsBuildVolume(const MasterToolingPiece& piece, const Point3& volume) {
  return piece.bounds.max.x - piece.bounds.min.x <= volume.x && piece.bounds.max.y - piece.bounds.min.y <= volume.y &&
         piece.bounds.max.z - piece.bounds.min.z <= volume.z;
}

void recordLimit(MasterMoldBudgetReport& budget, const std::string& limit) {
  if (std::find(budget.limitsExceeded.begin(), budget.limitsExceeded.end(), limit) == budget.limitsExceeded.end()) budget.limitsExceeded.push_back(limit);
}

struct NegativeTool {
  MeshPayload mesh;
  Bounds3 bounds;
};

NegativeTool buildSourceNegativeTool(IMeshGeometryEngine& engine, const MasterSeedSnapshot& seed) {
  const GeometryTolerancePolicy policy = buildGeometryTolerancePolicy(seed.sourceBounds, 0);
  MeshPayload payload;
  payload.positions.assign(seed.sourceMesh.positions.begin(), seed.sourceMesh.positions.end());
  payload.indices = seed.sourceMesh.indices;
  const SolidPtr solid = engine.solidFromMesh(payload, policy.booleanToleranceMm, "Mesh preparation");
  return {engine.meshFromSolid(solid, {}, "Mesh export"), solid->bounds()};
}

MasterToolingSet sacrificialOutcome(const MasterSeedSnapshot& seed, const MasterCastTarget& target, const MasterPourFaceDecision& decision,
                                    const MasterSurfaceAccessibility& accessibility, std::vector<std::string> warnings, const std::string& reason) {
  MasterToolingSet set;
  set.moldPartId = target.moldPartId;
  set.moldPartName = target.moldPartName;
  set.castTargetVersion = target.geometryVersion;
  set.sourceSignature = toolingSetInputSignature(seed, target.moldPartId, target.geometryVersion);
  set.pourFaceDecision = decision;
  set.accessibility = accessibility;
  set.releaseMode = "sacrificial-recommended";
  warnings.push_back("reusable_plan_not_found \xE2\x86\x92 sacrificial_release_recommended: " + reason);
  set.warnings = std::move(warnings);
  set.fingerprint = "master-tooling-set:sacrificial:" + target.geometryVersion;
  return set;
}

struct CaseAttempt {
  std::optional<MasterToolingSet> set;
  std::string rejection;
};

void applyPlan(MasterToolingSet& set, const MultiPiecePlan& plan) {
  set.releaseMode = "multi-piece";
  set.assembly.pieces = plan.pieces;
  set.assembly.releaseSequence = plan.releaseSequence;
  set.assembly.coreMode = coreModeName(plan.coreMode);
  set.assembly.registrationFeatures = plan.registrationFeatures;
  set.partingSurfaces = {plan.partingSurface};
  set.pourFaceDecision.ventPlan.features = plan.ventFeatures;
}

CaseAttempt attemptCaseForPourFace(IMeshGeometryEngine& engine, const MasterSeedSnapshot& seed, const MasterCastTarget& target,
                                   const NegativeTool& negative, const MasterToolingParameters& parameters, MasterMoldBudgetReport& budget,
                                   MasterDir pourFace, const MasterPourFaceDecision& decision, const MasterSurfaceAccessibility& accessibility,
                                   const Point3& assignedDirection) {
  std::vector<std::string> warnings;
  const std::optional<Point3>& buildVolume = seed.printerBuildVolume;
  const auto allFit = [&](const std::vector<MasterToolingPiece>& pieces) {
    return !buildVolume || std::all_of(pieces.begin(), pieces.end(), [&](const auto& p) { return fitsBuildVolume(p, *buildVolume); });
  };

  budget.toolingOnePieceAttempts += 1;
  budget.releaseVerificationAttempts += 1;
  OnePieceAttempt onePiece = attemptOnePiece(engine, target, pourFace, parameters, decision.ventPlan.unresolvedRecommendations, negative.mesh);

  MasterToolingSet set;
  set.releaseMode = "multi-piece";
  set.assembly.coreMode = "split";
  set.pourFaceDecision = decision;
  set.pourFaceDecision.selected = pourFace;
  std::vector<MasterVentFeature> ventFeatures;
  const std::string face = masterDirName(pourFace);

  if (onePiece.ok) {
    set.releaseMode = "one-piece";
    set.assembly.pieces = onePiece.pieces;
    set.assembly.releaseSequence = onePiece.releaseSequence;
    ventFeatures = onePiece.ventFeatures;
    if (!allFit(set.assembly.pieces)) {
      warnings.push_back("one-piece case exceeds the printer build volume; multi-piece partition attempted.");
      budget.toolingMultiPieceAttempts += 1;
      const MultiPiecePlanAttempt multi = planMultiPieceTooling(engine, target, pourFace, parameters, &negative.mesh, assignedDirection, negative.bounds,
                                                                buildVolume, decision.ventPlan.unresolvedRecommendations);
      budget.toolingExactPlanAttempts += 1;
      if (multi.plan && allFit(multi.plan->pieces)) {
        applyPlan(set, *multi.plan);
        ventFeatures = multi.plan->ventFeatures;
        if (multi.plan->registrationNote) warnings.push_back(*multi.plan->registrationNote);
      } else {
        return {std::nullopt, face + ": multi-piece partition could not satisfy the printer build volume."};
      }
    }
  } else {
    bool localizedAccepted = false;
    if (parameters.maxToolingPieces >= 2) {
      const LockEvidence lock = deriveLockRegions(target, masterDirFlip(pourFace), onePiece.collisionBounds);
      if (!lock.regions.empty()) {
        const MultiPiecePlanAttempt localized = planLocalizedRemovableCore(engine, target, pourFace, parameters, lock, assignedDirection, buildVolume,
                                                                           decision.ventPlan.unresolvedRecommendations);
        budget.toolingExactPlanAttempts += 1;
        if (localized.plan) {
          localizedAccepted = true;
          applyPlan(set, *localized.plan);
          ventFeatures = localized.plan->ventFeatures;
          warnings.push_back(localized.plan->registrationNote.value_or("localized removable core selected after one-piece release failure."));
        }
      }
    }
    if (!localizedAccepted) {
      budget.toolingMultiPieceAttempts += 1;
      const MultiPiecePlanAttempt multi = planMultiPieceTooling(engine, target, pourFace, parameters, &negative.mesh, assignedDirection, negative.bounds,
                                                                buildVolume, decision.ventPlan.unresolvedRecommendations);
      budget.toolingExactPlanAttempts += 1;
      if (!multi.plan) return {std::nullopt, face + ": " + multi.rejectionReason.value_or("unverified")};
      if (!allFit(multi.plan->pieces)) return {std::nullopt, face + ": multi-piece partition could not satisfy the printer build volume."};
      applyPlan(set, *multi.plan);
      ventFeatures = multi.plan->ventFeatures;
      if (multi.plan->registrationNote) warnings.push_back(*multi.plan->registrationNote);
    }
  }

  set.moldPartId = target.moldPartId;
  set.moldPartName = target.moldPartName;
  set.castTargetVersion = target.geometryVersion;
  set.sourceSignature = toolingSetInputSignature(seed, target.moldPartId, target.geometryVersion);
  set.pourFaceDecision.ventPlan.features = ventFeatures;
  std::vector<MasterVentRecommendation> remaining;
  for (const auto& rec : decision.ventPlan.unresolvedRecommendations) {
    const bool resolved = std::any_of(ventFeatures.begin(), ventFeatures.end(), [&](const auto& f) { return f.featureId == rec.recommendationId; });
    if (!resolved) remaining.push_back(rec);
  }
  set.pourFaceDecision.ventPlan.unresolvedRecommendations = remaining;
  set.pourFaceDecision.ventPlan.status = ventFeatures.size() == decision.ventPlan.unresolvedRecommendations.size() ? "clear" : "user-review";
  set.accessibility = accessibility;
  set.warnings = warnings;
  std::string fingerprint = seed.seedId + "|" + target.geometryVersion + "|" + face + "|" + set.releaseMode;
  for (const auto& p : set.assembly.pieces) fingerprint += "|" + p.pieceId + ":" + jsNumberToString(p.volumeMm3) + ":" + std::to_string(p.triangleCount);
  for (const auto& f : set.assembly.registrationFeatures) fingerprint += "|" + f.featureId;
  set.fingerprint = "master-tooling-set:" + finishHash(hashText(fingerprint));
  return {std::move(set), ""};
}
std::optional<MasterToolingSet> buildToolingSetForWorkingMoldPiece(IMeshGeometryEngine& engine, const MasterSeedSnapshot& seed,
                                                                   const MasterCastTarget& target, const NegativeTool& negative,
                                                                   const MasterToolingParameters& parameters, MasterMoldBudgetReport& budget,
                                                                   const MasterMoldEngineHooks& hooks, const Point3& assignedDirection) {
  std::vector<std::string> warnings;
  PourFacePlanInput input;
  input.castTarget = &target;
  input.negativeToolBounds = negative.bounds;
  input.geometryToleranceMm = parameters.geometryToleranceMm;
  const MasterPourFaceDecision decision = planPourFace(input);
  budget.pourFaceAnalysisAttempts += 1;
  budget.ventAnalysisAttempts += static_cast<int>(std::count_if(decision.candidates.begin(), decision.candidates.end(), [](const auto& c) { return c.valid; }));
  warnings.insert(warnings.end(), decision.fillabilityWarnings.begin(), decision.fillabilityWarnings.end());
  for (const auto& r : decision.ventPlan.unresolvedRecommendations) warnings.push_back(r.message);
  if (!decision.selected) throw std::runtime_error("no valid pour face: every candidate was rejected by hard constraints.");

  const MasterSurfaceAccessibility accessibility = analyzeSurfaceAccessibility(target);

  std::vector<MasterPourFaceCandidate> valid;
  for (const auto& c : decision.candidates) if (c.valid) valid.push_back(c);
  std::stable_sort(valid.begin(), valid.end(), [](const auto& a, const auto& b) {
    if (a.score != b.score) return a.score < b.score;
    return icuLess(masterDirName(a.direction), masterDirName(b.direction));
  });
  if (static_cast<int>(valid.size()) > kMaxExactToolingPlansPerTarget) valid.resize(kMaxExactToolingPlansPerTarget);

  std::optional<std::string> lastFailure;
  for (const auto& candidate : valid) {
    throwIfCancelled(hooks);
    CaseAttempt attempt = attemptCaseForPourFace(engine, seed, target, negative, parameters, budget, candidate.direction, decision, accessibility, assignedDirection);
    if (attempt.set) {
      std::vector<std::string> merged = warnings;
      merged.insert(merged.end(), attempt.set->warnings.begin(), attempt.set->warnings.end());
      attempt.set->warnings = merged;
      return attempt.set;
    }
    lastFailure = attempt.rejection;
    if (std::getenv("CRAFT_MASTER_TRACE")) std::fprintf(stderr, "[master] %s face %s rejected: %s\n", target.moldPartId.c_str(), masterDirName(candidate.direction), attempt.rejection.c_str());
    if (attempt.rejection.find("budget") != std::string::npos) recordLimit(budget, "tooling_exact_plan");
  }

  const std::string why = "no verified reusable tooling plan (" + lastFailure.value_or("unverified") + ")";
  if (!seed.processProfile.sacrificialToolingPermitted) throw std::runtime_error(why + " and the profile forbids sacrificial fallback.");
  return sacrificialOutcome(seed, target, decision, accessibility, warnings, why + ".");
}

}  // namespace

std::string masterMoldFailureFamilyOf(const std::string& reason) {
  if (reason == "invalid_snapshot" || reason == "invalid_source_geometry" || reason == "invalid_source_mesh" || reason == "cast_target_invalid") return "invalid-input";
  if (reason == "build_volume_exceeded") return "physically-impossible";
  if (reason == "tooling_construction_failed" || reason == "boolean_failed" || reason == "non_manifold_result") return "construction-failed";
  if (reason == "no_release_plan" || reason == "planning_piece_count_budget_exhausted" || reason == "planning_direction_budget_exhausted" ||
      reason == "planning_threshold_budget_exhausted")
    return "budget-exhausted";
  return "construction-failed";  // working_mold_release_locked, exact_working_mold_failed
}

MasterMoldEngineResult runMasterMoldEngine(IMeshGeometryEngine& engine, const MasterSeedSnapshot& seed, const std::vector<MasterToolingSet>& priorSets,
                                           const MasterMoldEngineHooks& hooks) {
  const EngineClock clock;
  MasterMoldEngineResult result;
  result.seedId = seed.seedId;
  std::vector<PlanningWarning> warnings;
  MasterMoldBudgetReport& budget = result.budget;

  const auto emit = [&](const char* stage, const std::optional<std::string>& detail) {
    if (!hooks.onStage) return;
    int index = 0;
    for (std::size_t i = 0; i < kMasterProgressStages.size(); ++i) if (std::string(kMasterProgressStages[i]) == stage) index = static_cast<int>(i);
    hooks.onStage({stage, index, 7, detail, clock.elapsedMs()});
  };

  throwIfCancelled(hooks);
  emit("analyzing_geometry", std::string("checking source mesh topology"));
  const MeshPreflightResult preflight = runMeshPreflight(seed.sourceMesh.positions, seed.sourceMesh.indices);
  if (preflight.status == "invalid-for-master-mold") {
    result.failures.push_back({"working-mold", "invalid_source_mesh", masterMoldFailureFamilyOf("invalid_source_mesh"),
                               "the source mesh is not usable as a manufacturing solid: " + joinMessages(preflight.issues)});
    result.elapsedMs = clock.elapsedMs();
    return result;
  }
  if (preflight.status == "repairable-warning") {
    warnings.push_back({"source_mesh_repairable_warning", "source mesh preflight found repairable issues: " + joinMessages(preflight.issues), std::nullopt});
  }
  throwIfCancelled(hooks);

  emit("analyzing_geometry", std::string("sampling source surface"));
  const PlanningMesh planningMesh = buildPlanningMesh(seed.sourceMesh.positions, seed.sourceMesh.indices, seed.sourceBounds, seed.sourceGeometryVersion);
  budget.planningPatchCount = static_cast<int>(planningMesh.patches.size());
  throwIfCancelled(hooks);
  emit("building_accessibility", std::to_string(planningMesh.patches.size()) + " patches");
  const auto directions = generateCandidateDirections(planningMesh, seed.sourceMesh.positions);
  const int rawDirectionCount = static_cast<int>(directions.size());
  budget.candidateDirectionCount = rawDirectionCount;
  AccessibilityAnalysis analysis = analyzeDirectionAccessibility(seed.sourceMesh.positions, seed.sourceMesh.indices, planningMesh, directions);
  analysis = pruneDirections(analysis.directions, analysis, planningMesh, kMaxCandidateDirections).analysis;
  throwIfCancelled(hooks);
  emit("building_accessibility", std::string("checking region coverage"));
  analysis = runAdaptiveDirectionDiscovery(planningMesh, seed.sourceMesh.positions, seed.sourceMesh.indices, analysis).analysis;
  budget.candidateDirectionCount = static_cast<int>(analysis.directions.size());
  throwIfCancelled(hooks);

  emit("optimizing_working_mold", std::string("searching mold-piece count"));
  const int maxPieces = std::min({seed.processProfile.maximumWorkingMoldPieceCount,
                                  seed.userPreferences.preferredMaximumWorkingMoldPieces.value_or(seed.processProfile.maximumWorkingMoldPieceCount),
                                  kAbsoluteMaxWorkingMoldPieces});
  std::vector<RejectedPieceCount> rejectedPieceCounts;
  std::vector<WorkingMoldPieceCountDiagnostics>& planningDiagnostics = result.planningDiagnostics;
  WorkingMoldPieceCountSearch search({planningMesh, analysis, maxPieces});
  std::optional<WorkingMoldConstructionOutput> construction;
  std::optional<WorkingMoldDecompositionFinalist> constructionFinalist;
  std::optional<std::string> constructionError;
  int partingSurfaceCandidateAttempts = 0;

  for (;;) {
    auto step = search.next();
    if (!step) break;
    planningDiagnostics.push_back(step->diagnostics);
    throwIfCancelled(hooks);
    if (step->rejectionReason) {
      rejectedPieceCounts.push_back({step->pieceCount, *step->rejectionReason});
      continue;
    }
    budget.workingMoldPlanCandidateCount += static_cast<int>(step->finalists.size());
    emit("constructing_working_mold", std::to_string(step->pieceCount) + " pieces");
    std::optional<std::string> countError;
    for (const auto& finalist : step->finalists) {
      throwIfCancelled(hooks);
      budget.workingMoldConstructionAttempts += 1;
      WorkingMoldConstructionInput in;
      in.sourcePositions = seed.sourceMesh.positions;
      in.sourceIndices = seed.sourceMesh.indices;
      in.sourceBounds = seed.sourceBounds;
      in.releaseClearanceMm = seed.processProfile.releaseClearanceMm.value_or(0);
      in.minimumToolingWallMm = seed.processProfile.minimumToolingWallMm;
      for (const auto& piece : finalist.candidate.pieces) {
        PlannedPieceRegion region;
        region.releaseDirection = piece.releaseDirection;
        if (piece.prism) region.plane = PlannedPieceRegion::Plane{analysis.directions[static_cast<std::size_t>(piece.prism->directionIndex)].vector, piece.prism->offsetMm};
        in.pieces.push_back(region);
      }
      std::vector<PlannedPieceRegion> planarPieces = in.pieces;
      try {
        construction = constructWorkingMold(engine, in, hooks.cancel);
        constructionFinalist = finalist;
        break;
      } catch (const CodedError& error) {
        rethrowIfCancelled(error);
        countError = error.what();
      } catch (const std::runtime_error& error) {
        countError = error.what();
      }
      // The flat planes are not the only way to realise this finalist's assignment: retry with parting tools that follow its own
      // real parting curves (one curve per neighbour a piece borders).
      if (auto heightField = heightFieldFallbackPieces(finalist, planarPieces)) {
        throwIfCancelled(hooks);
        budget.workingMoldConstructionAttempts += 1;
        partingSurfaceCandidateAttempts += 1;
        WorkingMoldConstructionInput fallback = in;
        fallback.pieces = std::move(*heightField);
        try {
          construction = constructWorkingMold(engine, fallback, hooks.cancel);
          constructionFinalist = finalist;
          break;
        } catch (const CodedError& error) {
          rethrowIfCancelled(error);
          countError = error.what();
        } catch (const std::runtime_error& error) {
          countError = error.what();
        }
      }
    }    if (construction) break;
    constructionError = countError;
    rejectedPieceCounts.push_back({step->pieceCount, "all " + std::to_string(step->finalists.size()) + " planning finalist(s) failed exact construction: " +
                                                         countError.value_or("unknown")});
  }
  // Last resorts after the ordinary search exhausted every piece count: assign every patch straight from the region set-cover proof
  // (a grid partition of physical pieces), then a joint multi-label reconstruction of the same assignment.
  const auto makeInput = [&](std::vector<PlannedPieceRegion> pieces) {
    WorkingMoldConstructionInput in;
    in.sourcePositions = seed.sourceMesh.positions;
    in.sourceIndices = seed.sourceMesh.indices;
    in.sourceBounds = seed.sourceBounds;
    in.releaseClearanceMm = seed.processProfile.releaseClearanceMm.value_or(0);
    in.minimumToolingWallMm = seed.processProfile.minimumToolingWallMm;
    in.pieces = std::move(pieces);
    return in;
  };
  const auto syntheticFinalist = [&](const DirectConstruction& built, const RegionSetCoverResult& cover, const RegionDirectAssignmentResult& assignment)
      -> std::optional<WorkingMoldDecompositionFinalist> {
    const int pieceCount = static_cast<int>(built.pieces.size());
    WorkingMoldDecompositionFinalist f;
    for (std::size_t i = 0; i < built.pieces.size(); ++i) {
      if (i >= cover.steps.size()) return std::nullopt;  // the reference reads `steps[index].directionId` of a missing step and throws
      f.candidate.pieces.push_back({built.pieces[i].releaseDirection, cover.steps[i].directionId, std::nullopt});
    }
    f.candidate.pieceCount = pieceCount;
    f.candidate.feasible = true;
    f.candidate.unassignablePatchCount = 0;
    f.candidate.score = pieceCount * 0.1;
    f.candidate.scoreBreakdown = {0, 0, 0, pieceCount - 1, pieceCount * 0.1};
    f.patchAssignment = assignment.assignment;
    f.interfaces = built.interfaces;
    return f;
  };
  if (!construction) {
    const SurfaceRegionGraph refinedRegionGraph = refineRegionGraphByVisibility(buildSurfaceRegionGraph(planningMesh), planningMesh, analysis).regionGraph;
    const RegionSetCoverResult directCover = greedyRegionCover(refinedRegionGraph, planningMesh, analysis);
    const bool coverUsable = directCover.uncoveredRegionIndexes.empty() && directCover.steps.size() >= 2 && static_cast<int>(directCover.steps.size()) <= maxPieces;
    if (coverUsable) {
      const RegionDirectAssignmentResult directAssignment = buildRegionDirectAssignment(refinedRegionGraph, planningMesh, analysis, directCover.steps);
      std::optional<DirectConstruction> directBuilt;
      if (directAssignment.unassignedPatchCount == 0) directBuilt = buildDirectAssignmentConstructionPieces(planningMesh, analysis, directAssignment);
      if (directBuilt) {
        throwIfCancelled(hooks);
        budget.workingMoldConstructionAttempts += 1;
        partingSurfaceCandidateAttempts += 1;
        try {
          construction = constructWorkingMold(engine, makeInput(directBuilt->pieces), hooks.cancel);
          constructionFinalist = syntheticFinalist(*directBuilt, directCover, directAssignment);
          if (!constructionFinalist) throw std::runtime_error("Cannot read properties of undefined (reading 'directionId')");
        } catch (const std::exception& error) {
          if (const auto* coded = dynamic_cast<const CodedError*>(&error)) rethrowIfCancelled(*coded);
          constructionError = "region-set-cover-driven direct assignment (" + std::to_string(directCover.steps.size()) +
                              " directions, proven full region coverage) reached real exact construction but failed: " + error.what();
          rejectedPieceCounts.push_back({static_cast<int>(directBuilt->pieces.size()), *constructionError});
        }
      }
    }
    if (!construction && coverUsable) {
      const RegionDirectAssignmentResult directAssignment = buildRegionDirectAssignment(refinedRegionGraph, planningMesh, analysis, directCover.steps);
      std::optional<DirectConstruction> multiLabelBuilt;
      if (directAssignment.unassignedPatchCount == 0) multiLabelBuilt = buildMultiLabelConstructionPieces(planningMesh, analysis, directAssignment);
      if (multiLabelBuilt) {
        throwIfCancelled(hooks);
        budget.workingMoldConstructionAttempts += 1;
        partingSurfaceCandidateAttempts += 1;
        try {
          WorkingMoldConstructionInput in = makeInput(multiLabelBuilt->pieces);
          for (const auto& d : analysis.directions) in.extraReleaseDirections.push_back(d.vector);
          construction = constructWorkingMold(engine, in, hooks.cancel);
          constructionFinalist = syntheticFinalist(*multiLabelBuilt, directCover, directAssignment);
          if (!constructionFinalist) throw std::runtime_error("Cannot read properties of undefined (reading 'directionId')");
        } catch (const std::exception& error) {
          if (const auto* coded = dynamic_cast<const CodedError*>(&error)) rethrowIfCancelled(*coded);
          constructionError = "region-set-cover-driven multi-label reconstruction (" + std::to_string(directCover.steps.size()) +
                              " directions, proven full region coverage) reached real exact construction but failed: " + error.what();
          rejectedPieceCounts.push_back({static_cast<int>(multiLabelBuilt->pieces.size()), *constructionError});
        }
      }
    }
  }
  budget.budgetDetails = buildBudgetDetails(rawDirectionCount, static_cast<int>(analysis.directions.size()), planningDiagnostics, maxPieces,
                                            budget.workingMoldConstructionAttempts);

  MasterMoldDebugSnapshot snapshot;
  snapshot.sourceValidity = preflight.status == "valid" ? "valid" : "repairable-warning";
  snapshot.regionCount = static_cast<int>(search.regionGraph().regions.size());
  snapshot.candidateDirectionCount = static_cast<int>(analysis.directions.size());
  snapshot.regionRefinementCount = search.subdividedRegionCount();
  snapshot.totalRegions = search.regionCover().totalRegionCount;
  snapshot.uncoveredRegionCount = static_cast<int>(search.regionCover().uncoveredRegionIndexes.size());
  if (search.regionCover().uncoveredRegionIndexes.empty()) snapshot.minimumPieceEstimate = static_cast<int>(search.regionCover().steps.size());
  snapshot.uncoveredRegionIndexes = search.regionCover().uncoveredRegionIndexes;
  for (const auto& d : planningDiagnostics) {
    snapshot.pieceCountAttempts.push_back(d.pieceCount);
    snapshot.thresholdAttemptsByPieceCount.emplace_back(d.pieceCount, d.thresholdCountUsed);
  }
  snapshot.partingSurfaceCandidateCount = partingSurfaceCandidateAttempts;
  snapshot.exactConstructionAttempts = budget.workingMoldConstructionAttempts;
  if (constructionFinalist) snapshot.selectedPieceCount = constructionFinalist->candidate.pieceCount;
  if (construction) snapshot.releaseSweepCount = construction->releaseSweepCount;
  result.debugSnapshot = snapshot;

  if (!construction || !constructionFinalist) {
    const bool budgetReached = !budget.limitsExceeded.empty() || !rejectedPieceCounts.empty();
    const bool atAutomaticCeiling = maxPieces >= kAbsoluteMaxWorkingMoldPieces;
    const std::string recovery = atAutomaticCeiling
        ? "automatic escalation already reached the internal safety ceiling of " + std::to_string(maxPieces) +
              " piece(s); use flexible/sacrificial tooling for fully enclosed features, or simplify the part"
        : "raise the piece-count cap (currently " + std::to_string(maxPieces) + " of a " + std::to_string(kAbsoluteMaxWorkingMoldPieces) +
              "-piece safety ceiling) in the process profile or preferred piece-count setting, or use flexible/sacrificial tooling for fully enclosed features";
    std::vector<std::string> exhausted;
    for (const auto& item : budget.budgetDetails) {
      if (item.name != "parting_surface" && item.limit > 0 && item.used >= item.limit) exhausted.push_back(item.name);
    }
    std::string exhaustedClause;
    if (!exhausted.empty()) {
      std::string joined;
      for (const auto& n : exhausted) joined += (joined.empty() ? "" : ", ") + n;
      exhaustedClause = " Exhausted budget(s): " + joined + ".";
    } else if (budget.workingMoldConstructionAttempts == 0) {
      exhaustedClause = " No individual search budget was exhausted; planning itself never produced a feasible candidate at any attempted piece count (see planningDiagnostics for the per-count reason).";
    }
    const auto has = [&](const char* name) { return std::find(exhausted.begin(), exhausted.end(), name) != exhausted.end(); };
    std::string reason;
    if (constructionError) {
      static const std::regex releasePattern("cannot release", std::regex::icase);
      reason = std::regex_search(*constructionError, releasePattern) ? "working_mold_release_locked" : "exact_working_mold_failed";
    } else if (has("piece_count")) reason = "planning_piece_count_budget_exhausted";
    else if (has("combination_directions")) reason = "planning_direction_budget_exhausted";
    else if (has("parting_thresholds")) reason = "planning_threshold_budget_exhausted";
    else reason = "no_release_plan";
    const std::string lastFailure = constructionError ? " (last exact failure: " + *constructionError + ")" : "";
    // Planning itself found nothing to build (no exact construction was ever attempted): say what is actually wrong with the part -- the share
    // of its surface that the best plan leaves trapped -- instead of the budget counters, which read like an engine failure.
    const WorkingMoldPieceCountDiagnostics* bestPlan = nullptr;
    for (const auto& d : planningDiagnostics) {
      if (d.bestUnassignableAreaFraction && (!bestPlan || *d.bestUnassignableAreaFraction < *bestPlan->bestUnassignableAreaFraction)) bestPlan = &d;
    }
    std::string message;
    if (!constructionError && budget.workingMoldConstructionAttempts == 0 && bestPlan) {
      char share[32];
      std::snprintf(share, sizeof share, "%.0f%%", std::max(1.0, std::round(*bestPlan->bestUnassignableAreaFraction * 100)));
      message = "no way was found to split the part into at most " + std::to_string(maxPieces) +
                " pieces that can all be pulled out: the best plan (" + std::to_string(bestPlan->pieceCount) + " piece(s)) still leaves about " + share +
                " of the part's surface (" + std::to_string(bestPlan->bestUnresolvedRegionCount.value_or(0)) +
                " region(s)) trapped behind other geometry, so no tooling was built. This is a limit of the automatic rigid-tooling search, not proof that rigid tooling is impossible: review the part, " +
                recovery + ".";
    } else if (budgetReached) {
      message = "the bounded search reached its configured limits (piece-count cap " + std::to_string(maxPieces) + ", " +
                std::to_string(budget.workingMoldConstructionAttempts) + " exact construction attempt(s), " + std::to_string(rejectedPieceCounts.size()) +
                " piece count(s) rejected) without finding a releasable decomposition" + lastFailure + "." + exhaustedClause +
                " This is a search-budget outcome, not proof that rigid tooling is impossible: review the part, " + recovery + ".";
    } else {
      message = "no working-mold decomposition could be planned" + lastFailure +
                ". This is a search-budget outcome, not proof that rigid tooling is impossible; flexible/sacrificial tooling may be required for fully enclosed features.";
    }
    result.failures.push_back({"working-mold", reason, masterMoldFailureFamilyOf(reason), message});
    result.elapsedMs = clock.elapsedMs();
    return result;
  }

  const std::vector<WorkingMoldPieceTarget>& pieceTargets = construction->pieces;
  throwIfCancelled(hooks);

  const NegativeTool negative = buildSourceNegativeTool(engine, seed);
  const MasterToolingParameters parameters = toolingParametersFromProfile(seed.processProfile);
  for (std::size_t index = 0; index < pieceTargets.size(); ++index) {
    const WorkingMoldPieceTarget& piece = pieceTargets[index];
    emit("planning_master_tooling", "piece " + std::to_string(index + 1) + " of " + std::to_string(pieceTargets.size()));
    throwIfCancelled(hooks);
    const std::string signature = toolingSetInputSignature(seed, piece.pieceId, piece.geometryVersion);
    const auto prior = std::find_if(priorSets.begin(), priorSets.end(), [&](const auto& s) { return s.moldPartId == piece.pieceId; });
    if (prior != priorSets.end() && prior->sourceSignature == signature) {
      result.toolingSets.push_back(*prior);
      continue;
    }
    MasterCastTarget target;
    target.moldPartId = piece.pieceId;
    target.moldPartName = piece.name;
    target.mesh = piece.mesh;
    target.bounds = piece.bounds;
    target.volumeMm3 = piece.volumeMm3;
    target.geometryVersion = piece.geometryVersion;
    try {
      budget.toolingExactPlanAttempts += 1;
      if (auto set = buildToolingSetForWorkingMoldPiece(engine, seed, target, negative, parameters, budget, hooks, piece.assignedDirection)) {
        result.toolingSets.push_back(std::move(*set));
      }
    } catch (const CodedError&) {
      throw;  // cancellation
    } catch (const std::exception& error) {
      result.failures.push_back({piece.pieceId, "tooling_construction_failed", masterMoldFailureFamilyOf("tooling_construction_failed"),
                                 piece.name + ": " + error.what()});
    }
  }
  if (!result.unportedPaths.empty()) result.unportedPathsReached = true;

  emit("verifying_release", std::to_string(pieceTargets.size()) + " pieces verified");
  AutoWorkingMoldPlan plan;
  plan.sourceGeometryVersion = seed.sourceGeometryVersion;
  plan.moldPieces = pieceTargets;
  plan.partingInterfaces = constructionFinalist->interfaces;
  plan.releaseSequence = construction->releaseSequence;
  plan.registrationPlan = construction->registrationPlan;
  plan.score = constructionFinalist->candidate.scoreBreakdown;
  plan.rejectedPieceCounts = rejectedPieceCounts;
  if (construction->registrationPlan.reason) {
    warnings.push_back({"working_mold_registration_unplaced",
                        "working mold assembled without automatic alignment features: " + *construction->registrationPlan.reason, std::nullopt});
  }
  plan.warnings = warnings;
  result.plan = std::move(plan);

  emit("finalizing", std::nullopt);
  result.elapsedMs = clock.elapsedMs();
  return result;
}

}  // namespace craft
