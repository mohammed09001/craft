import { describe, expect, it } from 'vitest';

import { getRegisteredEngineeringReportsForFrontend } from './engineeringReportRegistry.bridge';

describe('Engineering Report Registry Bridge', () => {
  it('exposes registered engineering reports to frontend integration without redefining report metadata', () => {
    const reports = getRegisteredEngineeringReportsForFrontend();

    expect(reports).toHaveLength(5);
    expect(reports.every((report) => report.supportStatus === 'coming-soon')).toBe(true);
    expect(reports.every((report) => report.version.length > 0)).toBe(true);
  });

  it('keeps reports sorted by registry display order', () => {
    const reports = getRegisteredEngineeringReportsForFrontend();

    expect(reports.map((report) => report.displayOrder)).toEqual([
      10,
      20,
      30,
      40,
      50,
    ]);
  });
});
