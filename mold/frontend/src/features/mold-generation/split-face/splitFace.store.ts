import { create, type StateCreator } from "zustand";
import { createReferenceMoldFrameBounds, DEFAULT_REFERENCE_MOLD_CLEARANCE_MM, clampReferenceMoldClearance, resolveAutomaticSegmentationMoldClearance } from "../reference-mold-definition/referenceMoldBlock.geometry";
import {
  createWholeMoldBody,
  generateMoldBodies,
} from "../reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "../reference-mold-definition/referenceMoldDefinition.contracts";
import { PART_BOUNDING_BOX_FACE_IDS, type Bounds3, type CuttingPlaneAxis, type CuttingPlaneRecord, type PartBoundingBoxFaceId, type SplitWorkflowState } from "./splitFace.contracts";
import { clampNormalizedPosition, createCuttingPlane, cuttingPlanesToCutPlaneData, normalizedToWorldCoordinate } from "./splitFace.geometry";
import { DEFAULT_CAVITY_CLEARANCE_MM, type CanonicalPartGeometry, type CavityWorkflowState } from "../cavity-generation/cavityGeneration.contracts";
import { buildCavityGenerationInput } from "../cavity-generation/cavityGeneration.input";
import { cancelActiveCavityGeneration as defaultCancelActiveCavityGeneration, runCavityGenerationInWorker as defaultRunCavityGenerationInWorker } from "../cavity-generation/cavityGeneration.workerClient";
import {
  normalizeSprueDiameterMm,
  normalizeSprueEntryNeckDiameterMm,
  type SprueDefinition,
  type SprueOperationDefinition,
  type SpruePreviewPlacement,
  type SprueProfileDesignResult,
} from "../sprue-generation";
import { AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY, unavailableRegistration, type DerivedRegistrationState, type RegistrationSizingPolicy } from "../registration";
import { applyBodyVisibility, canCommitMoldEvaluation, cancelDerivedMoldEvaluation as defaultCancelDerivedMoldEvaluation, idleMoldEvaluation, nextEvaluationRequest, runDerivedMoldEvaluation as defaultRunDerivedMoldEvaluation, type FinalMoldResult, type MoldDocument, type MoldEvaluationState } from "../workflow";
import type { MoldBodyData } from "../reference-mold-definition/orthogonalMold";

interface Snapshot { selectedFaceIds:readonly PartBoundingBoxFaceId[]; selectedSplitFaceId:PartBoundingBoxFaceId|null; cuttingPlanes:readonly CuttingPlaneRecord[]; workflow:SplitWorkflowState; definition:ReferenceMoldDefinition|null; clearanceMm:number; activePlaneId:string|null; cavity:CavityWorkflowState; partGeometrySignature:string|null; sprues:readonly SprueDefinition[]; sprueDefinitions:readonly SprueOperationDefinition[]; registration:DerivedRegistrationState; document:MoldDocument; evaluation:MoldEvaluationState; lastCommittedResult:FinalMoldResult|null; bodyVisibility:Readonly<Record<string,boolean>> }
export interface SplitFaceState extends Snapshot {
  error:string|null; sprueStatus:"idle"|"generating"; undoStack:readonly Snapshot[]; redoStack:readonly Snapshot[]; clearanceEditSnapshot:Snapshot|null;
  /**
   * Reference count of in-flight Mold-Scale-triggered Segmentation replans
   * (see cutting-workflow's regenerateSegmentationAfterScale). A count, not
   * a boolean, because a second Scale gesture can start a new replan before
   * an earlier one's async tail has finished; each caller decrements only
   * the increment it made, so the flag never clears while any replan is
   * still genuinely in flight. Deliberately outside Snapshot: it tracks a
   * real in-progress async operation, not document history, so Undo/Redo
   * must never fabricate or erase it.
   */
  segmentationRegenerationCount:number;
  beginSegmentationRegeneration():void;
  endSegmentationRegeneration():void;
  enterSelection():void; toggleFace(id:PartBoundingBoxFaceId):void; selectSplitFace(id:PartBoundingBoxFaceId|null):void; removeSplitFace(id:PartBoundingBoxFaceId):void; removeSplitFaceAndRebuild(id:PartBoundingBoxFaceId,modelId:string,k1:Bounds3):Promise<boolean>; removeSelectedSplitFaceAndRebuild(modelId:string,k1:Bounds3):Promise<boolean>; clearSelection():void;
  addExtensionCuttingPlane(faceId:PartBoundingBoxFaceId, algorithmUsedAxes:readonly CuttingPlaneAxis[], suggestedNormalizedPosition:number):boolean;
  beginPlaneDrag(id:string):void; cancelPlaneDrag():void; commitPlaneDrag(id:string, normalized:number, k1:Bounds3):void;
  createMoldParts(modelId:string,k1:Bounds3):Promise<boolean>; setClearanceMm(mm:number):void; beginClearanceEdit():void; updateClearanceEdit(mm:number):void; commitClearanceEdit():void; cancelClearanceEdit():void;
  createCavity(sourcePartMesh:CanonicalPartGeometry):Promise<boolean>; setCavityClearanceMm(mm:number):void; setCanonicalPartGeometrySignature(signature:string|null):void;
  createSprue(placement:SpruePreviewPlacement):Promise<boolean>;
  resizeSprue(operationId:string,diameterMm:number):Promise<boolean>;
  resizeSprueEntryNeck(operationId:string,diameterMm:number):Promise<boolean>;
  removeSprue(operationId:string):Promise<boolean>;
  moveSprue(operationId:string,position:{readonly x:number;readonly y:number;readonly z:number}):Promise<boolean>;
  rebuildSprues(sprues:readonly SprueDefinition[]):Promise<boolean>;
  rebuildSprueDefinitions(sprues:readonly SprueOperationDefinition[]):Promise<boolean>;
  setBodyVisibility(id:string,visible:boolean):void; undo():void; redo():void; clearForOrientationChange():void; clearForModelReplacement():void;
  adoptCommittedSegmentationResult(input:{sourceSignature:string|null;sourceDefinition:ReferenceMoldDefinition|null;bodies:readonly MoldBodyData[];warnings:readonly string[]}):void;
  /**
   * Promotes a Scale-triggered Segmentation replan's executed bodies into
   * the singleton -- unlike adoptCommittedSegmentationResult (a fresh
   * promotion that intentionally starts a clean `initial` baseline, fresh
   * undo/redo), this updates definition/lastCommittedResult/document IN
   * PLACE, touching neither undoStack nor redoStack: the Mold Scale commit
   * that triggered this replan already pushed the one history entry this
   * whole gesture gets (see invalidateForClearance's caller), and this
   * promotion is that same gesture's asynchronous tail, not a new one.
   * `expectedPriorRevision` must equal the CURRENT document.revision at the
   * moment this is applied, or the update is silently discarded -- guards
   * against a stale Worker result (from a superseded Scale gesture, or one
   * that raced an Undo) overwriting newer state.
   */
  promoteReplannedSegmentationResult(input:{expectedPriorRevision:number;sourceSignature:string|null;sourceDefinition:ReferenceMoldDefinition|null;bodies:readonly MoldBodyData[];warnings:readonly string[]}):void;
}
const hash=(value:string)=>{let result=2166136261;for(let i=0;i<value.length;i+=1)result=Math.imul(result^value.charCodeAt(i),16777619);return (result>>>0).toString(16).padStart(8,"0");};
const editableWorkflow=(count:number):SplitWorkflowState=>count ? "planesReady" : "selectingFaces";
const unavailableCavity=(clearanceMm=DEFAULT_CAVITY_CLEARANCE_MM):CavityWorkflowState=>({status:"unavailable",clearanceMm,qualityMode:"high",progressStage:null,progress:0,generationVersion:0,sourceSignature:null,result:null,warnings:[],blockers:[],lastError:null});
const generatingRegistration=(revision:string):DerivedRegistrationState=>({status:"generating",revision,bodies:null,report:null});
const readyCavity=(previous:CavityWorkflowState):CavityWorkflowState=>({...previous,status:"ready",progressStage:null,progress:0,sourceSignature:null,result:null,warnings:[],blockers:[],lastError:null});
const snap=(s:Snapshot):Snapshot=>({selectedFaceIds:s.selectedFaceIds,selectedSplitFaceId:s.selectedSplitFaceId,cuttingPlanes:s.cuttingPlanes,workflow:s.workflow==="draggingPlane"?editableWorkflow(s.cuttingPlanes.length):s.workflow,definition:s.definition,clearanceMm:s.clearanceMm,activePlaneId:null,cavity:s.cavity,partGeometrySignature:s.partGeometrySignature,sprues:s.sprues,sprueDefinitions:s.sprueDefinitions,registration:s.registration,document:s.document,evaluation:s.evaluation,lastCommittedResult:s.lastCommittedResult,bodyVisibility:s.bodyVisibility});
const history=(s:SplitFaceState)=>({undoStack:[...s.undoStack.slice(-49),snap(s)],redoStack:[] as readonly Snapshot[]});
/** Updates the canonical mold envelope and immediately removes every derived
 * result that was built against the old K2. This is deliberately synchronous:
 * it marks state stale but never starts cavity/sprue/registration/segmentation
 * work, keeping interactive scale edits worker-free. */
