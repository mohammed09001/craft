cmake_minimum_required(VERSION 3.25)

project(CraftNative
  VERSION 0.1.0
  DESCRIPTION "Craft native desktop application (Qt 6 / QML / Qt Quick 3D + native Manifold)"
  LANGUAGES CXX
)

if(CMAKE_SOURCE_DIR STREQUAL CMAKE_BINARY_DIR)
  message(FATAL_ERROR "In-source builds are not supported. Use a preset: cmake --preset windows-debug")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(CRAFT_BUILD_APP "Build the Qt Quick desktop application" ON)
option(CRAFT_BUILD_TESTS "Build the native test suite" ON)

# Repository root: the native tree reuses the existing model fixtures and
# launches the existing Python engine from mold/src during development.
get_filename_component(CRAFT_REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/.." ABSOLUTE)

# Development-only Python 3.13 for the analysis worker (tests and dev runs).
# Taken from the CRAFT_PYTHON environment variable at configure time; a
# packaged application ignores it and uses its bundled runtime.
set(CRAFT_PYTHON_EXECUTABLE "$ENV{CRAFT_PYTHON}" CACHE FILEPATH
    "Python 3.13 interpreter used by development builds and tests for the analysis worker")
file(TO_CMAKE_PATH "${CRAFT_PYTHON_EXECUTABLE}" CRAFT_PYTHON_EXECUTABLE_NORMALIZED)
set(CRAFT_WORKER_SCRIPT "${CMAKE_CURRENT_SOURCE_DIR}/engines/analysis-bridge/worker/craft_analysis_worker.py")
set(CRAFT_ENGINE_SRC "${CRAFT_REPO_ROOT}/mold/src")

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

# Pinned toolchain baseline (see docs/native-migration/DECISIONS.md, D-002).
find_package(Qt6 6.8 REQUIRED COMPONENTS Core Concurrent Test)
if(CRAFT_BUILD_APP)
  find_package(Qt6 6.8 REQUIRED COMPONENTS Gui Qml Quick QuickControls2 Quick3D)
endif()
qt_standard_project_setup(REQUIRES 6.8)

include(CraftManifold)

function(craft_target_defaults target)
  if(MSVC)
    target_compile_options(${target} PRIVATE /W4 /permissive- /utf-8 /wd4251)
    target_compile_definitions(${target} PRIVATE NOMINMAX _USE_MATH_DEFINES)
  else()
    target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic)
  endif()
endfunction()

# --- craft_core: contracts + renderer/kernel-independent math (no Qt) -------
add_library(craft_core STATIC
  core/contracts/Geometry.cpp
  core/contracts/Geometry.h
  core/contracts/Operation.h
  core/geometry/GeometryTolerance.cpp
  core/geometry/GeometryTolerance.h
  core/geometry/MeshAnalysis.cpp
  core/geometry/MeshAnalysis.h
  core/geometry/RayPicking.cpp
  core/geometry/RayPicking.h
  core/geometry/SignedDistance.cpp
  core/geometry/SignedDistance.h
  core/model/ModelGrounding.cpp
  core/model/ModelGrounding.h
  core/view/ViewPose.cpp
  core/view/ViewPose.h
)
target_include_directories(craft_core PUBLIC core)
craft_target_defaults(craft_core)

# --- craft_io: file formats (no Qt) -----------------------------------------
add_library(craft_io STATIC
  io/stl/Stl.cpp
  io/stl/Stl.h
)
target_include_directories(craft_io PUBLIC io)
target_link_libraries(craft_io PUBLIC craft_core)
craft_target_defaults(craft_io)

# --- craft_mesh_api: the kernel seam (header only) ---------------------------
add_library(craft_mesh_api INTERFACE)
target_include_directories(craft_mesh_api INTERFACE engines/mesh)
target_link_libraries(craft_mesh_api INTERFACE craft_core)

