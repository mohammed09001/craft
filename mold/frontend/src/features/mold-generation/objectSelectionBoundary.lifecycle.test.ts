import { describe, expect, it } from 'vitest';

import {
  buildObjectSelectionBoundarySnapshot,
  clearFaceFocus,
  clearHoveredFace,
  createSelectedObjectSelectionState,
  createUnselectedObjectSelectionState,
  focusFace,
  normalizeInteractiveSelectionState,
  selectFace,
  setSelectedFaces,
  updateHoveredFace,
  validateSelectionBounds,
  type SelectionBounds3,
} from './index';

const objectBounds: SelectionBounds3 = {
  min: { x: -10, y: -5, z: 0 },
  max: { x: 30, y: 15, z: 12 },
};

describe('object selection boundary lifecycle', () => {
  it('represents an uploaded object that is not selected without active bounds or faces', () => {
    const snapshot = createUnselectedObjectSelectionState({
      objectId: 'part-1',
      objectBounds,
    });

    expect(snapshot.uploadedObjectId).toBe('part-1');
    expect(snapshot.selectedObjectId).toBeNull();
    expect(snapshot.isObjectSelected).toBe(false);
    expect(snapshot.objectSelectionBounds).toBeNull();
    expect(snapshot.validity).toBe('inactive');
    expect(snapshot.faceInteraction).toMatchObject({
      hoveredFaceId: null,
      selectedFaceIds: [],
      focusedFaceId: null,
      interactionMode: 'object_selection',
    });
    expect(snapshot.reasonCodes).toContain('object_not_selected');
  });

  it('creates selected object bounds that exactly match uploaded model bounds', () => {
    const snapshot = createSelectedObjectSelectionState({
      objectId: 'part-1',
      objectBounds,
    });

    expect(snapshot.selectedObjectId).toBe('part-1');
    expect(snapshot.isObjectSelected).toBe(true);
    expect(snapshot.validity).toBe('valid');
    expect(snapshot.objectSelectionBounds).toEqual({
      boundsMin: objectBounds.min,
      boundsMax: objectBounds.max,
      center: { x: 10, y: 5, z: 6 },
      size: { x: 40, y: 20, z: 12 },
      source: 'uploaded_model_bounds',
    });
    expect(snapshot.reasonCodes).toContain('object_selection_bounds_ready');
  });

  it('treats missing or invalid bounds as a safe non-crashing fallback', () => {
    const missing = createSelectedObjectSelectionState({ objectId: 'part-1' });
    const invalid = createSelectedObjectSelectionState({
      objectId: 'part-1',
      objectBounds: {
        min: { x: 2, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 },
      },
    });

    expect(missing.isObjectSelected).toBe(true);
    expect(missing.objectSelectionBounds).toBeNull();
    expect(missing.validity).toBe('missing_bounds');
    expect(missing.reasonCodes).toContain('missing_object_bounds');
    expect(missing.warnings[0]?.code).toBe('missing_object_bounds');

    expect(invalid.objectSelectionBounds).toBeNull();
    expect(invalid.validity).toBe('invalid_bounds');
    expect(invalid.reasonCodes).toContain('invalid_object_bounds');
  });

  it('keeps selection bounds as object bounds only without margins or generated geometry', () => {
    const snapshot = createSelectedObjectSelectionState({
      objectId: 'part-1',
      objectBounds,
    });
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.objectSelectionBounds?.boundsMin).toEqual(objectBounds.min);
    expect(snapshot.objectSelectionBounds?.boundsMax).toEqual(objectBounds.max);
    expect(serialized).not.toContain('margin');
    expect(serialized).not.toContain('clearance');
    expect(serialized).not.toContain('offset');

    for (const forbiddenKey of [
      'moldEnvelope',
      'moldBlock',
      'cavity',
      'core',
      'm1',
      'm2',
      'parting',
      'openingPreview',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(snapshot, forbiddenKey)).toBe(false);
      expect(serialized).not.toContain(forbiddenKey);
    }
  });

  it('validates bounds without expanding or inventing selection data', () => {
    const valid = validateSelectionBounds(objectBounds);
    const zeroSize = validateSelectionBounds({
      min: { x: 1, y: 1, z: 1 },
      max: { x: 1, y: 1, z: 1 },
    });

    expect(valid.isValid).toBe(true);
    expect(valid.objectSelectionBounds?.boundsMin).toEqual(objectBounds.min);
    expect(valid.objectSelectionBounds?.boundsMax).toEqual(objectBounds.max);
    expect(zeroSize.isValid).toBe(false);
    expect(zeroSize.reasonCodes).toContain('zero_size_object_bounds');
  });

  it('normalizes face state for none, hover, and selected faces', () => {
    const snapshot = normalizeInteractiveSelectionState({
      objectId: 'part-1',
      selectedObjectId: 'part-1',
      objectBounds,
      hoveredFaceId: ' face-a ',
      selectedFaceIds: ['face-b', '', 'face-b', 'face-c'],
    });

    expect(snapshot.faceInteraction.hoveredFaceId).toBe('face-a');
    expect(snapshot.faceInteraction.selectedFaceIds).toEqual(['face-b', 'face-c']);
    expect(snapshot.faceInteraction.focusedFaceId).toBeNull();
    expect(snapshot.reasonCodes).toContain('face_hover_available');
    expect(snapshot.reasonCodes).toContain('face_selection_available');

    const withoutFaces = setSelectedFaces(snapshot, []);

    expect(withoutFaces.faceInteraction.selectedFaceIds).toEqual([]);
    expect(withoutFaces.reasonCodes).toContain('face_selection_empty');
  });

  it('updates hovered face repeatedly without clearing object selection', () => {
    const selected = createSelectedObjectSelectionState({
      objectId: 'part-1',
      objectBounds,
    });
    const firstHover = updateHoveredFace(selected, 'face-a');
    const secondHover = updateHoveredFace(firstHover, 'face-b');
    const clearedHover = clearHoveredFace(secondHover);

    expect(firstHover.faceInteraction.hoveredFaceId).toBe('face-a');
    expect(secondHover.faceInteraction.hoveredFaceId).toBe('face-b');
    expect(clearedHover.faceInteraction.hoveredFaceId).toBeNull();
    expect(clearedHover.selectedObjectId).toBe('part-1');
    expect(clearedHover.objectSelectionBounds).toBe(selected.objectSelectionBounds);
  });

  it('selects faces as empty, replaced, or additive repeatable state', () => {
    const selected = createSelectedObjectSelectionState({
      objectId: 'part-1',
      objectBounds,
    });
    const emptySelection = selectFace(selected, null);
    const firstSelection = selectFace(emptySelection, 'face-a');
    const replacedSelection = selectFace(firstSelection, 'face-b');
    const additiveSelection = selectFace(replacedSelection, 'face-c', 'additive');

    expect(emptySelection.faceInteraction.selectedFaceIds).toEqual([]);
    expect(firstSelection.faceInteraction.selectedFaceIds).toEqual(['face-a']);
    expect(replacedSelection.faceInteraction.selectedFaceIds).toEqual(['face-b']);
    expect(additiveSelection.faceInteraction.selectedFaceIds).toEqual([
      'face-b',
      'face-c',
    ]);
  });

  it('changes and clears face focus while preserving object selection and bounds', () => {
    const selected = createSelectedObjectSelectionState({
      objectId: 'part-1',
      objectBounds,
    });
    const firstFocus = focusFace(selected, 'face-a');
    const secondFocus = focusFace(firstFocus, 'face-b');
    const clearedFocus = clearFaceFocus(secondFocus);

    expect(firstFocus.faceInteraction.focusedFaceId).toBe('face-a');
    expect(firstFocus.faceInteraction.interactionMode).toBe('face_focus');
    expect(secondFocus.faceInteraction.focusedFaceId).toBe('face-b');
    expect(clearedFocus.faceInteraction.focusedFaceId).toBeNull();
    expect(clearedFocus.faceInteraction.interactionMode).toBe('object_selection');
    expect(clearedFocus.selectedObjectId).toBe('part-1');
    expect(clearedFocus.objectSelectionBounds).toBe(selected.objectSelectionBounds);
    expect(clearedFocus.reasonCodes).toContain('returned_to_object_selection');
  });

  it('supports repeated focus-to-object-selection loops without a terminal state', () => {
    let snapshot = buildObjectSelectionBoundarySnapshot({
      objectId: 'part-1',
      selectedObjectId: 'part-1',
      objectBounds,
    });
    const stableBounds = snapshot.objectSelectionBounds;

    for (const faceId of ['face-a', 'face-b', 'face-c']) {
      snapshot = updateHoveredFace(snapshot, faceId);
      snapshot = selectFace(snapshot, faceId);
      snapshot = focusFace(snapshot, faceId);
      expect(snapshot.faceInteraction.interactionMode).toBe('face_focus');

      snapshot = clearFaceFocus(snapshot);
      snapshot = clearHoveredFace(snapshot);
      expect(snapshot.faceInteraction.interactionMode).toBe('object_selection');
      expect(snapshot.selectedObjectId).toBe('part-1');
      expect(snapshot.objectSelectionBounds).toBe(stableBounds);
    }

    expect(snapshot.isObjectSelected).toBe(true);
    expect(snapshot.faceInteraction.selectedFaceIds).toEqual(['face-c']);
  });
});
