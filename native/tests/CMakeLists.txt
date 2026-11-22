# Native test suite (Qt Test + CTest).
#
# Tests locate Qt's runtime DLLs through the Qt bin directory being prepended
# to PATH for each test, so `ctest` works from a plain shell after sourcing
# scripts/native/windows-env.ps1 (or without it, via the property below).

get_target_property(_qt_core_location Qt6::Core LOCATION)
get_filename_component(CRAFT_QT_BIN_DIR "${_qt_core_location}" DIRECTORY)

function(craft_add_test name)
  cmake_parse_arguments(ARG "" "" "SOURCES;LIBS" ${ARGN})
  add_executable(${name} ${ARG_SOURCES} TestMeshes.h)
  target_link_libraries(${name} PRIVATE Qt6::Test ${ARG_LIBS})
  target_compile_definitions(${name} PRIVATE CRAFT_REPO_ROOT="${CRAFT_REPO_ROOT}")
  target_include_directories(${name} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
  craft_target_defaults(${name})
  add_test(NAME ${name} COMMAND ${name})
  set_tests_properties(${name} PROPERTIES
    ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${CRAFT_QT_BIN_DIR}"
    TIMEOUT 300
  )
endfunction()

craft_add_test(tst_core SOURCES tst_core.cpp LIBS craft_core)
if(CRAFT_BUILD_APP)
  craft_add_test(tst_imagecompare SOURCES tst_imagecompare.cpp LIBS craft_imagecompare)
endif()
craft_add_test(tst_stl SOURCES tst_stl.cpp LIBS craft_io)
craft_add_test(tst_threemf SOURCES tst_threemf.cpp LIBS craft_io Qt6::Core)
craft_add_test(tst_orientation_equivalence SOURCES tst_orientation_equivalence.cpp LIBS craft_core Qt6::Core)
target_compile_definitions(tst_orientation_equivalence PRIVATE
  CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")
craft_add_test(tst_mold SOURCES tst_mold.cpp LIBS craft_mold craft_mesh_manifold)
craft_add_test(tst_sprue SOURCES tst_sprue.cpp LIBS craft_mold craft_mesh_manifold)
craft_add_test(tst_registration SOURCES tst_registration.cpp LIBS craft_mold craft_mesh_manifold)
craft_add_test(tst_segmentation SOURCES tst_segmentation.cpp LIBS craft_mold craft_mesh_manifold)
craft_add_test(tst_segmentation_source_equivalence SOURCES tst_segmentation_source_equivalence.cpp LIBS craft_mold Qt6::Core)
target_compile_definitions(tst_segmentation_source_equivalence PRIVATE
  CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")
craft_add_test(tst_segmentation_equivalence
  SOURCES tst_segmentation_equivalence.cpp
  LIBS craft_mold craft_mesh_manifold Qt6::Core)
target_compile_definitions(tst_segmentation_equivalence PRIVATE
  CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")
craft_add_test(tst_selection_equivalence
  SOURCES tst_selection_equivalence.cpp
  LIBS craft_mold Qt6::Core)
target_compile_definitions(tst_selection_equivalence PRIVATE
  CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")
craft_add_test(tst_sprue_gizmo_equivalence
  SOURCES tst_sprue_gizmo_equivalence.cpp
  LIBS craft_mold Qt6::Core)
target_compile_definitions(tst_sprue_gizmo_equivalence PRIVATE
  CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")
craft_add_test(tst_cutplane_equivalence
  SOURCES tst_cutplane_equivalence.cpp
  LIBS craft_mold Qt6::Core)
target_compile_definitions(tst_cutplane_equivalence PRIVATE
  CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")
craft_add_test(tst_cutplane_drag_equivalence
  SOURCES tst_cutplane_drag_equivalence.cpp
  LIBS craft_mold Qt6::Core)
target_compile_definitions(tst_cutplane_drag_equivalence PRIVATE
  CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")
craft_add_test(tst_master_store SOURCES tst_master_store.cpp LIBS craft_mold craft_mesh_manifold)
craft_add_test(tst_master_export SOURCES tst_master_export.cpp LIBS craft_export Qt6::Core)
craft_add_test(tst_long_paths SOURCES tst_long_paths.cpp LIBS craft_export craft_project Qt6::Core)
craft_add_test(tst_variant_list_model SOURCES tst_variant_list_model.cpp LIBS craft_app_lib Qt6::Core)
craft_add_test(tst_master_equivalence
  SOURCES tst_master_equivalence.cpp
  LIBS craft_mold craft_mesh_manifold Qt6::Core)
target_compile_definitions(tst_master_equivalence PRIVATE
  CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")
# In a Release build its fallback-construction rows run (one multi-label voxel stage per row, about ten minutes in all: Debug skips them), which the
# default of 300 s can never cover; before this a plain `ctest --preset windows-release` always timed out here.
set_tests_properties(tst_master_equivalence PROPERTIES TIMEOUT 1800)
craft_add_test(tst_project SOURCES tst_project.cpp LIBS craft_project Qt6::Core)
craft_add_test(tst_reports_equivalence
  SOURCES tst_reports_equivalence.cpp
  LIBS craft_reports Qt6::Core)
target_compile_definitions(tst_reports_equivalence PRIVATE
  CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")
craft_add_test(tst_reference_equivalence
  SOURCES tst_reference_equivalence.cpp
  LIBS craft_mold craft_mesh_manifold Qt6::Core)
target_compile_definitions(tst_reference_equivalence PRIVATE
  CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")

craft_add_test(tst_analysis_bridge SOURCES tst_analysis_bridge.cpp LIBS craft_analysis_bridge)
add_dependencies(tst_analysis_bridge craft_analysis_kernels)
target_compile_definitions(tst_analysis_bridge PRIVATE
  CRAFT_KERNELS_LIBRARY="$<TARGET_FILE:craft_analysis_kernels>"
  CRAFT_WORKER_SCRIPT="${CRAFT_WORKER_SCRIPT}"
  CRAFT_ENGINE_SRC="${CRAFT_ENGINE_SRC}"
  CRAFT_DEV_PYTHON="${CRAFT_PYTHON_EXECUTABLE_NORMALIZED}")

# The worker must report a cavity/readiness stage that raises instead of hiding the moldability result (needs the
# development Python with pytest, the same interpreter the bridge tests use).
if(CRAFT_PYTHON_EXECUTABLE_NORMALIZED)
  add_test(NAME py_worker_stage_failures
    COMMAND ${CRAFT_PYTHON_EXECUTABLE_NORMALIZED} -m pytest -q -p no:cacheprovider ${CMAKE_CURRENT_SOURCE_DIR}/python/test_worker_stage_failures.py)
  set_tests_properties(py_worker_stage_failures PROPERTIES ENVIRONMENT "PYTHONPATH=${CRAFT_ENGINE_SRC}" TIMEOUT 120)
endif()

# No double-encoded text in the native sources (a middle dot once read as two characters on screen).
if(CRAFT_PYTHON_EXECUTABLE_NORMALIZED)
  add_test(NAME source_encoding
    COMMAND ${CRAFT_PYTHON_EXECUTABLE_NORMALIZED} -I ${CRAFT_REPO_ROOT}/scripts/native/check-source-encoding.py)
  set_tests_properties(source_encoding PROPERTIES TIMEOUT 60)
endif()

# The native candidate evaluation against the engine's Python loop, bit for bit (see craft_native_evaluation.py).
if(CRAFT_PYTHON_EXECUTABLE_NORMALIZED)
  add_test(NAME py_native_evaluation
    COMMAND ${CRAFT_PYTHON_EXECUTABLE_NORMALIZED} -m pytest -q -p no:cacheprovider
            ${CRAFT_REPO_ROOT}/native/engines/analysis-bridge/tests)
  set_tests_properties(py_native_evaluation PROPERTIES
    ENVIRONMENT "CRAFT_ANALYSIS_KERNELS=$<TARGET_FILE:craft_analysis_kernels>" TIMEOUT 300)
endif()

if(CRAFT_BUILD_APP)
  craft_add_test(tst_viewport SOURCES tst_viewport.cpp LIBS craft_viewport craft_io)
  craft_add_test(tst_ground_ruler SOURCES tst_ground_ruler.cpp LIBS craft_core Qt6::Core)
  target_compile_definitions(tst_ground_ruler PRIVATE
    CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")
  craft_add_test(tst_viewport_look SOURCES tst_viewport_look.cpp LIBS craft_viewport Qt6::Core)
  target_compile_definitions(tst_viewport_look PRIVATE
    CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")
  craft_add_test(tst_sprue_preview_equivalence
    SOURCES tst_sprue_preview_equivalence.cpp
    LIBS craft_mold craft_viewport Qt6::Core)
  target_compile_definitions(tst_sprue_preview_equivalence PRIVATE
    CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")
  craft_add_test(tst_app_workflow SOURCES tst_app_workflow.cpp LIBS craft_app_lib)
  target_compile_definitions(tst_app_workflow PRIVATE
    CRAFT_DEV_PYTHON="${CRAFT_PYTHON_EXECUTABLE_NORMALIZED}"
    CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")

  # End-to-end smoke test: launches the real executable, imports a fixture,
  # generates a mold, renders a frame, and checks the JSON summary.
  add_test(NAME app_smoke
    COMMAND craft --smoke-test
            --import "${CRAFT_REPO_ROOT}/native/tests/fixtures/models/bracket.stl"
            --generate-mold
            --summary "${CMAKE_CURRENT_BINARY_DIR}/app_smoke_summary.json")
  # The Sprue resize gizmo through REAL mouse events delivered to the window (QML routing, not only the controller).
  add_test(NAME app_smoke_sprue_gizmo
    COMMAND craft --smoke-test
            --import "${CRAFT_REPO_ROOT}/native/tests/fixtures/models/bracket.stl"
            --generate-mold --sprue-preview --sprue-gizmo-events
            --summary "${CMAKE_CURRENT_BINARY_DIR}/app_smoke_sprue_gizmo_summary.json")
  set_tests_properties(app_smoke_sprue_gizmo PROPERTIES
    ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${CRAFT_QT_BIN_DIR}"
    TIMEOUT 180
    PASS_REGULAR_EXPRESSION "CRAFT_SMOKE_OK")
  # The interaction hint badge through REAL input: a mouse press, and a wheel event, each hide it.
  foreach(_mode hint-events hint-wheel)
    string(REPLACE "-" "_" _name "app_smoke_${_mode}")
    add_test(NAME ${_name}
      COMMAND craft --smoke-test
              --import "${CRAFT_REPO_ROOT}/native/tests/fixtures/models/bracket.stl"
              --${_mode}
              --summary "${CMAKE_CURRENT_BINARY_DIR}/${_name}_summary.json")
    set_tests_properties(${_name} PROPERTIES
      ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${CRAFT_QT_BIN_DIR}"
      TIMEOUT 120
      PASS_REGULAR_EXPRESSION "CRAFT_SMOKE_OK")
  endforeach()
  # Undo/redo through REAL input: the toolbar buttons and the standard keys.
  add_test(NAME app_smoke_undo
    COMMAND craft --smoke-test
            --import "${CRAFT_REPO_ROOT}/native/tests/fixtures/models/bracket.stl"
            --undo-events
            --summary "${CMAKE_CURRENT_BINARY_DIR}/app_smoke_undo_summary.json")
  set_tests_properties(app_smoke_undo PROPERTIES
    ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${CRAFT_QT_BIN_DIR}"
    TIMEOUT 120
    PASS_REGULAR_EXPRESSION "CRAFT_SMOKE_OK")
  # Flip through REAL input: the toolbar button and the four arrow keys (a held key flips once).
  add_test(NAME app_smoke_flip
    COMMAND craft --smoke-test
            --import "${CRAFT_REPO_ROOT}/native/tests/fixtures/models/bracket.stl"
            --flip-events
            --summary "${CMAKE_CURRENT_BINARY_DIR}/app_smoke_flip_summary.json")
  set_tests_properties(app_smoke_flip PROPERTIES
    ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${CRAFT_QT_BIN_DIR}"
    TIMEOUT 120
    PASS_REGULAR_EXPRESSION "CRAFT_SMOKE_OK")
  # A segmentation extension plane dragged with the right button through REAL mouse events, then undone with a real Ctrl+Z.
  add_test(NAME app_smoke_extension_drag
    COMMAND craft --smoke-test
            --import "${CRAFT_REPO_ROOT}/native/tests/fixtures/models/bracket.stl"
            --extension-drag-events
            --summary "${CMAKE_CURRENT_BINARY_DIR}/app_smoke_extension_drag_summary.json")
  set_tests_properties(app_smoke_extension_drag PROPERTIES
    ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${CRAFT_QT_BIN_DIR}"
    TIMEOUT 120
    PASS_REGULAR_EXPRESSION "CRAFT_SMOKE_OK")
  # Keyboard use through REAL key events: Tab reaches every control, and focus survives a control that changes the controller's lists.
  add_test(NAME app_smoke_focus
    COMMAND craft --smoke-test
            --import "${CRAFT_REPO_ROOT}/native/tests/fixtures/models/bracket.stl"
            --generate-mold --focus-events
            --summary "${CMAKE_CURRENT_BINARY_DIR}/app_smoke_focus_summary.json")
  set_tests_properties(app_smoke_focus PROPERTIES
    ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${CRAFT_QT_BIN_DIR}"
    TIMEOUT 420
    PASS_REGULAR_EXPRESSION "CRAFT_SMOKE_OK")
  # The Eraser through REAL mouse events delivered to the window.
  add_test(NAME app_smoke_eraser
    COMMAND craft --smoke-test
            --import "${CRAFT_REPO_ROOT}/native/tests/fixtures/models/bracket.stl"
            --eraser-events
            --summary "${CMAKE_CURRENT_BINARY_DIR}/app_smoke_eraser_summary.json")
  set_tests_properties(app_smoke_eraser PROPERTIES
    ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${CRAFT_QT_BIN_DIR}"
    TIMEOUT 120
    PASS_REGULAR_EXPRESSION "CRAFT_SMOKE_OK")
  # The Master Mold toolbar button through a REAL click, on an imported model with no mold.
  add_test(NAME app_smoke_master
    COMMAND craft --smoke-test
            --import "${CRAFT_REPO_ROOT}/native/tests/fixtures/models/bracket.stl"
            --master-events
            --summary "${CMAKE_CURRENT_BINARY_DIR}/app_smoke_master_summary.json")
  set_tests_properties(app_smoke_master PROPERTIES
    ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${CRAFT_QT_BIN_DIR}"
    TIMEOUT 240
    PASS_REGULAR_EXPRESSION "CRAFT_SMOKE_OK")
  # The Molds browser through REAL clicks, with a mold generated.
  add_test(NAME app_smoke_molds
    COMMAND craft --smoke-test
            --import "${CRAFT_REPO_ROOT}/native/tests/fixtures/models/bracket.stl"
            --generate-mold --molds-events
            --summary "${CMAKE_CURRENT_BINARY_DIR}/app_smoke_molds_summary.json")
  set_tests_properties(app_smoke_molds PROPERTIES
    ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${CRAFT_QT_BIN_DIR}"
    TIMEOUT 120
    PASS_REGULAR_EXPRESSION "CRAFT_SMOKE_OK")
  # The inspector's sections through REAL mouse and keyboard events.
  add_test(NAME app_smoke_sections
    COMMAND craft --smoke-test
            --import "${CRAFT_REPO_ROOT}/native/tests/fixtures/models/bracket.stl"
            --sections-events
            --summary "${CMAKE_CURRENT_BINARY_DIR}/app_smoke_sections_summary.json")
  set_tests_properties(app_smoke_sections PROPERTIES
    ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${CRAFT_QT_BIN_DIR}"
    TIMEOUT 120
    PASS_REGULAR_EXPRESSION "CRAFT_SMOKE_OK")
  # Dropping files on the window through REAL platform drag-and-drop events.
  add_test(NAME app_smoke_drop
    COMMAND craft --smoke-test
            --import "${CRAFT_REPO_ROOT}/native/tests/fixtures/models/bracket.stl"
            --drop-events
            --summary "${CMAKE_CURRENT_BINARY_DIR}/app_smoke_drop_summary.json")
  set_tests_properties(app_smoke_drop PROPERTIES
    ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${CRAFT_QT_BIN_DIR}"
    TIMEOUT 120
    PASS_REGULAR_EXPRESSION "CRAFT_SMOKE_OK")
  # Dragging a cutting plane with the right mouse button through REAL mouse events delivered to the window.
  add_test(NAME app_smoke_plane_drag
    COMMAND craft --smoke-test
            --import "${CRAFT_REPO_ROOT}/native/tests/fixtures/models/bracket.stl"
            --plane-drag-events
            --summary "${CMAKE_CURRENT_BINARY_DIR}/app_smoke_plane_drag_summary.json")
  set_tests_properties(app_smoke_plane_drag PROPERTIES
    ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${CRAFT_QT_BIN_DIR}"
    TIMEOUT 120
    PASS_REGULAR_EXPRESSION "CRAFT_SMOKE_OK")
  # Each smoke test works in an autosave and cache folder of its own in the build tree. They used to share the user's real ones: a run that
  # ended without a clean shutdown (the UI tour did, and so would a killed test) left an autosave behind, the next launch opened with the
  # "Recover unsaved work?" dialog over the window, and every test that sends real mouse events failed because the dialog swallowed them.
  foreach(_smoke app_smoke app_smoke_sprue_gizmo app_smoke_hint_events app_smoke_hint_wheel app_smoke_undo app_smoke_flip app_smoke_extension_drag app_smoke_focus app_smoke_eraser app_smoke_drop app_smoke_sections app_smoke_molds app_smoke_master app_smoke_plane_drag)
    if(TEST ${_smoke})
      set_property(TEST ${_smoke} APPEND PROPERTY ENVIRONMENT
        "CRAFT_AUTOSAVE_DIR=${CMAKE_CURRENT_BINARY_DIR}/smoke-state/${_smoke}/autosave"
        "CRAFT_CACHE_DIR=${CMAKE_CURRENT_BINARY_DIR}/smoke-state/${_smoke}/cache")
    endif()
  endforeach()
  set_tests_properties(app_smoke PROPERTIES
    ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${CRAFT_QT_BIN_DIR}"
    TIMEOUT 120
    PASS_REGULAR_EXPRESSION "CRAFT_SMOKE_OK"
  )
endif()

# Benchmark (not registered with CTest): Release only.
add_executable(bench_pipeline bench_pipeline.cpp)
target_link_libraries(bench_pipeline PRIVATE craft_mold craft_mesh_manifold craft_io craft_viewport)
target_include_directories(bench_pipeline PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
craft_target_defaults(bench_pipeline)

add_executable(bench_sdf bench_sdf.cpp)
target_link_libraries(bench_sdf PRIVATE craft_core)
target_include_directories(bench_sdf PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
craft_target_defaults(bench_sdf)

# Development probe (not registered with CTest): the Master Mold preflight's pair loop on an STL, to inspect a "triangles intersect" verdict.
add_executable(probe_selfx probe_selfx.cpp)
target_link_libraries(probe_selfx PRIVATE craft_mold craft_core craft_io)
target_include_directories(probe_selfx PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
craft_target_defaults(probe_selfx)
