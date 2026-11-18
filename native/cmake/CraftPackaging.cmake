# Installation and packaging rules for the Windows desktop application.
#
#   cmake --install <build> --prefix <dir>      the installed layout (below)
#   cpack --config <build>/CPackConfig.cmake     the portable ZIP of that layout
#
# Installed layout (relative to the install root; the app resolves everything
# from its own directory, nothing refers to a development drive):
#
#   Craft.exe, Qt DLLs/plugins/QML (windeployqt), MSVC runtime
#   python/                       the embeddable CPython (CRAFT_PYTHON_RUNTIME_DIR)
#   analysis/craft_analysis_worker.py
#   analysis/site/                mold_generator_engine, engineering_reports,
#                                 engineering_analysis (+ dist-info, precompiled)
#   licenses/                     third-party licenses and notices
#
# CRAFT_PYTHON_RUNTIME_DIR must point at a prepared runtime
# (scripts/native/prepare-python-runtime.ps1). Without it `cmake --install`
# fails with an explanation instead of producing an app that silently lacks
# its analysis engine.

if(NOT WIN32)
  return()  # macOS bundling is a separate piece of work (see docs/native-migration/PACKAGING.md)
endif()

set(CRAFT_PYTHON_RUNTIME_DIR "" CACHE PATH
    "Prepared embeddable Python runtime to bundle (scripts/native/prepare-python-runtime.ps1)")

set(CRAFT_ENGINE_PACKAGES mold_generator_engine engineering_reports engineering_analysis)

# --- application -------------------------------------------------------------
install(TARGETS craft RUNTIME DESTINATION .)

