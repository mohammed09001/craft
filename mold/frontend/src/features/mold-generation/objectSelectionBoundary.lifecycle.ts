import type {
  FaceInteractionState,
  FaceSelectionMode,
  ObjectSelectionBoundaryReasonCode,
  ObjectSelectionBoundarySource,
  SelectionBoundaryInput,
  SelectionBoundaryWarning,
  SelectionBounds3,
  SelectionBoundsValidationResult,
  SelectionInteractionSnapshot,
  SelectionVector3,
} from './objectSelectionBoundary.contracts';

const DEFAULT_FACE_SELECTION_MODE: FaceSelectionMode = 'replace';

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

const isValidVector = (value: SelectionVector3 | undefined): value is SelectionVector3 =>
  value !== undefined &&
  isFiniteNumber(value.x) &&
  isFiniteNumber(value.y) &&
  isFiniteNumber(value.z);

const cloneVector = (value: SelectionVector3): SelectionVector3 => ({
  x: value.x,
  y: value.y,
  z: value.z,
});

const normalizeId = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
};

const uniqueIds = (values: readonly string[] | null | undefined): readonly string[] => {
  if (!values) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => normalizeId(value))
        .filter((value): value is string => value !== null),
    ),
  );
};

const uniqueReasonCodes = (
  reasonCodes: readonly ObjectSelectionBoundaryReasonCode[],
): readonly ObjectSelectionBoundaryReasonCode[] => Array.from(new Set(reasonCodes));

const createWarning = (
  code: ObjectSelectionBoundaryReasonCode,
  message: string,
  source: ObjectSelectionBoundarySource,
): SelectionBoundaryWarning => ({
  code,
  message,
  source,
});

const getBoundsSize = (bounds: SelectionBounds3): SelectionVector3 => ({
  x: bounds.max.x - bounds.min.x,
  y: bounds.max.y - bounds.min.y,
  z: bounds.max.z - bounds.min.z,
});

const getBoundsCenter = (bounds: SelectionBounds3): SelectionVector3 => ({
  x: (bounds.min.x + bounds.max.x) / 2,
  y: (bounds.min.y + bounds.max.y) / 2,
  z: (bounds.min.z + bounds.max.z) / 2,
});

export const validateSelectionBounds = (
  objectBounds: SelectionBounds3 | null | undefined,
  source: ObjectSelectionBoundarySource = 'uploaded_model_bounds',
): SelectionBoundsValidationResult => {
  if (objectBounds === null || objectBounds === undefined) {
    return {
      isValid: false,
      objectSelectionBounds: null,
      validity: 'missing_bounds',
      warnings: [
        createWarning(
          'missing_object_bounds',
          'Object selection bounds are unavailable because uploaded object bounds are missing.',
          'missing_model_bounds',
        ),
      ],
      reasonCodes: ['missing_object_bounds'],
    };
  }

  if (!isValidVector(objectBounds.min) || !isValidVector(objectBounds.max)) {
    return {
      isValid: false,
      objectSelectionBounds: null,
      validity: 'invalid_bounds',
      warnings: [
        createWarning(
          'invalid_object_bounds',
          'Object selection bounds are unavailable because uploaded object bounds are invalid.',
          'invalid_model_bounds',
        ),
      ],
      reasonCodes: ['invalid_object_bounds'],
    };
  }

  const size = getBoundsSize(objectBounds);
  const hasOrderedBounds = size.x >= 0 && size.y >= 0 && size.z >= 0;
  const hasDisplayableSize = size.x > 0 || size.y > 0 || size.z > 0;

  if (!hasOrderedBounds || !hasDisplayableSize) {
    const reasonCode: ObjectSelectionBoundaryReasonCode = hasOrderedBounds
      ? 'zero_size_object_bounds'
      : 'invalid_object_bounds';

    return {
      isValid: false,
      objectSelectionBounds: null,
      validity: 'invalid_bounds',
      warnings: [
        createWarning(
          reasonCode,
          'Object selection bounds are unavailable because uploaded object bounds are not usable.',
          'invalid_model_bounds',
        ),
      ],
      reasonCodes: [reasonCode],
    };
  }

  return {
    isValid: true,
    objectSelectionBounds: {
      boundsMin: cloneVector(objectBounds.min),
      boundsMax: cloneVector(objectBounds.max),
      center: getBoundsCenter(objectBounds),
      size,
      source,
    },
    validity: 'valid',
    warnings: [],
    reasonCodes: ['object_selection_bounds_ready'],
  };
};