const invalidateForClearance=(s:SplitFaceState,clearanceMm:number)=>{
 const definition=rebuildReferenceMoldForClearance(s,clearanceMm);
 const sprueDefinitions=pendingRevalidation(s.sprueDefinitions);
 return {
 ...s,
 definition,
 clearanceMm,
 lastCommittedResult:null,
 sprues:[],
 sprueDefinitions,
 cavity:unavailableCavity(s.cavity.clearanceMm),
 registration:unavailableRegistration(),
 document:createDocument(s.document.revision+1,definition,s.cuttingPlanes,clearanceMm,s.cavity.clearanceMm,sprueDefinitions),
 evaluation:s.evaluation.phase==="evaluating"?{...s.evaluation,phase:"stale" as const}:s.evaluation,
 // A live scale edit has already rebuilt the current base mold. Keep its
 // capability truthful; cavity/registration/Sprue state above carries the
 // independently stale derived-output lifecycle.
 workflow:(definition?.moldBodies?.length?"partsReady":(s.cuttingPlanes.length?"planesReady":"modelReady")) as SplitWorkflowState,
 error:null,
 };
};
const documentFingerprint=(revision:number,definition:ReferenceMoldDefinition|null,cuttingPlanes:readonly CuttingPlaneRecord[],clearanceMm:number,cavityClearanceMm:number,sprues:readonly SprueOperationDefinition[])=>hash(JSON.stringify({revision,definitionId:definition?.definitionId??null,cuttingPlanes,clearanceMm,cavityClearanceMm,sprues}));
/**
 * The derived-output cluster that must be invalidated ATOMICALLY whenever a
 * topology edit removes the authoritative Cut by Face definition
 * (`definition` -> null): nothing computed against the removed topology may
 * survive as if it still belonged to it. `sprueDefinitions` are cleared too
 * (not preserved as intent): their anchors, cavity relation, and target
 * geometry belonged to the removed topology, and the presentation selector
 * can reconstruct a display from definitions alone -- keeping them would
 * render ghosts as if still valid. Undo restores the whole coherent
 * snapshot, so intent is not lost, only truthfully invalidated.
 */
const invalidateCommittedTopology=()=>({
 lastCommittedResult:null as FinalMoldResult|null,
 sprues:[] as readonly SprueDefinition[],
 sprueDefinitions:[] as readonly SprueOperationDefinition[],
 bodyVisibility:{} as Readonly<Record<string,boolean>>,
});
const STALE_SPRUE_TOPOLOGY_MESSAGE="Mold topology changed; sprue requires revalidation.";
/**
 * Demotes preserved Sprue intent (`sprueDefinitions`) to `pending` whenever
 * its resolved geometry (`sprues`) has been invalidated by a topology
 * replacement that keeps the intent itself alive (Mold Scale,
 * adoptCommittedSegmentationResult, promoteReplannedSegmentationResult --
 * unlike invalidateCommittedTopology above, which discards the intent
 * outright). `validation.status` is resolved-geometry-dependent truth, not
 * user intent: it must never keep reporting "resolved" once the geometry it
 * described no longer exists, even while anchor/profile intent survives for
 * a future rebuild. Leaves already-pending definitions untouched (same
 * object identity) so this is a no-op on state shape when nothing needs
 * demoting.
 */
const pendingRevalidation=(definitions:readonly SprueOperationDefinition[]):readonly SprueOperationDefinition[]=>
 definitions.every(definition=>definition.validation.status==="pending")
  ?definitions
  :definitions.map(definition=>definition.validation.status==="pending"?definition:{...definition,validation:{status:"pending" as const,reasonCode:null,message:STALE_SPRUE_TOPOLOGY_MESSAGE}});
const createDocument=(revision:number,definition:ReferenceMoldDefinition|null,cuttingPlanes:readonly CuttingPlaneRecord[],clearanceMm:number,cavityClearanceMm:number,sprues:readonly SprueOperationDefinition[]):MoldDocument=>({schemaVersion:1,revision,fingerprint:documentFingerprint(revision,definition,cuttingPlanes,clearanceMm,cavityClearanceMm,sprues),definition,cuttingPlanes,cavityEnabled:true,cavityClearanceMm,sprues,registrationPolicyId:"default",manufacturingProfile:null});
const initialDocument=createDocument(0,null,[],DEFAULT_REFERENCE_MOLD_CLEARANCE_MM,DEFAULT_CAVITY_CLEARANCE_MM,[]);
const initial={selectedFaceIds:[] as readonly PartBoundingBoxFaceId[],selectedSplitFaceId:null as PartBoundingBoxFaceId|null,cuttingPlanes:[] as readonly CuttingPlaneRecord[],workflow:"modelReady" as SplitWorkflowState,definition:null,clearanceMm:DEFAULT_REFERENCE_MOLD_CLEARANCE_MM,activePlaneId:null,cavity:unavailableCavity(),partGeometrySignature:null,sprues:[] as readonly SprueDefinition[],sprueDefinitions:[] as readonly SprueOperationDefinition[],registration:unavailableRegistration(),document:initialDocument,evaluation:idleMoldEvaluation(),lastCommittedResult:null as FinalMoldResult|null,bodyVisibility:{} as Readonly<Record<string,boolean>>,error:null,sprueStatus:"idle" as const,undoStack:[] as readonly Snapshot[],redoStack:[] as readonly Snapshot[],clearanceEditSnapshot:null as Snapshot|null,segmentationRegenerationCount:0};

const profileDesign=(sprue:SprueDefinition):SprueProfileDesignResult=>({
 profile:sprue.profile,source:"fallback",mainSection:null,entryNeckDiameter:null,
 entryNeckLength:null,warnings:[],
});
function buildMoldPartsDefinition(
 modelId:string,
 k1:Bounds3,
 clearanceMm:number,
 cuttingPlanes:readonly CuttingPlaneRecord[],
 selectedFaceIds:readonly PartBoundingBoxFaceId[],
):ReferenceMoldDefinition{
 const frameBounds=createReferenceMoldFrameBounds(k1,clearanceMm);

 if(frameBounds===null){
  throw new Error(
   "K1 bounds or mold clearance are invalid.",
  );
 }
 const {partOffset,selectionBoxBounds:rebasedK1,referenceMoldBlockBounds:outer}=frameBounds;

 const planes=cuttingPlanesToCutPlaneData(
  rebasedK1,
  cuttingPlanes,
 );

 const signature=JSON.stringify({
  modelId,
  k1:rebasedK1,
  outer,
  planes:planes.map(
   plane=>[
    plane.axis,
    plane.coordinate,
    plane.sourceFace,
   ],
  ),
 });

 const base:ReferenceMoldDefinition={
  schemaVersion:1,
  definitionId:
   `${modelId}:mold-parts:${hash(signature)}`,
  modelId,
  coordinateSystem:{
   units:"millimeters",
   upAxis:"Z",
  },
  selectionBoxBounds:structuredClone(rebasedK1),
  referenceMoldBlock:{
   clearanceMm,
   bounds:outer,
  },
  moldFrame:{
   frameId:`mold-frame:${modelId}:${hash(signature)}`,
   version:1,
   units:"millimeters",
   upAxis:"Z",
   partOffset,
   semanticFaces:{
    left:{axis:"x",direction:-1},
    right:{axis:"x",direction:1},
    front:{axis:"y",direction:1},
    back:{axis:"y",direction:-1},
    bottom:{axis:"z",direction:-1},
    top:{axis:"z",direction:1},
   },
  },
  usedFaces:selectedFaceIds,
  selectedFaceIds,
 };

 const moldBodies=generateMoldBodies(
  base,
  planes,
 );

 return {
  ...base,
  moldBodies,
 };
}
/**
 * Rebuilds the current canonical K2 envelope for a Segmentation-promoted
 * definition under a new clearance,
 * presented as a single truthful unsegmented base body -- the same
 * "canonical unpartitioned K2 source body" `createWholeMoldBody` already
 * produces for segmentation preview. Segmentation has no face-cutting
 * planes of its own to partition with (`state.cuttingPlanes` is always []
 * after `adoptCommittedSegmentationResult`), so this deliberately never
 * calls `generateMoldBodies`/`partitionOrthogonalMold` -- there is nothing
 * to partition, only a K2 envelope to recompute. The old segmented bodies
 * are invalidated by `invalidateForClearance`'s caller regardless; the user
 * reruns Segmentation to obtain a new segmented result from this base.
 */
