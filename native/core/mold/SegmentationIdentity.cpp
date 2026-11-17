#include "mold/SegmentationIdentity.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>

#include "geometry/MeshAnalysis.h"
#include "mold/Registration.h"  // jsNumberToString

namespace craft {

Json Json::null() {
  Json j;
  j.type_ = Type::Null;
  return j;
}
Json Json::boolean(bool value) {
  Json j;
  j.type_ = Type::Bool;
  j.bool_ = value;
  return j;
}
Json Json::number(double value) {
  Json j;
  j.type_ = Type::Number;
  j.number_ = value;
  return j;
}
Json Json::string(std::string value) {
  Json j;
  j.type_ = Type::String;
  j.string_ = std::move(value);
  return j;
}
Json Json::array(std::vector<Json> items) {
  Json j;
  j.type_ = Type::Array;
  j.items_ = std::move(items);
  return j;
}
Json Json::object(std::vector<std::pair<std::string, Json>> entries) {
  Json j;
  j.type_ = Type::Object;
  for (auto& entry : entries) {
    if (entry.second.isDefined()) j.entries_.push_back(std::move(entry));
  }
  return j;
}

Json jsonPoint(const Point3& p) {
  return Json::object({{"x", Json::number(p.x)}, {"y", Json::number(p.y)}, {"z", Json::number(p.z)}});
}
Json jsonBounds(const Bounds3& b) {
  return Json::object({{"min", jsonPoint(b.min)}, {"max", jsonPoint(b.max)}});
}

namespace {

std::string quote(const std::string& text) {
  std::string out = "\"";
  for (unsigned char c : text) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\b': out += "\\b"; break;
      case '\f': out += "\\f"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          char buffer[8];
          std::snprintf(buffer, sizeof(buffer), "\\u%04x", c);
          out += buffer;
        } else {
          out += static_cast<char>(c);
        }
    }
  }
  return out + "\"";
}

/// FNV-1a over UTF-16 code units, like the reference's charCodeAt loop.
std::uint32_t hashUtf16(const std::string& text) {
  std::uint32_t hash = kFingerprintSeed;
  const auto mix = [&hash](std::uint32_t unit) { hash = (hash ^ unit) * 16777619u; };
  for (std::size_t i = 0; i < text.size();) {
    const unsigned char c = static_cast<unsigned char>(text[i]);
    std::uint32_t codePoint = c;
    int extra = 0;
    if (c >= 0xF0) { codePoint = c & 0x07; extra = 3; }
    else if (c >= 0xE0) { codePoint = c & 0x0F; extra = 2; }
    else if (c >= 0xC0) { codePoint = c & 0x1F; extra = 1; }
    for (int k = 1; k <= extra && i + k < text.size(); ++k) {
      codePoint = (codePoint << 6) | (static_cast<unsigned char>(text[i + k]) & 0x3F);
    }
    i += static_cast<std::size_t>(extra) + 1;
    if (codePoint >= 0x10000) {
      codePoint -= 0x10000;
      mix(0xD800 + (codePoint >> 10));
      mix(0xDC00 + (codePoint & 0x3FF));
    } else {
      mix(codePoint);
    }
  }
  return hash;
}

}  // namespace

bool localeKeyLess(const std::string& left, const std::string& right) {
  const std::size_t n = std::min(left.size(), right.size());
  for (std::size_t i = 0; i < n; ++i) {
    const int a = std::tolower(static_cast<unsigned char>(left[i]));
    const int b = std::tolower(static_cast<unsigned char>(right[i]));
    if (a != b) return a < b;
  }
  if (left.size() != right.size()) return left.size() < right.size();
  for (std::size_t i = 0; i < n; ++i) {
    if (left[i] != right[i]) return std::islower(static_cast<unsigned char>(left[i])) != 0;
  }
  return false;
}

std::string canonicalize(const Json& value) {
  switch (value.type_) {
    case Json::Type::Undefined: return "";
    case Json::Type::Null: return "null";
    case Json::Type::Bool: return value.bool_ ? "true" : "false";
    case Json::Type::Number: return std::isfinite(value.number_) ? jsNumberToString(value.number_) : "null";
    case Json::Type::String: return quote(value.string_);
    case Json::Type::Array: {
      std::string out = "[";
      for (std::size_t i = 0; i < value.items_.size(); ++i) {
        if (i > 0) out += ",";
        out += canonicalize(value.items_[i]);
      }
      return out + "]";
    }
    case Json::Type::Object: {
      std::vector<const std::pair<std::string, Json>*> entries;
      for (const auto& e : value.entries_) entries.push_back(&e);
      std::stable_sort(entries.begin(), entries.end(),
                       [](const auto* l, const auto* r) { return localeKeyLess(l->first, r->first); });
      std::string out = "{";
      for (std::size_t i = 0; i < entries.size(); ++i) {
        if (i > 0) out += ",";
        out += quote(entries[i]->first) + ":" + canonicalize(entries[i]->second);
      }
      return out + "}";
    }
  }
  return "";
}

std::string deterministicSegmentationId(const std::string& prefix, const Json& value) {
  return prefix + ":" + finishHash(hashUtf16(canonicalize(value)));
}

}  // namespace craft
