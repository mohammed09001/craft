#pragma once

// Sprue engineering profile design (pure math, no kernel).
// Ports of mold-generation/sprue-generation/: sprueProfile.ts,
// sprueGeometryPolicy.ts, sprueGeometryCalculator.ts, sprueGeometryContext.ts,
// sprueMainSectionDesigner.ts, sprueEntryNeckDesigner.ts,
// sprueEntryNeckLengthDesigner.ts, sprueProfileDesigner.ts, sprueIntegration.ts.

#include <optional>
#include <string>
#include <vector>

namespace craft {

inline constexpr double kDefaultSprueEntryNeckDiameterMm = 2.5;
inline constexpr double kDefaultSprueEntryNeckLengthMm = 4;
inline constexpr int kSprueCircularSegments = 32;
inline constexpr double kMinSprueDiameterMm = 2;
inline constexpr double kMaxSprueDiameterMm = 50;

std::optional<double> normalizeSprueDiameterMm(double diameterMm, double minimumCoupledDiameterMm = 0);
/// The entry neck may never exceed the main diameter.
std::optional<double> normalizeSprueEntryNeckDiameterMm(double diameterMm, double maximumCoupledDiameterMm);

struct SprueProfileDimensions {
  double mainDiameterMm = kDefaultSprueEntryNeckDiameterMm;
  double entryNeckDiameterMm = kDefaultSprueEntryNeckDiameterMm;
  double entryNeckLengthMm = kDefaultSprueEntryNeckLengthMm;
  friend bool operator==(const SprueProfileDimensions&, const SprueProfileDimensions&) = default;
};
bool isValidSprueProfile(const SprueProfileDimensions& profile);
std::optional<double> calculateEquivalentDiameterMm(double cavityVolumeMm3);

struct SprueGeometryPolicy {
  double mainDiameterRatio = 0.08;
  double minimumMainDiameterMm = 2.5;
  double maximumMainDiameterMm = 20;
  double entryNeckDiameterRatio = 0.7;
  double minimumEntryNeckDiameterMm = 2.5;
  double maximumEntryNeckDiameterMm = 12;
  double entryNeckLengthToDiameterRatio = 1.6;
  double minimumEntryNeckLengthMm = 2;
  double maximumEntryNeckLengthMm = 12;
  double maximumEntryNeckLengthShare = 0.4;
};
bool isValidSprueGeometryPolicy(const SprueGeometryPolicy& policy);

enum class SprueDesignSource { Equation, MinimumLimit, MaximumLimit };
const char* sprueDesignSourceName(SprueDesignSource source);

struct SprueScalarDesign {
  double valueMm = 0;
  double unconstrainedValueMm = 0;
  SprueDesignSource source = SprueDesignSource::Equation;
};

struct SprueCavityBoundsDimensions {
  double xLengthMm = 0, yLengthMm = 0, zLengthMm = 0;
};
std::optional<double> calculateCavityAspectRatio(const SprueCavityBoundsDimensions& bounds);

struct SprueGeometryContextInput {
  double cavityVolumeMm3 = 0;
  SprueCavityBoundsDimensions cavityBounds;
  double totalSprueLengthMm = 0;
};
struct SprueGeometryContext {
  double cavityVolumeMm3 = 0;
  SprueCavityBoundsDimensions cavityBounds;
  double totalSprueLengthMm = 0;
  double equivalentDiameterMm = 0;
  double aspectRatio = 1;
};
std::optional<SprueGeometryContext> buildSprueGeometryContext(const SprueGeometryContextInput& input);

std::optional<SprueScalarDesign> designMainSprueDiameterMm(const SprueGeometryContext& context,
                                                           const SprueGeometryPolicy& policy = {});
std::optional<SprueScalarDesign> designEntryNeckDiameterMm(double mainDiameterMm,
                                                           const SprueGeometryPolicy& policy = {});
std::optional<SprueScalarDesign> designEntryNeckLengthMm(const SprueGeometryContext& context,
                                                         const SprueScalarDesign& mainDiameter,
                                                         const SprueScalarDesign& entryNeckDiameter,
                                                         const SprueGeometryPolicy& policy = {});

/// Mirrors SprueProfileDesignResult. `source` is "geometry-derived" or "fallback".
struct SprueProfileDesignResult {
  SprueProfileDimensions profile;
  std::string source = "fallback";
  std::optional<SprueScalarDesign> mainSection, entryNeckDiameter, entryNeckLength;
  std::vector<std::string> warnings;
};
SprueProfileDesignResult designSprueProfile(const std::optional<SprueGeometryContext>& context,
                                            const SprueGeometryPolicy& policy = {});

struct SprueIntegrationResult {
  std::optional<SprueGeometryContext> context;
  SprueProfileDesignResult design;
};
/// The one canonical path from cavity facts to a profile; invalid inputs flow
/// to the controlled fallback profile.
SprueIntegrationResult resolveSprueIntegration(const SprueGeometryContextInput& input);

}  // namespace craft