function buildSegmentationBaseForClearance(
 modelId:string,
 k1:Bounds3,
 clearanceMm:number,
 selectedFaceIds:readonly PartBoundingBoxFaceId[],
):ReferenceMoldDefinition{
 // Segmentation's own source snapshot (capturePreliminaryWholeBlockSnapshot,
 // used whenever lastCommittedResult is null -- true here, since Scale just
 // invalidated it) floors clearance to
 // AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM. This whole-K2 base must use
 // the identical resolved clearance, or its geometry would visibly jump the
 // instant a Scale-triggered segmentation replan lands (see
 // regenerateSegmentationAfterScale), and its own reported
 // referenceMoldBlock.clearanceMm would misreport what it actually built.
 const resolvedClearanceMm=resolveAutomaticSegmentationMoldClearance(clearanceMm);
 const frameBounds=createReferenceMoldFrameBounds(k1,resolvedClearanceMm);
 if(frameBounds===null){
  throw new Error(
   "K1 bounds or mold clearance are invalid.",
  );
 }
 const {partOffset,selectionBoxBounds:rebasedK1,referenceMoldBlockBounds:outer}=frameBounds;
 const signature=JSON.stringify({modelId,k1:rebasedK1,outer,segmentationBase:true});
 const base:ReferenceMoldDefinition={
  schemaVersion:1,
  definitionId:`${modelId}:segmentation-base:${hash(signature)}`,
  modelId,
  coordinateSystem:{
   units:"millimeters",
   upAxis:"Z",
  },
  selectionBoxBounds:structuredClone(rebasedK1),
  referenceMoldBlock:{
   clearanceMm:resolvedClearanceMm,
   bounds:outer,
  },
  moldFrame:{
   frameId:`mold-frame:${modelId}:${hash(signature)}`,
   version:1,
   units:"millimeters",
   upAxis:"Z",
   partOffset,
   semanticFaces:{
    left:{axis:"x",direction:-1},
    right:{axis:"x",direction:1},
    front:{axis:"y",direction:1},
    back:{axis:"y",direction:-1},
    bottom:{axis:"z",direction:-1},
    top:{axis:"z",direction:1},
   },
  },
  usedFaces:selectedFaceIds,
  selectedFaceIds,
 };
 const wholeBody=createWholeMoldBody(base,{id:`${base.definitionId}:whole`,name:"Mold"});
 return {
  ...base,
  moldBodies:[wholeBody],
  // A single whole-K2 body trivially partitions the reference block, so
  // moldBodiesPartitionReferenceBlock is left unset (default true-ish) --
  // this is a current canonical base, not a re-presentation of the old
  // segmented result, and Create Cavity's coverage check applies to it the
  // same as any Cut by Face base.
  //
  // segmentationLineage stays true: this base still has no face-cutting
  // planes to rebuild a partition from, so a second (and every subsequent)
  // Mold Scale edit must keep taking this whole-block rebuild path rather
  // than falling through to buildMoldPartsDefinition, which would reject
  // the still-empty state.cuttingPlanes.
  segmentationLineage:true,
 };
}
/** Rebuilds only the canonical reference mold envelope. It intentionally
 * excludes cavity, Sprue, registration, and segmentation-derived output. */
function rebuildReferenceMoldForClearance(
 state: SplitFaceState,
 clearanceMm: number,
): ReferenceMoldDefinition | null {
 const definition=state.definition;
 if(definition===null) return null;
 const previousOffset=definition.moldFrame?.partOffset.z??definition.referenceMoldBlock.clearanceMm;
 const groundedK1={
  min:{...definition.selectionBoxBounds.min,z:definition.selectionBoxBounds.min.z-previousOffset},
  max:{...definition.selectionBoxBounds.max,z:definition.selectionBoxBounds.max.z-previousOffset},
 };
 const selectedFaceIds=definition.selectedFaceIds??definition.usedFaces;
 try{
  // A Segmentation-promoted definition carries no face-cutting planes of
  // its own -- state.cuttingPlanes is always [] after
  // adoptCommittedSegmentationResult -- so buildMoldPartsDefinition would
  // reject the empty plane list (generateMoldBodies requires at least one
   // K1 face). segmentationLineage is sticky across repeated rebuilds (see
   // buildSegmentationBaseForClearance), so every subsequent Mold Scale edit
   // keeps taking this branch too, not just the first one. Cut by Face
   // never sets segmentationLineage, so this branch never affects it.
  if(definition.segmentationLineage===true){
   return buildSegmentationBaseForClearance(definition.modelId,groundedK1,clearanceMm,selectedFaceIds);
  }
  return buildMoldPartsDefinition(
   definition.modelId,
   groundedK1,
   clearanceMm,
   state.cuttingPlanes,
   selectedFaceIds,
  );
 }catch{
  return null;
 }
}
/**
 * Carries the source definition forward unchanged except for the committed
 * segmentation-body set and its deliberately different partition contract.
 * Executed segmentation meshes remain in the source mold-local frame, so K1,
 * K2, and moldFrame must never be reconstructed from their aggregate bounds.
 */
function buildSegmentationDerivedDefinition(
 sourceDefinition:ReferenceMoldDefinition,
 sourceSignature:string|null,
 bodies:readonly MoldBodyData[],
):ReferenceMoldDefinition{
 return {
  ...sourceDefinition,
  definitionId:`${sourceDefinition.definitionId}:segmentation:${hash(sourceSignature??sourceDefinition.definitionId)}`,
  moldBodies:bodies,
  // Segmentation may originate from a cavity-affected source body. Its
  // outputs conserve that body's material, not necessarily the full K2 box.
  moldBodiesPartitionReferenceBlock:false,
  segmentationLineage:true,
 };
}
/**
 * Selects the Registration sizing policy for the committed evaluation of
 * `definition` from its own authoritative, persisted provenance --
 * `segmentationLineage`, the same field `rebuildReferenceMoldForClearance`
 * above already uses to distinguish Segmentation-promoted definitions from
 * Cut by Face (which never sets it and must stay on the NORMAL
 * default applied by buildRegistrationDependencySnapshot). Returns a
 * spreadable field (never an explicit `undefined` value) so the NORMAL case
 * omits `registrationSizingPolicy` entirely, matching this project's
 * `exactOptionalPropertyTypes` contract.
 */
