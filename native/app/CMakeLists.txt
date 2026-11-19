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
  AppController.cpp AppControllerMaster.cpp AppControllerReports.cpp AppControllerProject.cpp AppControllerSelection.cpp AppControllerSprueGizmo.cpp AppControllerHistory.cpp AppControllerRuler.cpp RulerLabelImage.cpp RulerLabelImage.h
  SprueHandleModel.cpp SprueHandleModel.h AppControllerCutPlanes.cpp CutPlaneModel.cpp CutPlaneModel.h AppController.h
  AppPaths.cpp AppPaths.h
  JobRunner.h
  Logging.cpp Logging.h
  SceneModel.cpp SceneModel.h
)
target_include_directories(craft_app_lib PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(craft_app_lib PUBLIC
  craft_viewport craft_mold craft_reports craft_project craft_export craft_io craft_mesh_manifold craft_analysis_bridge
  Qt6::Concurrent Qt6::Quick3D)
# Development fallbacks (the source-tree worker and the developer's interpreter) are compiled in only for development
# builds. A packaged build must resolve its runtime from its own folder and report "analysis_runtime_missing" if it is
# absent, never quietly run a developer's interpreter whose path happens to be baked into the binary.
if(CRAFT_EMBED_DEV_RUNTIME_PATHS)
  target_compile_definitions(craft_app_lib PRIVATE
    CRAFT_DEV_WORKER_SCRIPT="${CRAFT_WORKER_SCRIPT}"
    CRAFT_DEV_ENGINE_SRC="${CRAFT_ENGINE_SRC}"
    CRAFT_DEV_PYTHON="${CRAFT_PYTHON_EXECUTABLE_NORMALIZED}"
    CRAFT_DEV_KERNELS="$<TARGET_FILE:craft_analysis_kernels>")
endif()
add_dependencies(craft_app_lib craft_analysis_kernels)
craft_target_defaults(craft_app_lib)

# --- the application ----------------------------------------------------------
qt_add_executable(craft WIN32 MACOSX_BUNDLE main.cpp)
target_link_libraries(craft PRIVATE craft_app_lib Qt6::Quick Qt6::QuickControls2 Qt6::QuickDialogs2)
if(CRAFT_BUILD_TESTS)
  # The smoke test can drive the window with real platform mouse events (--sprue-gizmo-events). That uses Qt's private
  # platform event interface, so packaged (tests-off) builds neither link it nor contain the code.
  target_link_libraries(craft PRIVATE Qt6::GuiPrivate)
  target_compile_definitions(craft PRIVATE CRAFT_SMOKE_REAL_EVENTS=1)
  target_sources(craft PRIVATE ViewportBench.cpp ViewportBench.h UiTour.cpp UiTour.h)
endif()
craft_target_defaults(craft)

foreach(_q Main ViewportView Inspector CraftCheckBox)
  set_source_files_properties(ui/${_q}.qml PROPERTIES QT_RESOURCE_ALIAS ${_q}.qml)
endforeach()

qt_add_qml_module(craft
  URI Craft
  VERSION 1.0
  QML_FILES
    ui/Main.qml
    ui/ViewportView.qml
    ui/Inspector.qml
    ui/CraftCheckBox.qml
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
