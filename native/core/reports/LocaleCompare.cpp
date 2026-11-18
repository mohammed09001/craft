#include "reports/LocaleCompare.h"

#include <cstdint>
#include <vector>

namespace craft {

namespace {

struct Key {
  int primary = 0;
  int accent = 0;     // 0 unaccented, otherwise a stable accent id
  bool upper = false;
};

std::vector<std::uint32_t> decodeUtf8(const std::string& text) {
  std::vector<std::uint32_t> out;
  for (std::size_t i = 0; i < text.size();) {
    const unsigned char c = static_cast<unsigned char>(text[i]);
    std::uint32_t cp = c;
    int extra = 0;
    if (c >= 0xF0) { cp = c & 0x07; extra = 3; }
    else if (c >= 0xE0) { cp = c & 0x0F; extra = 2; }
    else if (c >= 0xC0) { cp = c & 0x1F; extra = 1; }
    ++i;
    for (int k = 0; k < extra && i < text.size(); ++k, ++i) cp = (cp << 6) | (static_cast<unsigned char>(text[i]) & 0x3F);
    out.push_back(cp);
  }
  return out;
}

int asciiPrimary(std::uint32_t c) {
  static const std::string punctuation = "_-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$";
  if (c >= '0' && c <= '9') return 100 + static_cast<int>(c - '0');
  if (c >= 'a' && c <= 'z') return 200 + static_cast<int>(c - 'a');
  if (c >= 'A' && c <= 'Z') return 200 + static_cast<int>(c - 'A');
  const std::size_t i = punctuation.find(static_cast<char>(c));
  return i == std::string::npos ? 50 : static_cast<int>(i);
}

/// Latin-1 letters with a diacritic: base letter and an accent id (the cp itself, which only needs to be stable).
bool latin1Base(std::uint32_t cp, char& base, bool& upper) {
  struct Range { std::uint32_t first, last; char base; bool upper; };
  static const Range ranges[] = {
      {0xC0, 0xC5, 'a', true},  {0xC7, 0xC7, 'c', true},  {0xC8, 0xCB, 'e', true},  {0xCC, 0xCF, 'i', true},  {0xD1, 0xD1, 'n', true},
      {0xD2, 0xD6, 'o', true},  {0xD8, 0xD8, 'o', true},  {0xD9, 0xDC, 'u', true},  {0xDD, 0xDD, 'y', true},  {0xE0, 0xE5, 'a', false},
      {0xE7, 0xE7, 'c', false}, {0xE8, 0xEB, 'e', false}, {0xEC, 0xEF, 'i', false}, {0xF1, 0xF1, 'n', false}, {0xF2, 0xF6, 'o', false},
      {0xF8, 0xF8, 'o', false}, {0xF9, 0xFC, 'u', false}, {0xFD, 0xFD, 'y', false}, {0xFF, 0xFF, 'y', false}};
  for (const Range& r : ranges)
    if (cp >= r.first && cp <= r.last) { base = r.base; upper = r.upper; return true; }
  return false;
}

Key keyOf(std::uint32_t cp) {
  Key key;
  if (cp < 0x80) {
    key.primary = asciiPrimary(cp);
    key.upper = cp >= 'A' && cp <= 'Z';
    return key;
  }
  char base = 0;
  bool upper = false;
  if (latin1Base(cp, base, upper)) {
    key.primary = asciiPrimary(static_cast<std::uint32_t>(base));
    key.accent = static_cast<int>(cp);
    key.upper = upper;
    return key;
  }
  key.primary = 1000 + static_cast<int>(cp);
  return key;
}

}  // namespace

int localeCompare(const std::string& a, const std::string& b) {
  const std::vector<std::uint32_t> ua = decodeUtf8(a), ub = decodeUtf8(b);
  std::vector<Key> ka, kb;
  for (auto cp : ua) ka.push_back(keyOf(cp));
  for (auto cp : ub) kb.push_back(keyOf(cp));
  const std::size_t n = std::min(ka.size(), kb.size());
  for (std::size_t i = 0; i < n; ++i)
    if (ka[i].primary != kb[i].primary) return ka[i].primary < kb[i].primary ? -1 : 1;
  if (ka.size() != kb.size()) return ka.size() < kb.size() ? -1 : 1;
  for (std::size_t i = 0; i < n; ++i)
    if (ka[i].accent != kb[i].accent) return ka[i].accent < kb[i].accent ? -1 : 1;  // unaccented (0) first
  for (std::size_t i = 0; i < n; ++i)
    if (ka[i].upper != kb[i].upper) return ka[i].upper ? 1 : -1;  // lowercase first
  return 0;
}

}  // namespace craft