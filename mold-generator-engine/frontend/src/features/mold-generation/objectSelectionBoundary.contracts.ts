export const OBJECT_SELECTION_BOUNDARY_SOURCE_VALUES = [
  'uploaded_model_bounds',
  'missing_model_bounds',
  'invalid_model_bounds',
  'selection_state',
  'programmatic',
] as const;

export type ObjectSelectionBoundarySource =
  (typeof OBJECT_SELECTION_BOUNDARY_SOURCE_VALUES)[number];

export const OBJECT_SELECTION_BOUNDARY_VALIDITY_VALUES = [
  'inactive',
  'valid',
  'missing_bounds',
  'invalid_bounds',
  'missing_object',
] as const;

export type ObjectSelectionBoundaryValidity =
  (typeof OBJECT_SELECTION_BOUNDARY_VALIDITY_VALUES)[number];

export const OBJECT_SELECTION_BOUNDARY_REASON_CODES = [
  'uploaded_object_available',
  'uploaded_object_missing',
  'object_not_selected',
  'selected_object_available',
  'selected_object_missing',
  'selected_object_mismatch',
  'missing_object_bounds',
  'invalid_object_bounds',
  'zero_size_object_bounds',
  'object_selection_bounds_ready',
  'face_hover_available',
  'face_hover_cleared',
  'face_selection_available',
  'face_selection_empty',
  'face_focus_available',
  'face_focus_cleared',
  'returned_to_object_selection',
] as const;

export type ObjectSelectionBoundaryReasonCode =
  (typeof OBJECT_SELECTION_BOUNDARY_REASON_CODES)[number];

export const SELECTION_INTERACTION_MODE_VALUES = [
  'object_selection',
  'face_focus',
] as const;

export type SelectionInteractionMode =
  (typeof SELECTION_INTERACTION_MODE_VALUES)[number];

export const FACE_SELECTION_MODE_VALUES = ['replace', 'additive'] as const;

export type FaceSelectionMode = (typeof FACE_SELECTION_MODE_VALUES)[number];

export interface SelectionVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SelectionBounds3 {
  readonly min: SelectionVector3;
  readonly max: SelectionVector3;
}

export interface ObjectSelectionBounds {
  readonly boundsMin: SelectionVector3;
  readonly boundsMax: SelectionVector3;
  readonly center: SelectionVector3;
  readonly size: SelectionVector3;
  readonly source: ObjectSelectionBoundarySource;
}

export interface FaceInteractionState {
  readonly hoveredFaceId: string | null;
  readonly selectedFaceIds: readonly string[];
  readonly focusedFaceId: string | null;
  readonly selectedRegionIds: readonly string[];
  readonly interactionMode: SelectionInteractionMode;
  readonly faceSelectionMode: FaceSelectionMode;
  readonly source: ObjectSelectionBoundarySource;
}

export interface SelectionBoundaryWarning {
  readonly code: ObjectSelectionBoundaryReasonCode;
  readonly message: string;
  readonly source: ObjectSelectionBoundarySource;
}

export interface SelectionBoundaryInput {
  readonly objectId?: string | null;
  readonly selectedObjectId?: string | null;
  readonly objectBounds?: SelectionBounds3 | null;
  readonly hoveredFaceId?: string | null;
  readonly selectedFaceIds?: readonly string[] | null;
  readonly focusedFaceId?: string | null;
  readonly selectedRegionIds?: readonly string[] | null;
  readonly faceSelectionMode?: FaceSelectionMode;
  readonly source?: ObjectSelectionBoundarySource;
}

export interface SelectionInteractionSnapshot {
  readonly uploadedObjectId: string | null;
  readonly selectedObjectId: string | null;
  readonly isObjectSelected: boolean;
  readonly objectSelectionBounds: ObjectSelectionBounds | null;
  readonly validity: ObjectSelectionBoundaryValidity;
  readonly source: ObjectSelectionBoundarySource;
  readonly warnings: readonly SelectionBoundaryWarning[];
  readonly reasonCodes: readonly ObjectSelectionBoundaryReasonCode[];
  readonly faceInteraction: FaceInteractionState;
}

export interface SelectionBoundsValidationResult {
  readonly isValid: boolean;
  readonly objectSelectionBounds: ObjectSelectionBounds | null;
  readonly validity: ObjectSelectionBoundaryValidity;
  readonly warnings: readonly SelectionBoundaryWarning[];
  readonly reasonCodes: readonly ObjectSelectionBoundaryReasonCode[];
}
