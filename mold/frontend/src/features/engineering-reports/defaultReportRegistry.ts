import { pullDirectionEngineeringReportDefinition } from "./pull-direction";
import { createEngineeringReportRegistry } from "./reportRegistry";
import type { EngineeringReportDefinition } from "./reportRegistry.types";

export const defaultEngineeringReportDefinitions: readonly EngineeringReportDefinition[] =
  Object.freeze([
    pullDirectionEngineeringReportDefinition,
  ]);

export const defaultEngineeringReportRegistry = createEngineeringReportRegistry(
  defaultEngineeringReportDefinitions,
);
