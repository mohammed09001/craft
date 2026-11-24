#include "master/MasterContract.h"

#include <algorithm>
#include <cmath>
#include <map>
#include <numeric>
#include <tuple>

namespace craft {

const char* masterToolName(MasterToolId id) { return id == MasterToolId::A ? "Master A" : "Master B"; }

const char* masterOutcomeCodeName(MasterOutcomeCode code) {
  switch (code) {
    case MasterOutcomeCode::Success: return "success";
    case MasterOutcomeCode::InvalidInput: return "invalid_input";
    case MasterOutcomeCode::NoFeasiblePlan: return "no_feasible_plan";
    case MasterOutcomeCode::BlockedRelease: return "blocked_release";
    case MasterOutcomeCode::UnresolvedVerification: return "unresolved_verification";
    case MasterOutcomeCode::ResourceLimit: return "resource_limit";
    case MasterOutcomeCode::InternalError: return "internal_error";
  }
  return "internal_error";
}

MasterOutcomeCode masterOutcomeCodeFromName(const std::string& name) {
  for (const MasterOutcomeCode c : {MasterOutcomeCode::Success, MasterOutcomeCode::InvalidInput, MasterOutcomeCode::NoFeasiblePlan,
                                    MasterOutcomeCode::BlockedRelease, MasterOutcomeCode::UnresolvedVerification, MasterOutcomeCode::ResourceLimit}) {
    if (name == masterOutcomeCodeName(c)) return c;
  }
  return MasterOutcomeCode::InternalError;
}

const char* masterReleaseStageName(MasterReleaseStage stage) {
  switch (stage) {
    case MasterReleaseStage::None: return "none";
    case MasterReleaseStage::MasterToWorkingMold: return "master_to_working_mold";
    case MasterReleaseStage::WorkingMoldAssembly: return "working_mold_assembly";
    case MasterReleaseStage::ProductRelease: return "product_release";
  }
  return "none";
}

const char* masterVerificationName(MasterVerification v) {
  switch (v) {
    case MasterVerification::NotRun: return "not_run";
    case MasterVerification::Verified: return "verified";
    case MasterVerification::Blocked: return "blocked";
    case MasterVerification::Unverified: return "unverified";
  }
  return "not_run";
}

// --- measured body facts ----------------------------------------------------------------------------------------------------------------

MasterBodyFacts analyzeSolidBody(const MeshPayload& mesh, MasterBodyDefects* defects) {
  MasterBodyDefects local;
  MasterBodyDefects& d = defects ? *defects : local;
  d = {};
  MasterBodyFacts facts;
  facts.triangleCount = static_cast<int>(mesh.triangleCount());
  const std::size_t vertexCount = mesh.vertexCount();
  if (facts.triangleCount == 0 || vertexCount == 0) return facts;

  // Weld vertices that coincide exactly, so a triangle soup and an indexed mesh of the same solid give the same answer.
  std::map<std::tuple<double, double, double>, std::uint32_t> canonicalOf;
  std::vector<std::uint32_t> canon(vertexCount);
  for (std::size_t v = 0; v < vertexCount; ++v) {
    const auto key = std::make_tuple(mesh.positions[3 * v], mesh.positions[3 * v + 1], mesh.positions[3 * v + 2]);
    canon[v] = canonicalOf.emplace(key, static_cast<std::uint32_t>(canonicalOf.size())).first->second;
  }

  std::vector<std::uint32_t> parent(canonicalOf.size());
  std::iota(parent.begin(), parent.end(), 0u);
  const auto find = [&](std::uint32_t x) {
    while (parent[x] != x) x = parent[x] = parent[parent[x]];
    return x;
  };

  // Directed edge use counts: a closed, consistently oriented 2-manifold uses each undirected edge exactly twice, once in each direction.
  std::map<std::pair<std::uint32_t, std::uint32_t>, int> directed;
  int degenerateCount = 0;
  double volume6 = 0;
  Bounds3 b;
  b.min = {mesh.positions[0], mesh.positions[1], mesh.positions[2]};
  b.max = b.min;
  for (std::size_t t = 0; t < static_cast<std::size_t>(facts.triangleCount); ++t) {
    std::uint32_t c[3];
    double p[3][3];
    for (int k = 0; k < 3; ++k) {
      const std::uint32_t raw = mesh.indices[3 * t + k];
      if (raw >= vertexCount) return MasterBodyFacts{facts.triangleCount, 0, false, false, 0, {}};
      c[k] = canon[raw];
      for (int a = 0; a < 3; ++a) p[k][a] = mesh.positions[3 * raw + a];
      for (int a = 0; a < 3; ++a) {
        b.min[a] = std::min(b.min[a], p[k][a]);
        b.max[a] = std::max(b.max[a], p[k][a]);
      }
    }
    if (c[0] == c[1] || c[1] == c[2] || c[0] == c[2]) {  // a zero-area sliver: reported, but it carries no volume and must not break the edge pairing of its neighbours
      ++degenerateCount;
      continue;
    }
    for (int k = 0; k < 3; ++k) {
      directed[{c[k], c[(k + 1) % 3]}] += 1;
      parent[find(c[k])] = find(c[(k + 1) % 3]);
    }
    volume6 += p[0][0] * (p[1][1] * p[2][2] - p[1][2] * p[2][1]) - p[0][1] * (p[1][0] * p[2][2] - p[1][2] * p[2][0]) +
               p[0][2] * (p[1][0] * p[2][1] - p[1][1] * p[2][0]);
  }

  d.degenerateTriangles = degenerateCount;
  bool closed = true, manifold = true;
  for (const auto& [edge, count] : directed) {
    const auto reverse = directed.find({edge.second, edge.first});
    const int back = reverse == directed.end() ? 0 : reverse->second;
    if (count != 1 || back != 1) {
      if (count > 1 || back > 1) { manifold = false; ++d.nonManifoldEdges; } else { ++d.openEdges; }
      closed = false;
    }
  }
  std::map<std::uint32_t, int> roots;
  for (const auto& [edge, count] : directed) roots.emplace(find(edge.first), 0);
  facts.componentCount = static_cast<int>(roots.size());
  facts.watertight = closed;
  facts.manifold = manifold && closed;
  facts.volumeMm3 = volume6 / 6.0;
  facts.bounds = b;
  return facts;
}

MasterMaterialEstimate estimateMasterMaterial(MasterToolId id, double fillVolumeMm3, double wasteMargin, std::optional<double> densityGPerCm3) {
  MasterMaterialEstimate m;
  m.id = id;
  m.fillVolumeMm3 = fillVolumeMm3;
  m.wasteMargin = wasteMargin;
  m.volumeWithWasteMm3 = fillVolumeMm3 * (1.0 + wasteMargin);
  m.densityGPerCm3 = densityGPerCm3;
  if (densityGPerCm3) m.massG = m.volumeWithWasteMm3 / 1000.0 * *densityGPerCm3;  // mm^3 -> cm^3, then x g/cm^3
  return m;
}

// --- validation -----------------------------------------------------------------------------------------------------------------------------

namespace {

bool isUnit(const Point3& v) { return std::abs(std::sqrt(v.x * v.x + v.y * v.y + v.z * v.z) - 1.0) < 1e-6; }

void requireClosedSolid(std::vector<std::string>& out, const std::string& label, const MeshPayload& mesh) {
  MasterBodyDefects defects;
  const MasterBodyFacts f = analyzeSolidBody(mesh, &defects);
  if (f.triangleCount == 0) { out.push_back(label + ": empty mesh."); return; }
  if (defects.degenerateTriangles > 0) out.push_back(label + ": contains " + std::to_string(defects.degenerateTriangles) + " zero-area triangle(s).");
  if (f.componentCount != 1) out.push_back(label + ": expected exactly one connected body, found " + std::to_string(f.componentCount) + ".");
  if (!f.watertight) out.push_back(label + ": not a closed watertight surface.");
  if (!f.manifold) out.push_back(label + ": not a consistently oriented 2-manifold.");
  if (!(f.volumeMm3 > 0)) out.push_back(label + ": non-positive volume (inverted or degenerate).");
}

}  // namespace

std::vector<std::string> validateMasterPlan(const MasterMoldPlan& plan) {
  std::vector<std::string> v;
  if (plan.contractVersion != kMasterContractVersion) v.push_back("contract version mismatch.");
  if (plan.fingerprint.empty()) v.push_back("missing fingerprint.");
  if (plan.sourceGeometryVersion.empty()) v.push_back("missing source geometry version.");

  for (int i = 0; i < kMasterToolCount; ++i) {
    const MasterTool& m = plan.masters[static_cast<std::size_t>(i)];
    const VirtualWorkingHalf& h = plan.halves[static_cast<std::size_t>(i)];
    const std::string tool = masterToolName(static_cast<MasterToolId>(i));
    if (static_cast<int>(m.id) != i) v.push_back(tool + ": id out of order.");
    if (m.name != tool) v.push_back(tool + ": wrong name '" + m.name + "'.");
    requireClosedSolid(v, tool, m.mesh);
    if (static_cast<int>(h.id) != i) v.push_back(tool + " working half: id out of order.");
    requireClosedSolid(v, tool + " working half", h.mesh);
    if (!isUnit(m.pourDirection)) v.push_back(tool + ": pour direction is not a unit vector.");
    if (!isUnit(h.releaseDirection)) v.push_back(tool + " working half: release direction is not a unit vector.");
    if (!(m.fillVolumeMm3 > 0)) v.push_back(tool + ": non-positive fill volume.");
    if (!(m.minimumWallMm > 0)) v.push_back(tool + ": minimum wall thickness not reported.");
    if (m.registrationFeatureIds.empty()) v.push_back(tool + ": no registration features.");
    const MasterMaterialEstimate& e = plan.materials[static_cast<std::size_t>(i)];
    if (static_cast<int>(e.id) != i) v.push_back(tool + ": material estimate id out of order.");
    if (std::abs(e.fillVolumeMm3 - m.fillVolumeMm3) > 1e-9 * std::max(1.0, m.fillVolumeMm3)) v.push_back(tool + ": material estimate disagrees with the fill volume.");
    if (e.densityGPerCm3.has_value() != e.massG.has_value()) v.push_back(tool + ": mass must be reported exactly when a density is known.");
    const double halfVolume = analyzeSolidBody(h.mesh).volumeMm3;
    if (halfVolume > 0 && std::abs(m.fillVolumeMm3 - halfVolume) > 0.01 * halfVolume) v.push_back(tool + ": fill volume does not match its working half.");
  }
  for (const std::string& a : plan.masters[0].registrationFeatureIds) {
    const auto& b = plan.masters[1].registrationFeatureIds;
    if (std::find(b.begin(), b.end(), a) != b.end()) v.push_back("registration feature '" + a + "' appears on both masters; polarity must be complementary.");
  }

  struct Needed { MasterReleaseStage stage; MasterToolId subject; };
  const Needed needed[] = {{MasterReleaseStage::MasterToWorkingMold, MasterToolId::A},
                           {MasterReleaseStage::MasterToWorkingMold, MasterToolId::B},
                           {MasterReleaseStage::WorkingMoldAssembly, MasterToolId::A},
                           {MasterReleaseStage::ProductRelease, MasterToolId::A}};
  for (const Needed& n : needed) {
    const auto it = std::find_if(plan.releaseChecks.begin(), plan.releaseChecks.end(),
                                 [&](const MasterReleaseCheck& c) { return c.stage == n.stage && c.subject == n.subject; });
    const std::string label = std::string(masterReleaseStageName(n.stage)) + " (" + masterToolName(n.subject) + ")";
    if (it == plan.releaseChecks.end()) { v.push_back("missing release check: " + label + "."); continue; }
    if (it->verification != MasterVerification::Verified) v.push_back("release check not verified: " + label + " is " + masterVerificationName(it->verification) + ".");
    if (it->method.empty()) v.push_back("release check without a recorded method: " + label + ".");
    if (it->marginMm < 0) v.push_back("release check with a negative margin: " + label + ".");
    if (!isUnit(it->direction)) v.push_back("release check without a unit direction: " + label + ".");
  }
  for (const MasterReleaseCheck& c : plan.releaseChecks) {
    if (c.verification == MasterVerification::Blocked || c.verification == MasterVerification::Unverified)
      v.push_back(std::string("a release check is ") + masterVerificationName(c.verification) + " at stage " + masterReleaseStageName(c.stage) + ".");
  }

  if (!plan.fidelity.measured) v.push_back("reproduction fidelity was not measured.");
  if (plan.fidelity.measured && plan.fidelity.method.empty()) v.push_back("fidelity measurement has no recorded method.");
  if (!(plan.fidelity.toleranceMm > 0)) v.push_back("fidelity tolerance not declared.");
  if (plan.fidelity.measured && plan.fidelity.maxDeviationMm > plan.fidelity.toleranceMm) v.push_back("reproduction deviates beyond the declared tolerance.");
  if (plan.residualUncertainty.empty()) v.push_back("residual uncertainty must be stated: digital validation is not physical qualification.");
  return v;
}

MasterMoldOutcome makeMasterOutcome(MasterMoldPlan plan, double elapsedMs) {
  const std::vector<std::string> violations = validateMasterPlan(plan);
  if (!violations.empty()) {
    MasterFailure f;
    f.code = MasterOutcomeCode::InternalError;
    f.message = "the produced Master Mold plan violated its own contract and was not published.";
    f.diagnostics = violations;
    return makeMasterFailure(std::move(f), elapsedMs);
  }
  MasterMoldOutcome o;
  o.code = MasterOutcomeCode::Success;
  o.plan = std::move(plan);
  o.elapsedMs = elapsedMs;
  return o;
}

MasterMoldOutcome makeMasterFailure(MasterFailure failure, double elapsedMs) {
  MasterMoldOutcome o;
  // A failure can never carry the success code.
  if (failure.code == MasterOutcomeCode::Success) failure.code = MasterOutcomeCode::InternalError;
  o.code = failure.code;
  o.failure = std::move(failure);
  o.elapsedMs = elapsedMs;
  return o;
}

}  // namespace craft
