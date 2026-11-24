#pragma once

// Master Mold result contract (version 2): exactly two independent, reusable, rigid printable master tools (Master A and Master B),
// plus the two virtual working-mold halves they are inverted from.
//
// A master is NOT a negative mold half. Each master is an open-top casting tool holding the positive impression geometry of one
// working-mold half, a base and integral containment walls. Master A is filled with mold-making material to cast working half A, Master B to
// cast working half B; only the two cast halves are assembled to cast the final product. The working halves are virtual: they are reported for
// preview and verification and are never exported as printable bodies.
//
// A successful outcome cannot be fabricated: `makeMasterOutcome` runs `validateMasterPlan` and returns a structured failure instead of a
// success when any invariant fails (a count other than two, a body that is not one closed solid, a release stage that is not verified, fidelity
// outside tolerance). A failure always names its code and, for a blocked release, the stage.

#include <array>
#include <optional>
#include <string>
#include <vector>

#include "contracts/Geometry.h"

namespace craft {

inline constexpr int kMasterContractVersion = 2;
inline constexpr int kMasterToolCount = 2;

enum class MasterToolId { A = 0, B = 1 };
const char* masterToolName(MasterToolId id);  // "Master A" / "Master B"

enum class MasterOutcomeCode {
  Success,
  InvalidInput,            // the source mesh is not a usable solid (diagnosed, never silently repaired)
  NoFeasiblePlan,          // the bounded search found no candidate; NOT proof that no rigid two-part solution exists
  BlockedRelease,          // a candidate was built and a witnessed collision blocks release at `failure.stage`
  UnresolvedVerification,  // a candidate was built but release could not be certified (interval left unverified)
  ResourceLimit,           // timeout or memory limit
  InternalError
};
const char* masterOutcomeCodeName(MasterOutcomeCode code);
MasterOutcomeCode masterOutcomeCodeFromName(const std::string& name);

enum class MasterReleaseStage {
  None,
  MasterToWorkingMold,  // cast working half W_i lifts out of its printed master M_i
  WorkingMoldAssembly,  // W_A and W_B mate with correct registration, and the inverse assembly motion is clear
  ProductRelease        // W_A and W_B separate from each other and from the cast product
};
const char* masterReleaseStageName(MasterReleaseStage stage);

enum class MasterVerification { NotRun, Verified, Blocked, Unverified };
const char* masterVerificationName(MasterVerification v);

/// One release check on the final feature-complete solids. `Verified` requires a continuous (swept, interval or conservative-bound) proof,
/// never a set of discrete samples alone; `method` records which.
struct MasterReleaseCheck {
  MasterReleaseStage stage = MasterReleaseStage::None;
  MasterToolId subject = MasterToolId::A;  // the master / working half the check concerns (both for assembly stages: A)
  MasterVerification verification = MasterVerification::NotRun;
  Point3 direction;                        // unit release direction in the model frame
  double marginMm = 0;                     // smallest verified clearance along the motion (>= 0 when verified)
  std::string method;                      // e.g. "swept-volume-conservative"
  std::string note;                        // witnessed obstruction or the unverified interval, when any
};

/// Solid-body facts, measured from the mesh itself (see `analyzeSolidBody`), never taken on trust from the producer.
struct MasterBodyFacts {
  int triangleCount = 0;
  int componentCount = 0;
  bool watertight = false;  // every edge used by exactly two triangles
  bool manifold = false;
  double volumeMm3 = 0;
  Bounds3 bounds;
};
struct MasterBodyDefects {
  int degenerateTriangles = 0;  // triangles with two coincident corners after welding
  int openEdges = 0;            // edges not used exactly once in each direction (counted per direction)
  int nonManifoldEdges = 0;
};
MasterBodyFacts analyzeSolidBody(const MeshPayload& mesh, MasterBodyDefects* defects = nullptr);

/// One independent printable master tool, in its own manufacturing frame: the underside of the base lies on z = 0 (the print bed) and the open
/// pour face looks toward +Z.
struct MasterTool {
  MasterToolId id = MasterToolId::A;
  std::string name;
  MeshPayload mesh;                              // printable body, manufacturing frame
  MasterBodyFacts facts;                         // measured; must be one closed solid
  std::array<double, 16> printFromModel{};       // column-major: model frame -> manufacturing frame
  Point3 pourDirection{0, 0, 1};                 // manufacturing frame; the open fill boundary faces this way
  double fillVolumeMm3 = 0;                      // working-half volume the tool is filled with (mold-making material)
  double minimumWallMm = 0;                      // thinnest integral containment wall or base
  std::vector<std::string> registrationFeatureIds;  // integral keys; polarity is complementary between A and B
  std::vector<std::string> ventFeatureIds;
};

/// A virtual working-mold half W_i, model frame. Preview and verification only.
struct VirtualWorkingHalf {
  MasterToolId id = MasterToolId::A;
  std::string name;
  MeshPayload mesh;
  MasterBodyFacts facts;
  Point3 releaseDirection;  // unit, model frame: how this half leaves the product
};

struct MasterSeam {
  std::string kind = "planar";  // planar | height-field
  Point3 pullAxis{0, 0, 1};     // half A pulls along +axis, half B along -axis (opposing translation)
  double planeOffsetMm = 0;     // planar: offset along pullAxis in the model frame
  std::string description;
};

/// Fill-domain material estimate. Mass is reported only when a density was supplied (mass = volume x density), with an explicit waste margin.
struct MasterMaterialEstimate {
  MasterToolId id = MasterToolId::A;
  double fillVolumeMm3 = 0;
  double wasteMargin = 0;                  // fraction added to the fill volume, e.g. 0.10
  double volumeWithWasteMm3 = 0;
  std::optional<double> densityGPerCm3;
  std::optional<double> massG;
};
MasterMaterialEstimate estimateMasterMaterial(MasterToolId id, double fillVolumeMm3, double wasteMargin, std::optional<double> densityGPerCm3);

struct MasterFidelity {
  double toleranceMm = 0;    // declared reproduction tolerance (excludes explicit features such as the inlet)
  double maxDeviationMm = 0; // measured between W_A + W_B + product and the source model
  bool measured = false;
  std::string method;        // how maxDeviationMm was obtained, e.g. "xor-volume-per-product-area"
};

struct MasterMoldPlan {
  int contractVersion = kMasterContractVersion;
  std::string sourceGeometryVersion;
  std::array<MasterTool, kMasterToolCount> masters;
  std::array<VirtualWorkingHalf, kMasterToolCount> halves;
  MasterSeam seam;
  std::vector<MasterReleaseCheck> releaseChecks;
  std::array<MasterMaterialEstimate, kMasterToolCount> materials;
  MasterFidelity fidelity;
  std::vector<std::string> warnings;
  std::vector<std::string> residualUncertainty;  // digital validation is not physical qualification; list what remains unverified
  std::string fingerprint;
};

struct MasterFailure {
  MasterOutcomeCode code = MasterOutcomeCode::InternalError;
  MasterReleaseStage stage = MasterReleaseStage::None;  // meaningful for BlockedRelease / UnresolvedVerification
  std::string message;
  std::vector<std::string> diagnostics;
};

/// Every invariant of a successful result; empty when the plan is a valid two-master success.
std::vector<std::string> validateMasterPlan(const MasterMoldPlan& plan);

struct MasterMoldOutcome {
  MasterOutcomeCode code = MasterOutcomeCode::InternalError;
  std::optional<MasterMoldPlan> plan;        // present exactly when code == Success
  std::optional<MasterFailure> failure;      // present exactly when code != Success
  double elapsedMs = 0;
  bool success() const { return code == MasterOutcomeCode::Success; }
};

/// The only way to make a success. Returns InternalError (with the violated invariants) when the plan does not validate.
MasterMoldOutcome makeMasterOutcome(MasterMoldPlan plan, double elapsedMs);
MasterMoldOutcome makeMasterFailure(MasterFailure failure, double elapsedMs);

}  // namespace craft