const createFaceInteractionState = (
  input: SelectionBoundaryInput,
): FaceInteractionState => {
  const hoveredFaceId = normalizeId(input.hoveredFaceId);
  const focusedFaceId = normalizeId(input.focusedFaceId);
  const selectedFaceIds = uniqueIds(input.selectedFaceIds);

  return {
    hoveredFaceId,
    selectedFaceIds,
    focusedFaceId,
    selectedRegionIds: uniqueIds(input.selectedRegionIds),
    interactionMode: focusedFaceId === null ? 'object_selection' : 'face_focus',
    faceSelectionMode: input.faceSelectionMode ?? DEFAULT_FACE_SELECTION_MODE,
    source: input.source ?? 'selection_state',
  };
};

export const buildObjectSelectionBoundarySnapshot = (
  input: SelectionBoundaryInput = {},
): SelectionInteractionSnapshot => {
  const uploadedObjectId = normalizeId(input.objectId);
  const selectedObjectId = normalizeId(input.selectedObjectId);
  const source = input.source ?? 'selection_state';
  const reasonCodes: ObjectSelectionBoundaryReasonCode[] = [];
  const warnings: SelectionBoundaryWarning[] = [];

  if (uploadedObjectId === null) {
    reasonCodes.push('uploaded_object_missing');
  } else {
    reasonCodes.push('uploaded_object_available');
  }

  if (selectedObjectId === null) {
    reasonCodes.push('object_not_selected');
  } else {
    reasonCodes.push('selected_object_available');
  }

  if (selectedObjectId !== null && uploadedObjectId === null) {
    reasonCodes.push('selected_object_missing');
    warnings.push(
      createWarning(
        'selected_object_missing',
        'Selected object state is ignored because no uploaded object is available.',
        source,
      ),
    );
  }

  if (
    selectedObjectId !== null &&
    uploadedObjectId !== null &&
    selectedObjectId !== uploadedObjectId
  ) {
    reasonCodes.push('selected_object_mismatch');
    warnings.push(
      createWarning(
        'selected_object_mismatch',
        'Selected object state is ignored because it does not match the uploaded object.',
        source,
      ),
    );
  }

  const isObjectSelected =
    selectedObjectId !== null &&
    uploadedObjectId !== null &&
    selectedObjectId === uploadedObjectId;

  const boundsValidation = isObjectSelected
    ? validateSelectionBounds(input.objectBounds, 'uploaded_model_bounds')
    : null;

  if (boundsValidation !== null) {
    reasonCodes.push(...boundsValidation.reasonCodes);
    warnings.push(...boundsValidation.warnings);
  }

  const faceInteraction = createFaceInteractionState(input);

  if (faceInteraction.hoveredFaceId === null) {
    reasonCodes.push('face_hover_cleared');
  } else {
    reasonCodes.push('face_hover_available');
  }

  if (faceInteraction.selectedFaceIds.length === 0) {
    reasonCodes.push('face_selection_empty');
  } else {
    reasonCodes.push('face_selection_available');
  }

  if (faceInteraction.focusedFaceId === null) {
    reasonCodes.push('face_focus_cleared');
  } else {
    reasonCodes.push('face_focus_available');
  }

  return {
    uploadedObjectId,
    selectedObjectId: isObjectSelected ? selectedObjectId : null,
    isObjectSelected,
    objectSelectionBounds: boundsValidation?.objectSelectionBounds ?? null,
    validity: isObjectSelected ? (boundsValidation?.validity ?? 'invalid_bounds') : 'inactive',
    source,
    warnings,
    reasonCodes: uniqueReasonCodes(reasonCodes),
    faceInteraction,
  };
};

