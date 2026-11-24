#pragma once

// An optional value held by shared pointer.
//
// The controller keeps large, immutable results (the generated mold, its sprue evaluation, its registration). A history
// snapshot of them must cost a pointer, not a copy of every mesh, so the results are held shared: copying a Held shares
// the value, and the value is only ever replaced as a whole (never modified in place), which keeps every snapshot valid.
// The interface is std::optional's read side, so existing code reads it unchanged.

#include <memory>
#include <optional>
#include <stdexcept>
#include <utility>

namespace craft::app {

template <typename T>
class Held {
 public:
  Held() = default;
  Held(std::nullopt_t) {}

  Held& operator=(T value) {
    value_ = std::make_shared<const T>(std::move(value));
    return *this;
  }
  Held& operator=(std::optional<T> value) {
    if (value) value_ = std::make_shared<const T>(std::move(*value));
    else value_.reset();
    return *this;
  }
  Held& operator=(std::nullopt_t) {
    value_.reset();
    return *this;
  }

  bool has_value() const noexcept { return value_ != nullptr; }
  explicit operator bool() const noexcept { return has_value(); }
  const T& operator*() const { return *value_; }
  const T* operator->() const { return value_.get(); }
  const T& value() const {
    if (!value_) throw std::bad_optional_access();
    return *value_;
  }
  void reset() noexcept { value_.reset(); }

  /// Whether two holders share the very same value (a snapshot and the live state after nothing changed).
  bool sameAs(const Held& other) const noexcept { return value_ == other.value_; }

 private:
  std::shared_ptr<const T> value_;
};

}  // namespace craft::app
