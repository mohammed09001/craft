#pragma once

// A small, valid two-master plan for tests that need a result without running the planner (store, export, long paths). Two boxes stand in for the
// masters and the halves: the contract only cares that each is one closed solid.

#include <memory>

#include "TestMeshes.h"
#include "master/MasterContract.h"

namespace craft::testing {

inline MasterMoldPlan validMasterPlan(const std::string& fingerprint = "plan-fp", double masterWidthMm = 10) {
  MasterMoldPlan p;
  p.sourceGeometryVersion = "geom";
  p.fingerprint = fingerprint;
  for (int i = 0; i < kMasterToolCount; ++i) {
    const auto id = static_cast<MasterToolId>(i);
    MasterTool& m = p.masters[static_cast<std::size_t>(i)];
    m.id = id;
    m.name = masterToolName(id);
    m.mesh = test::cubeMesh({{0, 0, 0}, {masterWidthMm, 10, 10}});
    m.facts = analyzeSolidBody(m.mesh);
    m.fillVolumeMm3 = 1000;
    m.minimumWallMm = 3;
    m.registrationFeatureIds = {i == 0 ? "A:key" : "B:key"};
    VirtualWorkingHalf& h = p.halves[static_cast<std::size_t>(i)];
    h.id = id;
    h.name = std::string("Working half ") + (i == 0 ? "A" : "B");
    h.mesh = test::cubeMesh({{0, 0, 0}, {10, 10, 10}});
    h.facts = analyzeSolidBody(h.mesh);
    h.releaseDirection = {0, 0, i == 0 ? 1.0 : -1.0};
    p.materials[static_cast<std::size_t>(i)] = estimateMasterMaterial(id, 1000, 0.1, std::nullopt);
  }
  const std::pair<MasterReleaseStage, MasterToolId> needed[] = {{MasterReleaseStage::MasterToWorkingMold, MasterToolId::A},
                                                               {MasterReleaseStage::MasterToWorkingMold, MasterToolId::B},
                                                               {MasterReleaseStage::WorkingMoldAssembly, MasterToolId::A},
                                                               {MasterReleaseStage::ProductRelease, MasterToolId::A}};
  for (const auto& [stage, subject] : needed) {
    MasterReleaseCheck c;
    c.stage = stage;
    c.subject = subject;
    c.verification = MasterVerification::Verified;
    c.direction = {0, 0, 1};
    c.method = "test";
    p.releaseChecks.push_back(c);
  }
  p.fidelity = {0.05, 0.01, true, "test"};
  p.residualUncertainty = {"Digital validation only."};
  return p;
}

inline std::shared_ptr<const MasterMoldPlan> sharedValidMasterPlan(const std::string& fingerprint = "plan-fp") {
  return std::make_shared<const MasterMoldPlan>(validMasterPlan(fingerprint));
}

}  // namespace craft::testing
