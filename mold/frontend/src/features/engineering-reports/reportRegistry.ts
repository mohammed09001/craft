import type {
  EngineeringReportCategory,
  EngineeringReportDefinition,
  EngineeringReportDiscoverOptions,
  EngineeringReportId,
  EngineeringReportManifestItem,
  EngineeringReportRegistry,
  EngineeringReportSupportStatus,
  EngineeringReportType,
} from './reportRegistry.types';

const supportedCategories = new Set<EngineeringReportCategory>([
  'moldability',
  'geometry',
  'manufacturing',
  'quality',
  'diagnostics',
  'other',
]);

const supportedStatuses = new Set<EngineeringReportSupportStatus>([
  'coming-soon',
  'supported',
  'experimental',
  'hidden',
  'deprecated',
]);

const normalizeKey = (value: string): string => value.trim().toLowerCase();

const assertNonEmptyString = (name: string, value: string): void => {
  if (value.trim().length === 0) {
    throw new Error(`Engineering report ${name} must be a non-empty string.`);
  }
};

const assertValidDefinition = (
  definition: EngineeringReportDefinition,
): void => {
  assertNonEmptyString('id', definition.id);
  assertNonEmptyString('type', definition.type);
  assertNonEmptyString('displayName', definition.displayName);
  assertNonEmptyString('description', definition.description);
  assertNonEmptyString('version', definition.version);

  if (!supportedCategories.has(definition.category)) {
    throw new Error(`Unsupported engineering report category: ${definition.category}`);
  }

  if (!supportedStatuses.has(definition.supportStatus)) {
    throw new Error(`Unsupported engineering report status: ${definition.supportStatus}`);
  }

  if (!Number.isFinite(definition.displayOrder)) {
    throw new Error('Engineering report displayOrder must be a finite number.');
  }
};

const freezeDefinition = (
  definition: EngineeringReportDefinition,
): EngineeringReportDefinition => {
  const frozenDefinition: EngineeringReportDefinition = {
    id: definition.id,
    type: definition.type,
    displayName: definition.displayName,
    description: definition.description,
    category: definition.category,
    displayOrder: definition.displayOrder,
    visible: definition.visible,
    supportStatus: definition.supportStatus,
    version: definition.version,
    ...(definition.icon ? { icon: definition.icon } : {}),
    ...(definition.metadata
      ? { metadata: Object.freeze({ ...definition.metadata }) }
      : {}),
  };

  return Object.freeze(frozenDefinition);
};

const toManifestItem = (
  definition: EngineeringReportDefinition,
): EngineeringReportManifestItem => {
  const manifestItem: EngineeringReportManifestItem = {
    id: definition.id,
    type: definition.type,
    displayName: definition.displayName,
    description: definition.description,
    category: definition.category,
    displayOrder: definition.displayOrder,
    visible: definition.visible,
    supportStatus: definition.supportStatus,
    version: definition.version,
    ...(definition.icon ? { icon: definition.icon } : {}),
    ...(definition.metadata
      ? { metadata: Object.freeze({ ...definition.metadata }) }
      : {}),
  };

  return Object.freeze(manifestItem);
};

const sortReports = (
  reports: readonly EngineeringReportDefinition[],
): readonly EngineeringReportDefinition[] => {
  return Object.freeze(
    [...reports].sort((left, right) => {
      if (left.displayOrder !== right.displayOrder) {
        return left.displayOrder - right.displayOrder;
      }

      return left.displayName.localeCompare(right.displayName);
    }),
  );
};

export const createEngineeringReportRegistry = (
  initialDefinitions: readonly EngineeringReportDefinition[] = [],
): EngineeringReportRegistry => {
  const reportsById = new Map<string, EngineeringReportDefinition>();
  const reportsByType = new Map<string, EngineeringReportDefinition>();

  const addDefinition = (definition: EngineeringReportDefinition): void => {
    assertValidDefinition(definition);

    const normalizedId = normalizeKey(definition.id);
    const normalizedType = normalizeKey(definition.type);

    if (reportsById.has(normalizedId)) {
      throw new Error(`Duplicate engineering report id registered: ${definition.id}`);
    }

    if (reportsByType.has(normalizedType)) {
      throw new Error(`Duplicate engineering report type registered: ${definition.type}`);
    }

    const frozenDefinition = freezeDefinition(definition);

    reportsById.set(normalizedId, frozenDefinition);
    reportsByType.set(normalizedType, frozenDefinition);
  };

  for (const definition of initialDefinitions) {
    addDefinition(definition);
  }

  const discover = (
    options: EngineeringReportDiscoverOptions = {},
  ): readonly EngineeringReportDefinition[] => {
    const reports = [...reportsById.values()].filter((report) => {
      if (options.category && report.category !== options.category) {
        return false;
      }

      if (!options.includeHidden) {
        return report.visible && report.supportStatus !== 'hidden';
      }

      return true;
    });

    return sortReports(reports);
  };

  const registry: EngineeringReportRegistry = Object.freeze({
    register(
      definition: EngineeringReportDefinition,
    ): EngineeringReportRegistry {
      return createEngineeringReportRegistry([
        ...reportsById.values(),
        definition,
      ]);
    },

    discover,

    getById(
      id: EngineeringReportId,
    ): EngineeringReportDefinition | undefined {
      return reportsById.get(normalizeKey(id));
    },

    getByType(
      type: EngineeringReportType,
    ): EngineeringReportDefinition | undefined {
      return reportsByType.get(normalizeKey(type));
    },

    getByCategory(
      category: EngineeringReportCategory,
      options: Omit<EngineeringReportDiscoverOptions, 'category'> = {},
    ): readonly EngineeringReportDefinition[] {
      return discover({
        ...options,
        category,
      });
    },

    getVisible(): readonly EngineeringReportDefinition[] {
      return discover();
    },

    toManifest(
      options: EngineeringReportDiscoverOptions = {},
    ): readonly EngineeringReportManifestItem[] {
      return Object.freeze(discover(options).map(toManifestItem));
    },
  });

  return registry;
};
