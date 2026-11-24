#include "reports/ReportJson.h"

#include <cmath>

#include "master/MasterPlanning.h"  // stableJsonQuote
#include "mold/Registration.h"      // jsNumberToString

namespace craft {

ReportJson ReportJson::boolean(bool value) {
  ReportJson json;
  json.kind_ = Kind::Bool;
  json.bool_ = value;
  return json;
}

ReportJson ReportJson::number(double value) {
  ReportJson json;
  json.kind_ = Kind::Number;
  json.number_ = value;
  return json;
}

ReportJson ReportJson::string(std::string value) {
  ReportJson json;
  json.kind_ = Kind::String;
  json.string_ = std::move(value);
  return json;
}

ReportJson ReportJson::array() {
  ReportJson json;
  json.kind_ = Kind::Array;
  return json;
}

ReportJson ReportJson::object() {
  ReportJson json;
  json.kind_ = Kind::Object;
  return json;
}

ReportJson& ReportJson::push(ReportJson value) {
  items_.push_back(std::move(value));
  return *this;
}

ReportJson& ReportJson::set(const std::string& key, ReportJson value) {
  for (std::size_t i = 0; i < keys_.size(); ++i) {
    if (keys_[i] == key) {
      items_[i] = std::move(value);
      return *this;
    }
  }
  keys_.push_back(key);
  items_.push_back(std::move(value));
  return *this;
}

const ReportJson* ReportJson::find(const std::string& key) const {
  for (std::size_t i = 0; i < keys_.size(); ++i)
    if (keys_[i] == key) return &items_[i];
  return nullptr;
}

std::string ReportJson::toText() const {
  switch (kind_) {
    case Kind::Null: return "null";
    case Kind::Bool: return bool_ ? "true" : "false";
    case Kind::Number: return std::isfinite(number_) ? jsNumberToString(number_) : "null";
    case Kind::String: return stableJsonQuote(string_);
    case Kind::Array: {
      std::string out = "[";
      for (std::size_t i = 0; i < items_.size(); ++i) out += (i ? "," : "") + items_[i].toText();
      return out + "]";
    }
    case Kind::Object: {
      std::string out = "{";
      for (std::size_t i = 0; i < items_.size(); ++i) out += (i ? "," : "") + stableJsonQuote(keys_[i]) + ":" + items_[i].toText();
      return out + "}";
    }
  }
  return "null";
}

}  // namespace craft