function registrationSizingPolicyFor(definition:ReferenceMoldDefinition):{registrationSizingPolicy:RegistrationSizingPolicy}|Record<string,never>{
 return definition.segmentationLineage===true?{registrationSizingPolicy:AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY}:{};
}
export interface SplitFaceStoreDeps{runDerivedMoldEvaluation:typeof defaultRunDerivedMoldEvaluation;cancelDerivedMoldEvaluation:typeof defaultCancelDerivedMoldEvaluation;runCavityGenerationInWorker:typeof defaultRunCavityGenerationInWorker;cancelActiveCavityGeneration:typeof defaultCancelActiveCavityGeneration;}
const defaultSplitFaceStoreDeps:SplitFaceStoreDeps={runDerivedMoldEvaluation:defaultRunDerivedMoldEvaluation,cancelDerivedMoldEvaluation:defaultCancelDerivedMoldEvaluation,runCavityGenerationInWorker:defaultRunCavityGenerationInWorker,cancelActiveCavityGeneration:defaultCancelActiveCavityGeneration};
/** Factory so an isolated draft session (see cutting-workflow/) can own its own worker-runner instances instead of sharing the module-level singletons below. Default args keep `useSplitFaceStore` behaviorally identical to before this extraction. */
export function createSplitFaceStoreCreator(deps:SplitFaceStoreDeps=defaultSplitFaceStoreDeps):StateCreator<SplitFaceState>{
const{runDerivedMoldEvaluation,cancelDerivedMoldEvaluation,runCavityGenerationInWorker,cancelActiveCavityGeneration}=deps;
return (set,get)=>({...initial,
 /** Activates the interactive Cut by Face selection workflow (opening the
  * panel's Cut by Face tab, or reopening it after a prior commit). This is
  * an activation, not an edit: it deliberately leaves `definition`,
  * `cavity`, and `registration` untouched. Merely opening/reopening the
  * Constructed Cutting Plan must not mutate committed project geometry --
  * `toggleFace` below performs the equivalent invalidation atomically, in
  * the same update as the real edit that causes it, and already tolerates
  * being called directly from "partsReady" (see its own guard). */
 enterSelection:()=>set(s=>({...history(s),workflow:editableWorkflow(s.cuttingPlanes.length),error:null,activePlaneId:null})), toggleFace:(id)=>set(s=>{
  if(!["selectingFaces","planesReady","error","partsReady"].includes(s.workflow)){
   return s;
  }

  const exists=s.cuttingPlanes.some(
   plane=>plane.sourceFaceId===id
  );

  const cuttingPlanes=exists
   ?s.cuttingPlanes.filter(
     plane=>plane.sourceFaceId!==id
    )
   :[
     ...s.cuttingPlanes,
     createCuttingPlane(id),
    ].sort(
     (a,b)=>a.creationOrder-b.creationOrder
    );

  const selectedFaceIds=PART_BOUNDING_BOX_FACE_IDS.filter(
   faceId=>cuttingPlanes.some(
    plane=>plane.sourceFaceId===faceId
   )
  );

  const selectedSplitFaceId=exists
   ?(
     s.selectedSplitFaceId===id
      ?selectedFaceIds.at(-1)??null
      :s.selectedSplitFaceId
    )
   :id;

   return {
    ...invalidateCommittedTopology(),
    ...history(s),
    selectedFaceIds,
    selectedSplitFaceId,
    cuttingPlanes,
    workflow:editableWorkflow(cuttingPlanes.length),
    definition:null,
    cavity:unavailableCavity(s.cavity.clearanceMm),
    registration:unavailableRegistration(),
    error:null,
    activePlaneId:null,
    document:createDocument(s.document.revision+1,null,cuttingPlanes,s.clearanceMm,s.cavity.clearanceMm,[]),
    evaluation:idleMoldEvaluation(),
   };
  }),
  addExtensionCuttingPlane:(faceId,algorithmUsedAxes,suggestedNormalizedPosition)=>{
  const s=get();
   // "modelReady" (the singleton's default, untouched state) is included
   // deliberately: Segmentation never calls
   // enterSelection() at all (that is Cut by Face's own entry point), so
  // the singleton stays in "modelReady" the entire time a segmentation
  // extension plane is added -- unlike ordinary face toggling, which is
  // reachable only after enterSelection().
  if(!["modelReady","selectingFaces","planesReady","error","partsReady"].includes(s.workflow)){
   return false;
  }
  const axis=createCuttingPlane(faceId).axis;
  if(algorithmUsedAxes.includes(axis)){
   return false;
  }
  const axisAlreadyExtended=s.cuttingPlanes.some(
   plane=>plane.axis===axis&&plane.provenance.startsWith("segmentation-extension"),
  );
  if(axisAlreadyExtended){
   return false;
  }
  if(s.cuttingPlanes.some(plane=>plane.sourceFaceId===faceId)){
   return false;
  }

  const cuttingPlanes=[
   ...s.cuttingPlanes,
   createCuttingPlane(faceId,{
    normalizedPosition:clampNormalizedPosition(suggestedNormalizedPosition),
    provenance:"segmentation-extension-suggested",
   }),
  ].sort((a,b)=>a.creationOrder-b.creationOrder);

  const selectedFaceIds=PART_BOUNDING_BOX_FACE_IDS.filter(
   candidateFaceId=>cuttingPlanes.some(plane=>plane.sourceFaceId===candidateFaceId),
  );

  // Deliberately does NOT bump document.revision or invalidate
  // definition/cavity/registration/evaluation: a segmentation extension
  // plane is a pure visual/interaction marker on the singleton, not a
  // change to split-face's own geometry pipeline. Bumping the document
  // revision here would make segmentation's own upstream-change
  // subscription (handleUpstreamChange in segmentation.store.ts, which
  // watches this same singleton) see a "changed" document and mark its own
  // plan stale -- wiping the very extension boundary this action just
  // added, since preliminary-snapshot planning embeds document.revision in
  // its own identity.
  set({
   ...history(s),
   selectedFaceIds,
   selectedSplitFaceId:faceId,
   cuttingPlanes,
   workflow:editableWorkflow(cuttingPlanes.length),
  });
  return true;
 },
 selectSplitFace:(id)=>set(s=>{
 if(id===null){
  return s.selectedSplitFaceId===null
   ?s
   :{...s,selectedSplitFaceId:null};
 }
 const exists=s.cuttingPlanes.some(
  plane=>plane.sourceFaceId===id
 );
 if(!exists||s.selectedSplitFaceId===id)return s;
 return {...s,selectedSplitFaceId:id};
}), removeSplitFace:(id)=>set(s=>{
  if(
   s.workflow==="generatingParts"||
   s.cavity.status==="generating"
  ){
   return s;
  }

  const faceExists=s.cuttingPlanes.some(
   plane=>plane.sourceFaceId===id
  );

  if(!faceExists){
   return s;
  }

  const cuttingPlanes=s.cuttingPlanes.filter(
   plane=>plane.sourceFaceId!==id
  );

  const selectedFaceIds=PART_BOUNDING_BOX_FACE_IDS.filter(
   faceId=>cuttingPlanes.some(
    plane=>plane.sourceFaceId===faceId
   )
  );

  const selectedSplitFaceId=
   s.selectedSplitFaceId===id
    ?selectedFaceIds.at(-1)??null
    :s.selectedSplitFaceId;

  // Removing a segmentation extension plane is a pure visual/interaction
  // update, same reasoning as addExtensionCuttingPlane/commitPlaneDrag
  // above -- must not bump document.revision or invalidate split-face's
  // own definition/cavity/registration/evaluation, or segmentation's own
  // upstream-change subscription would mark its (still otherwise valid)
  // plan stale purely as a side effect.
  const removedPlane=s.cuttingPlanes.find(plane=>plane.sourceFaceId===id);
  if(removedPlane!==undefined&&removedPlane.provenance.startsWith("segmentation-extension")){
   return {...history(s),selectedFaceIds,selectedSplitFaceId,cuttingPlanes,workflow:editableWorkflow(cuttingPlanes.length),error:null,activePlaneId:null};
  }

  return {
   ...invalidateCommittedTopology(),
   ...history(s),
   selectedFaceIds,
   selectedSplitFaceId,
   cuttingPlanes,
   workflow:editableWorkflow(cuttingPlanes.length),
   definition:null,
   cavity:unavailableCavity(s.cavity.clearanceMm),
   registration:unavailableRegistration(),
   error:null,
   activePlaneId:null,
   document:createDocument(s.document.revision+1,null,cuttingPlanes,s.clearanceMm,s.cavity.clearanceMm,[]),
   evaluation:idleMoldEvaluation(),
  };
 }),
 removeSplitFaceAndRebuild:async(id,modelId,k1)=>{
  const before=get();

  if(
   before.workflow==="generatingParts"||
   before.cavity.status==="generating"
  ){
   return false;
  }

  const targetExists=before.cuttingPlanes.some(
   plane=>plane.sourceFaceId===id
  );

  if(!targetExists){
   return false;
  }

  const cuttingPlanes=before.cuttingPlanes.filter(
   plane=>plane.sourceFaceId!==id
  );

  const selectedFaceIds=PART_BOUNDING_BOX_FACE_IDS.filter(
   faceId=>cuttingPlanes.some(
    plane=>plane.sourceFaceId===faceId
   )
  );

  const selectedSplitFaceId=
   before.selectedSplitFaceId===id
    ?selectedFaceIds.at(-1)??null
    :before.selectedSplitFaceId;

  await Promise.resolve();

  if(!cuttingPlanes.length){
   set(current=>({
    ...current,
    ...invalidateCommittedTopology(),
    undoStack:[
     ...before.undoStack.slice(-49),
     snap(before),
    ],
    redoStack:[],
    selectedFaceIds:[],
    selectedSplitFaceId:null,
    cuttingPlanes:[],
    workflow:"selectingFaces",
    definition:null,
    cavity:unavailableCavity(
     before.cavity.clearanceMm,
    ),
    registration:unavailableRegistration(),
    // The document must truthfully describe the new no-parts state: a
    // revision/fingerprint bump (with a null definition) is what makes
    // segmentation's own source-snapshot staleness gate and the async
    // evaluation commit gate treat the removed topology as gone, instead
    // of a surviving committed result matching the unchanged document.
    document:createDocument(before.document.revision+1,null,[],before.clearanceMm,before.cavity.clearanceMm,[]),
    evaluation:idleMoldEvaluation(),
    activePlaneId:null,
    error:null,
   }));

   return true;
  }

  try{
   const definition=buildMoldPartsDefinition(
    modelId,
    k1,
    before.clearanceMm,
    cuttingPlanes,
    selectedFaceIds,
   );
   const document=createDocument(before.document.revision+1,definition,cuttingPlanes,before.clearanceMm,before.cavity.clearanceMm,before.sprueDefinitions);
   const evaluation=nextEvaluationRequest(document);
   set({document,evaluation,registration:generatingRegistration(document.fingerprint)});
   const derived=await runDerivedMoldEvaluation({requestId:evaluation.requestId!,sourceRevision:document.revision,sourceFingerprint:document.fingerprint,cavityResult:null,definition,cuttingPlanes,sprueDefinitions:before.sprueDefinitions,...registrationSizingPolicyFor(definition)});
   const latest=get();
   const finalResult:FinalMoldResult={sourceRevision:document.revision,sourceFingerprint:document.fingerprint,requestId:evaluation.requestId!,bodies:derived.registration.bodies??derived.sprueBodies,keyed:derived.registration.status==="generated",stages:{baseBodies:definition.moldBodies??[],cavityResult:null,sprueBodies:derived.sprueBodies,resolvedSprues:[],registration:derived.registration},warnings:derived.warnings};
   if(!canCommitMoldEvaluation(latest,finalResult))return false;

   set(current=>({
    ...current,
    undoStack:[
     ...before.undoStack.slice(-49),
     snap(before),
    ],
    redoStack:[],
    selectedFaceIds,
    selectedSplitFaceId,
    cuttingPlanes,
    workflow:"partsReady",
    definition,
    cavity:readyCavity(before.cavity),
    sprues:[],
    sprueDefinitions:derived.sprueDefinitions,
    registration:derived.registration,
    lastCommittedResult:finalResult,
    evaluation:{...current.evaluation,phase:"complete",stage:"validation",progress:1},
    activePlaneId:null,
    error:null,
   }));

   return true;
  }catch(error){
   set(current=>({
    ...current,
    // The provisional document/evaluation/registration belong to the NEW
    // definition the rebuild failed to commit -- restore the rolled-back
    // state's own document bookkeeping atomically, or the surviving
    // committed result would silently mismatch (or worse, silently match)
    // a document it never produced.
    document:before.document,
    evaluation:before.evaluation,
    registration:before.registration,
    workflow:before.workflow,
    definition:before.definition,
    cavity:before.cavity,
    selectedFaceIds:before.selectedFaceIds,
    selectedSplitFaceId:
     before.selectedSplitFaceId,
    cuttingPlanes:before.cuttingPlanes,
    activePlaneId:null,
    error:
     error instanceof Error
      ?error.message
      :"Mold parts could not be rebuilt.",
   }));

   return false;
  }
 },
 removeSelectedSplitFaceAndRebuild:async(modelId,k1)=>{
  const targetId=get().selectedSplitFaceId;

  if(targetId===null){
   return false;
  }

  return get().removeSplitFaceAndRebuild(
   targetId,
   modelId,
   k1,
  );
 }, clearSelection:()=>{cancelDerivedMoldEvaluation("Mold document changed.");set(s=>s.cuttingPlanes.length?{...invalidateCommittedTopology(),...history(s),selectedFaceIds:[],selectedSplitFaceId:null,cuttingPlanes:[],workflow:"selectingFaces",definition:null,cavity:unavailableCavity(s.cavity.clearanceMm),registration:unavailableRegistration(),document:createDocument(s.document.revision+1,null,[],s.clearanceMm,s.cavity.clearanceMm,[]),evaluation:idleMoldEvaluation(),error:null,activePlaneId:null}:s);},
 beginPlaneDrag:(id)=>set(s=>s.cuttingPlanes.some(p=>p.id===id)?{...s,workflow:"draggingPlane",activePlaneId:id,error:null}:s),
 cancelPlaneDrag:()=>set(s=>s.workflow==="draggingPlane"?{...s,workflow:editableWorkflow(s.cuttingPlanes.length),activePlaneId:null}:s),
 commitPlaneDrag:(id,normalized,k1)=>{cancelDerivedMoldEvaluation("Mold document changed.");set(s=>{
  const plane=s.cuttingPlanes.find(p=>p.id===id);
  if(plane===undefined)return {...s,workflow:editableWorkflow(s.cuttingPlanes.length),activePlaneId:null};
  const next=clampNormalizedPosition(normalized,k1,plane.axis);
  if(Math.abs(next-plane.normalizedPosition)<=1e-9)return {...s,workflow:editableWorkflow(s.cuttingPlanes.length),activePlaneId:null};
  const isExtensionPlane=plane.provenance.startsWith("segmentation-extension");
  const cuttingPlanes=s.cuttingPlanes.map(p=>p.id===id?{...p,normalizedPosition:next,lastValidWorldCoordinate:normalizedToWorldCoordinate(k1,p.axis,next),provenance:isExtensionPlane?"segmentation-extension-adjusted" as const:p.provenance}:p);
  // A segmentation extension plane's drag is a pure visual/interaction
  // update, same reasoning as addExtensionCuttingPlane above: it must not
  // bump document.revision or invalidate split-face's own
  // definition/cavity/registration/evaluation, since doing so would make
  // segmentation's own upstream-change subscription mark its plan stale
  // (wiping the very extension boundary this drag just moved) purely as a
  // side effect of a plane it doesn't even use for its own geometry.
  if(isExtensionPlane){
   return {...history(s),cuttingPlanes,workflow:"planesReady",activePlaneId:null,error:null};
  }
  return {...invalidateCommittedTopology(),...history({...s,definition:null}),cuttingPlanes,workflow:"planesReady",activePlaneId:null,definition:null,cavity:unavailableCavity(s.cavity.clearanceMm),registration:unavailableRegistration(),document:createDocument(s.document.revision+1,null,cuttingPlanes,s.clearanceMm,s.cavity.clearanceMm,[]),evaluation:idleMoldEvaluation(),error:null};
 });},
 createMoldParts:async(modelId,k1)=>{
  const before=get();

  if(
   before.workflow!=="planesReady"||
   !before.cuttingPlanes.length
  ){
   return false;
  }

  await Promise.resolve();

  try{
   const definition=buildMoldPartsDefinition(
    modelId,
    k1,
    before.clearanceMm,
    before.cuttingPlanes,
    before.selectedFaceIds,
   );
   const document=createDocument(before.document.revision+1,definition,before.cuttingPlanes,before.clearanceMm,before.cavity.clearanceMm,before.sprueDefinitions);
   const evaluation=nextEvaluationRequest(document);
   set(s=>({...s,workflow:"generatingParts",definition,document,evaluation,registration:generatingRegistration(document.fingerprint),error:null}));
   const derived=await runDerivedMoldEvaluation({requestId:evaluation.requestId!,sourceRevision:document.revision,sourceFingerprint:document.fingerprint,cavityResult:null,definition,cuttingPlanes:before.cuttingPlanes,sprueDefinitions:before.sprueDefinitions,...registrationSizingPolicyFor(definition)});
   const latest=get();
   const finalBodies=derived.registration.bodies??derived.sprueBodies;
   const finalResult:FinalMoldResult={sourceRevision:document.revision,sourceFingerprint:document.fingerprint,requestId:evaluation.requestId!,bodies:finalBodies,keyed:derived.registration.status==="generated",stages:{baseBodies:definition.moldBodies??[],cavityResult:null,sprueBodies:derived.sprueBodies,resolvedSprues:derived.resolvedSprues,registration:derived.registration},warnings:derived.warnings};
   if(!canCommitMoldEvaluation(latest,finalResult))return false;

   set(current=>({
    undoStack:[
     ...current.undoStack.slice(-49),
     snap(before),
    ],
    redoStack:[],
    workflow:"partsReady",
    definition,
    cavity:readyCavity(before.cavity),
    sprueDefinitions:derived.sprueDefinitions,
    registration:derived.registration,
    lastCommittedResult:finalResult,
    evaluation:{...current.evaluation,phase:"complete",stage:"validation",progress:1},
    error:null,
   }));

   return true;
  }catch(error){
   set({
    workflow:"error",
    error:
     error instanceof Error
      ?error.message
      :"Mold parts could not be created.",
   });

   return false;
  }
 },
 // history(s) must be spread AFTER invalidateForClearance(s,...): the
 // latter's return value itself spreads the pre-push `...s` (including the
 // old undoStack/redoStack), so applying it after history(s) would silently
 // clobber the freshly-pushed history entry and this instant-commit scale
 // edit would never become undoable.
 setClearanceMm:(mm)=>{cancelDerivedMoldEvaluation("Mold size changed.");set(s=>{const clearanceMm=clampReferenceMoldClearance(mm);if(clearanceMm===s.clearanceMm)return s;return {...invalidateForClearance(s,clearanceMm),...history(s),clearanceEditSnapshot:null};});},
 beginClearanceEdit:()=>set(s=>s.clearanceEditSnapshot===null?{...s,clearanceEditSnapshot:snap(s)}:s),
 updateClearanceEdit:(mm)=>{cancelDerivedMoldEvaluation("Mold size changed.");set(s=>{const clearanceMm=clampReferenceMoldClearance(mm);if(clearanceMm===s.clearanceMm)return s;const snapshot=s.clearanceEditSnapshot??snap(s);return {...invalidateForClearance(s,clearanceMm),clearanceEditSnapshot:snapshot,redoStack:[]};});},
 commitClearanceEdit:()=>set(s=>{const before=s.clearanceEditSnapshot;if(before===null)return s;return {...s,clearanceEditSnapshot:null,undoStack:before.clearanceMm===s.clearanceMm?s.undoStack:[...s.undoStack.slice(-49),before],redoStack:[]};}),
 cancelClearanceEdit:()=>{cancelDerivedMoldEvaluation("Mold scale edit cancelled.");set(s=>s.clearanceEditSnapshot===null?s:{...s.clearanceEditSnapshot,clearanceEditSnapshot:null,error:null,sprueStatus:"idle"});},
  createCavity:async(sourcePartMesh)=>{
   const before=get();

   if(
     before.workflow!=="partsReady"||
     before.definition?.moldBodies===undefined||
     before.cavity.status==="generating"||
     before.partGeometrySignature!==sourcePartMesh.sourceSignature||
     // Independent domain-level backstop: a Mold-Scale-triggered Segmentation
     // replan is still in flight (see regenerateSegmentationAfterScale), so
     // `before.definition` may still be the temporary whole-K2 base rather
     // than final segmented bodies. Never trust CavityAction's own disabled
     // state alone -- this must reject even if some other caller bypasses it.
     before.segmentationRegenerationCount>0
   )return false;

  const generationVersion=before.cavity.generationVersion+1;
  const document=createDocument(before.document.revision+1,before.definition,before.cuttingPlanes,before.clearanceMm,before.cavity.clearanceMm,before.sprueDefinitions);
  const evaluation=nextEvaluationRequest(document);
  let input;

  try{
    input=buildCavityGenerationInput({
      sourcePartMesh,
      definition:before.definition,
      cuttingPlanes:before.cuttingPlanes,
      cavityClearanceMm:before.cavity.clearanceMm,
      qualityMode:before.cavity.qualityMode,
      generationVersion,
    });
  }catch(e){
    set(s=>({
      ...s,
      cavity:{
        ...s.cavity,
        status:"blocked",
        lastError:e instanceof Error?e.message:"Cavity input is invalid.",
      },
    }));
    return false;
  }

  set(s=>({
    ...s,
    document,
    evaluation:{...evaluation,stage:"cavity"},
    registration:generatingRegistration(document.fingerprint),
    cavity:{
      ...s.cavity,
      status:"generating",
      progressStage:"validating",
      progress:0,
      generationVersion,
      lastError:null,
      warnings:[],
      blockers:[],
    },
  }));

  try{
    const execution=await runCavityGenerationInWorker(input,{onProgress:(progressStage,progress)=>set(s=>s.cavity.generationVersion===generationVersion?{...s,cavity:{...s.cavity,progressStage,progress}}:s)});
    const result=execution.result;
    const current=get();

    if(
      current.cavity.generationVersion!==generationVersion||
      current.partGeometrySignature!==sourcePartMesh.sourceSignature||
      current.definition?.moldBodies===undefined
    )return false;

    const currentInput=buildCavityGenerationInput({
      sourcePartMesh,
      definition:current.definition,
      cuttingPlanes:current.cuttingPlanes,
      cavityClearanceMm:current.cavity.clearanceMm,
      qualityMode:current.cavity.qualityMode,
      generationVersion,
    });

    if(currentInput.upstreamInputSignature!==input.upstreamInputSignature){
      set(s=>({...s,cavity:readyCavity(s.cavity)}));
      return false;
    }
    const subtraction=result.diagnostics?.subtraction??result.subtractionDiagnostics;
    if(result.blockers.length>0||subtraction===undefined||subtraction.affectedBodyCount<1||subtraction.removedVolumeMm3<=input.tolerancePolicy.affectedVolumeToleranceMm3)throw Object.assign(new Error("The cavity tool did not intersect any mold material. Verify mold-body construction and coordinate alignment."),{code:"cavity_no_material_intersection"});

    const visibility=new Map(
      current.definition.moldBodies.map(body=>[body.id,body.visible]),
    );

    const bodies=result.bodies.map(body=>({
      ...body,
      visible:visibility.get(body.parentBodyId)??true,
    }));
    const canonicalResult={...result,bodies};
    const derived=await runDerivedMoldEvaluation({requestId:evaluation.requestId!,sourceRevision:document.revision,sourceFingerprint:document.fingerprint,cavityResult:canonicalResult,definition:current.definition,cuttingPlanes:current.cuttingPlanes,sprueDefinitions:before.sprueDefinitions,...registrationSizingPolicyFor(current.definition)},(stage,progress)=>set(s=>s.evaluation.requestId===evaluation.requestId?{...s,evaluation:{...s.evaluation,stage,progress}}:s));
    const latest=get();
    const finalBodies=derived.registration.bodies??derived.sprueBodies;
    const finalResult:FinalMoldResult={sourceRevision:document.revision,sourceFingerprint:document.fingerprint,requestId:evaluation.requestId!,bodies:finalBodies,keyed:derived.registration.status==="generated",stages:{baseBodies:current.definition.moldBodies??[],cavityResult:canonicalResult,sprueBodies:derived.sprueBodies,resolvedSprues:derived.resolvedSprues,registration:derived.registration},warnings:derived.warnings};
    if(!canCommitMoldEvaluation(latest,finalResult))return false;

    const registrationWarning = derived.registration.report?.message ?? null;

    set(s=>({
      ...s,
      undoStack:[...s.undoStack.slice(-49),snap(before)],
      redoStack:[],
      cavity:{
        ...s.cavity,
        status:"complete",
        progressStage:"complete",
        progress:1,
        sourceSignature:result.sourceSignature,
        result:canonicalResult,
        warnings:[
          ...execution.validationWarnings,
          ...result.warnings,
          ...(registrationWarning !== null && derived.registration.status !== "generated" ? [{ severity: "warning" as const, reasonCode: derived.registration.report?.reasonCode ?? "registration_unavailable", message: registrationWarning }] : []),
        ],
        blockers:[],
        lastError:null,
      },
      sprues:derived.resolvedSprues,
      sprueDefinitions:derived.sprueDefinitions,
      registration:derived.registration,
      lastCommittedResult:finalResult,
      evaluation:{...s.evaluation,phase:"complete",stage:"validation",progress:1},
      error:null,
    }));
    return true;


  }catch(e){
    const reasonCode=e instanceof Error&&"code" in e?String(e.code):"cavity_generation_failed";
    set(s=>
      s.cavity.generationVersion===generationVersion
        ?{
          ...s,
          evaluation:{...s.evaluation,phase:reasonCode==="cavity_cancelled"?"cancelled":"failed",failure:{reasonCode,message:e instanceof Error?e.message:"Cavity generation failed."}},
          cavity:{
            ...s.cavity,
            status:"blocked",
            progressStage:null,
            progress:0,
            blockers:[{severity:"blocker",reasonCode,message:e instanceof Error?e.message:"Cavity generation failed."}],
            lastError:
              e instanceof Error
                ?e.message
                :"Cavity generation failed.",
          },
        }
        :s,
    );

    return false;
  }
 },
 setCavityClearanceMm:()=>{cancelActiveCavityGeneration("Cavity clearance locked at 0.0 mm.");set(s=>s.cavity.clearanceMm===0?s:{...history(s),cavity:{...readyCavity(s.cavity),clearanceMm:0}});},
 setCanonicalPartGeometrySignature:(signature)=>{cancelActiveCavityGeneration("Model geometry changed.");cancelDerivedMoldEvaluation("Model geometry changed.");set(s=>signature===s.partGeometrySignature?s:{...s,partGeometrySignature:signature,cavity:s.definition?.moldBodies?.length?readyCavity(s.cavity):unavailableCavity(s.cavity.clearanceMm),registration:unavailableRegistration(),document:createDocument(s.document.revision+1,s.definition,s.cuttingPlanes,s.clearanceMm,s.cavity.clearanceMm,s.sprueDefinitions),evaluation:s.evaluation.phase==="evaluating"?{...s.evaluation,phase:"stale"}:s.evaluation});},
 createSprue:async(placement)=>{
  const before=get();
  if(
   before.sprueStatus==="generating"||
   placement.coordinateSpace!=="mold-local"
  )return false;
  if(before.definition===null)return false;
  const operationId=`sprue:${hash(`${before.document.revision}:${placement.topPoint.x}:${placement.topPoint.y}:${placement.topPoint.z}:${before.sprueDefinitions.length}`)}`;
  const intent:SprueOperationDefinition={operationId,anchor:{position:structuredClone(placement.topPoint),surfaceId:"reference-mold:top"},inwardDirection:structuredClone(placement.inwardDirection),profileDesign:placement.profileDesign,creationOrder:before.sprueDefinitions.length,coordinateSpace:"mold-local",validation:{status:placement.status==="valid"?"pending":"pending",reasonCode:null,message:before.cavity.result===null?"Waiting for cavity geometry.":null}};
  const requested=[...before.sprueDefinitions,intent];
  const document=createDocument(before.document.revision+1,before.definition,before.cuttingPlanes,before.clearanceMm,before.cavity.clearanceMm,requested);
  const evaluation=nextEvaluationRequest(document);
  set({sprueDefinitions:requested,document,evaluation,registration:generatingRegistration(document.fingerprint),sprueStatus:"generating",error:null});
  if(before.cavity.result===null){
   set(s=>({...s,undoStack:[...s.undoStack.slice(-49),snap(before)],redoStack:[],registration:before.registration,sprueStatus:"idle",evaluation:{...s.evaluation,phase:"complete",stage:"sprues",progress:1}}));
   return true;
  }
  try{
   const derived=await runDerivedMoldEvaluation({requestId:evaluation.requestId!,sourceRevision:document.revision,sourceFingerprint:document.fingerprint,cavityResult:before.cavity.result,definition:before.definition,cuttingPlanes:before.cuttingPlanes,sprueDefinitions:requested,...registrationSizingPolicyFor(before.definition)});
   const latest=get();
   const finalResult:FinalMoldResult={sourceRevision:document.revision,sourceFingerprint:document.fingerprint,requestId:evaluation.requestId!,bodies:derived.registration.bodies??derived.sprueBodies,keyed:derived.registration.status==="generated",stages:{baseBodies:before.definition.moldBodies??[],cavityResult:before.cavity.result,sprueBodies:derived.sprueBodies,resolvedSprues:derived.resolvedSprues,registration:derived.registration},warnings:derived.warnings};
   if(!canCommitMoldEvaluation(latest,finalResult))return false;
   set(s=>({...s,undoStack:[...s.undoStack.slice(-49),snap(before)],redoStack:[],sprues:derived.resolvedSprues,sprueDefinitions:derived.sprueDefinitions,registration:derived.registration,lastCommittedResult:finalResult,sprueStatus:"idle",evaluation:{...s.evaluation,phase:"complete",stage:"validation",progress:1},error:null}));
   return true;
  }catch(error){
   set(s=>s.evaluation.requestId===evaluation.requestId?{...s,sprueStatus:"idle",evaluation:{...s.evaluation,phase:"failed",failure:{reasonCode:"derived_evaluation_failed",message:error instanceof Error?error.message:"Sprue evaluation failed."}},error:error instanceof Error?error.message:"Sprue evaluation failed."}:s);
   return false;
  }
 },
 resizeSprue:async(operationId,diameterMm)=>{
  const before=get();
  const target=before.sprueDefinitions.find(sprue=>sprue.operationId===operationId);
  if(target===undefined)return false;
  const normalized=normalizeSprueDiameterMm(diameterMm,target.profileDesign.profile.entryNeckDiameterMm);
  if(normalized===null)return false;
  if(normalized===target.profileDesign.profile.mainDiameterMm)return true;
  const requested=before.sprueDefinitions.map(sprue=>sprue.operationId===operationId?{
   ...sprue,profileDesign:{...sprue.profileDesign,profile:{...sprue.profileDesign.profile,mainDiameterMm:normalized}},validation:{status:"pending" as const,reasonCode:null,message:null},
  }:sprue);
  return get().rebuildSprueDefinitions(requested);
 },
 resizeSprueEntryNeck:async(operationId,diameterMm)=>{
  const before=get();
  const target=before.sprueDefinitions.find(sprue=>sprue.operationId===operationId);
  if(target===undefined)return false;
  const normalized=normalizeSprueEntryNeckDiameterMm(diameterMm,target.profileDesign.profile.mainDiameterMm);
  if(normalized===null)return false;
  if(normalized===target.profileDesign.profile.entryNeckDiameterMm)return true;
  const requested=before.sprueDefinitions.map(sprue=>sprue.operationId===operationId?{
   ...sprue,profileDesign:{...sprue.profileDesign,profile:{...sprue.profileDesign.profile,entryNeckDiameterMm:normalized}},validation:{status:"pending" as const,reasonCode:null,message:null},
  }:sprue);
  return get().rebuildSprueDefinitions(requested);
 },
 removeSprue:async(operationId)=>{
  const before=get();
  if(!before.sprueDefinitions.some(sprue=>sprue.operationId===operationId))return false;
  return get().rebuildSprueDefinitions(before.sprueDefinitions.filter(sprue=>sprue.operationId!==operationId));
 },
 moveSprue:async(operationId,position)=>{
  if(![position.x,position.y,position.z].every(Number.isFinite))return false;
  const before=get();
  if(!before.sprueDefinitions.some(sprue=>sprue.operationId===operationId))return false;
  return get().rebuildSprueDefinitions(before.sprueDefinitions.map(sprue=>sprue.operationId===operationId?{...sprue,anchor:{...sprue.anchor,position:structuredClone(position)},validation:{status:"pending" as const,reasonCode:null,message:null}}:sprue));
 },
 rebuildSprues:async(requested)=>{
  const current=get();
  const definitions=requested.map((sprue,index):SprueOperationDefinition=>({operationId:sprue.operationId,anchor:{position:sprue.position,surfaceId:"reference-mold:top"},inwardDirection:sprue.inwardDirection,profileDesign:profileDesign(sprue),creationOrder:index,coordinateSpace:"mold-local",validation:{status:"pending",reasonCode:null,message:null}}));
  return current.rebuildSprueDefinitions(definitions);
 },
 rebuildSprueDefinitions:async(requested)=>{
  const before=get();
  const cavityResult=before.cavity.result;
  if(before.sprueStatus!=="idle"||before.definition===null)return false;
  const document=createDocument(before.document.revision+1,before.definition,before.cuttingPlanes,before.clearanceMm,before.cavity.clearanceMm,requested);
  const evaluation=nextEvaluationRequest(document);
  set({sprueDefinitions:requested,document,evaluation,registration:generatingRegistration(document.fingerprint),sprueStatus:"generating",error:null});
  if(cavityResult===null){
   set(s=>({...s,undoStack:[...s.undoStack.slice(-49),snap(before)],redoStack:[],sprues:[],registration:before.registration,sprueStatus:"idle",evaluation:{...s.evaluation,phase:"complete",stage:"sprues",progress:1}}));
   return true;
  }
  try{
   const derived=await runDerivedMoldEvaluation({requestId:evaluation.requestId!,sourceRevision:document.revision,sourceFingerprint:document.fingerprint,cavityResult,definition:before.definition,cuttingPlanes:before.cuttingPlanes,sprueDefinitions:requested,...registrationSizingPolicyFor(before.definition)});
   const latest=get();
   const finalResult:FinalMoldResult={sourceRevision:document.revision,sourceFingerprint:document.fingerprint,requestId:evaluation.requestId!,bodies:derived.registration.bodies??derived.sprueBodies,keyed:derived.registration.status==="generated",stages:{baseBodies:before.definition.moldBodies??[],cavityResult,sprueBodies:derived.sprueBodies,resolvedSprues:derived.resolvedSprues,registration:derived.registration},warnings:derived.warnings};
   if(!canCommitMoldEvaluation(latest,finalResult))return false;
   set(s=>({...s,undoStack:[...s.undoStack.slice(-49),snap(before)],redoStack:[],registration:derived.registration,sprues:derived.resolvedSprues,sprueDefinitions:derived.sprueDefinitions,lastCommittedResult:finalResult,sprueStatus:"idle",evaluation:{...s.evaluation,phase:"complete",stage:"validation",progress:1},error:null}));
   return true;
  }catch(error){
   set(s=>({...s,sprueStatus:"idle",evaluation:{...s.evaluation,phase:"failed",failure:{reasonCode:"derived_evaluation_failed",message:error instanceof Error?error.message:"Sprue evaluation failed."}},error:error instanceof Error?error.message:"Sprue evaluation failed."}));
   return false;
  }
 },
 setBodyVisibility:(id,visible)=>set(s=>s.bodyVisibility[id]===visible?s:{...history(s),bodyVisibility:{...s.bodyVisibility,[id]:visible}}),
 undo:()=>{cancelActiveCavityGeneration("Undo changed the mold document.");cancelDerivedMoldEvaluation("Undo changed the mold document.");set(s=>{const p=s.undoStack.at(-1);return p?{...p,error:null,sprueStatus:"idle",undoStack:s.undoStack.slice(0,-1),redoStack:[snap(s),...s.redoStack].slice(0,50)}:s;});},
 redo:()=>{cancelActiveCavityGeneration("Redo changed the mold document.");cancelDerivedMoldEvaluation("Redo changed the mold document.");set(s=>{const n=s.redoStack[0];return n?{...n,error:null,sprueStatus:"idle",undoStack:[...s.undoStack.slice(-49),snap(s)],redoStack:s.redoStack.slice(1)}:s;});},
 clearForOrientationChange:()=>{cancelActiveCavityGeneration("Part orientation changed the mold document.");cancelDerivedMoldEvaluation("Part orientation changed the mold document.");set(s=>({...initial,clearanceMm:s.clearanceMm,cavity:unavailableCavity(s.cavity.clearanceMm),document:createDocument(s.document.revision+1,null,[],s.clearanceMm,s.cavity.clearanceMm,[])}));},
 clearForModelReplacement:()=>{cancelActiveCavityGeneration("Model replacement changed the mold document.");cancelDerivedMoldEvaluation("Model replacement changed the mold document.");set({...initial});},
 /**
  * Reopen support: seeds only the committed cutting-plane INPUTS (not the
  * computed geometry outputs -- no mesh/definition/lastCommittedResult is
  * carried over) as a fresh baseline. The caller (cutting-workflow's
  * orchestrator) must follow this with createMoldParts to recompute
  * definition/lastCommittedResult against current model state, so
  * restoration always rebuilds from authoritative inputs rather than
  * reusing stale transient geometry. Resets everything else to `initial`
  * (fresh undo/redo, no cavity/sprues/registration -- out of this phase's
  * scope), so undo can never cross back into the discarded prior session.
  */
  /**
   * Promotes an already-validated, already-executed segmentation result
   * (the Constructed Cutting Plan's Segmentation "Done" commit, or an
   * oversized-model General Segmentation execution) into the singleton as
   * its new
  * authoritative committed result -- the segmentation engine has no
  * face-based cutting planes of its own, so (unlike seedCuttingPlanesForReopen)
  * there is no shared input shape to rebuild from; the bodies themselves
  * are the authoritative output and are adopted directly rather than
  * transferring any transient runtime object. The source definition is
  * retained with only the committed body set and segmentation-specific
  * partition contract replaced, preserving the authoritative mold frame,
  * K1, and K2 required by Create Cavity. Starts from a
  * clean `initial` baseline (fresh undo/redo -- a draft-session history has
  * no meaning for a singleton that never ran that session) with no cutting
  * planes (there is nothing to face-edit until the user starts a new Cut by
  * Face pass).
  */
 adoptCommittedSegmentationResult:(input)=>{
  cancelActiveCavityGeneration("A committed segmentation result replaced the mold document.");
  cancelDerivedMoldEvaluation("A committed segmentation result replaced the mold document.");
  set(s=>{
   const definition=input.sourceDefinition===null||input.bodies.length===0
     ?null
     :buildSegmentationDerivedDefinition(input.sourceDefinition,input.sourceSignature,input.bodies);
   // Sprue *intent* (sprueDefinitions) is preserved across this reset, not
   // wiped along with `...initial` -- a new committed segmentation plan
   // invalidates Sprue's GEOMETRY (cavity-dependent, already unavailable
   // after this reset) exactly like every other upstream edit already does
   // (Mold Scale, re-entry), but must not also delete the user's already-
   // durable Sprue intent (see createSprue/resizeSprue and their own
   // "Waiting for cavity geometry" pending state, which this reset leaves
   // sprueDefinitions in). Its validation is demoted to `pending` via
   // pendingRevalidation -- the resolved geometry this reset just discarded
   // (`...initial`'s sprues:[]) is exactly what a "resolved" status would
   // claim still exists; only a fresh Cavity + Sprue rebuild against this
   // new topology may report it resolved again. document's sprues
   // fingerprint input is always fed intent (sprueDefinitions), not
   // geometry, elsewhere in this file (see invalidateForClearance,
   // createMoldParts, createCavity) -- matched here for the same reason.
   const sprueDefinitions=pendingRevalidation(s.sprueDefinitions);
   const document=createDocument(s.document.revision+1,definition,[],s.clearanceMm,s.cavity.clearanceMm,sprueDefinitions);
   const requestId=`segmentation-committed:${document.fingerprint}`;
   const finalResult:FinalMoldResult={
    sourceRevision:document.revision,
    sourceFingerprint:document.fingerprint,
    requestId,
    bodies:input.bodies,
    keyed:false,
    stages:{baseBodies:input.bodies,cavityResult:null,sprueBodies:[],resolvedSprues:[],registration:unavailableRegistration()},
    warnings:input.warnings,
   };
   return {
    ...initial,
    partGeometrySignature:input.sourceSignature,
    clearanceMm:s.clearanceMm,
    sprueDefinitions,
    definition,
    document,
    workflow:"partsReady",
    lastCommittedResult:finalResult,
    evaluation:{phase:"complete",requestId,sourceRevision:document.revision,sourceFingerprint:document.fingerprint,stage:"validation",progress:1,failure:null},
   };
  });
 },
 promoteReplannedSegmentationResult:(input)=>{
  cancelActiveCavityGeneration("A regenerated segmentation result replaced the mold document.");
  cancelDerivedMoldEvaluation("A regenerated segmentation result replaced the mold document.");
  set(s=>{
   // Superseded by a newer Scale gesture, an Undo, or any other edit since
   // this replan started -- discard rather than overwrite state this
   // in-flight Worker result no longer describes.
   if(s.document.revision!==input.expectedPriorRevision) return s;
   if(input.sourceDefinition===null||input.bodies.length===0) return s;
   const definition=buildSegmentationDerivedDefinition(input.sourceDefinition,input.sourceSignature,input.bodies);
   // Independently re-invalidates resolved Sprue geometry/status on this
   // path too, rather than trusting the Scale edit that started this replan
   // (invalidateForClearance) to have already left them safe -- a topology
   // replacement must never depend on a caller's prior state to stay
   // truthful. See pendingRevalidation's own doc comment.
   const sprueDefinitions=pendingRevalidation(s.sprueDefinitions);
   const document=createDocument(s.document.revision+1,definition,[],s.clearanceMm,s.cavity.clearanceMm,sprueDefinitions);
   const requestId=`segmentation-regenerated:${document.fingerprint}`;
   const finalResult:FinalMoldResult={
    sourceRevision:document.revision,
    sourceFingerprint:document.fingerprint,
    requestId,
    bodies:input.bodies,
    keyed:false,
    stages:{baseBodies:input.bodies,cavityResult:null,sprueBodies:[],resolvedSprues:[],registration:unavailableRegistration()},
    warnings:input.warnings,
   };
   return {
    ...s,
    partGeometrySignature:input.sourceSignature,
    sprues:[],
    sprueDefinitions,
    definition,
    document,
    workflow:"partsReady",
    lastCommittedResult:finalResult,
    evaluation:{phase:"complete",requestId,sourceRevision:document.revision,sourceFingerprint:document.fingerprint,stage:"validation",progress:1,failure:null},
    error:null,
   };
  });
 },
 beginSegmentationRegeneration:()=>set(s=>({...s,segmentationRegenerationCount:s.segmentationRegenerationCount+1})),
 endSegmentationRegeneration:()=>set(s=>({...s,segmentationRegenerationCount:Math.max(0,s.segmentationRegenerationCount-1)})),
});
}
export const useSplitFaceStore=create<SplitFaceState>(createSplitFaceStoreCreator());

