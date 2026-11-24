#include "Logging.h"

#include <QDateTime>
#include <QFile>
#include <QFileInfo>
#include <QMutex>
#include <QMutexLocker>

#include <cstdio>

#include "AppPaths.h"

namespace craft::app {

namespace {

constexpr qint64 kMaxLogBytes = 2 * 1024 * 1024;

QMutex& logMutex() {
  static QMutex mutex;
  return mutex;
}
QFile& logFile() {
  static QFile file;
  return file;
}

const char* levelName(QtMsgType type) {
  switch (type) {
    case QtDebugMsg: return "DEBUG";
    case QtInfoMsg: return "INFO";
    case QtWarningMsg: return "WARN";
    case QtCriticalMsg: return "ERROR";
    case QtFatalMsg: return "FATAL";
  }
  return "INFO";
}

void handler(QtMsgType type, const QMessageLogContext& context, const QString& message) {
  const QString line = QStringLiteral("%1 %2 [%3] %4\n")
                           .arg(QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs),
                                QLatin1String(levelName(type)),
                                QLatin1String(context.category ? context.category : "default"),
                                message);
  const QByteArray bytes = line.toUtf8();
  QMutexLocker locker(&logMutex());
  std::fwrite(bytes.constData(), 1, static_cast<std::size_t>(bytes.size()), stderr);
  std::fflush(stderr);
  if (logFile().isOpen()) {
    logFile().write(bytes);
    logFile().flush();
  }
}

}  // namespace

QString installLogging() {
  const QString path = AppPaths::logFilePath();
  // One generation of history: craft.log -> craft.log.1 once it grows large.
  if (QFileInfo(path).size() > kMaxLogBytes) {
    QFile::remove(path + QStringLiteral(".1"));
    QFile::rename(path, path + QStringLiteral(".1"));
  }
  logFile().setFileName(path);
  logFile().open(QIODevice::WriteOnly | QIODevice::Append | QIODevice::Text);
  qInstallMessageHandler(handler);
  return path;
}

}  // namespace craft::app
