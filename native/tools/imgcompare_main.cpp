// craft_imgcompare: compares the Three.js reference frames with the native frames of one scene.
//   craft_imgcompare --ref-empty a.png --ref-part b.png --native-empty c.png --native-part d.png --out metrics.json
//                    [--side-by-side sbs.png] [--diff diff.png] [--threshold 24]
#include <QCommandLineParser>
#include <QCoreApplication>
#include <QFile>
#include <QGuiApplication>
#include <QJsonDocument>

#include "ImageCompare.h"

int main(int argc, char* argv[]) {
  QGuiApplication app(argc, argv);
  QCommandLineParser parser;
  parser.addHelpOption();
  for (const char* name : {"ref-empty", "ref-part", "native-empty", "native-part", "out", "side-by-side", "diff", "threshold", "opening"})
    parser.addOption({name, QString(), "value"});
  parser.process(app);
  craft::tools::FrameSet frames;
  const auto load = [&](const char* option, QImage& into) {
    if (!into.load(parser.value(option))) {
      fprintf(stderr, "cannot read --%s %s\n", option, qPrintable(parser.value(option)));
      return false;
    }
    return true;
  };
  if (!load("ref-empty", frames.referenceEmpty) || !load("ref-part", frames.referenceWithPart) ||
      !load("native-empty", frames.nativeEmpty) || !load("native-part", frames.nativeWithPart))
    return 2;
  QImage sbs, diff;
  const int threshold = parser.isSet("threshold") ? parser.value("threshold").toInt() : 24;
  const QJsonObject result = craft::tools::compareFrames(frames, threshold, &sbs, &diff, parser.isSet("opening") ? parser.value("opening").toInt() : 2);
  if (parser.isSet("side-by-side")) sbs.save(parser.value("side-by-side"));
  if (parser.isSet("diff")) diff.save(parser.value("diff"));
  QFile out(parser.value("out"));
  if (!out.open(QIODevice::WriteOnly)) return 3;
  out.write(QJsonDocument(result).toJson());
  return 0;
}