/**
 * Sole display/export body selector shape. It never switches to an
 * in-progress stage. A committed result is served ONLY while it still
 * matches the current document (revision + fingerprint) -- i.e. only while
 * the topology it was computed against is still the authoritative one;
 * otherwise the current definition's own bodies are served, so a committed
 * result can never outlive the topology it represents. Factory so a second
 * live SplitFaceState-shaped store gets its OWN independent single-slot
 * memoization instead of thrashing a shared module-level cache against a
 * different instance's state on every render -- confirmed unsafe for two
 * concurrently-subscribed live instances during the Phase 6
 * pre-implementation stability review.
 */
export function createSelectActiveMoldBodies() {
 let selectedSourceBodies:readonly import("../reference-mold-definition/orthogonalMold").MoldBodyData[]|undefined;
 let selectedVisibility:Readonly<Record<string,boolean>>|undefined;
 let selectedVisibleBodies:readonly import("../reference-mold-definition/orthogonalMold").MoldBodyData[]|undefined;
 return (state:Pick<SplitFaceState,"definition"|"lastCommittedResult"|"bodyVisibility"|"document">)=>{
  const committed=state.lastCommittedResult;
  const committedIsCurrent=committed!==null
   &&committed.sourceRevision===state.document.revision
   &&committed.sourceFingerprint===state.document.fingerprint;
  const source=committedIsCurrent?committed.bodies:state.definition?.moldBodies;
  if(source===selectedSourceBodies&&state.bodyVisibility===selectedVisibility)return selectedVisibleBodies;
  selectedSourceBodies=source;selectedVisibility=state.bodyVisibility;selectedVisibleBodies=applyBodyVisibility(source,state.bodyVisibility);
  return selectedVisibleBodies;
 };
}

