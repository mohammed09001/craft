#include "master/JsFormat.h"

#include <cmath>
#include <cstdio>

namespace craft {

std::string jsToFixed(double value, int digits) {
  if (!std::isfinite(value)) return std::isnan(value) ? "NaN" : (value < 0 ? "-Infinity" : "Infinity");
  const bool negative = value < 0;
  const double x = std::fabs(value);
  // Exact decimal expansion, then round half up on the digit string (ECMAScript picks the larger n on a tie).
  char buf[512];
  std::snprintf(buf, sizeof buf, "%.80f", x);
  std::string s = buf;
  const std::size_t dot = s.find('.');
  std::string intPart = s.substr(0, dot), frac = s.substr(dot + 1);
  const bool roundUp = static_cast<int>(frac.size()) > digits && frac[static_cast<std::size_t>(digits)] >= '5';
  std::string digitsText = intPart + frac.substr(0, static_cast<std::size_t>(digits));
  if (roundUp) {
    int i = static_cast<int>(digitsText.size()) - 1;
    while (i >= 0) {
      if (digitsText[static_cast<std::size_t>(i)] == '9') { digitsText[static_cast<std::size_t>(i)] = '0'; --i; }
      else { ++digitsText[static_cast<std::size_t>(i)]; break; }
    }
    if (i < 0) digitsText.insert(digitsText.begin(), '1');
  }
  const std::size_t intLen = digitsText.size() - static_cast<std::size_t>(digits);
  std::string out = digitsText.substr(0, intLen);
  if (digits > 0) out += "." + digitsText.substr(intLen);
  return (negative ? "-" : "") + out;
}

}  // namespace craft
