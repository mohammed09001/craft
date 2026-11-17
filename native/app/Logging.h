#pragma once

#include <QString>

namespace craft::app {

/// Installs a Qt message handler that mirrors every log line to stderr and to
/// a size-capped file in the per-user log directory. Returns the file path.
QString installLogging();

}  // namespace craft::app
