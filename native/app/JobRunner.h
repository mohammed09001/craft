#pragma once

// Background job abstraction for heavy work (file parsing, Booleans, export).
//
// A job runs on the global thread pool, never on the UI thread. It receives a
// CancellationToken and a thread-safe progress callback; its outcome is
// delivered back on the owner's thread. Engine failures (craft::CodedError)
// become a Failed outcome with the engine's code; a cancelled token or the
// "cavity_cancelled" code becomes Cancelled.
//
// Stale-result protection is the caller's job by design: every start returns
// a JobTicket, and the completion handler compares its generation with the
// caller's current one before touching any state.

#include <QFutureWatcher>
#include <QMetaObject>
#include <QObject>
#include <QPointer>
#include <QString>
#include <QtConcurrent/QtConcurrentRun>

#include <exception>
#include <functional>
#include <optional>

#include "contracts/Operation.h"

namespace craft::app {

template <typename Result>
struct JobOutcome {
  JobState state = JobState::Failed;
  std::optional<Result> result;
  QString errorCode;
  QString errorMessage;
};

struct JobTicket {
  quint64 generation = 0;
  CancellationToken cancel;
};

/// Runs `work` on a worker thread and calls `done` on `owner`'s thread.
/// `progress` (optional) is also invoked on `owner`'s thread.
template <typename Result>
void runJob(QObject* owner, CancellationToken cancel,
            std::function<Result(const CancellationToken&, const ProgressCallback&)> work,
            std::function<void(JobOutcome<Result>)> done,
            std::function<void(QString, double)> progress = {}) {
  const QPointer<QObject> guard(owner);
  ProgressCallback report = [guard, progress](const std::string& stage, double fraction) {
    if (!progress) return;
    const QString stageName = QString::fromStdString(stage);
    QMetaObject::invokeMethod(
        guard.data(),
        [guard, progress, stageName, fraction] {
          if (guard) progress(stageName, fraction);
        },
        Qt::QueuedConnection);
  };

  auto* watcher = new QFutureWatcher<JobOutcome<Result>>(owner);
  QObject::connect(watcher, &QFutureWatcherBase::finished, owner, [watcher, done] {
    JobOutcome<Result> outcome = watcher->result();
    watcher->deleteLater();
    done(std::move(outcome));
  });

  watcher->setFuture(QtConcurrent::run([cancel, work = std::move(work), report]() {
    JobOutcome<Result> outcome;
    try {
      outcome.result = work(cancel, report);
      outcome.state = cancel.isCancelled() ? JobState::Cancelled : JobState::Succeeded;
    } catch (const CodedError& error) {
      outcome.errorCode = QString::fromStdString(error.code());
      outcome.errorMessage = QString::fromUtf8(error.what());
      outcome.state = (cancel.isCancelled() || error.code() == "cavity_cancelled")
                          ? JobState::Cancelled
                          : JobState::Failed;
    } catch (const std::exception& error) {
      outcome.errorCode = QStringLiteral("internal_error");
      outcome.errorMessage = QString::fromUtf8(error.what());
      outcome.state = JobState::Failed;
    } catch (...) {
      outcome.errorCode = QStringLiteral("internal_error");
      outcome.errorMessage = QStringLiteral("An unknown error occurred.");
      outcome.state = JobState::Failed;
    }
    return outcome;
  }));
}

}  // namespace craft::app
