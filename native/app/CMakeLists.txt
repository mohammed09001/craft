find_package(Qt6 6.8 REQUIRED COMPONENTS Quick3D QuickDialogs2 ShaderTools)

# --- craft_viewport: engineering geometry -> Qt Quick 3D buffers / camera -----
add_library(craft_viewport STATIC
  ../viewport/MeshGeometryAdapter.cpp ../viewport/MeshGeometryAdapter.h
  ../viewport/SceneGeometry.cpp ../viewport/SceneGeometry.h
  ../viewport/ViewportCamera.cpp ../viewport/ViewportCamera.h
)
target_include_directories(craft_viewport PUBLIC ../viewport)
target_link_libraries(craft_viewport PUBLIC craft_core Qt6::Quick3D Qt6::Gui)
craft_target_defaults(craft_viewport)

# --- craft_app_lib: controller, scene model, paths, logging -------------------
add_library(craft_app_lib STATIC
  AppController.cpp AppControllerMaster.cpp AppControllerReports.cpp AppControllerProject.cpp AppController.h
  AppPaths.cpp AppPaths.h
  JobRunner.h
  Logging.cpp Logging.h
  SceneModel.cpp SceneModel.h
)
target_include_directories(craft_app_lib PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(craft_app_lib PUBLIC
  craft_viewport craft_mold craft_reports craft_project craft_io craft_mesh_manifold craft_analysis_bridge
  Qt6::Concurrent Qt6::Quick3D)
target_compile_definitions(craft_app_lib PRIVATE
  CRAFT_DEV_WORKER_SCRIPT="${CRAFT_WORKER_SCRIPT}"
  CRAFT_DEV_ENGINE_SRC="${CRAFT_ENGINE_SRC}"
  CRAFT_DEV_PYTHON="${CRAFT_PYTHON_EXECUTABLE_NORMALIZED}")
craft_target_defaults(craft_app_lib)

# --- the application ----------------------------------------------------------
qt_add_executable(craft WIN32 MACOSX_BUNDLE main.cpp)
target_link_libraries(craft PRIVATE craft_app_lib Qt6::Quick Qt6::QuickControls2 Qt6::QuickDialogs2)
craft_target_defaults(craft)

foreach(_q Main ViewportView Inspector)
  set_source_files_properties(ui/${_q}.qml PROPERTIES QT_RESOURCE_ALIAS ${_q}.qml)
endforeach()

qt_add_qml_module(craft
  URI Craft
  VERSION 1.0
  QML_FILES
    ui/Main.qml
    ui/ViewportView.qml
    ui/Inspector.qml
)

set_target_properties(craft PROPERTIES
  OUTPUT_NAME "Craft"
  MACOSX_BUNDLE_BUNDLE_NAME "Craft"
  MACOSX_BUNDLE_GUI_IDENTIFIER "app.craft.native"
)

# Copy Qt runtime next to the exe in the build tree so it launches directly.
if(WIN32)
  get_target_property(_core_location Qt6::Core LOCATION)
  get_filename_component(CRAFT_QT_BIN_DIR "${_core_location}" DIRECTORY)
  add_custom_command(TARGET craft POST_BUILD
    COMMAND "${CRAFT_QT_BIN_DIR}/windeployqt.exe" --no-translations --no-system-d3d-compiler
            --qmldir "${CMAKE_CURRENT_SOURCE_DIR}/ui" "$<TARGET_FILE:craft>"
    COMMENT "Deploying Qt runtime into the build tree")
endif()
