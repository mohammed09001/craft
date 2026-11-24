#pragma once

// Image comparison used by the viewport comparison against the Three.js reference (docs/native-migration/VIEWPORT_COMPARISON.md).
//
// Two renderers never produce identical pixels (different shading, tone mapping, anti-aliasing, shadow filters), so the
// comparison measures what parity can mean here: where the part lands in the frame (a mask of what changed between an empty
// frame and a frame with the part: area, bounding box, overlap, boundary distance), and how the two frames differ in
// brightness and structure (mean absolute difference, SSIM). Pure functions on QImage, covered by tst_imagecompare.

#include <QImage>
#include <QJsonObject>

#include <cstdint>
#include <vector>

namespace craft::tools {

struct Mask {
  int width = 0, height = 0;
  std::vector<std::uint8_t> bits;  // 1 = part
  bool at(int x, int y) const { return x >= 0 && y >= 0 && x < width && y < height && bits[static_cast<std::size_t>(y) * width + x] != 0; }
};

struct MaskStats {
  long long area = 0;
  int minX = 0, minY = 0, maxX = -1, maxY = -1;
  double centroidX = 0, centroidY = 0;
  bool empty() const { return area == 0; }
};

/// Pixels where the largest per-channel difference between the two frames is above `threshold` (0..255).
Mask changedMask(const QImage& empty, const QImage& withPart, int threshold);
/// Morphological opening with a (2r+1) square: removes anything thinner than that (the grid lines that both applications
/// redraw when a part is loaded) and keeps solid regions the same size.
Mask openMask(const Mask& mask, int radius);
/// Only the largest 4-connected region (the part itself: the grid labels and other small marks that appear with a part are
/// dropped). An empty mask stays empty.
Mask largestRegion(const Mask& mask);
MaskStats maskStats(const Mask& mask);
/// Intersection over union; 0 when both are empty.
double maskIoU(const Mask& a, const Mask& b);

struct BoundaryDistance {
  double meanPx = 0, p95Px = 0, maxPx = 0;  // symmetric: both directions pooled
  long long samples = 0;
};
/// Distance from every boundary pixel of one mask to the nearest boundary pixel of the other (chamfer 3-4, so within ~8%).
BoundaryDistance boundaryDistance(const Mask& a, const Mask& b);

/// Mean absolute difference over all channels, 0..1. With a region, only its pixels count.
double meanAbsDifference(const QImage& a, const QImage& b, const Mask* region = nullptr);
/// Structural similarity of the luminance, 8x8 windows every 4 pixels, -1..1 (1 = identical). With a region, only windows
/// that are at least half inside it count.
double ssim(const QImage& a, const QImage& b, const Mask* region = nullptr);

/// |a - b| scaled so that a difference of 64/255 or more is full red on black.
QImage diffImage(const QImage& a, const QImage& b);
/// a | b | diff, left to right, with a 4 px gap.
QImage sideBySide(const QImage& a, const QImage& b, const QImage& diff);

struct FrameSet {
  QImage referenceEmpty, referenceWithPart, nativeEmpty, nativeWithPart;
};
/// Everything the report quotes for one scene.
QJsonObject compareFrames(const FrameSet& frames, int maskThreshold, QImage* sideBySideOut = nullptr, QImage* diffOut = nullptr,
                          int openingRadius = 2);

}  // namespace craft::tools
