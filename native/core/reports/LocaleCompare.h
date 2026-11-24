#pragma once

// String.prototype.localeCompare for report ids and display names: an approximation of ICU root collation
// sufficient for Latin text (punctuation < digits < letters; letters compare by base letter first, then accent
// (unaccented first), then case (lowercase first)). Characters outside Latin-1 compare by code point after
// all Latin letters. Pure ASCII input orders exactly like icuLess.

#include <string>

namespace craft {

/// Negative when a sorts before b, positive when after, 0 when equal under this collation.
int localeCompare(const std::string& a, const std::string& b);

}  // namespace craft