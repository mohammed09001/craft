# Development tooling: the image comparison used by the viewport comparison (not shipped).
add_library(craft_imagecompare STATIC ImageCompare.cpp ImageCompare.h)
target_include_directories(craft_imagecompare PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(craft_imagecompare PUBLIC Qt6::Gui Qt6::Core)
craft_target_defaults(craft_imagecompare)

add_executable(craft_imgcompare imgcompare_main.cpp)
target_link_libraries(craft_imgcompare PRIVATE craft_imagecompare)
craft_target_defaults(craft_imgcompare)