export const createUnselectedObjectSelectionState = (
  input: Omit<SelectionBoundaryInput, 'selectedObjectId'> = {},
): SelectionInteractionSnapshot =>
  buildObjectSelectionBoundarySnapshot({
    ...input,
    selectedObjectId: null,
  });

export const createSelectedObjectSelectionState = (
  input: Omit<SelectionBoundaryInput, 'selectedObjectId'>,
): SelectionInteractionSnapshot =>
  buildObjectSelectionBoundarySnapshot({
    ...input,
    selectedObjectId: input.objectId ?? null,
  });

export const normalizeInteractiveSelectionState = (
  input: SelectionBoundaryInput,
): SelectionInteractionSnapshot => buildObjectSelectionBoundarySnapshot(input);

const withFaceInteraction = (
  state: SelectionInteractionSnapshot,
  faceInteraction: FaceInteractionState,
  reasonCode: ObjectSelectionBoundaryReasonCode,
): SelectionInteractionSnapshot => ({
  ...state,
  reasonCodes: uniqueReasonCodes([...state.reasonCodes, reasonCode]),
  faceInteraction,
});

export const updateHoveredFace = (
  state: SelectionInteractionSnapshot,
  faceId: string | null | undefined,
): SelectionInteractionSnapshot => {
  const hoveredFaceId = normalizeId(faceId);

  return withFaceInteraction(
    state,
    {
      ...state.faceInteraction,
      hoveredFaceId,
      source: 'selection_state',
    },
    hoveredFaceId === null ? 'face_hover_cleared' : 'face_hover_available',
  );
};

export const clearHoveredFace = (
  state: SelectionInteractionSnapshot,
): SelectionInteractionSnapshot => updateHoveredFace(state, null);

export const selectFace = (
  state: SelectionInteractionSnapshot,
  faceId: string | null | undefined,
  mode: FaceSelectionMode = state.faceInteraction.faceSelectionMode,
): SelectionInteractionSnapshot => {
  const normalizedFaceId = normalizeId(faceId);
  const selectedFaceIds =
    normalizedFaceId === null
      ? []
      : mode === 'additive'
        ? uniqueIds([...state.faceInteraction.selectedFaceIds, normalizedFaceId])
        : [normalizedFaceId];

  return withFaceInteraction(
    state,
    {
      ...state.faceInteraction,
      selectedFaceIds,
      faceSelectionMode: mode,
      source: 'selection_state',
    },
    selectedFaceIds.length === 0 ? 'face_selection_empty' : 'face_selection_available',
  );
};

export const setSelectedFaces = (
  state: SelectionInteractionSnapshot,
  faceIds: readonly string[] | null | undefined,
): SelectionInteractionSnapshot => {
  const selectedFaceIds = uniqueIds(faceIds);

  return withFaceInteraction(
    state,
    {
      ...state.faceInteraction,
      selectedFaceIds,
      source: 'selection_state',
    },
    selectedFaceIds.length === 0 ? 'face_selection_empty' : 'face_selection_available',
  );
};

export const focusFace = (
  state: SelectionInteractionSnapshot,
  faceId: string | null | undefined,
): SelectionInteractionSnapshot => {
  const focusedFaceId = normalizeId(faceId);

  return withFaceInteraction(
    state,
    {
      ...state.faceInteraction,
      focusedFaceId,
      interactionMode: focusedFaceId === null ? 'object_selection' : 'face_focus',
      source: 'selection_state',
    },
    focusedFaceId === null ? 'returned_to_object_selection' : 'face_focus_available',
  );
};

export const clearFaceFocus = (
  state: SelectionInteractionSnapshot,
): SelectionInteractionSnapshot => focusFace(state, null);
