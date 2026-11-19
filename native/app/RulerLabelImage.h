#pragma once

// The image of one ground-plane ruler label: white text on transparent, tinted by the material (the reference's
// rulerLabelTexture.ts draws "600 32px" text with 4 px of padding into a canvas and tints the sprite). Qt Quick 3D loads
// textures from files (it does not take image:// provider URLs), so each label is written once to a small PNG in the cache
// directory and referenced by file URL. Text metrics come from the platform font, so the label's aspect ratio differs a little
// from the browser's.

#include <QImage>
#include <QString>

namespace craft::app {

/// White text on a transparent background, 32 px high plus 4 px of padding on every side.
QImage rulerLabelImage(const QString& text);
/// Width over height of that image.
double rulerLabelAspect(const QString& text);
/// The file URL of the label's PNG, written on first use (empty when it cannot be written).
QString rulerLabelFileUrl(const QString& text);

}  // namespace craft::app
