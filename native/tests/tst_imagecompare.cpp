// The image comparison behind the viewport comparison: known shapes with known answers.
#include <QtTest>

#include "ImageCompare.h"

using namespace craft::tools;

namespace {

QImage solid(int w, int h, QRgb color) {
  QImage image(w, h, QImage::Format_RGB32);
  image.fill(color);
  return image;
}

QImage withSquare(int w, int h, int x0, int y0, int size, QRgb background, QRgb color) {
  QImage image = solid(w, h, background);
  for (int y = y0; y < y0 + size; ++y)
    for (int x = x0; x < x0 + size; ++x) image.setPixel(x, y, color);
  return image;
}

}  // namespace

class ImageCompareTest : public QObject {
  Q_OBJECT
 private slots:
  void theMaskIsWhatChangedAboveTheThreshold() {
    const QImage empty = solid(60, 40, qRgb(40, 40, 40));
    QImage part = withSquare(60, 40, 10, 10, 20, qRgb(40, 40, 40), qRgb(200, 200, 200));
    part.setPixel(50, 5, qRgb(50, 50, 50));  // a difference of 10: below the threshold
    const Mask mask = changedMask(empty, part, 24);
    const MaskStats s = maskStats(mask);
    QCOMPARE(s.area, 400LL);
    QCOMPARE(s.minX, 10);
    QCOMPARE(s.maxX, 29);
    QCOMPARE(s.minY, 10);
    QCOMPARE(s.maxY, 29);
    QCOMPARE(s.centroidX, 19.5);
    QCOMPARE(s.centroidY, 19.5);
    QVERIFY(!mask.at(50, 5));
    QCOMPARE(maskStats(changedMask(empty, empty, 24)).area, 0LL);
  }

  void openingRemovesThinLinesAndKeepsSolidRegions() {
    const QRgb bg = qRgb(0, 0, 0), fg = qRgb(255, 255, 255);
    QImage frame = withSquare(100, 80, 30, 20, 30, bg, fg);
    for (int x = 0; x < 100; ++x) frame.setPixel(x, 5, fg);   // a one pixel line (a grid line)
    for (int y = 0; y < 80; ++y) frame.setPixel(90, y, fg);
    frame.setPixel(10, 60, fg);                                // an isolated pixel
    const QImage empty = solid(100, 80, bg);
    const Mask raw = changedMask(empty, frame, 24);
    QVERIFY(maskStats(raw).area > 900);
    const Mask opened = openMask(raw, 2);
    const MaskStats s = maskStats(opened);
    QCOMPARE(s.area, 900LL);  // exactly the 30 x 30 square survives
    QCOMPARE(s.minX, 30);
    QCOMPARE(s.maxX, 59);
    QCOMPARE(s.minY, 20);
    QCOMPARE(s.maxY, 49);
    QCOMPARE(maskStats(openMask(raw, 0)).area, maskStats(raw).area);  // radius 0 changes nothing
    // A region narrower than the window disappears entirely.
    QCOMPARE(maskStats(openMask(changedMask(empty, withSquare(100, 80, 10, 10, 4, bg, fg), 24), 2)).area, 0LL);
  }

  void onlyTheLargestRegionIsKept() {
    const QRgb bg = qRgb(0, 0, 0), fg = qRgb(255, 255, 255);
    QImage frame = withSquare(120, 80, 10, 10, 40, bg, fg);                   // 1600 px: the part
    for (int y = 20; y < 30; ++y)
      for (int x = 90; x < 100; ++x) frame.setPixel(x, y, fg);                 // 100 px: a mark (a grid label)
    for (int y = 60; y < 66; ++y)
      for (int x = 100; x < 106; ++x) frame.setPixel(x, y, fg);                // 36 px: another
    const Mask raw = changedMask(solid(120, 80, bg), frame, 24);
    QCOMPARE(maskStats(raw).area, 1736LL);
    const Mask part = largestRegion(raw);
    QCOMPARE(maskStats(part).area, 1600LL);
    QCOMPARE(maskStats(part).minX, 10);
    QCOMPARE(maskStats(part).maxX, 49);
    QVERIFY(!part.at(95, 25));
    // Regions touching only at a corner are separate (4-connected).
    QImage diagonal = solid(20, 20, bg);
    for (int y = 0; y < 5; ++y)
      for (int x = 0; x < 5; ++x) { diagonal.setPixel(x, y, fg); diagonal.setPixel(x + 5, y + 5, fg); }
    diagonal.setPixel(7, 2, fg);
    QCOMPARE(maskStats(largestRegion(changedMask(solid(20, 20, bg), diagonal, 24))).area, 25LL);
    QCOMPARE(maskStats(largestRegion(changedMask(solid(20, 20, bg), solid(20, 20, bg), 24))).area, 0LL);
  }

