import type { RegistrationManufacturingProfile, RegistrationTolerancePolicy, RegistrationToleranceResolver } from "./registration.contracts";

/**
 * Conservative, replaceable policy used until a printer profile is attached to the project.
 *
 * Alignment features are locators, not structural locks: they only need to guide assembly and resist lateral
 * drift, so they are sized noticeably smaller than a load-bearing dowel and given roomier radial clearance
 * (an easy hand-assembled slip fit, not a press fit) so they print cleanly and go together without forcing.
 */
export class DefaultRegistrationToleranceResolver implements RegistrationToleranceResolver {
  resolve(profile:RegistrationManufacturingProfile|null):RegistrationTolerancePolicy {
    const accuracy=profile?.xyAccuracyMm;
    const nozzle=profile?.nozzleDiameterMm;
    const radialClearanceMm=profile?.process==="resin"
      ?Math.max(0.15,(accuracy??0.08)*1.8)
      :Math.max(0.3,(accuracy??0.15)*1.8,(nozzle??0.4)*0.6);
    const minimumWallMm=profile?.process==="resin"
      ?Math.max(1.0,(accuracy??0.08)*8)
      :Math.max(1.2,(nozzle??0.4)*3);
    const minimumFeatureRadiusMm=profile?.process==="resin"
      ?Math.max(0.6,(accuracy??0.08)*6)
      :Math.max(0.8,(nozzle??0.4)*2);
    const maximumFeatureRadiusMm=profile===null?2.5:(profile.process==="resin"?10.0:15.0);
    return Object.freeze({
      policyId:profile===null?"registration-conservative-fdm-v1":`registration-${profile.process}-v1`,
      radialClearanceMm,booleanToleranceMm:Math.max(1e-6,(accuracy??0.05)*1e-3),minimumWallMm,
      cavitySafetyMarginMm:Math.max(1.0,minimumWallMm),outerEdgeMarginMm:Math.max(1.0,minimumWallMm),
      minimumFeatureRadiusMm,
      maximumFeatureRadiusMm,
    });
  }
}
