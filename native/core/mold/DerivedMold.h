#pragma once

// The derived stages after the cavity: sprues, then registration. Port of
// evaluateDerivedMold() in mold-generation/workflow/evaluateDerivedMold.ts
// (without the per-sprue result cache, see docs D-013).

#include <vector>

#include "IMeshGeometryEngine.h"
#include "contracts/Operation.h"
#include "mold/CavityGeneration.h"
#include "mold/Registration.h"
#include "mold/SprueGeneration.h"

namespace craft {

struct DerivedMoldEvaluation {
  SprueEvaluation sprues;
  DerivedRegistrationState registration;

  /// The bodies the user sees and exports: registration output when it
  /// exists (generated or blocked, which preserves the input), else the
  /// sprue stage output.
  const std::vector<MoldBody>& finalBodies() const {
    return registration.bodies.empty() ? sprues.bodies : registration.bodies;
  }
  bool keyed() const { return registration.status == "generated"; }
};

/// Stages report as "sprues" and "registration" with a 0..1 fraction.
DerivedMoldEvaluation evaluateDerivedMold(IMeshGeometryEngine& engine, const MoldGenerationResult& mold,
                                          std::vector<SprueOperationDefinition> sprueDefinitions,
                                          const ProgressCallback& progress = {}, SprueResultCache* sprueCache = nullptr);

}  // namespace craft