  void overlapOfShiftedSquaresIsExact() {
    const QRgb bg = qRgb(0, 0, 0), fg = qRgb(255, 255, 255);
    const QImage empty = solid(100, 80, bg);
    const Mask a = changedMask(empty, withSquare(100, 80, 10, 10, 20, bg, fg), 24);
    const Mask b = changedMask(empty, withSquare(100, 80, 15, 10, 20, bg, fg), 24);
    QCOMPARE(maskIoU(a, a), 1.0);
    QCOMPARE(maskIoU(a, b), 300.0 / 500.0);  // 15x20 shared out of 20x20 + 20x20 - 15x20
    QCOMPARE(maskIoU(a, changedMask(empty, empty, 24)), 0.0);
    QCOMPARE(maskIoU(changedMask(empty, empty, 24), changedMask(empty, empty, 24)), 0.0);
  }

  void boundaryDistanceFollowsTheShift() {
    const QRgb bg = qRgb(0, 0, 0), fg = qRgb(255, 255, 255);
    const QImage empty = solid(100, 80, bg);
    const Mask a = changedMask(empty, withSquare(100, 80, 10, 10, 20, bg, fg), 24);
    const BoundaryDistance same = boundaryDistance(a, a);
    QCOMPARE(same.maxPx, 0.0);
    QCOMPARE(same.meanPx, 0.0);
    const Mask b = changedMask(empty, withSquare(100, 80, 15, 10, 20, bg, fg), 24);
    const BoundaryDistance shifted = boundaryDistance(a, b);
    QVERIFY2(std::fabs(shifted.maxPx - 5.0) < 0.5, qPrintable(QString::number(shifted.maxPx)));  // the side edges are 5 px apart
    QVERIFY(shifted.meanPx > 0.5 && shifted.meanPx < 5.0);
    QVERIFY(shifted.p95Px <= shifted.maxPx);
    // A part twice as large is far away at its corners.
    const Mask big = changedMask(empty, withSquare(100, 80, 10, 10, 40, bg, fg), 24);
    QVERIFY(boundaryDistance(a, big).maxPx > 15.0);
  }

  void boundaryDistancePoolsBothDirections() {
    const QRgb bg = qRgb(0, 0, 0), fg = qRgb(255, 255, 255);
    const QImage empty = solid(100, 80, bg);
    const Mask big = changedMask(empty, withSquare(100, 80, 10, 10, 40, bg, fg), 24);
    const Mask small = changedMask(empty, withSquare(100, 80, 25, 25, 10, bg, fg), 24);
    const BoundaryDistance d = boundaryDistance(big, small);
    QCOMPARE(d.samples, 156LL + 36LL);  // every boundary pixel of both shapes, not one direction only
    // The small square sits well inside the big one: its outline is ~15 px from the big outline, while the big outline is
    // 15..40 px from the small one. Pooled, the mean lies between the two directions' means.
    QVERIFY2(d.meanPx > 15.0 && d.meanPx < 30.0, qPrintable(QString::number(d.meanPx)));
    QCOMPARE(boundaryDistance(big, small).meanPx, boundaryDistance(small, big).meanPx);  // symmetric
  }

