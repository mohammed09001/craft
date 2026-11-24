#pragma once

// Master Mold engine entry point: the original model in, exactly two printable masters (with their two virtual working halves) or a structured
// failure out. There is one pipeline (master/MasterTwoPart); this header holds what its callers share: the progress stages, the cancellation
// hooks and the single function to call.

#include <array>
#include <functional>
#include <optional>
#include <string>

#include "IMeshGeometryEngine.h"
#include "contracts/Operation.h"
#include "master/MasterContract.h"
#include "master/MasterPlanning.h"

namespace craft {

inline constexpr std::array<const char*, 7> kMasterProgressStages = {
    "analyzing_geometry", "searching_release_axes", "choosing_seam", "building_working_halves", "inverting_masters", "verifying_release", "finalizing"};

struct MasterMoldProgressStage {
  std::string stage;
  int stageIndex = 0;
  int stageCount = 7;
  std::optional<std::string> detail;
  double elapsedMs = 0;
};

struct MasterMoldEngineHooks {
  std::function<void(const MasterMoldProgressStage&)> onStage;
  CancellationToken cancel;
};

/// `seed` must already carry WORLD-space positions (worldMeshFromSnapshot). Throws CodedError("cancelled", ...) when `hooks.cancel` is set.
MasterMoldOutcome runMasterMoldEngine(IMeshGeometryEngine& engine, const MasterSeedSnapshot& seed, const MasterMoldEngineHooks& hooks = {});

}  // namespace craft
