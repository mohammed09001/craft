# Native Manifold (C++), pinned to the same release the reference frontend
# uses through the `manifold-3d` WASM package (mold/frontend/package-lock.json
# resolves manifold-3d 3.5.1), so native and reference Booleans come from the
# same kernel revision.
#
# The download and build tree live under FETCHCONTENT_BASE_DIR, which the
# presets route to the heavy-data root (never the source tree, never C:).

include(FetchContent)

set(CRAFT_MANIFOLD_TAG "v3.5.1" CACHE STRING "Pinned Manifold release tag")
set(CRAFT_MANIFOLD_COMMIT "cc8a7f66d7d5a560da94346258c5b546af27811e"
    CACHE STRING "Commit the pinned Manifold tag must resolve to")

# Deterministic, dependency-free configuration:
#  - no TBB (the WASM reference is single-threaded as well),
#  - no CrossSection (avoids fetching Clipper2; 2D offsets are not used yet),
#  - no bindings, tests, or samples.
set(MANIFOLD_PAR OFF CACHE BOOL "" FORCE)
set(MANIFOLD_CROSS_SECTION OFF CACHE BOOL "" FORCE)
set(MANIFOLD_TEST OFF CACHE BOOL "" FORCE)
set(MANIFOLD_CBIND OFF CACHE BOOL "" FORCE)
set(MANIFOLD_PYBIND OFF CACHE BOOL "" FORCE)
set(MANIFOLD_JSBIND OFF CACHE BOOL "" FORCE)
set(MANIFOLD_EXPORT OFF CACHE BOOL "" FORCE)
set(MANIFOLD_DEBUG OFF CACHE BOOL "" FORCE)
set(MANIFOLD_DOWNLOADS ON CACHE BOOL "" FORCE)

set(_craft_saved_shared ${BUILD_SHARED_LIBS})
set(BUILD_SHARED_LIBS OFF)

FetchContent_Declare(
  manifold
  GIT_REPOSITORY https://github.com/elalish/manifold.git
  GIT_TAG ${CRAFT_MANIFOLD_COMMIT}
  GIT_SHALLOW FALSE
  EXCLUDE_FROM_ALL
)
FetchContent_MakeAvailable(manifold)

set(BUILD_SHARED_LIBS ${_craft_saved_shared})

if(NOT TARGET manifold::manifold)
  if(TARGET manifold)
    add_library(manifold::manifold ALIAS manifold)
  else()
    message(FATAL_ERROR "Manifold did not export a 'manifold' target.")
  endif()
endif()
