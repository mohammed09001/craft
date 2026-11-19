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
craft_add_test(tst_mold SOURCES tst_mold.cpp LIBS craft_mold craft_mesh_manifold)
craft_add_test(tst_sprue SOURCES tst_sprue.cpp LIBS craft_mold craft_mesh_manifold)
craft_add_test(tst_registration SOURCES tst_registration.cpp LIBS craft_mold craft_mesh_manifold)
craft_add_test(tst_segmentation SOURCES tst_segmentation.cpp LIBS craft_mold craft_mesh_manifold)
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
craft_add_test(tst_master_equivalence
  SOURCES tst_master_equivalence.cpp
  LIBS craft_mold craft_mesh_manifold Qt6::Core)
target_compile_definitions(tst_master_equivalence PRIVATE
  CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")
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
