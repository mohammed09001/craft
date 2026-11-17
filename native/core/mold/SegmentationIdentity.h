#pragma once

// Deterministic segmentation identities.
// Port of domain/segmentationIdentity.ts: ids are an FNV-1a hash of a
// canonical JSON rendering of a value (keys sorted, undefined omitted), so
// they equal the reference ids when the same fields are supplied.

#include <string>
#include <utility>
#include <vector>

#include "contracts/Geometry.h"

namespace craft {

/// Minimal JSON value, just enough to describe identity payloads.
class Json {
 public:
  enum class Type { Undefined, Null, Bool, Number, String, Array, Object };

  Json() = default;  // undefined (omitted from objects)
  static Json null();
  static Json boolean(bool value);
  static Json number(double value);
  static Json string(std::string value);
  static Json array(std::vector<Json> items);
  /// Entries whose value is undefined are dropped, like JS object spread of undefined.
  static Json object(std::vector<std::pair<std::string, Json>> entries);

  Type type() const { return type_; }
  bool isDefined() const { return type_ != Type::Undefined; }
  double numberValue() const { return number_; }
  bool boolValue() const { return bool_; }
  const std::string& stringValue() const { return string_; }

  friend std::string canonicalize(const Json& value);

 private:
  Type type_ = Type::Undefined;
  bool bool_ = false;
  double number_ = 0;
  std::string string_;
  std::vector<Json> items_;
  std::vector<std::pair<std::string, Json>> entries_;
};

Json jsonPoint(const Point3& p);
Json jsonBounds(const Bounds3& b);

/// Canonical text (JSON.stringify with sorted keys, JavaScript number format).
std::string canonicalize(const Json& value);

/// "<prefix>:<8 hex digits>" over the canonical text.
std::string deterministicSegmentationId(const std::string& prefix, const Json& value);

/// Key order used by the reference's localeCompare for ASCII identifiers:
/// letters compare case-insensitively first, then lowercase sorts before
/// uppercase at the first case difference (ICU root collation behaviour).
bool localeKeyLess(const std::string& left, const std::string& right);

}  // namespace craft
