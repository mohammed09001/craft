# Numerical kernels for the Python analysis worker (loaded through ctypes; see AnalysisKernels.h).
add_library(craft_analysis_kernels SHARED AnalysisKernels.cpp AnalysisKernels.h)
target_include_directories(craft_analysis_kernels PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_compile_definitions(craft_analysis_kernels PRIVATE CRAFT_KERNELS_BUILD)
# The kernels must do a*b+c as a multiply and an add, like CPython: no fused multiply-add, no fast-math. The C runtime is the shared
# one (the default), so asin is the function python.exe itself calls.
if(MSVC)
  target_compile_options(craft_analysis_kernels PRIVATE /W4 /fp:strict /utf-8)
else()
  target_compile_options(craft_analysis_kernels PRIVATE -Wall -Wextra -Wpedantic -ffp-contract=off -fno-fast-math)
endif()
set_target_properties(craft_analysis_kernels PROPERTIES
  CXX_VISIBILITY_PRESET hidden
  VISIBILITY_INLINES_HIDDEN ON
  PREFIX "")   # craft_analysis_kernels.dll / .so / .dylib, the name the worker looks for
if(NOT WIN32)
  find_package(Threads REQUIRED)
  target_link_libraries(craft_analysis_kernels PRIVATE Threads::Threads)
endif()
# Always the release C runtime, also in a debug build: the library is loaded into the (release) Python interpreter, which has no debug
# runtime to share, and the result must come from the same C library functions the interpreter calls.
set_target_properties(craft_analysis_kernels PROPERTIES AUTOMOC OFF AUTOUIC OFF AUTORCC OFF
  MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")
