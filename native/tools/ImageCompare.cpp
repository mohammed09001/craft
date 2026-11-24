#include "ImageCompare.h"

#include <QPainter>

#include <algorithm>
#include <cmath>
#include <limits>

namespace craft::tools {

namespace {

QImage rgb(const QImage& image) { return image.convertToFormat(QImage::Format_RGB32); }

int lumaAt(const QRgb p) { return (qRed(p) * 299 + qGreen(p) * 587 + qBlue(p) * 114) / 1000; }

int maxChannelDifference(QRgb a, QRgb b) {
  return std::max({std::abs(qRed(a) - qRed(b)), std::abs(qGreen(a) - qGreen(b)), std::abs(qBlue(a) - qBlue(b))});
}

}  // namespace

Mask changedMask(const QImage& empty, const QImage& withPart, int threshold) {
  const QImage a = rgb(empty), b = rgb(withPart);
  Mask mask;
  mask.width = std::min(a.width(), b.width());
  mask.height = std::min(a.height(), b.height());
  mask.bits.assign(static_cast<std::size_t>(mask.width) * mask.height, 0);
  for (int y = 0; y < mask.height; ++y) {
    const QRgb* ra = reinterpret_cast<const QRgb*>(a.constScanLine(y));
    const QRgb* rb = reinterpret_cast<const QRgb*>(b.constScanLine(y));
    for (int x = 0; x < mask.width; ++x)
      if (maxChannelDifference(ra[x], rb[x]) > threshold) mask.bits[static_cast<std::size_t>(y) * mask.width + x] = 1;
  }
  return mask;
}

namespace {

// Separable square erosion (keep = true: a pixel stays only if the whole window is set) or dilation (keep = false).
Mask morph(const Mask& in, int radius, bool erode) {
  const auto pass = [&](const Mask& src, bool horizontal) {
    Mask out = src;
    for (int y = 0; y < src.height; ++y)
      for (int x = 0; x < src.width; ++x) {
        bool all = true, any = false;
        for (int k = -radius; k <= radius; ++k) {
          const bool set = horizontal ? src.at(x + k, y) : src.at(x, y + k);
          all = all && set;
          any = any || set;
        }
        out.bits[static_cast<std::size_t>(y) * src.width + x] = (erode ? all : any) ? 1 : 0;
      }
    return out;
  };
  return pass(pass(in, true), false);
}

}  // namespace

Mask openMask(const Mask& mask, int radius) {
  if (radius <= 0) return mask;
  return morph(morph(mask, radius, true), radius, false);
}

Mask largestRegion(const Mask& mask) {
  std::vector<int> label(mask.bits.size(), 0);
  std::vector<long long> sizes{0};
  std::vector<int> stack;
  for (int y0 = 0; y0 < mask.height; ++y0)
    for (int x0 = 0; x0 < mask.width; ++x0) {
      const std::size_t start = static_cast<std::size_t>(y0) * mask.width + x0;
      if (!mask.bits[start] || label[start]) continue;
      const int id = static_cast<int>(sizes.size());
      sizes.push_back(0);
      label[start] = id;
      stack.assign(1, static_cast<int>(start));
      while (!stack.empty()) {
        const int at = stack.back();
        stack.pop_back();
        ++sizes[static_cast<std::size_t>(id)];
        const int x = at % mask.width, y = at / mask.width;
        const int next[4][2] = {{x - 1, y}, {x + 1, y}, {x, y - 1}, {x, y + 1}};
        for (const auto& n : next) {
          if (n[0] < 0 || n[1] < 0 || n[0] >= mask.width || n[1] >= mask.height) continue;
          const std::size_t i = static_cast<std::size_t>(n[1]) * mask.width + n[0];
          if (mask.bits[i] && !label[i]) {
            label[i] = id;
            stack.push_back(static_cast<int>(i));
          }
        }
      }
    }
  int best = 0;
  for (std::size_t i = 1; i < sizes.size(); ++i)
    if (sizes[i] > sizes[static_cast<std::size_t>(best)]) best = static_cast<int>(i);
  Mask out = mask;
  for (std::size_t i = 0; i < out.bits.size(); ++i) out.bits[i] = (best != 0 && label[i] == best) ? 1 : 0;
  return out;
}

MaskStats maskStats(const Mask& mask) {
  MaskStats s;
  s.minX = mask.width;
  s.minY = mask.height;
  double sx = 0, sy = 0;
  for (int y = 0; y < mask.height; ++y)
    for (int x = 0; x < mask.width; ++x)
      if (mask.at(x, y)) {
        ++s.area;
        s.minX = std::min(s.minX, x);
        s.minY = std::min(s.minY, y);
        s.maxX = std::max(s.maxX, x);
        s.maxY = std::max(s.maxY, y);
        sx += x;
        sy += y;
      }
  if (s.area == 0) {
    s.minX = s.minY = 0;
    return s;
  }
  s.centroidX = sx / static_cast<double>(s.area);
  s.centroidY = sy / static_cast<double>(s.area);
  return s;
}

double maskIoU(const Mask& a, const Mask& b) {
  const int w = std::min(a.width, b.width), h = std::min(a.height, b.height);
  long long inter = 0, uni = 0;
  for (int y = 0; y < h; ++y)
    for (int x = 0; x < w; ++x) {
      const bool pa = a.at(x, y), pb = b.at(x, y);
      inter += (pa && pb);
      uni += (pa || pb);
    }
  return uni == 0 ? 0.0 : static_cast<double>(inter) / static_cast<double>(uni);
}

namespace {

std::vector<std::pair<int, int>> boundaryPixels(const Mask& m) {
  std::vector<std::pair<int, int>> out;
  for (int y = 0; y < m.height; ++y)
    for (int x = 0; x < m.width; ++x)
      if (m.at(x, y) && (!m.at(x - 1, y) || !m.at(x + 1, y) || !m.at(x, y - 1) || !m.at(x, y + 1))) out.emplace_back(x, y);
  return out;
}

// Chamfer 3-4 distance (in pixels) from every pixel to the nearest boundary pixel of `m`.
std::vector<float> distanceToBoundary(const Mask& m) {
  constexpr float kInf = std::numeric_limits<float>::max() / 4;
  std::vector<float> d(static_cast<std::size_t>(m.width) * m.height, kInf);
  for (const auto& [x, y] : boundaryPixels(m)) d[static_cast<std::size_t>(y) * m.width + x] = 0;
  const auto idx = [&](int x, int y) { return static_cast<std::size_t>(y) * m.width + x; };
  for (int y = 0; y < m.height; ++y)
    for (int x = 0; x < m.width; ++x) {
      float v = d[idx(x, y)];
      if (x > 0) v = std::min(v, d[idx(x - 1, y)] + 3.f);
      if (y > 0) {
        v = std::min(v, d[idx(x, y - 1)] + 3.f);
        if (x > 0) v = std::min(v, d[idx(x - 1, y - 1)] + 4.f);
        if (x + 1 < m.width) v = std::min(v, d[idx(x + 1, y - 1)] + 4.f);
      }
      d[idx(x, y)] = v;
    }
  for (int y = m.height - 1; y >= 0; --y)
    for (int x = m.width - 1; x >= 0; --x) {
      float v = d[idx(x, y)];
      if (x + 1 < m.width) v = std::min(v, d[idx(x + 1, y)] + 3.f);
      if (y + 1 < m.height) {
        v = std::min(v, d[idx(x, y + 1)] + 3.f);
        if (x + 1 < m.width) v = std::min(v, d[idx(x + 1, y + 1)] + 4.f);
        if (x > 0) v = std::min(v, d[idx(x - 1, y + 1)] + 4.f);
      }
      d[idx(x, y)] = v;
    }
  for (float& v : d) v /= 3.f;
  return d;
}

}  // namespace

BoundaryDistance boundaryDistance(const Mask& a, const Mask& b) {
  BoundaryDistance out;
  const auto ba = boundaryPixels(a), bb = boundaryPixels(b);
  if (ba.empty() || bb.empty() || a.width != b.width || a.height != b.height) return out;
  const std::vector<float> da = distanceToBoundary(a), db = distanceToBoundary(b);
  std::vector<double> samples;
  samples.reserve(ba.size() + bb.size());
  for (const auto& [x, y] : ba) samples.push_back(db[static_cast<std::size_t>(y) * b.width + x]);
  for (const auto& [x, y] : bb) samples.push_back(da[static_cast<std::size_t>(y) * a.width + x]);
  std::sort(samples.begin(), samples.end());
  double sum = 0;
  for (double v : samples) sum += v;
  out.samples = static_cast<long long>(samples.size());
  out.meanPx = sum / static_cast<double>(samples.size());
  out.p95Px = samples[static_cast<std::size_t>(0.95 * static_cast<double>(samples.size() - 1))];
  out.maxPx = samples.back();
  return out;
}

double meanAbsDifference(const QImage& imageA, const QImage& imageB, const Mask* region) {
  const QImage a = rgb(imageA), b = rgb(imageB);
  const int w = std::min(a.width(), b.width()), h = std::min(a.height(), b.height());
  double sum = 0;
  long long count = 0;
  for (int y = 0; y < h; ++y) {
    const QRgb* ra = reinterpret_cast<const QRgb*>(a.constScanLine(y));
    const QRgb* rb = reinterpret_cast<const QRgb*>(b.constScanLine(y));
    for (int x = 0; x < w; ++x) {
      if (region && !region->at(x, y)) continue;
      sum += std::abs(qRed(ra[x]) - qRed(rb[x])) + std::abs(qGreen(ra[x]) - qGreen(rb[x])) + std::abs(qBlue(ra[x]) - qBlue(rb[x]));
      ++count;
    }
  }
  return count == 0 ? 0.0 : sum / (3.0 * 255.0 * static_cast<double>(count));
}

double ssim(const QImage& imageA, const QImage& imageB, const Mask* region) {
  const QImage a = rgb(imageA), b = rgb(imageB);
  const int w = std::min(a.width(), b.width()), h = std::min(a.height(), b.height());
  constexpr int kWin = 8, kStride = 4;
  constexpr double c1 = (0.01 * 255) * (0.01 * 255), c2 = (0.03 * 255) * (0.03 * 255);
  double total = 0;
  long long windows = 0;
  for (int y0 = 0; y0 + kWin <= h; y0 += kStride)
    for (int x0 = 0; x0 + kWin <= w; x0 += kStride) {
      if (region) {
        int inside = 0;
        for (int y = y0; y < y0 + kWin; ++y)
          for (int x = x0; x < x0 + kWin; ++x) inside += region->at(x, y);
        if (inside * 2 < kWin * kWin) continue;
      }
      double sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (int y = y0; y < y0 + kWin; ++y) {
        const QRgb* ra = reinterpret_cast<const QRgb*>(a.constScanLine(y));
        const QRgb* rb = reinterpret_cast<const QRgb*>(b.constScanLine(y));
        for (int x = x0; x < x0 + kWin; ++x) {
          const double la = lumaAt(ra[x]), lb = lumaAt(rb[x]);
          sa += la;
          sb += lb;
          saa += la * la;
          sbb += lb * lb;
          sab += la * lb;
        }
      }
      constexpr double n = kWin * kWin;
      const double ma = sa / n, mb = sb / n;
      const double va = saa / n - ma * ma, vb = sbb / n - mb * mb, cov = sab / n - ma * mb;
      total += ((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2));
      ++windows;
    }
  return windows == 0 ? 0.0 : total / static_cast<double>(windows);
}

QImage diffImage(const QImage& imageA, const QImage& imageB) {
  const QImage a = rgb(imageA), b = rgb(imageB);
  const int w = std::min(a.width(), b.width()), h = std::min(a.height(), b.height());
  QImage out(w, h, QImage::Format_RGB32);
  for (int y = 0; y < h; ++y) {
    const QRgb* ra = reinterpret_cast<const QRgb*>(a.constScanLine(y));
    const QRgb* rb = reinterpret_cast<const QRgb*>(b.constScanLine(y));
    QRgb* ro = reinterpret_cast<QRgb*>(out.scanLine(y));
    for (int x = 0; x < w; ++x) ro[x] = qRgb(std::min(255, maxChannelDifference(ra[x], rb[x]) * 4), 0, 0);
  }
  return out;
}

QImage sideBySide(const QImage& a, const QImage& b, const QImage& diff) {
  constexpr int gap = 4;
  const int h = std::max({a.height(), b.height(), diff.height()});
  QImage out(a.width() + b.width() + diff.width() + 2 * gap, h, QImage::Format_RGB32);
  out.fill(qRgb(255, 0, 255));
  QPainter p(&out);
  p.drawImage(0, 0, a);
  p.drawImage(a.width() + gap, 0, b);
  p.drawImage(a.width() + b.width() + 2 * gap, 0, diff);
  return out;
}

namespace {

QJsonObject statsJson(const MaskStats& s) {
  return QJsonObject{{"areaPx", static_cast<double>(s.area)}, {"minX", s.minX}, {"minY", s.minY}, {"maxX", s.maxX}, {"maxY", s.maxY},
                     {"centroidX", s.centroidX}, {"centroidY", s.centroidY}};
}

}  // namespace

QJsonObject compareFrames(const FrameSet& f, int maskThreshold, QImage* sideBySideOut, QImage* diffOut, int openingRadius) {
  const Mask ref = largestRegion(openMask(changedMask(f.referenceEmpty, f.referenceWithPart, maskThreshold), openingRadius));
  const Mask nat = largestRegion(openMask(changedMask(f.nativeEmpty, f.nativeWithPart, maskThreshold), openingRadius));
  const MaskStats rs = maskStats(ref), ns = maskStats(nat);
  Mask both;
  both.width = std::min(ref.width, nat.width);
  both.height = std::min(ref.height, nat.height);
  both.bits.assign(static_cast<std::size_t>(both.width) * both.height, 0);
  Mask either = both;
  for (int y = 0; y < both.height; ++y)
    for (int x = 0; x < both.width; ++x) {
      const std::size_t i = static_cast<std::size_t>(y) * both.width + x;
      both.bits[i] = ref.at(x, y) && nat.at(x, y);
      either.bits[i] = ref.at(x, y) || nat.at(x, y);
    }

  QJsonObject out;
  out["width"] = f.referenceWithPart.width();
  out["height"] = f.referenceWithPart.height();
  out["nativeWidth"] = f.nativeWithPart.width();
  out["nativeHeight"] = f.nativeWithPart.height();
  out["maskThreshold"] = maskThreshold;
  out["maskOpeningRadius"] = openingRadius;
  out["reference"] = statsJson(rs);
  out["native"] = statsJson(ns);
  out["areaRatioNativeOverReference"] = rs.area ? static_cast<double>(ns.area) / static_cast<double>(rs.area) : 0.0;
  out["maskIoU"] = maskIoU(ref, nat);
  out["centroidOffsetPx"] = std::hypot(ns.centroidX - rs.centroidX, ns.centroidY - rs.centroidY);
  const BoundaryDistance bd = boundaryDistance(ref, nat);
  out["boundaryDistanceMeanPx"] = bd.meanPx;
  out["boundaryDistanceP95Px"] = bd.p95Px;
  out["boundaryDistanceMaxPx"] = bd.maxPx;
  out["meanAbsDifferenceFrame"] = meanAbsDifference(f.referenceWithPart, f.nativeWithPart);
  out["meanAbsDifferenceBackground"] = meanAbsDifference(f.referenceEmpty, f.nativeEmpty);
  out["meanAbsDifferencePartRegion"] = meanAbsDifference(f.referenceWithPart, f.nativeWithPart, &both);
  out["ssimFrame"] = ssim(f.referenceWithPart, f.nativeWithPart);
  out["ssimPartRegion"] = ssim(f.referenceWithPart, f.nativeWithPart, &either);
  const QImage diff = diffImage(f.referenceWithPart, f.nativeWithPart);
  if (diffOut) *diffOut = diff;
  if (sideBySideOut) *sideBySideOut = sideBySide(f.referenceWithPart, f.nativeWithPart, diff);
  return out;
}

}  // namespace craft::tools
