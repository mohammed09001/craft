import { describe, expect, it } from 'vitest';

import { completePullDirection } from './pullDirectionCompletion';

describe('Pull Direction Completion', () => {
  it('selects the highest ranked pull direction and returns a Good status', () => {
    const result = completePullDirection([
      {
        id: 'candidate-z',
        direction: [0, 0, 1],
        rank: 1,
        score: 91,
      },
      {
        id: 'candidate-x',
        direction: [1, 0, 0],
        rank: 2,
        score: 74,
      },
    ]);

    expect(result.selectedCandidate?.id).toBe('candidate-z');
    expect(result.confidenceScore).toBe(91);
    expect(result.status).toBe('Good');
    expect(result.warnings).toEqual([]);
  });

  it('returns Review when the selected direction is usable but not strong enough', () => {
    const result = completePullDirection([
      {
        id: 'candidate-y',
        direction: [0, 1, 0],
        score: 68,
      },
    ]);

    expect(result.selectedCandidate?.id).toBe('candidate-y');
    expect(result.confidenceScore).toBe(68);
    expect(result.status).toBe('Review');
    expect(result.warnings).toContain(
      'Pull direction should be reviewed before final mold generation.',
    );
  });

  it('returns Poor when no valid candidate is available', () => {
    const result = completePullDirection([
      {
        id: 'invalid-candidate',
        direction: [0, 0, 1],
        score: 95,
        isValid: false,
      },
    ]);

    expect(result.selectedCandidate).toBeNull();
    expect(result.confidenceScore).toBe(0);
    expect(result.status).toBe('Poor');
    expect(result.warnings).toEqual([
      'No valid pull direction candidates are available.',
    ]);
  });

  it('warns when the best candidate is close to the runner up', () => {
    const result = completePullDirection([
      {
        id: 'candidate-a',
        direction: [0, 0, 1],
        rank: 1,
        score: 84,
      },
      {
        id: 'candidate-b',
        direction: [0, 1, 0],
        rank: 2,
        score: 80,
      },
    ]);

    expect(result.status).toBe('Good');
    expect(result.warnings).toContain(
      'Top pull direction is close to another candidate; manual review is recommended.',
    );
  });
});
