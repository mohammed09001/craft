#pragma once

// Generation readiness: turns the Python engine's Chapter 9 hand-off report (or
// just its contract) into the readiness snapshot the UI shows -- available and
// missing inputs, blockers, warnings, reason codes, `canGenerate`.
// Port of mold-generation/generationReadiness.adapter.ts and
// generationReadiness.contracts.ts (the Python side is
// models/generation_readiness.py, whose `to_dict()` is the input). Qt-free.
//
// The input is untrusted JSON from another process, so every guard of the
// reference (`isChapter9GenerationReport` and friends) is reproduced exactly:
// anything that fails them yields the "unavailable" snapshot rather than a
// partial result. Note the reference's rule that a required input without a
// selected parting strategy blocks generation: the Python engine currently
// never selects one, so real reports come out "blocked" (manual review).

#include <string>

#include "reports/ReportJson.h"

namespace craft {

/// The snapshot as JSON (camelCase keys exactly as the reference object). `nowIso` replaces `new Date().toISOString()`.
ReportJson buildGenerationReadinessSnapshot(const ReportJson& input, const std::string& nowIso);

/// createUnavailableGenerationReadinessSnapshot.
ReportJson unavailableGenerationReadinessSnapshot(const std::string& nowIso);

}  // namespace craft
