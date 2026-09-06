def test_import_package():
    import mold_generator_engine

    assert mold_generator_engine is not None


def test_root_package_exports_public_import_analysis_api():
    import mold_generator_engine

    assert mold_generator_engine.ImportAnalysisService is not None
    assert mold_generator_engine.ImportAnalysisReport is not None
    assert mold_generator_engine.ImportAnalysisReportStatus is not None


def test_root_package_exports_public_detailed_mold_analysis_api():
    import mold_generator_engine

    assert mold_generator_engine.DetailedMoldAnalysisService is not None
    assert mold_generator_engine.DetailedMoldAnalysisReport is not None
    assert mold_generator_engine.DetailedMoldAnalysisStatus is not None
    assert mold_generator_engine.DetailedMoldAnalysisContext is not None
    assert mold_generator_engine.MoldAnalysisModule is not None
    assert mold_generator_engine.Vector3D is not None
    assert mold_generator_engine.analyze_model_face_geometry is not None
    assert mold_generator_engine.generate_candidate_pull_directions is not None
    assert mold_generator_engine.PullDirectionEvaluator is not None
    assert mold_generator_engine.PullDirectionEvaluationSettings is not None
    assert mold_generator_engine.CandidatePullDirectionEvaluation is not None


def test_root_package_exports_public_cavity_analysis_api():
    import mold_generator_engine

    assert mold_generator_engine.CavityAnalysisService is not None
    assert mold_generator_engine.CavityAnalysisReport is not None
    assert mold_generator_engine.CavityAnalysisContext is not None
    assert mold_generator_engine.CavityEvidenceAssessor is not None
    assert mold_generator_engine.CavityAssessmentOutcome is not None


def test_importers_package_keeps_public_exports_minimal():
    import mold_generator_engine.io.importers as importers

    assert not hasattr(importers, "ObjReader")
    assert not hasattr(importers, "StlReader")