/** The singleton's own selector instance -- existing call sites (Viewport.tsx, MoldBodiesBrowser.tsx) are unaffected by the factory extraction above. */
export const selectActiveMoldBodies=createSelectActiveMoldBodies();

/**
 * Factory for the same reason as createSelectActiveMoldBodies above -- a
 * second live SplitFaceState-shaped store must never thrash a shared
 * module-level memoization cache against a different instance's state.
 */
export function createSelectSpruePresentationDefinitions() {
 let selectedSprueDefinitions:readonly SprueOperationDefinition[]|undefined;
 let selectedResolvedSprues:readonly SprueDefinition[]|undefined;
 let selectedSpruePresentation:readonly import("../sprue-generation").SpruePresentationDefinition[]=[];
 return (state:Pick<SplitFaceState,"sprueDefinitions"|"sprues">)=>{
  if(state.sprueDefinitions===selectedSprueDefinitions&&state.sprues===selectedResolvedSprues)return selectedSpruePresentation;
  const resolved=new Map(state.sprues.map(sprue=>[sprue.operationId,sprue]));
  selectedSprueDefinitions=state.sprueDefinitions;selectedResolvedSprues=state.sprues;
  selectedSpruePresentation=state.sprueDefinitions.map(definition=>{const sprue=resolved.get(definition.operationId);return {operationId:definition.operationId,position:sprue?.position??definition.anchor.position,inwardDirection:sprue?.inwardDirection??definition.inwardDirection,profile:sprue?.profile??definition.profileDesign.profile,...(sprue?.depthMm!==undefined?{depthMm:sprue.depthMm}:{}),...(sprue?.targetBodyIds!==undefined?{targetBodyIds:sprue.targetBodyIds}:{}),status:definition.validation.status};});
  return selectedSpruePresentation;
 };
}

/** The singleton's own selector instance -- existing call sites (Viewport.tsx) are unaffected by the factory extraction above. */
export const selectSpruePresentationDefinitions=createSelectSpruePresentationDefinitions();











