#include "RulerLabelImage.h"

#include <QCryptographicHash>
#include <QDir>
#include <QFont>
#include <QFontMetricsF>
#include <QGuiApplication>
#include <QHash>
#include <QMutex>
#include <QPainter>
#include <QSaveFile>
#include <QStandardPaths>
#include <QUrl>

#include <algorithm>
#include <cmath>

namespace craft::app {

namespace {
constexpr int kFontPixels = 32;  // rulerLabelTexture.ts: fontSize 32, padding 4
constexpr int kPadding = 4;

QFont labelFont() {
  QFont font = QGuiApplication::font();
  font.setPixelSize(kFontPixels);
  font.setWeight(QFont::DemiBold);  // the reference asks for weight 600
  return font;
}
}  // namespace

QImage rulerLabelImage(const QString& text) {
  const QFont font = labelFont();
  const int textWidth = std::max(1, static_cast<int>(std::ceil(QFontMetricsF(font).horizontalAdvance(text))));
  const int width = textWidth + 2 * kPadding, height = kFontPixels + 2 * kPadding;
  QImage image(width, height, QImage::Format_ARGB32);
  image.fill(Qt::transparent);
  {
    QPainter painter(&image);
    painter.setRenderHint(QPainter::TextAntialiasing, true);
    painter.setFont(font);
    painter.setPen(Qt::white);
    painter.drawText(QRect(0, 0, width, height), Qt::AlignCenter, text);
  }
  return image;
}

double rulerLabelAspect(const QString& text) {
  const QFontMetricsF metrics(labelFont());
  const int textWidth = std::max(1, static_cast<int>(std::ceil(metrics.horizontalAdvance(text))));
  return static_cast<double>(textWidth + 2 * kPadding) / (kFontPixels + 2 * kPadding);
}

QString rulerLabelFileUrl(const QString& text) {
  static QMutex mutex;
  static QHash<QString, QString> written;   // text -> file URL, for this process
  QMutexLocker lock(&mutex);
  if (const auto it = written.constFind(text); it != written.constEnd()) return it.value();

  const QString directory = QStandardPaths::writableLocation(QStandardPaths::CacheLocation) + QStringLiteral("/ruler-labels");
  if (!QDir().mkpath(directory)) return {};
  // The font decides the image, so the name carries the font and the text: another font never reuses an old file.
  const QString key = QGuiApplication::font().family() + QLatin1Char('|') + text;
  const QString name = QString::fromLatin1(QCryptographicHash::hash(key.toUtf8(), QCryptographicHash::Sha1).toHex().left(16)) + QStringLiteral(".png");
  const QString path = directory + QLatin1Char('/') + name;
  QSaveFile file(path);
  if (!file.open(QIODevice::WriteOnly) || !rulerLabelImage(text).save(&file, "PNG") || !file.commit()) return {};
  const QString url = QUrl::fromLocalFile(path).toString();
  written.insert(text, url);
  return url;
}

}  // namespace craft::app
