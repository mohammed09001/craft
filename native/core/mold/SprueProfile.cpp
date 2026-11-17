#include "mold/SprueProfile.h"

#include <algorithm>
#include <cmath>

namespace craft {

namespace {
bool positiveFinite(double v) { return std::isfinite(v) && v > 0; }

SprueProfileDesignResult fallbackResult(const std::string& warning) {
  SprueProfileDesignResult result;
  result.profile = SprueProfileDimensions{};
  result.source = "fallback";
  result.warnings = {warning};
  return result;
}
}  // namespace

const char* sprueDesignSourceName(SprueDesignSource source) {
  switch (source) {
    case SprueDesignSource::Equation: return "equation";
    case SprueDesignSource::MinimumLimit: return "minimum-limit";
    case SprueDesignSource::MaximumLimit: return "maximum-limit";
  }
  return "equation";
}

std::optional<double> normalizeSprueDiameterMm(double d, double minimumCoupled) {
  if (!std::isfinite(d)) return std::nullopt;
  return std::min(kMaxSprueDiameterMm, std::max({kMinSprueDiameterMm, minimumCoupled, d}));
}

std::optional<double> normalizeSprueEntryNeckDiameterMm(double d, double maximumCoupled) {
  if (!std::isfinite(d)) return std::nullopt;
  return std::min({kMaxSprueDiameterMm, maximumCoupled, std::max(kMinSprueDiameterMm, d)});
}

bool isValidSprueProfile(const SprueProfileDimensions& p) {
  return std::isfinite(p.mainDiameterMm) && std::isfinite(p.entryNeckDiameterMm) &&
         std::isfinite(p.entryNeckLengthMm) && p.mainDiameterMm > 0 && p.entryNeckDiameterMm > 0 &&
         p.entryNeckLengthMm > 0 && p.mainDiameterMm >= p.entryNeckDiameterMm;
}

std::optional<double> calculateEquivalentDiameterMm(double volume) {
  if (!positiveFinite(volume)) return std::nullopt;
  const double d = std::cbrt(6 * volume / M_PI);
  return positiveFinite(d) ? std::optional<double>(d) : std::nullopt;
}

bool isValidSprueGeometryPolicy(const SprueGeometryPolicy& p) {
  const double values[] = {p.mainDiameterRatio,           p.minimumMainDiameterMm,
                           p.maximumMainDiameterMm,       p.entryNeckDiameterRatio,
                           p.minimumEntryNeckDiameterMm,  p.maximumEntryNeckDiameterMm,
                           p.entryNeckLengthToDiameterRatio, p.minimumEntryNeckLengthMm,
                           p.maximumEntryNeckLengthMm,    p.maximumEntryNeckLengthShare};
  for (double v : values) {
    if (!positiveFinite(v)) return false;
  }
  return p.minimumMainDiameterMm <= p.maximumMainDiameterMm &&
         p.minimumEntryNeckDiameterMm <= p.maximumEntryNeckDiameterMm &&
         p.minimumEntryNeckLengthMm <= p.maximumEntryNeckLengthMm && p.entryNeckDiameterRatio <= 1 &&
         p.maximumEntryNeckLengthShare <= 1;
}

std::optional<double> calculateCavityAspectRatio(const SprueCavityBoundsDimensions& b) {
  const double dims[] = {b.xLengthMm, b.yLengthMm, b.zLengthMm};
  for (double d : dims) {
    if (!positiveFinite(d)) return std::nullopt;
  }
  const double ratio = std::max({dims[0], dims[1], dims[2]}) / std::min({dims[0], dims[1], dims[2]});
  return std::isfinite(ratio) && ratio >= 1 ? std::optional<double>(ratio) : std::nullopt;
}

std::optional<SprueGeometryContext> buildSprueGeometryContext(const SprueGeometryContextInput& in) {
  if (!positiveFinite(in.totalSprueLengthMm)) return std::nullopt;
  const auto equivalent = calculateEquivalentDiameterMm(in.cavityVolumeMm3);
  if (!equivalent) return std::nullopt;
  const auto aspect = calculateCavityAspectRatio(in.cavityBounds);
  if (!aspect) return std::nullopt;
  SprueGeometryContext context;
  context.cavityVolumeMm3 = in.cavityVolumeMm3;
  context.cavityBounds = in.cavityBounds;
  context.totalSprueLengthMm = in.totalSprueLengthMm;
  context.equivalentDiameterMm = *equivalent;
  context.aspectRatio = *aspect;
  return context;
}

std::optional<SprueScalarDesign> designMainSprueDiameterMm(const SprueGeometryContext& context,
                                                           const SprueGeometryPolicy& policy) {
  if (!isValidSprueGeometryPolicy(policy) || !positiveFinite(context.equivalentDiameterMm)) {
    return std::nullopt;
  }
  const double unconstrained = context.equivalentDiameterMm * policy.mainDiameterRatio;
  if (!positiveFinite(unconstrained)) return std::nullopt;
  if (unconstrained < policy.minimumMainDiameterMm) {
    return SprueScalarDesign{policy.minimumMainDiameterMm, unconstrained, SprueDesignSource::MinimumLimit};
  }
  if (unconstrained > policy.maximumMainDiameterMm) {
    return SprueScalarDesign{policy.maximumMainDiameterMm, unconstrained, SprueDesignSource::MaximumLimit};
  }
  return SprueScalarDesign{unconstrained, unconstrained, SprueDesignSource::Equation};
}

std::optional<SprueScalarDesign> designEntryNeckDiameterMm(double mainDiameterMm,
                                                           const SprueGeometryPolicy& policy) {
  if (!isValidSprueGeometryPolicy(policy) || !positiveFinite(mainDiameterMm)) return std::nullopt;
  const double unconstrained = mainDiameterMm * policy.entryNeckDiameterRatio;
  if (!positiveFinite(unconstrained)) return std::nullopt;
  if (unconstrained < policy.minimumEntryNeckDiameterMm) {
    return SprueScalarDesign{std::min(mainDiameterMm, policy.minimumEntryNeckDiameterMm), unconstrained,
                             SprueDesignSource::MinimumLimit};
  }
  if (unconstrained > policy.maximumEntryNeckDiameterMm) {
    return SprueScalarDesign{std::min(mainDiameterMm, policy.maximumEntryNeckDiameterMm), unconstrained,
                             SprueDesignSource::MaximumLimit};
  }
  return SprueScalarDesign{std::min(mainDiameterMm, unconstrained), unconstrained, SprueDesignSource::Equation};
}

std::optional<SprueScalarDesign> designEntryNeckLengthMm(const SprueGeometryContext& context,
                                                         const SprueScalarDesign& main,
                                                         const SprueScalarDesign& neck,
                                                         const SprueGeometryPolicy& policy) {
  if (!isValidSprueGeometryPolicy(policy) || !positiveFinite(context.totalSprueLengthMm) ||
      !positiveFinite(main.valueMm) || !positiveFinite(neck.valueMm) || neck.valueMm > main.valueMm) {
    return std::nullopt;
  }
  const double unconstrained = neck.valueMm * policy.entryNeckLengthToDiameterRatio;
  if (!positiveFinite(unconstrained)) return std::nullopt;
  const double effectiveMaximum = std::min(policy.maximumEntryNeckLengthMm,
                                           context.totalSprueLengthMm * policy.maximumEntryNeckLengthShare);
  if (!positiveFinite(effectiveMaximum)) return std::nullopt;
  if (effectiveMaximum < policy.minimumEntryNeckLengthMm) {
    return SprueScalarDesign{effectiveMaximum, unconstrained, SprueDesignSource::MaximumLimit};
  }
  if (unconstrained < policy.minimumEntryNeckLengthMm) {
    return SprueScalarDesign{policy.minimumEntryNeckLengthMm, unconstrained, SprueDesignSource::MinimumLimit};
  }
  if (unconstrained > effectiveMaximum) {
    return SprueScalarDesign{effectiveMaximum, unconstrained, SprueDesignSource::MaximumLimit};
  }
  return SprueScalarDesign{unconstrained, unconstrained, SprueDesignSource::Equation};
}

SprueProfileDesignResult designSprueProfile(const std::optional<SprueGeometryContext>& context,
                                            const SprueGeometryPolicy& policy) {
  if (!context) return fallbackResult("Sprue geometry context is unavailable. Default profile applied.");
  const auto main = designMainSprueDiameterMm(*context, policy);
  if (!main) return fallbackResult("Main sprue diameter design failed. Default profile applied.");
  const auto neckDiameter = designEntryNeckDiameterMm(main->valueMm, policy);
  if (!neckDiameter) return fallbackResult("Entry neck diameter design failed. Default profile applied.");
  const auto neckLength = designEntryNeckLengthMm(*context, *main, *neckDiameter, policy);
  if (!neckLength) return fallbackResult("Entry neck length design failed. Default profile applied.");
  const SprueProfileDimensions profile{main->valueMm, neckDiameter->valueMm, neckLength->valueMm};
  if (!isValidSprueProfile(profile)) {
    return fallbackResult("Geometry-derived sprue profile is invalid. Default profile applied.");
  }
  SprueProfileDesignResult result;
  result.profile = profile;
  result.source = "geometry-derived";
  result.mainSection = main;
  result.entryNeckDiameter = neckDiameter;
  result.entryNeckLength = neckLength;
  return result;
}

SprueIntegrationResult resolveSprueIntegration(const SprueGeometryContextInput& input) {
  SprueIntegrationResult result;
  result.context = buildSprueGeometryContext(input);
  result.design = designSprueProfile(result.context);
  return result;
}

}  // namespace craft
