#pragma once

// The process profile of the two-part Master Mold planner: every manufacturing parameter the geometry depends on, in one place, with the value
// a part of the given size gets when a field is left unset. Lengths are millimetres. A profile encodes clearances and containment sizes; it does not
// assume a material. Three material roles stay separate: the rigid printed master, the rigid working-mold material cast into it (for slip casting,
// porous mold-making plaster) and the final cast material (the ceramic slip). None of them is assumed flexible.

#include <optional>
#include <string>
#include <vector>

namespace craft {

struct MasterProcessProfile {
  std::string profileId = "rigidTwoPart";
  std::optional<double> workingWallMm;      // working-mold margin around the part (default: 15 % of the largest extent, clamped to 10..25)
  std::optional<double> sprueRadiusMm;      // final-cast inlet radius (default: 4 % of the largest extent, clamped to 3..8)
  double masterWallMm = 4;                  // containment wall around the fill domain
  double masterBaseMm = 4;                  // minimum base thickness under the floor (raised to cover the key pits)
  double freeboardMm = 5;                   // open headspace above the fill level, inside the walls
  double keyRadiusMm = 2.5;
  double keyHeightMm = 4;
  double keyClearanceMm = 0.25;             // radial and axial clearance between a key and its socket
  double slidingSine = 1e-5;                // |sin(angle)| below which a face counts as parallel to the motion (zero-draft sliding contact)
  double blockedVolumeMm3 = 1e-3;           // swept overlap above this witnesses a block
  double clearVolumeMm3 = 1e-6;             // swept overlap at or below this is numerical noise; in between is "unverified"
  double wasteMargin = 0.10;                // added to each fill volume for the material estimate
  std::optional<double> workingMoldDensityGPerCm3;  // mass is reported only when this is known
  double fidelityToleranceMm = 1e-3;
  int maxConstructedCandidates = 4;
  int maxSweepPrisms = 4000;                // beyond this the sweep is reported unverified instead of being cut short
  int maxCurvedAxes = 4;                    // release axes tried for a curved seam when no flat seam works
  std::vector<int> curvedSeamResolutions{64, 160};  // seam grid cells along the longer side, coarse to fine; the finer one only when the coarse is not enough
};

}  // namespace craft
