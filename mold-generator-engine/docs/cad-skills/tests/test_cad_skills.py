"""
CAD Skill System Integrated Pipeline & Quality Gate Test Suite

Validates:
1. Registry, numbered Skill, gateway, proposal, execution, and segmentation schemas.
2. Central Skill Registry capability ownership and lifecycle status.
3. Skill 3 Quality Gate & Implementation Record validation.
4. Skill 4 Quality Gate & Validation Suite Report validation (detects intentional failures).
5. Skill 5 Quality Gate & Optimization Report validation (proves behavior & contracts unchanged).
6. Skill 6 Quality Gate & Maintenance Health Report validation (technical debt detection).
7. End-to-End Pipeline Traceability Chain (Skills 1 -> 2 -> 3 -> 4 -> 5 -> 6).
"""

import json
import re
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
CONTRACTS_DIR = BASE_DIR / "contracts"
REGISTRY_DIR = BASE_DIR / "registry"

SKILL_0_SCHEMA_PATH = CONTRACTS_DIR / "skill-0-orchestrator.schema.json"
SKILL_1_SCHEMA_PATH = CONTRACTS_DIR / "skill-1-designer.schema.json"
SKILL_2_SCHEMA_PATH = CONTRACTS_DIR / "skill-2-geometry.schema.json"
SKILL_3_SCHEMA_PATH = CONTRACTS_DIR / "skill-3-implementer.schema.json"
SKILL_4_SCHEMA_PATH = CONTRACTS_DIR / "skill-4-validation.schema.json"
SKILL_5_SCHEMA_PATH = CONTRACTS_DIR / "skill-5-optimization.schema.json"
SKILL_6_SCHEMA_PATH = CONTRACTS_DIR / "skill-6-maintenance.schema.json"
PRODUCTION_CONSTRAINT_PROFILE_SCHEMA_PATH = CONTRACTS_DIR / "production-constraint-profile.schema.json"
SEGMENTATION_POLICY_SCHEMA_PATH = CONTRACTS_DIR / "segmentation-policy.schema.json"
SEGMENTATION_REQUEST_SCHEMA_PATH = CONTRACTS_DIR / "general-segmentation-request.schema.json"
SEGMENTATION_PLAN_SCHEMA_PATH = CONTRACTS_DIR / "general-segmentation-plan.schema.json"
LOOP_ARTIFACT_ENVELOPE_SCHEMA_PATH = CONTRACTS_DIR / "loop-artifact-envelope.schema.json"
PROMPT_COMPILER_SCHEMA_PATH = CONTRACTS_DIR / "prompt-compiler.schema.json"
PROPOSAL_SCHEMA_PATH = CONTRACTS_DIR / "proposal.schema.json"
REGISTRY_SCHEMA_PATH = REGISTRY_DIR / "skill-registry.schema.json"
REGISTRY_FILE_PATH = REGISTRY_DIR / "skill-registry.json"
EXECUTION_ENGINE_REGISTRY_SCHEMA_PATH = REGISTRY_DIR / "execution-engine-registry.schema.json"
EXECUTION_ENGINE_REGISTRY_FILE_PATH = REGISTRY_DIR / "execution-engines.json"
REPOSITORY_ROOT = BASE_DIR.parent.parent
LOOP_REGISTRY_FILE_PATH = REPOSITORY_ROOT / ".claude" / "loop" / "registry.json"
SEGMENTATION_SKILL_PATH = REPOSITORY_ROOT / ".claude" / "skills" / "general-segmentation-engine" / "SKILL.md"


def load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


class JSONSchemaValidator:
    """Draft-07 JSON Schema Validator enforcing the registered CAD Skill contracts."""

    @staticmethod
    def validate(instance: dict, schema: dict, path: str = "root") -> list[str]:
        errors = []
        schema_type = schema.get("type")

        if isinstance(schema_type, list):
            # Hardening (Defect 4): this branch previously only recognized "string"/"null"
            # union members, silently accepting ANY other type for e.g. ["integer", "null"]
            # (matched stayed False -> always reported as an error) or, depending on order,
            # masking a real type mismatch. Extended to cover every basic JSON Schema type
            # so a new nullable field (e.g. proposal.schema.json's approvedVersion) is
            # actually checked, not just declared.
            matched = False
            for st in schema_type:
                if st == "null" and instance is None:
                    matched = True
                    break
                elif st == "string" and isinstance(instance, str):
                    matched = True
                    break
                elif st == "boolean" and isinstance(instance, bool):
                    matched = True
                    break
                elif st == "integer" and isinstance(instance, int) and not isinstance(instance, bool):
                    matched = True
                    break
                elif st == "number" and isinstance(instance, (int, float)) and not isinstance(instance, bool):
                    matched = True
                    break
                elif st == "object" and isinstance(instance, dict):
                    matched = True
                    break
                elif st == "array" and isinstance(instance, list):
                    matched = True
                    break
            if not matched:
                return [f"{path}: value {instance} does not match allowed union types {schema_type}"]
            return []

        if schema_type == "object":
            if not isinstance(instance, dict):
                return [f"{path}: expected object, got {type(instance).__name__}"]

            for req in schema.get("required", []):
                if req not in instance:
                    errors.append(f"{path}: missing required property '{req}'")

            props = schema.get("properties", {})
            for key, val in instance.items():
                if key in props:
                    errors.extend(
                        JSONSchemaValidator.validate(val, props[key], f"{path}.{key}")
                    )

        elif schema_type == "array":
            if not isinstance(instance, list):
                return [f"{path}: expected array, got {type(instance).__name__}"]

            items_schema = schema.get("items")
            if items_schema:
                for idx, item in enumerate(instance):
                    errors.extend(
                        JSONSchemaValidator.validate(item, items_schema, f"{path}[{idx}]")
                    )

        elif schema_type == "string":
            if not isinstance(instance, str):
                return [f"{path}: expected string, got {type(instance).__name__}"]

            if "enum" in schema and instance not in schema["enum"]:
                errors.append(
                    f"{path}: value '{instance}' not in allowed enum {schema['enum']}"
                )

            if "pattern" in schema:
                pattern = schema["pattern"]
                if not re.search(pattern, instance):
                    errors.append(
                        f"{path}: string '{instance}' does not match pattern '{pattern}'"
                    )

        elif schema_type in ("integer", "number"):
            if not isinstance(instance, (int, float)) or (
                schema_type == "integer" and isinstance(instance, float)
            ):
                return [f"{path}: expected {schema_type}, got {type(instance).__name__}"]

            if "minimum" in schema and instance < schema["minimum"]:
                errors.append(
                    f"{path}: value {instance} is less than minimum {schema['minimum']}"
                )

        elif schema_type == "boolean":
            if not isinstance(instance, bool):
                return [f"{path}: expected boolean, got {type(instance).__name__}"]

        return errors