  void differenceAndStructure() {
    // Same brightness, opposite structure: a checkerboard and the same checkerboard shifted by one pixel.
    QImage checker(64, 64, QImage::Format_RGB32), inverse(64, 64, QImage::Format_RGB32);
    for (int y = 0; y < 64; ++y)
      for (int x = 0; x < 64; ++x) {
        checker.setPixel(x, y, ((x + y) % 2) ? qRgb(200, 200, 200) : qRgb(50, 50, 50));
        inverse.setPixel(x, y, ((x + y) % 2) ? qRgb(50, 50, 50) : qRgb(200, 200, 200));
      }
    QVERIFY2(ssim(checker, inverse) < 0.1, "equal brightness but anti-correlated structure must not look similar");
    QVERIFY(ssim(checker, checker) > 0.999);
    const QImage black = solid(64, 64, qRgb(0, 0, 0)), white = solid(64, 64, qRgb(255, 255, 255));
    QCOMPARE(meanAbsDifference(black, black), 0.0);
    QCOMPARE(meanAbsDifference(black, white), 1.0);
    QCOMPARE(meanAbsDifference(black, solid(64, 64, qRgb(51, 51, 51))), 0.2);
    const QImage textured = withSquare(64, 64, 8, 8, 24, qRgb(30, 30, 30), qRgb(220, 120, 60));
    QVERIFY(std::fabs(ssim(textured, textured) - 1.0) < 1e-12);
    const QImage moved = withSquare(64, 64, 20, 20, 24, qRgb(30, 30, 30), qRgb(220, 120, 60));
    QVERIFY(ssim(textured, moved) < 0.9);
    QVERIFY(ssim(textured, solid(64, 64, qRgb(30, 30, 30))) < 0.9);
    // A region restricts both measures.
    Mask region;
    region.width = region.height = 64;
    region.bits.assign(64 * 64, 0);
    for (int y = 0; y < 8; ++y)
      for (int x = 0; x < 8; ++x) region.bits[static_cast<std::size_t>(y) * 64 + x] = 1;  // corner that is the same in both
    QCOMPARE(meanAbsDifference(textured, moved, &region), 0.0);
  }

  void theReportHoldsEveryNumberAndIdenticalFramesScorePerfectly() {
    const QRgb bg = qRgb(20, 24, 30), fg = qRgb(200, 180, 90);
    FrameSet f;
    f.referenceEmpty = f.nativeEmpty = solid(120, 90, bg);
    f.referenceWithPart = f.nativeWithPart = withSquare(120, 90, 30, 20, 40, bg, fg);
    QImage sbs, diff;
    const QJsonObject r = compareFrames(f, 24, &sbs, &diff);
    QCOMPARE(r.value("maskIoU").toDouble(), 1.0);
    QCOMPARE(r.value("centroidOffsetPx").toDouble(), 0.0);
    QCOMPARE(r.value("boundaryDistanceMaxPx").toDouble(), 0.0);
    QCOMPARE(r.value("meanAbsDifferenceFrame").toDouble(), 0.0);
    QCOMPARE(r.value("areaRatioNativeOverReference").toDouble(), 1.0);
    QVERIFY(std::fabs(r.value("ssimFrame").toDouble() - 1.0) < 1e-12);
    QCOMPARE(diff.size(), QSize(120, 90));
    QCOMPARE(sbs.width(), 120 * 3 + 8);

    // The native renders the same part 10 px to the right and 20 % larger: the numbers must say so.
    f.nativeWithPart = withSquare(120, 90, 40, 20, 48, bg, fg);
    const QJsonObject d = compareFrames(f, 24);
    QVERIFY(d.value("maskIoU").toDouble() < 0.7);
    QVERIFY(d.value("centroidOffsetPx").toDouble() > 10.0);
    QVERIFY(std::fabs(d.value("areaRatioNativeOverReference").toDouble() - (48.0 * 48.0) / (40.0 * 40.0)) < 1e-9);
    QVERIFY(d.value("ssimFrame").toDouble() < 0.95);
    QVERIFY(d.value("boundaryDistanceMaxPx").toDouble() > 8.0);
  }
};

QTEST_MAIN(ImageCompareTest)
#include "tst_imagecompare.moc"