# Qt runtime: DLLs, platform/style/Quick3D plugins and the QML modules the UI imports.
get_target_property(_core_location Qt6::Core LOCATION)
get_filename_component(_qt_bin_dir "${_core_location}" DIRECTORY)
set(_windeployqt "${_qt_bin_dir}/windeployqt.exe")
install(CODE "
  set(_dir \"\$ENV{DESTDIR}\${CMAKE_INSTALL_PREFIX}\")
  execute_process(
    COMMAND \"${_windeployqt}\" --release --no-translations --no-system-d3d-compiler --no-opengl-sw
            --qmldir \"${CMAKE_SOURCE_DIR}/app/ui\" --dir \"\${_dir}\" \"\${_dir}/Craft.exe\"
    RESULT_VARIABLE _deploy_result OUTPUT_VARIABLE _deploy_output ERROR_VARIABLE _deploy_output)
  if(NOT _deploy_result EQUAL 0)
    message(FATAL_ERROR \"windeployqt failed (\${_deploy_result}):\\n\${_deploy_output}\")
  endif()
" COMPONENT Runtime)

# MSVC runtime, app-local (the exe and Qt need msvcp140/vcruntime140; Windows 11 does not ship them).
set(CMAKE_INSTALL_UCRT_LIBRARIES FALSE)
set(CMAKE_INSTALL_SYSTEM_RUNTIME_DESTINATION .)
set(CMAKE_INSTALL_SYSTEM_RUNTIME_COMPONENT Runtime)
include(InstallRequiredSystemLibraries)

# --- analysis engine ---------------------------------------------------------
install(CODE "
  if(NOT EXISTS \"${CRAFT_PYTHON_RUNTIME_DIR}/python.exe\")
    message(FATAL_ERROR \"CRAFT_PYTHON_RUNTIME_DIR is not set to a prepared Python runtime (got '${CRAFT_PYTHON_RUNTIME_DIR}'). Run scripts/native/prepare-python-runtime.ps1 and configure with -DCRAFT_PYTHON_RUNTIME_DIR=<that folder>.\")
  endif()
" COMPONENT Runtime)
if(CRAFT_PYTHON_RUNTIME_DIR)
  install(DIRECTORY "${CRAFT_PYTHON_RUNTIME_DIR}/" DESTINATION python COMPONENT Runtime USE_SOURCE_PERMISSIONS)
endif()

install(FILES "${CRAFT_WORKER_SCRIPT}" DESTINATION analysis COMPONENT Runtime)
foreach(_package IN LISTS CRAFT_ENGINE_PACKAGES)
  install(DIRECTORY "${CRAFT_ENGINE_SRC}/${_package}" DESTINATION analysis/site COMPONENT Runtime
          PATTERN "__pycache__" EXCLUDE PATTERN "*.pyc" EXCLUDE)
endforeach()

# Package metadata so the worker can report the engine version (importlib.metadata), then precompile the engine with
# hash-based pyc files that are never re-validated: the install tree is immutable and may be read-only.
file(STRINGS "${CRAFT_ENGINE_SRC}/../pyproject.toml" _engine_version_line REGEX "^version = \"")
string(REGEX REPLACE "^version = \"([^\"]+)\".*$" "\\1" CRAFT_ENGINE_VERSION "${_engine_version_line}")
install(CODE "
  set(_dir \"\$ENV{DESTDIR}\${CMAKE_INSTALL_PREFIX}\")
  set(_info \"\${_dir}/analysis/site/mold_generator_engine-${CRAFT_ENGINE_VERSION}.dist-info\")
  file(WRITE \"\${_info}/METADATA\" \"Metadata-Version: 2.1\\nName: mold-generator-engine\\nVersion: ${CRAFT_ENGINE_VERSION}\\n\")
  file(WRITE \"\${_info}/INSTALLER\" \"craft-installer\\n\")
  execute_process(
    COMMAND \"\${_dir}/python/python.exe\" -I -m compileall -q -j 1 --invalidation-mode unchecked-hash \"\${_dir}/analysis/site\"
    RESULT_VARIABLE _compile_result OUTPUT_VARIABLE _compile_output ERROR_VARIABLE _compile_output)
  if(NOT _compile_result EQUAL 0)
    message(FATAL_ERROR \"Precompiling the analysis engine failed (\${_compile_result}):\\n\${_compile_output}\")
  endif()
" COMPONENT Runtime)

# --- licenses ----------------------------------------------------------------
install(FILES "${CMAKE_SOURCE_DIR}/packaging/THIRD_PARTY_NOTICES.txt" DESTINATION licenses COMPONENT Runtime)
include(FetchContent)
FetchContent_GetProperties(manifold SOURCE_DIR _manifold_dir)
FetchContent_GetProperties(clipper2 SOURCE_DIR _clipper2_dir)
if(NOT _manifold_dir OR NOT EXISTS "${_manifold_dir}/LICENSE" OR NOT _clipper2_dir OR NOT EXISTS "${_clipper2_dir}/LICENSE")
  message(FATAL_ERROR "Packaging needs the Manifold and Clipper2 license files from the fetched sources (manifold: '${_manifold_dir}', clipper2: '${_clipper2_dir}').")
endif()
install(FILES "${_manifold_dir}/LICENSE" DESTINATION licenses RENAME Manifold-LICENSE-Apache-2.0.txt COMPONENT Runtime)
install(FILES "${_clipper2_dir}/LICENSE" DESTINATION licenses RENAME Clipper2-LICENSE-BSL-1.0.txt COMPONENT Runtime)

# --- CPack: the portable ZIP of the installed layout --------------------------
set(CPACK_PACKAGE_NAME "Craft")
set(CPACK_PACKAGE_VENDOR "Craft")
set(CPACK_PACKAGE_VERSION "${PROJECT_VERSION}")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "Craft: native desktop mold design")
set(CPACK_PACKAGE_FILE_NAME "Craft-${PROJECT_VERSION}-windows-x64")
set(CPACK_PACKAGE_DIRECTORY "${CMAKE_BINARY_DIR}/packages")
set(CPACK_GENERATOR "ZIP")
set(CPACK_ARCHIVE_COMPONENT_INSTALL OFF)
set(CPACK_INCLUDE_TOPLEVEL_DIRECTORY ON)
set(CPACK_VERBATIM_VARIABLES ON)
include(CPack)