# --- craft_mold: mold-domain algorithms, kernel-agnostic (no Qt) -------------
add_library(craft_mold STATIC
  core/master/MasterAccessibility.cpp
  core/master/MasterAccessibility.h
  core/master/MasterWorkingMoldPlanner.cpp
  core/master/MasterWorkingMoldPlanner.h
  core/master/MasterWorkingMoldConstructor.cpp
  core/master/MasterWorkingMoldConstructor.h
  core/master/RayBvh.cpp
  core/master/RayBvh.h
  core/master/MasterTooling.cpp
  core/master/MasterTooling.h
  core/master/MasterEngine.cpp
  core/master/MasterEngine.h
  core/master/MasterMultiPiece.cpp
  core/master/MasterMultiPiece.h
  core/master/MasterMoldStore.cpp
  core/master/MasterMoldStore.h
  core/master/MasterMultiLabel.cpp
  core/master/MasterMultiLabel.h
  core/master/MasterRegionDirect.cpp
  core/master/MasterRegionDirect.h
  core/master/MasterPlanning.cpp
    core/master/TriangleIntersection.cpp
    core/master/TriangleIntersection.h
  core/master/MasterPlanning.h
  core/mold/CavityGeneration.cpp
  core/mold/CavityGeneration.h
  core/mold/DerivedMold.cpp
  core/mold/DerivedMold.h
  core/mold/CavityOffset.cpp
  core/mold/CavityOffset.h
  core/mold/PartSolid.cpp
  core/mold/PartSolid.h
  core/mold/Registration.cpp
  core/mold/Registration.h
  core/mold/ReferenceMold.cpp
  core/mold/ReferenceMold.h
  core/mold/Segmentation.cpp
  core/mold/Segmentation.h
  core/mold/SegmentationIdentity.cpp
  core/mold/SegmentationIdentity.h
  core/mold/SprueGeneration.cpp
  core/mold/SprueGeneration.h
  core/mold/SprueProfile.cpp
  core/mold/SprueProfile.h
)
target_link_libraries(craft_mold PUBLIC craft_core craft_mesh_api)
craft_target_defaults(craft_mold)

# --- craft_project: the Craft project document and its .craft container (documents are Qt-free; the file format uses Qt Core) --
add_library(craft_project STATIC
  core/project/ProjectDocument.cpp
  core/project/ProjectDocument.h
  io/project/ProjectJson.cpp
  io/project/ProjectJson.h
  io/project/ProjectFile.cpp
  io/project/ProjectFile.h
)
target_include_directories(craft_project PUBLIC core io)
target_link_libraries(craft_project PUBLIC Qt6::Core craft_core)
craft_target_defaults(craft_project)

# --- craft_reports: engineering report contracts, registry, pull-direction foundation and evaluation (no Qt) --
add_library(craft_reports STATIC
  core/reports/ReportJson.cpp
  core/reports/ReportJson.h
  core/reports/LocaleCompare.cpp
  core/reports/LocaleCompare.h
  core/reports/GenerationReadiness.cpp
  core/reports/GenerationReadiness.h
  core/reports/EngineeringReports.cpp
  core/reports/EngineeringReports.h
  core/reports/PullDirection.cpp
  core/reports/PullDirection.h
  core/reports/PullDirectionEvaluation.cpp
  core/reports/PullDirectionEvaluation.h
)
target_link_libraries(craft_reports PUBLIC craft_mold)
craft_target_defaults(craft_reports)

# --- craft_mesh_manifold: native Manifold behind IMeshGeometryEngine ---------
add_library(craft_mesh_manifold STATIC
  engines/mesh/ManifoldMeshEngine.cpp
  engines/mesh/ManifoldMeshEngine.h
)
target_link_libraries(craft_mesh_manifold PUBLIC craft_mesh_api PRIVATE manifold::manifold)
craft_target_defaults(craft_mesh_manifold)

# --- craft_analysis_bridge: local Python worker over QProcess ----------------
add_library(craft_analysis_bridge STATIC
  engines/analysis-bridge/AnalysisProtocol.h
  engines/analysis-bridge/AnalysisWorkerClient.cpp
  engines/analysis-bridge/AnalysisWorkerClient.h
)
target_include_directories(craft_analysis_bridge PUBLIC engines/analysis-bridge)
target_link_libraries(craft_analysis_bridge PUBLIC Qt6::Core craft_core)
craft_target_defaults(craft_analysis_bridge)

if(CRAFT_BUILD_APP)
  add_subdirectory(app)
endif()

if(CRAFT_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
