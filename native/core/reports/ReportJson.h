#pragma once

// A small ordered JSON value (null / bool / number / string / array / object) for
// engineering reports. Objects keep insertion order like a JS object literal;
// numbers are doubles (JSON.stringify semantics: non-finite serializes as null).
// Qt-free so the report logic can live in the core.

#include <cstddef>
#include <string>
#include <vector>

namespace craft {

class ReportJson {
 public:
  enum class Kind { Null, Bool, Number, String, Array, Object };

  ReportJson() = default;
  static ReportJson null() { return ReportJson(); }
  static ReportJson boolean(bool value);
  static ReportJson number(double value);
  static ReportJson string(std::string value);
  static ReportJson array();
  static ReportJson object();

  Kind kind() const { return kind_; }
  bool isNull() const { return kind_ == Kind::Null; }
  bool isBool() const { return kind_ == Kind::Bool; }
  bool isNumber() const { return kind_ == Kind::Number; }
  bool isString() const { return kind_ == Kind::String; }
  bool isArray() const { return kind_ == Kind::Array; }
  bool isObject() const { return kind_ == Kind::Object; }

  bool asBool() const { return bool_; }
  double asNumber() const { return number_; }
  const std::string& asString() const { return string_; }

  /// Array/object element count.
  std::size_t size() const { return items_.size(); }
  const ReportJson& at(std::size_t index) const { return items_[index]; }
  const std::string& keyAt(std::size_t index) const { return keys_[index]; }

  /// Appends to an array.
  ReportJson& push(ReportJson value);
  /// Sets an object member (replaces an existing key in place, else appends).
  ReportJson& set(const std::string& key, ReportJson value);
  /// Object member or nullptr.
  const ReportJson* find(const std::string& key) const;

  /// JSON text with JS number formatting (and null for non-finite numbers).
  std::string toText() const;

 private:
  Kind kind_ = Kind::Null;
  bool bool_ = false;
  double number_ = 0;
  std::string string_;
  std::vector<std::string> keys_;
  std::vector<ReportJson> items_;
};

}  // namespace craft