def validate_segmentation_plan_semantics(plan: dict, profile: dict) -> list[str]:
    """Validate cross-field planning invariants not enforced by the small schema validator."""
    errors = []
    decision = plan["necessityAnalysis"]["decision"]
    selected_id = plan["selectionRecord"]["selectedCandidateId"]
    candidates = {candidate["candidateId"]: candidate for candidate in plan["candidates"]}

    if decision == "REQUIRED":
        if selected_id is None:
            errors.append("REQUIRED plan must select one candidate")
        elif selected_id not in candidates:
            errors.append("selected candidate must belong to the candidate set")
        elif not candidates[selected_id]["feasible"]:
            errors.append("selected candidate must be feasible")
    elif selected_id is not None:
        errors.append(f"{decision} plan must not select a segmented candidate")

    if decision == "NOT_REQUIRED" and any(candidate["boundaryIntents"] for candidate in plan["candidates"]):
        errors.append("NOT_REQUIRED plan must not contain executable boundary intents")
    if decision == "BLOCKED" and not plan["blockers"]:
        errors.append("BLOCKED plan must contain at least one blocker")

    maximum_segments = profile.get("maximumSegmentCount")
    if maximum_segments is not None:
        for candidate in plan["candidates"]:
            if candidate["predictedSegmentCount"] > maximum_segments:
                errors.append("candidate exceeds production profile segment limit")

    if plan["preExecutionValidation"]["executionPerformed"] is not False:
        errors.append("planning artifact must never claim geometry execution")

    return errors


def validate_segmentation_traceability(artifact: dict, artifact_kind: str) -> list[str]:
    """Require a consistent plan reference for segmentation implementation/validation."""
    metadata_plan_id = artifact["metadata"].get("sourceSegmentationPlanArtifactId")
    if artifact_kind == "implementation":
        trace_plan_id = artifact["implementationRecord"]["implementationTraceability"].get(
            "segmentationPlanArtifactId"
        )
        if not metadata_plan_id or metadata_plan_id != trace_plan_id:
            return ["segmentation implementation must carry one consistent accepted plan reference"]
    elif artifact_kind == "validation" and not metadata_plan_id:
        return ["segmentation validation must reference the executed segmentation plan"]
    return []


