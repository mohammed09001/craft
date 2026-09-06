import type { PartBoundingBoxFaceId } from "../split-face/splitFace.contracts";

export interface AuthoritativeMoldFrame {
  readonly frameId: string;
  readonly version: 1;
  readonly units: "millimeters";
  readonly upAxis: "Z";
  readonly partOffset: { readonly x: number; readonly y: number; readonly z: number };
  readonly semanticFaces: Readonly<Record<PartBoundingBoxFaceId, {
    readonly axis: "x" | "y" | "z";
    readonly direction: -1 | 1;
  }>>;
}

export interface ReferenceMoldDefinition {
  readonly schemaVersion: 1;
  readonly definitionId: string;
  readonly modelId: string;
  readonly coordinateSystem: { readonly units: "millimeters"; readonly upAxis: "Z" };
  readonly selectionBoxBounds: {
    readonly min: { readonly x: number; readonly y: number; readonly z: number };
    readonly max: { readonly x: number; readonly y: number; readonly z: number };
  };
  readonly referenceMoldBlock: {
    readonly clearanceMm: number;
    readonly bounds: ReferenceMoldDefinition["selectionBoxBounds"];
  };
  /**
   * False only for a definition synthesized from Segmentation's committed
   * bodies (see `adoptCommittedSegmentationResult`), whose bodies are
   * irregular part-derived pieces, not an exact partition of a rectangular
   * reference block. Cut by Face never sets this -- its moldBodies always
   * partition `referenceMoldBlock.bounds` exactly, and omitting the field
   * (undefined) keeps that invariant checked by default.
   */
  readonly moldBodiesPartitionReferenceBlock?: boolean;
  /**
   * True once a definition descends from a Segmentation-promoted result
   * (see `adoptCommittedSegmentationResult`) -- either its original
   * committed bodies, or a Mold Scale rebuild of a truthful unsegmented K2
   * base derived from it -- and therefore has no face-cutting planes of its
   * own to partition with. Distinct from `moldBodiesPartitionReferenceBlock`,
   * which describes only the *current* moldBodies' shape (irregular
   * segmented pieces vs. an exact K2 partition, which the rebuilt whole-
   * block base trivially satisfies as one piece); this flag instead governs
   * *how* to rebuild moldBodies under a new clearance, and must stay `true`
   * across repeated Mold Scale edits even once the first rebuild has
   * already replaced the irregular segmented pieces. Cut by Face and Manual
   * neither of which is segmentation-promoted, never set this.
   */
  readonly segmentationLineage?: boolean;
  /**
   * The final manufactured coordinate frame. Older serialized/test fixtures
   * may omit it; newly generated definitions always provide it.
   */
  readonly moldFrame?: AuthoritativeMoldFrame;
  readonly usedFaces: readonly PartBoundingBoxFaceId[];
  readonly moldBodies?: readonly import("./orthogonalMold").MoldBodyData[] | undefined;
  readonly selectedFaceIds?: readonly PartBoundingBoxFaceId[] | undefined;
  readonly registrationFeatures?: readonly import("../registration").RegistrationFeature[] | undefined;
  readonly sprues?: readonly import("../sprue-generation").SpruePresentationDefinition[] | undefined;
}
