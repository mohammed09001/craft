#pragma once

#include <string>

namespace craft {

/// JavaScript Number.prototype.toFixed (exact decimal expansion, ties round up like ECMAScript). Used by the reports so their text matches the reference.
std::string jsToFixed(double value, int digits);

}  // namespace craft
