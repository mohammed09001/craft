#include "master/MasterEngine.h"

#include "master/MasterTwoPart.h"

namespace craft {

MasterMoldOutcome runMasterMoldEngine(IMeshGeometryEngine& engine, const MasterSeedSnapshot& seed, const MasterMoldEngineHooks& hooks) {
  return planTwoPartMasters(engine, seed, seed.processProfile, hooks);
}

}  // namespace craft
