#pragma once

// The part's selection box and its six pickable faces, plus the selection highlight colours.
//
// Port of mold/frontend/src/features/viewport/runtime/objectSelectionBoxRuntime.ts (box edges, face quads, hover
// resolution) and modelSelectionHighlight.ts (the highlight colour rule). In the reference the "faces" of a selection
// are these six faces of the part's bounding box, not patches of the part's own surface: hovering shows the nearest
// box face under the pointer, and while Cut by Face is active a click toggles that face. The face names are the
// reference's (front = +Y, back = -Y, left = -X, right = +X, top = +Z, bottom = -Z), which are also the Cut by Face
// plane names.
//
// Picking matches the reference's raycast: every face is two triangles (a,b,c) and (a,c,d), intersected double-sided
// with Three.js's rules (edges inclusive), hits ordered by distance, the nearest one wins.

#include <array>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "contracts/Geometry.h"
#include "view/ViewPose.h"

namespace craft {

enum class SelectionBoxFace : int { Front = 0, Back, Left, Right, Top, Bottom };
inline constexpr std::array<SelectionBoxFace, 6> kSelectionBoxFaces{
    SelectionBoxFace::Front, SelectionBoxFace::Back, SelectionBoxFace::Left,
    SelectionBoxFace::Right, SelectionBoxFace::Top,  SelectionBoxFace::Bottom};

const char* selectionBoxFaceName(SelectionBoxFace face);
std::optional<SelectionBoxFace> selectionBoxFaceFromName(std::string_view name);

struct SelectionBoxFaceQuad {
  SelectionBoxFace face = SelectionBoxFace::Front;
  std::array<Vec3, 4> corners;  // in the reference's winding order
};

/// Outward unit normal of a face (front +Y, back -Y, left -X, right +X, top +Z, bottom -Z).
Vec3 selectionBoxFaceNormal(SelectionBoxFace face);

/// The six face quads of `bounds`, in the reference's order and corner order.
std::array<SelectionBoxFaceQuad, 6> selectionBoxFaceQuads(const Bounds3& bounds);

struct SelectionBoxHit {
  SelectionBoxFace face = SelectionBoxFace::Front;
  double distance = 0;
  Vec3 point;
};

/// Every triangle hit of the six faces, nearest first (a ray through a quad's diagonal reports both triangles, as the
/// reference's raycast does). Empty when the ray misses the box.
std::vector<SelectionBoxHit> pickSelectionBoxFaces(const Ray& ray, const Bounds3& bounds);
/// The face the hover logic resolves: the nearest hit.
std::optional<SelectionBoxHit> pickSelectionBoxFace(const Ray& ray, const Bounds3& bounds);

struct Segment3 {
  Vec3 from, to;
};

/// The twelve box edges, in the reference's vertex order (bottom ring, top ring, four verticals).
std::array<Segment3, 12> selectionBoxEdges(const Bounds3& bounds);

/// The dashed pieces of one edge. The reference draws the box as one LineSegments with LineDashedMaterial, whose line
/// distance accumulates over the consecutive segments: a point is drawn when (distance mod (dash + gap)) <= dash, with
/// the distance measured from the start of the first edge. `startDistance` is that accumulated distance at `edge.from`.
/// `maxDashes` bounds the geometry for absurdly long edges (dash and gap are then scaled up together).
std::vector<Segment3> dashEdge(const Segment3& edge, double dashMm, double gapMm, double startDistance = 0, std::size_t maxDashes = 20000);

/// All twelve edges dashed with the pattern running on from one edge into the next, in the reference's edge order.
std::vector<Segment3> selectionBoxDashes(const Bounds3& bounds, double dashMm = 0.35, double gapMm = 0.22);

// --- style: the reference's constants ------------------------------------------------------------------------------
inline constexpr double kSelectionBoxDashMm = 0.35;
inline constexpr double kSelectionBoxGapMm = 0.22;
inline constexpr double kSelectionBoxLineOpacity = 0.95;
inline constexpr double kSelectionBoxHoverOpacity = 0.26;
inline constexpr double kSelectionBoxSelectedOpacity = 0.34;
inline constexpr unsigned kSelectionBoxColorRgb = 0x38bdf8;
inline constexpr unsigned kHighlightOnLightRgb = 0x2563eb;
inline constexpr unsigned kHighlightOnDarkRgb = 0xfacc15;
inline constexpr double kHighlightEmissiveIntensity = 0.18;
inline constexpr double kHighlightMaxRoughness = 0.58;
/// A press that moves farther than this (Euclidean, in pixels) is a drag, not a click (pointerSelection.ts).
inline constexpr double kClickDragThresholdPx = 4.0;

/// sRGB channel (0..1) to linear, as Three.js colour management does for hex/CSS colours.
double srgbChannelToLinear(double channel);

/// Whether the highlight uses the light-background colour. The reference converts the CSS colour to Three.js's linear
/// working space before taking HSL lightness, so the threshold (lightness > 0.5) sits near sRGB 0xbc, not 0x80.
/// Accepts "#rrggbb" and "#rgb"; anything else counts as dark.
bool isLightBackground(std::string_view cssHex);
/// 0xRRGGBB of the highlight for that background.
unsigned highlightColorRgb(std::string_view backgroundCssHex);

}  // namespace craft
