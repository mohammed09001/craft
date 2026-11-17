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
craft_add_test(tst_reference_equivalence
  SOURCES tst_reference_equivalence.cpp
  LIBS craft_mold craft_mesh_manifold Qt6::Core)
target_compile_definitions(tst_reference_equivalence PRIVATE
  CRAFT_REFERENCE_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reference")

craft_add_test(tst_analysis_bridge SOURCES tst_analysis_bridge.cpp LIBS craft_analysis_bridge)
target_compile_definitions(tst_analysis_bridge PRIVATE
  CRAFT_WORKER_SCRIPT="${CRAFT_WORKER_SCRIPT}"
  CRAFT_ENGINE_SRC="${CRAFT_ENGINE_SRC}"
  CRAFT_DEV_PYTHON="${CRAFT_PYTHON_EXECUTABLE_NORMALIZED}")

if(CRAFT_BUILD_APP)
  craft_add_test(tst_viewport SOURCES tst_viewport.cpp LIBS craft_viewport craft_io)
  craft_add_test(tst_app_workflow SOURCES tst_app_workflow.cpp LIBS craft_app_lib)
  target_compile_definitions(tst_app_workflow PRIVATE
    CRAFT_DEV_PYTHON="${CRAFT_PYTHON_EXECUTABLE_NORMALIZED}")

  # End-to-end smoke test: launches the real executable, imports a fixture,
  # generates a mold, renders a frame, and checks the JSON summary.
  add_test(NAME app_smoke
    COMMAND craft --smoke-test
            --import "${CRAFT_REPO_ROOT}/native/tests/fixtures/models/bracket.stl"
            --generate-mold
            --summary "${CMAKE_CURRENT_BINARY_DIR}/app_smoke_summary.json")
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