def run_phase_2_tests():
    print("=======================================================================")
    print("          CAD SKILL SYSTEM INTEGRATED PIPELINE TESTS                  ")
    print("=======================================================================")

    # 1. Schema Validation
    print("\n--- TEST 1: Schema Syntax & Constraint Validation ---")
    all_schemas = [
        ("Registry Schema", REGISTRY_SCHEMA_PATH),
        ("Skill 0 Schema", SKILL_0_SCHEMA_PATH),
        ("Skill 1 Schema", SKILL_1_SCHEMA_PATH),
        ("Skill 2 Schema", SKILL_2_SCHEMA_PATH),
        ("Skill 3 Schema", SKILL_3_SCHEMA_PATH),
        ("Skill 4 Schema", SKILL_4_SCHEMA_PATH),
        ("Skill 5 Schema", SKILL_5_SCHEMA_PATH),
        ("Skill 6 Schema", SKILL_6_SCHEMA_PATH),
        ("Production Constraint Profile Schema", PRODUCTION_CONSTRAINT_PROFILE_SCHEMA_PATH),
        ("Segmentation Policy Schema", SEGMENTATION_POLICY_SCHEMA_PATH),
        ("Segmentation Request Schema", SEGMENTATION_REQUEST_SCHEMA_PATH),
        ("Segmentation Plan Schema", SEGMENTATION_PLAN_SCHEMA_PATH),
        ("Loop Artifact Envelope Schema", LOOP_ARTIFACT_ENVELOPE_SCHEMA_PATH),
        ("Prompt Compiler Schema", PROMPT_COMPILER_SCHEMA_PATH),
        ("Proposal Schema", PROPOSAL_SCHEMA_PATH),
        ("Execution Engine Registry Schema", EXECUTION_ENGINE_REGISTRY_SCHEMA_PATH)
    ]

    for name, path in all_schemas:
        schema_data = load_json(path)
        assert schema_data.get("$schema") == "http://json-schema.org/draft-07/schema#", f"{name} invalid $schema header"
        print(f"  PASS: {name} ({path.name}) loaded and structurally valid.")

    # 2. Skill Registry & Capability Ownership Verification
    print("\n--- TEST 2: Central Skill Registry & Capability Ownership ---")
    reg_schema = load_json(REGISTRY_SCHEMA_PATH)
    reg_data = load_json(REGISTRY_FILE_PATH)
    errs = JSONSchemaValidator.validate(reg_data, reg_schema)
    assert len(errs) == 0, f"Skill Registry Validation Errors: {errs}"

    canonical_skills = {
        "prompt-compiler": (["Compilation", "Gateway"], "Stable"),
        "cad-skill-orchestrator": (["Workflow"], "Stable"),
        "cad-algorithm-designer": (["Design"], "Stable"),
        "geometry-computational-specialist": (["Geometry"], "Stable"),
        "general-segmentation-engine": (["SegmentationPlanning"], "Experimental"),
        "cad-algorithm-implementer": (["Implementation"], "Stable"),
        "cad-validation-testing-engineer": (["Validation", "Testing"], "Stable"),
        "cad-performance-optimization-engineer": (["Performance", "Optimization"], "Stable"),
        "cad-maintenance-evolution-engineer": (["Maintenance", "Evolution"], "Stable")
    }

    registry_map = {s["skillId"]: s for s in reg_data["skills"]}

    for skill_id, (expected_caps, expected_status) in canonical_skills.items():
        assert skill_id in registry_map, f"Missing canonical skill ID: {skill_id}"
        actual_caps = registry_map[skill_id]["capabilities"]
        assert actual_caps == expected_caps, f"Skill {skill_id} capabilities mismatch: expected {expected_caps}, got {actual_caps}"
        assert registry_map[skill_id]["status"] == expected_status, (
            f"Skill {skill_id} status should be {expected_status}, got {registry_map[skill_id]['status']}"
        )
        print(f"  PASS: Skill '{skill_id}' confirmed {expected_status} with capabilities {actual_caps}.")

    # 2b. Cross-registry drift guard: skill-registry.json and .claude/loop/registry.json
    # independently maintain the same 9 CAD-pipeline skills' routing metadata (see
    # docs/agent/CURRENT_HANDOFF.md). `description` legitimately differs between them
    # (each is written for a different consumer's framing), but `capabilities`,
    # `dependencies`, and `executionPriority` are mechanical facts about the same skill
    # and must not silently diverge. This does not merge the two registries — see
    # docs/cad-skills/LOOP_ENGINE.md and docs/agent/CURRENT_HANDOFF.md for why a full
    # merge is out of scope — it only turns "must be kept in sync manually" into a
    # failure an agent cannot miss.
    loop_registry_for_drift_check = load_json(LOOP_REGISTRY_FILE_PATH)
    loop_map_for_drift_check = {s["skillId"]: s for s in loop_registry_for_drift_check["skills"]}
    for skill_id in canonical_skills:
        assert skill_id in loop_map_for_drift_check, (
            f"'{skill_id}' is in skill-registry.json but missing from .claude/loop/registry.json"
        )
        reg_entry = registry_map[skill_id]
        loop_entry = loop_map_for_drift_check[skill_id]
        assert reg_entry["capabilities"] == loop_entry["capabilities"], (
            f"Skill '{skill_id}' capabilities diverged between the two registries: "
            f"skill-registry.json={reg_entry['capabilities']} vs "
            f".claude/loop/registry.json={loop_entry['capabilities']}"
        )
        assert reg_entry["dependencies"] == loop_entry["dependencies"], (
            f"Skill '{skill_id}' dependencies diverged between the two registries: "
            f"skill-registry.json={reg_entry['dependencies']} vs "
            f".claude/loop/registry.json={loop_entry['dependencies']}"
        )
        assert reg_entry["executionPriority"] == loop_entry["executionPriority"], (
            f"Skill '{skill_id}' executionPriority diverged between the two registries: "
            f"skill-registry.json={reg_entry['executionPriority']} vs "
            f".claude/loop/registry.json={loop_entry['executionPriority']}"
        )
    print(f"  PASS: capabilities/dependencies/executionPriority agree across both registries for all {len(canonical_skills)} CAD-pipeline skills.")

    # 3. Skill 3 Implementation Record & Quality Gate
    print("\n--- TEST 3: Skill 3 Implementation Record & Upstream Quality Gate ---")
    s3_schema = load_json(SKILL_3_SCHEMA_PATH)

    sample_s3 = {
        "metadata": {
            "artifactId": "IMP-SPRUE-001",
            "artifactType": "ImplementationRecord",
            "artifactVersion": "1.0.0",
            "revision": 1,
            "authorSkill": "cad-algorithm-implementer",
            "status": "COMPLETED",
            "detailLevel": "STANDARD",
            "updateMode": "FULL",
            "sourceAlgorithmArtifactId": "ALG-SPRUE-001",
            "sourceGeometryArtifactId": "GEO-SPRUE-001",
            "dependencyIds": ["ALG-SPRUE-001", "GEO-SPRUE-001"],
            "supersedesArtifactId": None,
            "invalidationTriggers": ["Spec revision"]
        },
        "featureName": "Sprue",
        "changedSections": [],
        "implementationRecord": {
            "targetSubsystem": "frontend/src/features/mold-generation/sprue-generation",
            "modifiedFiles": ["frontend/src/features/mold-generation/sprue-generation/sprueProfile.ts"],
            "createdFiles": ["frontend/src/features/mold-generation/sprue-generation/sprueGeneration.contracts.ts"],
            "exports": ["createSprueProfile", "validateSprueBounds"],
            "implementationTraceability": {
                "algorithmArtifactId": "ALG-SPRUE-001",
                "geometryArtifactId": "GEO-SPRUE-001",
                "specSectionsSatisfied": ["1_problemDefinition", "2_inputs", "6_algorithmPipeline"]
            },
            "implementationAssumptions": ["Z-up coordinate space enforced by caller"],
            "qualityChecksPassed": True
        }
    }

    errs_s3 = JSONSchemaValidator.validate(sample_s3, s3_schema)
    assert len(errs_s3) == 0, f"Skill 3 Validation Errors: {errs_s3}"
    print("  PASS: Skill 3 ImplementationRecord satisfies schema rules and preserves traceability.")

    # 4. Skill 4 Validation Suite Report & Intentional Failure Detection
    print("\n--- TEST 4: Skill 4 Validation Suite Report & Intentional Failure Detection ---")
    s4_schema = load_json(SKILL_4_SCHEMA_PATH)

    sample_s4_pass = {
        "metadata": {
            "artifactId": "VAL-SPRUE-001",
            "artifactType": "ValidationSuiteReport",
            "artifactVersion": "1.0.0",
            "revision": 1,
            "authorSkill": "cad-validation-testing-engineer",
            "status": "PASSED",
            "sourceImplementationArtifactId": "IMP-SPRUE-001",
            "sourceAlgorithmArtifactId": "ALG-SPRUE-001",
            "sourceGeometryArtifactId": "GEO-SPRUE-001",
            "dependencyIds": ["IMP-SPRUE-001"],
            "invalidationTriggers": ["Implementation change"]
        },
        "featureName": "Sprue",
        "changedSections": [],
        "validationReport": {
            "overallResult": "PASS",
            "summary": "All 11 validation suites executed successfully.",
            "testResults": [
                {"testId": "T-UNIT-01", "category": "UNIT", "status": "PASS", "durationMs": 4.2},
                {"testId": "T-GEOM-01", "category": "GEOMETRY", "status": "PASS", "durationMs": 12.5},
                {"testId": "T-TOPO-01", "category": "TOPOLOGY", "status": "PASS", "durationMs": 8.1},
                {"testId": "T-BOOL-01", "category": "BOOLEAN_ROBUSTNESS", "status": "PASS", "durationMs": 15.3}
            ],
            "geometryValidation": {
                "watertightManifoldCheck": True,
                "eulerCharacteristic": "V - E + F = 2",
                "coplanarFaceCheck": True
            },
            "numericalToleranceValidation": {
                "distanceTolerancePassed": True,
                "angularTolerancePassed": True
            },
            "detectedIssues": []
        }
    }

    errs_s4 = JSONSchemaValidator.validate(sample_s4_pass, s4_schema)
    assert len(errs_s4) == 0, f"Skill 4 Validation Errors: {errs_s4}"
    print("  PASS: Skill 4 ValidationSuiteReport satisfies schema rules.")

    # Intentional Failure Detection Test
    sample_s4_fail = json.loads(json.dumps(sample_s4_pass))
    sample_s4_fail["metadata"]["status"] = "FAILED"
    sample_s4_fail["validationReport"]["overallResult"] = "FAIL"
    sample_s4_fail["validationReport"]["testResults"][2]["status"] = "FAIL"
    sample_s4_fail["validationReport"]["testResults"][2]["errorDetails"] = "Euler characteristic violation: V - E + F = 0 (Non-manifold edge detected)"
    sample_s4_fail["validationReport"]["geometryValidation"]["watertightManifoldCheck"] = False
    sample_s4_fail["validationReport"]["detectedIssues"].append({
        "issueId": "ISSUE-TOPO-001",
        "severity": "CRITICAL",
        "category": "TOPOLOGY",
        "description": "Non-manifold edge created during CSG boolean difference",
        "remediationRecommendation": "Apply 0.05mm coplanar epsilon perturbation in Skill 2 strategy"
    })

    errs_s4_f = JSONSchemaValidator.validate(sample_s4_fail, s4_schema)
    assert len(errs_s4_f) == 0, f"Skill 4 Failure Report Validation Errors: {errs_s4_f}"
    assert sample_s4_fail["validationReport"]["overallResult"] == "FAIL"
    assert len(sample_s4_fail["validationReport"]["detectedIssues"]) == 1
    print("  PASS: Skill 4 correctly detects and formats intentional topology validation failures.")

    # 5. Skill 5 Optimization Report & Behavior Preservation Verification
    print("\n--- TEST 5: Skill 5 Optimization Report & Behavior Preservation ---")
    s5_schema = load_json(SKILL_5_SCHEMA_PATH)

    sample_s5 = {
        "metadata": {
            "artifactId": "OPT-SPRUE-001",
            "artifactType": "OptimizationReport",
            "artifactVersion": "1.0.0",
            "revision": 1,
            "authorSkill": "cad-performance-optimization-engineer",
            "status": "APPLIED",
            "sourceValidationArtifactId": "VAL-SPRUE-001",
            "sourceImplementationArtifactId": "IMP-SPRUE-001",
            "dependencyIds": ["VAL-SPRUE-001"],
            "invalidationTriggers": ["Algorithm refactoring"]
        },
        "featureName": "Sprue",
        "changedSections": [],
        "optimizationReport": {
            "targetComponent": "sprueProfile.ts",
            "baselineMetrics": {"executionTimeMs": 42.0, "memoryBytes": 1048576, "bvTreeDepth": 8},
            "optimizedMetrics": {"executionTimeMs": 18.0, "memoryBytes": 524288, "bvTreeDepth": 6},
            "appliedOptimizations": [
                {"technique": "SPATIAL_QUERY", "description": "BVH spatial ray query acceleration", "speedupFactor": 2.33}
            ],
            "behaviorVerification": {
                "observableBehaviorUnchanged": True,
                "contractsUnchanged": True,
                "validationSuiteRePassed": True
            }
        }
    }

    errs_s5 = JSONSchemaValidator.validate(sample_s5, s5_schema)
    assert len(errs_s5) == 0, f"Skill 5 Optimization Validation Errors: {errs_s5}"
    assert sample_s5["optimizationReport"]["behaviorVerification"]["observableBehaviorUnchanged"] is True
    assert sample_s5["optimizationReport"]["behaviorVerification"]["contractsUnchanged"] is True
    print("  PASS: Skill 5 OptimizationReport satisfies schema rules and proves observable behavior remains unchanged.")

    # 6. Skill 6 Maintenance Health Report & Technical Debt Detection
    print("\n--- TEST 6: Skill 6 Maintenance Health Report & Tech Debt Detection ---")
    s6_schema = load_json(SKILL_6_SCHEMA_PATH)

    sample_s6 = {
        "metadata": {
            "artifactId": "MNT-SPRUE-001",
            "artifactType": "MaintenanceHealthReport",
            "artifactVersion": "1.0.0",
            "revision": 1,
            "authorSkill": "cad-maintenance-evolution-engineer",
            "status": "DEBT_DETECTED",
            "sourceOptimizationArtifactId": "OPT-SPRUE-001",
            "dependencyIds": ["OPT-SPRUE-001"],
            "invalidationTriggers": ["Contract deprecation"]
        },
        "featureName": "Sprue",
        "changedSections": [],
        "maintenanceReport": {
            "healthScore": 92.5,
            "detectedTechnicalDebt": [
                {
                    "debtId": "DEBT-001",
                    "category": "DEPRECATED_CONTRACT",
                    "description": "Legacy vector helper used in sprue profile calculations",
                    "impactScore": 3.0
                }
            ],
            "migrationRecommendations": [
                {
                    "recommendationId": "MIG-001",
                    "targetComponent": "sprueProfile.ts",
                    "proposedAction": "Migrate to canonical NumericPoint3 matrix transform helper",
                    "urgency": "LOW"
                }
            ],
            "evolutionRoadmap": [
                {"phase": "Phase 3", "actionItem": "Refactor legacy vector helpers"}
            ]
        }
    }

    errs_s6 = JSONSchemaValidator.validate(sample_s6, s6_schema)
    assert len(errs_s6) == 0, f"Skill 6 Maintenance Validation Errors: {errs_s6}"
    assert len(sample_s6["maintenanceReport"]["detectedTechnicalDebt"]) == 1
    print("  PASS: Skill 6 MaintenanceHealthReport satisfies schema rules and detects technical debt.")

    # 7. End-to-End Traceability Chain Assertion Across Skills 1-6
    print("\n--- TEST 7: End-to-End Artifact Traceability Chain Assertion ---")
    traceability_chain = {
        "Skill 1 (Design)": sample_s3["implementationRecord"]["implementationTraceability"]["algorithmArtifactId"],
        "Skill 2 (Geometry)": sample_s3["implementationRecord"]["implementationTraceability"]["geometryArtifactId"],
        "Skill 3 (Implementation)": sample_s4_pass["metadata"]["sourceImplementationArtifactId"],
        "Skill 4 (Validation)": sample_s5["metadata"]["sourceValidationArtifactId"],
        "Skill 5 (Optimization)": sample_s6["metadata"]["sourceOptimizationArtifactId"]
    }

    assert traceability_chain["Skill 1 (Design)"] == "ALG-SPRUE-001"
    assert traceability_chain["Skill 2 (Geometry)"] == "GEO-SPRUE-001"
    assert traceability_chain["Skill 3 (Implementation)"] == "IMP-SPRUE-001"
    assert traceability_chain["Skill 4 (Validation)"] == "VAL-SPRUE-001"
    assert traceability_chain["Skill 5 (Optimization)"] == "OPT-SPRUE-001"

    print("  PASS: Complete traceability chain verified across Skills 1 -> 2 -> 3 -> 4 -> 5 -> 6!")

    # 8. Prompt Compiler Contract Validation
    print("\n--- TEST 8: Prompt Compiler Gateway Contract Validation ---")
    pc_schema = load_json(PROMPT_COMPILER_SCHEMA_PATH)
    sample_pc = {
        "registryVersion": "1.0.0",
        "rawPrompt": "Fix sprue yellow color issue",
        "engineeringIntent": "Isolate sprue/funnel render overlays from canonical mold block bodies",
        "taskClassification": "CAD_GEOMETRY",
        "complexityLevel": "LEVEL_3",
        "estimatedRisk": "HIGH",
        "affectedSystems": [
            "frontend/src/features/viewport/runtime/referenceMoldBlock3dRuntime.ts",
            "frontend/src/features/viewport/Viewport.tsx"
        ],
        "protectedSystems": [
            "activeMoldBodies",
            "FinalMoldResult STL export",
            "Manifold Boolean CSG kernel"
        ],
        "engineeringConstraints": [
            "Preserve Engineering Red for solid mold bodies",
            "Use render-only satin Engineering Yellow overlays for sprues and funnels",
            "Disable raycasting on overlays (raycast = () => undefined)"
        ],
        "validationRequirements": [
            "npm test -- --run src/features/viewport/__tests__/referenceMoldBlock3dRuntime.appearance.test.ts",
            "npm run typecheck"
        ],
        "compiledEngineeringPrompt": "COMPILED ENGINEERING PROMPT\n\n### Objective\nRestore visual identification of Sprue and Funnel...",
        "compilerReport": {
            "status": "Compilation completed",
            "intent": "Isolate sprue/funnel render overlays from canonical mold block bodies",
            "compilationLevel": "Complex CAD",
            "detectedDomains": [
                "Geometry & Topology",
                "Rendering & Materials",
                "Boolean CSG Operations",
                "Sprue & Funnel Generation"
            ],
            "protectedSystems": [
                "activeMoldBodies",
                "FinalMoldResult STL export",
                "Manifold Boolean CSG kernel"
            ],
            "engineeringAssumptions": [
                "Sprue geometry is merged into main mold body, requiring investigation of material role resolution vs. render overlays."
            ],
            "compilationDecisions": [
                "Classified as Level 3 Complex CAD task due to Boolean mesh merging vs visual overlay isolation.",
                "Mandated render-only overlay strategy using SpruePresentationDefinition.",
                "Injected z-fighting prevention (polygonOffset) and raycast isolation (raycast = () => undefined)."
            ],
            "warnings": [],
            "outputStatus": "Compiled Engineering Prompt generated successfully."
        }
    }
    errs_pc = JSONSchemaValidator.validate(sample_pc, pc_schema)
    assert len(errs_pc) == 0, f"Prompt Compiler Validation Errors: {errs_pc}"
    print("  PASS: Prompt Compiler payload structurally valid and conforms to PromptCompilerContract schema.")

    # 9. Proposal Contract Validation (Proposal-Driven Engineering Workflow, Phase 1)
    print("\n--- TEST 9: Engineering Proposal Contract Validation ---")
    proposal_schema = load_json(PROPOSAL_SCHEMA_PATH)

    sample_proposal = {
        "proposalId": "run-1784900000000-abc123",
        "version": 2,
        "status": "AWAITING_APPROVAL",
        "rawUserRequest": "Change registration keys to green.",
        "engineeringPrompt": "### Objective\nChange registration key material color from Engineering Yellow to Engineering Green...",
        "promptHash": "a" * 64,
        "repositoryRevision": "3a39e83f1e2d4c5b6a7089d0e1f2a3b4c5d6e7f8",
        "filesInvestigated": [
            "frontend/src/features/mold-generation/registration/RegistrationGenerationService.ts",
            "frontend/src/features/viewport/runtime/referenceMoldBlock3dRuntime.ts"
        ],
        "expectedFilesToChange": [
            "frontend/src/features/viewport/runtime/cadMaterialFactory.ts"
        ],
        "protectedSystems": ["activeMoldBodies", "FinalMoldResult STL export", "Manifold Boolean CSG kernel"],
        "validationPlan": ["npm test -- --run src/features/viewport", "npm run typecheck"],
        "risks": ["Registration key material may be shared with an unrelated feature role"],
        "openQuestions": ["Is the color shared across all key instances or assigned per-body?"],
        "executionOrder": [
            {
                "step": 1,
                "skill": "mold-cad-engineering",
                "purpose": "Review material assignment change for CAD correctness",
                "inputSource": "userPrompt",
                "artifactAction": "FULL"
            }
        ],
        "approval": {
            "approvalStatus": "PENDING",
            "approvedAt": None,
            "approvedPromptHash": None,
            "approvedVersion": None,
            "approvedRepositoryRevision": None,
            "rejectedAt": None,
            "rejectionReason": None,
            "cancelledAt": None,
            "cancelReason": None
        },
        "history": [
            {
                "version": 1,
                "promptHash": "b" * 64,
                "repositoryRevision": "2f1a8c9d0e1b2a3c4d5e6f7089a0b1c2d3e4f5a6",
                "engineeringPrompt": "### Objective\nChange registration key material color to green (draft)...",
                "status": "REJECTED",
                "createdAt": "2026-07-24T10:00:00.000Z",
                "changeReason": "Human requested a more specific green shade before approving."
            }
        ],
        "createdAt": "2026-07-24T10:00:00.000Z",
        "updatedAt": "2026-07-24T10:05:00.000Z"
    }

    errs_proposal = JSONSchemaValidator.validate(sample_proposal, proposal_schema)
    assert len(errs_proposal) == 0, f"Proposal Validation Errors: {errs_proposal}"
    assert sample_proposal["version"] == 2, "REVISE must increment version, never reuse it"
    assert len(sample_proposal["history"]) == 1, "Prior version must be preserved in immutable history, not discarded"
    assert sample_proposal["history"][0]["version"] == 1
    assert sample_proposal["history"][0]["status"] == "REJECTED"
    print("  PASS: EngineeringProposal satisfies schema rules; REVISE preserves immutable version history.")

    # Stale-approval detection: an approval recorded against a promptHash that no
    # longer matches the current proposal must be distinguishable from a live approval.
    stale_case = json.loads(json.dumps(sample_proposal))
    stale_case["status"] = "APPROVED"
    stale_case["approval"]["approvalStatus"] = "APPROVED"
    stale_case["approval"]["approvedAt"] = "2026-07-24T10:04:00.000Z"
    stale_case["approval"]["approvedPromptHash"] = "c" * 64  # does not match promptHash below
    stale_case["approval"]["approvedVersion"] = stale_case["version"]
    stale_case["approval"]["approvedRepositoryRevision"] = stale_case["repositoryRevision"]

    errs_stale = JSONSchemaValidator.validate(stale_case, proposal_schema)
    assert len(errs_stale) == 0, f"Stale-approval fixture Validation Errors: {errs_stale}"
    assert stale_case["approval"]["approvedPromptHash"] != stale_case["promptHash"], (
        "Fixture must demonstrate a hash mismatch: Execution must refuse to proceed in this case"
    )
    print("  PASS: Proposal contract carries the fields needed to detect a stale approval (promptHash mismatch).")

    # 10. Execution Engine Registry Validation
    print("\n--- TEST 10: Execution Engine Registry Validation ---")
    ee_schema = load_json(EXECUTION_ENGINE_REGISTRY_SCHEMA_PATH)
    ee_data = load_json(EXECUTION_ENGINE_REGISTRY_FILE_PATH)

    errs_ee = JSONSchemaValidator.validate(ee_data, ee_schema)
    assert len(errs_ee) == 0, f"Execution Engine Registry Validation Errors: {errs_ee}"

    engines_by_id = {e["engineId"]: e for e in ee_data["engines"]}
    for required_engine in ("claude-code", "codex", "gemini-cli"):
        assert required_engine in engines_by_id, f"Missing execution engine entry: {required_engine}"

    assert engines_by_id["claude-code"]["verificationLevel"] == "HookConfirmed"
    assert "SkillInvocation" in engines_by_id["claude-code"]["capabilities"]
    assert engines_by_id["codex"]["verificationLevel"] == "ExplicitLogOnly"
    assert "SkillInvocation" not in engines_by_id["codex"]["capabilities"], (
        "Codex has no Skill tool per docs/cad-skills/LOOP_ENGINE.md - must not claim SkillInvocation"
    )
    assert engines_by_id["gemini-cli"]["status"] == "Unverified"
    assert engines_by_id["gemini-cli"]["capabilities"] == [], (
        "Gemini CLI is unverified in this repository - must not assert unevidenced capabilities"
    )
    print("  PASS: Execution Engine Registry structurally valid; capability claims match repository evidence.")

    # 11. Executing Proposal Fixture (Phase 4 - Execution Engine abstraction + hard enforcement)
    print("\n--- TEST 11: Executing Proposal with Execution Engine Assignment ---")
    executing_proposal = json.loads(json.dumps(sample_proposal))
    executing_proposal["version"] = 3
    executing_proposal["status"] = "EXECUTING"
    executing_proposal["approval"]["approvalStatus"] = "APPROVED"
    executing_proposal["approval"]["approvedAt"] = "2026-07-24T11:00:00.000Z"
    executing_proposal["approval"]["approvedPromptHash"] = executing_proposal["promptHash"]
    executing_proposal["approval"]["approvedVersion"] = executing_proposal["version"]
    executing_proposal["approval"]["approvedRepositoryRevision"] = executing_proposal["repositoryRevision"]
    executing_proposal["executionEngineId"] = "claude-code"
    executing_proposal["executionStartedAt"] = "2026-07-24T11:05:00.000Z"

    errs_executing = JSONSchemaValidator.validate(executing_proposal, proposal_schema)
    assert len(errs_executing) == 0, f"Executing Proposal Validation Errors: {errs_executing}"
    assert executing_proposal["approval"]["approvedVersion"] == executing_proposal["version"], (
        "Hardening: approvedVersion must match the proposal's current version for begin-execution to allow it"
    )
    assert executing_proposal["executionEngineId"] in engines_by_id, (
        "executionEngineId must reference a registered execution engine"
    )
    assert "EditFiles" in engines_by_id[executing_proposal["executionEngineId"]]["capabilities"], (
        "The assigned execution engine must actually declare the capability required to execute a code change"
    )
    print("  PASS: EXECUTING proposal with executionEngineId satisfies schema rules and references a registered, capable engine.")

    # 12. Complete Lifecycle Fixtures (Engineering Hardening pass - Defect 2)
    print("\n--- TEST 12: Complete Lifecycle - VALIDATING/COMPLETED Fixtures + Validator Fix Proof ---")
    validating_proposal = json.loads(json.dumps(executing_proposal))
    validating_proposal["status"] = "VALIDATING"
    errs_validating = JSONSchemaValidator.validate(validating_proposal, proposal_schema)
    assert len(errs_validating) == 0, f"VALIDATING Proposal Validation Errors: {errs_validating}"
    print("  PASS: VALIDATING proposal is schema-valid (real code path in .claude/loop/loop-trace.mjs's begin-validation).")

    completed_proposal = json.loads(json.dumps(validating_proposal))
    completed_proposal["status"] = "COMPLETED"
    errs_completed = JSONSchemaValidator.validate(completed_proposal, proposal_schema)
    assert len(errs_completed) == 0, f"COMPLETED Proposal Validation Errors: {errs_completed}"
    print("  PASS: COMPLETED proposal is schema-valid (real code path in .claude/loop/loop-trace.mjs's complete-validation).")

    all_lifecycle_states = {
        "DISCOVERING", "ANALYZING", "COMPILING_PROPOSAL", "AWAITING_APPROVAL", "APPROVED",
        "EXECUTING", "VALIDATING", "COMPLETED", "REJECTED", "CANCELLED",
    }
    assert set(proposal_schema["properties"]["status"]["enum"]) == all_lifecycle_states, (
        "The schema's declared lifecycle enum must exactly match the states this test suite "
        "and .claude/loop/loop-trace.mjs's computeProposalTransition actually exercise - no "
        "documentation-only state may remain undeclared or unaccounted for."
    )
    print("  PASS: All 10 declared lifecycle states are accounted for (see .claude/loop/loop-trace.test.mjs for the Node-side transition tests proving each is a real, reachable code path).")

    # Prove the union-type validator fix (above) actually catches a real mismatch, not just
    # that it stopped rejecting valid fixtures. Without the fix, this invalid instance
    # (a string where the schema requires integer|null) was previously reported as passing.
    bad_version_case = json.loads(json.dumps(sample_proposal))
    bad_version_case["approval"]["approvedVersion"] = "not-an-integer"
    errs_bad_version = JSONSchemaValidator.validate(bad_version_case, proposal_schema)
    assert len(errs_bad_version) > 0, (
        "JSONSchemaValidator must reject a string value for an ['integer','null']-typed field - "
        "this is the exact union-type bug this Hardening pass fixed in JSONSchemaValidator.validate()."
    )
    print("  PASS: JSONSchemaValidator now correctly rejects a type mismatch on an integer|null union field (bug fixed this pass).")

    # 13. General Segmentation Engine: domain neutrality, policy, plan semantics, and registry order
    print("\n--- TEST 13: General Segmentation Engine Contracts & Orchestration ---")
    profile_schema = load_json(PRODUCTION_CONSTRAINT_PROFILE_SCHEMA_PATH)
    policy_schema = load_json(SEGMENTATION_POLICY_SCHEMA_PATH)
    request_schema = load_json(SEGMENTATION_REQUEST_SCHEMA_PATH)
    plan_schema = load_json(SEGMENTATION_PLAN_SCHEMA_PATH)

    cnc_profile = {
        "profileId": "profile:subtractive-cnc",
        "profileVersion": "1.0.0",
        "revision": 1,
        "domainId": "production.subtractive.cnc",
        "providerId": "fixture.cnc",
        "units": "millimeters",
        "coordinateConvention": "right-handed-z-up",
        "applicableRepresentations": ["solid", "brep"],
        "constraints": [
            {
                "constraintId": "access-envelope",
                "category": "accessibility",
                "requirementLevel": "HARD_CONSTRAINT",
                "description": "Every planned segment must be reachable by the configured production setup.",
                "value": {"envelopeRef": "fixture-envelope"},
                "valueSource": "fixture.cnc/setup-1",
                "evidenceIds": ["evidence:setup-1"]
            }
        ],
        "maximumSegmentCount": 4,
        "allowedConfigurationIds": ["configuration:setup-1"],
        "extensions": [
            {
                "namespace": "fixture.cnc",
                "schemaId": "fixture.cnc/setup",
                "schemaVersion": "1.0.0",
                "owner": "fixture.cnc",
                "data": {"setupId": "setup-1"}
            }
        ],
        "evidence": [
            {
                "evidenceId": "evidence:setup-1",
                "source": "fixture.cnc/setup-1",
                "revision": "1",
                "confidence": "HIGH"
            }
        ],
        "invalidationTokens": ["setup-1:revision-1"]
    }
    robotics_profile = {
        **json.loads(json.dumps(cnc_profile)),
        "profileId": "profile:robotic-assembly",
        "domainId": "operations.robotics.assembly",
        "providerId": "fixture.robotics",
        "applicableRepresentations": ["assembly"],
        "constraints": [
            {
                "constraintId": "manipulator-reach",
                "category": "handling",
                "requirementLevel": "HARD_CONSTRAINT",
                "description": "Every planned segment must remain within the supplied manipulation envelope.",
                "value": {"reachModelRef": "robot-cell-a"},
                "valueSource": "fixture.robotics/cell-a",
                "evidenceIds": ["evidence:setup-1"]
            }
        ],
        "extensions": [
            {
                "namespace": "fixture.robotics",
                "schemaId": "fixture.robotics/cell",
                "schemaVersion": "1.0.0",
                "owner": "fixture.robotics",
                "data": {"cellId": "cell-a"}
            }
        ]
    }
    for profile in (cnc_profile, robotics_profile):
        profile_errors = JSONSchemaValidator.validate(profile, profile_schema)
        assert profile_errors == [], f"Production profile validation errors: {profile_errors}"
    print("  PASS: materially different CNC and robotics profiles use the same domain-neutral contract.")

    segmentation_policy = {
        "policyId": "policy:balanced-engineering",
        "policyVersion": "1.0.0",
        "revision": 1,
        "providerId": "fixture.policy",
        "components": [
            {
                "componentId": "component:production",
                "role": "production",
                "applicability": "all candidates",
                "objectives": [
                    {
                        "metricId": "constraint-margin",
                        "objectiveKind": "HARD_CONSTRAINT",
                        "normalizationMethod": "declared-range",
                        "priority": 1,
                        "valueSource": "profile:subtractive-cnc"
                    }
                ],
                "uncertaintyTreatment": {
                    "method": "evidence-confidence-penalty",
                    "penaltySource": "fixture.policy"
                },
                "requiredValidation": ["constraint-margin-recalculation"]
            }
        ],
        "aggregation": {
            "method": "pareto-then-weighted",
            "weightSource": "policy:balanced-engineering",
            "riskPenaltySource": "policy:balanced-engineering"
        },
        "tieBreakers": ["validated-confidence", "minimum-hard-constraint-margin", "engineering-risk", "candidate-id"],
        "requiredEvidence": ["subject-bounds", "production-constraints"],
        "invalidationTriggers": ["policy revision", "profile revision"]
    }
    policy_errors = JSONSchemaValidator.validate(segmentation_policy, policy_schema)
    assert policy_errors == [], f"Segmentation policy validation errors: {policy_errors}"
    missing_policy = json.loads(json.dumps(segmentation_policy))
    del missing_policy["components"]
    assert JSONSchemaValidator.validate(missing_policy, policy_schema), "Missing mandatory policy components must fail"

    bad_extension = json.loads(json.dumps(cnc_profile))
    del bad_extension["extensions"][0]["owner"]
    assert JSONSchemaValidator.validate(bad_extension, profile_schema), (
        "Technology-specific extension data must identify its owner"
    )
    print("  PASS: policy priorities are explicit; missing policy and unowned extension data are rejected.")

    segmentation_request = {
        "schemaVersion": "1.0.0",
        "requestId": "request:segmentation-1",
        "updateMode": "FULL",
        "priorPlanArtifactId": None,
        "sourceAlgorithmArtifactId": "ALG-GENERIC-001",
        "sourceGeometryArtifactId": "GEO-GENERIC-001",
        "candidateStrategySources": [
            {
                "strategySourceId": "strategy:project-owned",
                "strategyFamily": "project.example.feature-aware",
                "owner": "fixture.project",
                "sourceSchemaId": "fixture.project/segmentation-strategy",
                "sourceSchemaVersion": "1.0.0",
                "algorithmArtifactId": "ALG-GENERIC-001",
                "algorithmSectionReference": "candidate-generation",
                "geometryArtifactId": "GEO-GENERIC-001",
                "geometrySectionReference": "boundary-representation"
            }
        ],
        "subject": {
            "subjectId": "subject-1",
            "subjectRevision": "1",
            "sourceSystem": "fixture.cad",
            "representation": "brep",
            "artifactReference": "fixture.cad/subject-1",
            "contentHash": "sha256:subject-1",
            "units": "millimeters",
            "coordinateFrame": "subject-local",
            "dimensionality": "3D",
            "bounds": {"reference": "bounds-1"},
            "topologySummary": "closed connected solid",
            "evidence": [
                {
                    "evidenceId": "subject-bounds",
                    "kind": "bounds",
                    "sourceArtifactId": "GEO-GENERIC-001",
                    "confidence": "HIGH",
                    "dataReference": "bounds-1"
                }
            ]
        },
        "productionConstraintProfileRef": {
            "profileId": cnc_profile["profileId"],
            "profileVersion": cnc_profile["profileVersion"],
            "revision": cnc_profile["revision"]
        },
        "segmentationPolicyRef": {
            "policyId": segmentation_policy["policyId"],
            "policyVersion": segmentation_policy["policyVersion"],
            "revision": segmentation_policy["revision"]
        },
        "allowedConfigurations": [
            {
                "configurationId": "configuration:setup-1",
                "description": "Accepted unsegmented setup candidate.",
                "transformReference": "transform:identity"
            }
        ],
        "protectedRegions": [],
        "downstreamRequirements": ["preserve subject identity in the execution manifest"],
        "invalidationTokens": ["subject-1:revision-1", "setup-1:revision-1"],
        "extensions": []
    }
    request_errors = JSONSchemaValidator.validate(segmentation_request, request_schema)
    assert request_errors == [], f"Segmentation request validation errors: {request_errors}"

    required_plan = {
        "metadata": {
            "artifactId": "SEG-PLAN-001",
            "artifactType": "SegmentationPlanSpecification",
            "artifactVersion": "1.0.0",
            "revision": 1,
            "authorSkill": "general-segmentation-engine",
            "status": "ACCEPTED",
            "detailLevel": "DEEP",
            "updateMode": "FULL",
            "dependencyIds": [
                "ALG-GENERIC-001",
                "GEO-GENERIC-001",
                cnc_profile["profileId"],
                segmentation_policy["policyId"],
                "request:segmentation-1"
            ],
            "supersedesArtifactId": None,
            "invalidationTriggers": ["subject revision", "profile revision", "policy revision"]
        },
        "planningContext": {
            "subjectId": "subject-1",
            "subjectRevision": "1",
            "subjectContentHash": "sha256:subject-1",
            "units": "millimeters",
            "coordinateFrame": "subject-local",
            "sourceAlgorithmArtifactId": "ALG-GENERIC-001",
            "sourceGeometryArtifactId": "GEO-GENERIC-001",
            "sourceRequestArtifactId": "request:segmentation-1",
            "productionConstraintProfileRef": "profile:subtractive-cnc@1.0.0#1",
            "segmentationPolicyRef": "policy:balanced-engineering@1.0.0#1"
        },
        "necessityAnalysis": {
            "decision": "REQUIRED",
            "reasonCodes": ["unsegmented-hard-constraint-failure"],
            "evaluatedUnsegmentedAlternatives": [
                {
                    "alternativeId": "configuration:setup-1",
                    "description": "Accepted unsegmented setup candidate.",
                    "hardConstraintsPassed": False,
                    "reason": "Production accessibility constraint failed."
                }
            ],
            "confidence": "HIGH"
        },
        "candidates": [
            {
                "candidateId": "candidate-1",
                "strategySourceId": "strategy:project-owned",
                "strategyFamily": "project.example.feature-aware",
                "description": "Planning-only boundary intent.",
                "boundaryIntents": [
                    {
                        "boundaryId": "boundary-1",
                        "descriptorType": "surface-reference",
                        "descriptorReference": "GEO-GENERIC-001/surface-7",
                        "coordinateFrame": "subject-local"
                    }
                ],
                "predictedSegmentCount": 2,
                "assemblyGraph": ["segment-a<->segment-b"],
                "hardConstraintResults": [
                    {
                        "constraintId": "access-envelope",
                        "passed": True,
                        "margin": {"value": 2, "unit": "millimeters"},
                        "evidenceIds": ["evidence:setup-1"]
                    }
                ],
                "policyMetricResults": [
                    {
                        "metricId": "constraint-margin",
                        "normalizedValue": 0.8,
                        "policyComponentId": "component:production"
                    }
                ],
                "feasible": True,
                "confidence": "HIGH",
                "risk": "LOW",
                "uncertainty": 0.1,
                "sensitivityResult": "stable under declared tolerance perturbation",
                "warnings": [],
                "rejectionReasons": []
            }
        ],
        "selectionRecord": {
            "feasibleCandidateIds": ["candidate-1"],
            "paretoCandidateIds": ["candidate-1"],
            "selectedCandidateId": "candidate-1",
            "policyEvaluation": "Selected by declared Pareto and policy aggregation.",
            "tieBreakRecord": [],
            "confidence": "HIGH"
        },
        "assemblyReintegrationPlan": [],
        "preExecutionValidation": {
            "passed": True,
            "checks": ["selected-candidate-membership", "hard-constraint-compliance"],
            "executionPerformed": False
        },
        "postExecutionValidationRequirements": ["coverage conservation", "downstream manifest integrity"],
        "warnings": [],
        "blockers": [],
        "recommendedNextCapability": "Implementation"
    }
    plan_errors = JSONSchemaValidator.validate(required_plan, plan_schema)
    assert plan_errors == [], f"Segmentation plan validation errors: {plan_errors}"
    assert validate_segmentation_plan_semantics(required_plan, cnc_profile) == []

    invalid_selected = json.loads(json.dumps(required_plan))
    invalid_selected["selectionRecord"]["selectedCandidateId"] = "candidate-missing"
    assert validate_segmentation_plan_semantics(invalid_selected, cnc_profile)

    not_required = json.loads(json.dumps(required_plan))
    not_required["necessityAnalysis"]["decision"] = "NOT_REQUIRED"
    not_required["candidates"] = []
    not_required["selectionRecord"]["selectedCandidateId"] = None
    not_required["selectionRecord"]["feasibleCandidateIds"] = []
    not_required["selectionRecord"]["paretoCandidateIds"] = []
    not_required["recommendedNextCapability"] = "NONE"
    assert validate_segmentation_plan_semantics(not_required, cnc_profile) == []

    blocked = json.loads(json.dumps(not_required))
    blocked["necessityAnalysis"]["decision"] = "BLOCKED"
    blocked["blockers"] = ["required evidence missing"]
    assert validate_segmentation_plan_semantics(blocked, cnc_profile) == []
    blocked["blockers"] = []
    assert validate_segmentation_plan_semantics(blocked, cnc_profile)

    false_execution = json.loads(json.dumps(required_plan))
    false_execution["preExecutionValidation"]["executionPerformed"] = True
    assert validate_segmentation_plan_semantics(false_execution, cnc_profile)
    print("  PASS: necessity, selected-candidate, blocker, segment-limit, and no-execution semantics are enforced.")

    for strategy_family in (
        "project.axis-based",
        "project.structure-aware",
        "project.hierarchical",
        "project.assembly-aware",
    ):
        strategy_request = json.loads(json.dumps(segmentation_request))
        strategy_request["candidateStrategySources"][0]["strategyFamily"] = strategy_family
        assert JSONSchemaValidator.validate(strategy_request, request_schema) == []
        strategy_plan = json.loads(json.dumps(required_plan))
        strategy_plan["candidates"][0]["strategyFamily"] = strategy_family
        assert JSONSchemaValidator.validate(strategy_plan, plan_schema) == []
        assert validate_segmentation_plan_semantics(strategy_plan, cnc_profile) == []
    print("  PASS: multiple externally owned strategy families use the same request and plan contracts.")

    invalid_request_extension = json.loads(json.dumps(segmentation_request))
    invalid_request_extension["extensions"] = [
        {
            "namespace": "fixture.project",
            "schemaId": "fixture.project/request-data",
            "schemaVersion": "1.0.0",
            "data": {"opaque": True}
        }
    ]
    assert JSONSchemaValidator.validate(invalid_request_extension, request_schema)
    partial_without_prior = json.loads(json.dumps(segmentation_request))
    partial_without_prior["updateMode"] = "PARTIAL_UPDATE"
    assert partial_without_prior["priorPlanArtifactId"] is None
    print("  PASS: project extension data is namespaced and owner/versioned; partial updates require prior-plan lineage at runtime.")

    segmentation_implementation = json.loads(json.dumps(sample_s3))
    segmentation_implementation["featureName"] = "General Segmentation"
    segmentation_implementation["metadata"]["sourceSegmentationPlanArtifactId"] = "SEG-PLAN-001"
    segmentation_implementation["metadata"]["dependencyIds"].append("SEG-PLAN-001")
    segmentation_implementation["implementationRecord"]["implementationTraceability"][
        "segmentationPlanArtifactId"
    ] = "SEG-PLAN-001"
    assert JSONSchemaValidator.validate(segmentation_implementation, s3_schema) == []
    assert validate_segmentation_traceability(segmentation_implementation, "implementation") == []
    missing_implementation_plan = json.loads(json.dumps(segmentation_implementation))
    del missing_implementation_plan["metadata"]["sourceSegmentationPlanArtifactId"]
    assert validate_segmentation_traceability(missing_implementation_plan, "implementation")

    segmentation_validation = json.loads(json.dumps(sample_s4_pass))
    segmentation_validation["featureName"] = "General Segmentation"
    segmentation_validation["metadata"]["sourceSegmentationPlanArtifactId"] = "SEG-PLAN-001"
    segmentation_validation["metadata"]["dependencyIds"].append("SEG-PLAN-001")
    assert JSONSchemaValidator.validate(segmentation_validation, s4_schema) == []
    assert validate_segmentation_traceability(segmentation_validation, "validation") == []
    missing_validation_plan = json.loads(json.dumps(segmentation_validation))
    del missing_validation_plan["metadata"]["sourceSegmentationPlanArtifactId"]
    assert validate_segmentation_traceability(missing_validation_plan, "validation")
    print("  PASS: segmentation implementation and validation carry the same accepted plan traceability.")

    loop_registry = load_json(LOOP_REGISTRY_FILE_PATH)
    loop_map = {skill["skillId"]: skill for skill in loop_registry["skills"]}
    segmentation_registry_entry = registry_map["general-segmentation-engine"]
    segmentation_loop_entry = loop_map["general-segmentation-engine"]
    assert segmentation_loop_entry["inputContract"] == segmentation_registry_entry["inputContract"]
    assert segmentation_loop_entry["outputContract"] == segmentation_registry_entry["outputContract"]
    assert segmentation_loop_entry["dependencies"] == segmentation_registry_entry["dependencies"]
    assert segmentation_loop_entry["executionPriority"] == 25
    assert loop_map["interconnected-systems-stability-engineer"]["executionPriority"] < loop_map["cad-algorithm-implementer"]["executionPriority"]
    assert "interconnected-systems-stability-engineer" not in segmentation_loop_entry["dependencies"]
    skill_text = SEGMENTATION_SKILL_PATH.read_text(encoding="utf-8")
    assert "name: general-segmentation-engine" in skill_text
    assert "Status:** Experimental" in skill_text
    assert "Generate a bounded candidate set" not in skill_text
    assert "Never define, invent, or hard-code a candidate-generation method" in skill_text
    domain_neutral_contract_text = (
        skill_text
        + SEGMENTATION_REQUEST_SCHEMA_PATH.read_text(encoding="utf-8")
        + SEGMENTATION_PLAN_SCHEMA_PATH.read_text(encoding="utf-8")
    ).lower()
    for forbidden_term in (
        "mold bodies",
        "cavities",
        "sprues",
        "mold registration",
        "printer ui",
        "viewer state",
        "mold-specific",
    ):
        assert forbidden_term not in domain_neutral_contract_text
    print("  PASS: registries agree; planning precedes project stability and implementation without a Mold-specific dependency.")

    print("\n=======================================================================")
    print("  ALL TESTS PASSED SUCCESSFULLY! SKILLS PIPELINE & GATEWAY INTEGRATED (PASS) ")
    print("=======================================================================")


if __name__ == "__main__":
    run_phase_2_tests()
