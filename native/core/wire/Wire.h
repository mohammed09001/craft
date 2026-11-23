#pragma once

// The binary archive shared by the job wire formats (P0-5, docs/native-migration/PROCESS_ISOLATION_DESIGN.md).
//
// A job request or result crosses to or from the geometry worker process as bytes. Each type is described once, by a `visit(archive, value)`
// function that names its fields in order; a Writer and a Reader drive the same function, so a field cannot be written and forgotten when read.
// A Reader refuses truncated data and lengths that exceed the data (WireError) instead of allocating what a corrupt length asks for.
// The format is only ever read by the build that wrote it, so it is not versioned.

#include <array>
#include <cstdint>
#include <cstring>
#include <map>
#include <memory>
#include <optional>
#include <span>
#include <stdexcept>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>

#include "contracts/Geometry.h"

namespace craft {

struct WireError : std::runtime_error {
  using std::runtime_error::runtime_error;
};

namespace wire {

class Writer {
 public:
  static constexpr bool kReading = false;
  void raw(const void* data, std::size_t n) {
    const auto* p = static_cast<const std::uint8_t*>(data);
    bytes.insert(bytes.end(), p, p + n);
  }
  std::size_t remaining() const { return ~std::size_t{0}; }
  std::vector<std::uint8_t> bytes;
};

class Reader {
 public:
  static constexpr bool kReading = true;
  explicit Reader(std::span<const std::uint8_t> data) : p_(data.data()), left_(data.size()) {}
  void raw(void* out, std::size_t n) {
    if (n > left_) throw WireError("The data is truncated.");
    if (n) std::memcpy(out, p_, n);
    p_ += n;
    left_ -= n;
  }
  std::size_t remaining() const { return left_; }

 private:
  const std::uint8_t* p_;
  std::size_t left_;
};

// --- the generic pieces ------------------------------------------------------------------------------------------------------------------

template <class A, class T>
  requires std::is_arithmetic_v<T>
void io(A& a, T& v) {
  a.raw(&v, sizeof(T));
}

template <class A, class T>
  requires std::is_enum_v<T>
void io(A& a, T& v) {
  auto n = static_cast<std::int32_t>(v);
  io(a, n);
  v = static_cast<T>(n);
}

template <class A>
void io(A& a, std::string& s) {
  std::uint64_t n = s.size();
  io(a, n);
  if constexpr (A::kReading) {
    if (n > a.remaining()) throw WireError("A string is longer than the data.");
    s.resize(static_cast<std::size_t>(n));
  }
  a.raw(s.data(), s.size());
}

template <class A, class T>
void io(A& a, std::vector<T>& v) {
  static_assert(!std::is_same_v<T, bool>, "vector<bool> is not supported");
  std::uint64_t n = v.size();
  io(a, n);
  if constexpr (A::kReading) {
    // Every element takes at least one byte on the wire, so a count beyond the remaining data is corrupt: refuse it before allocating.
    if (n > a.remaining()) throw WireError("A list is longer than the data.");
    if constexpr (std::is_arithmetic_v<T>) {
      if (n * sizeof(T) > a.remaining()) throw WireError("A list is longer than the data.");
    }
    v.resize(static_cast<std::size_t>(n));
  }
  if constexpr (std::is_arithmetic_v<T>) {
    a.raw(v.data(), v.size() * sizeof(T));
  } else {
    for (T& e : v) io(a, e);
  }
}

template <class A, class T>
void io(A& a, std::optional<T>& v) {
  bool has = v.has_value();
  io(a, has);
  if constexpr (A::kReading) {
    if (has) {
      v.emplace();
      io(a, *v);
    } else {
      v.reset();
    }
  } else {
    if (has) io(a, *v);
  }
}

template <class A, class T, std::size_t N>
void io(A& a, std::array<T, N>& v) {
  for (T& e : v) io(a, e);
}

/// A map with string keys (the sprue cache). Entries are written in key order.
template <class A, class V>
void io(A& a, std::map<std::string, V>& m) {
  std::uint64_t n = m.size();
  io(a, n);
  if constexpr (A::kReading) {
    if (n > a.remaining()) throw WireError("A map is longer than the data.");
    m.clear();
    for (std::uint64_t i = 0; i < n; ++i) {
      std::string key;
      io(a, key);
      V value;
      io(a, value);
      m.emplace(std::move(key), std::move(value));
    }
  } else {
    for (auto& entry : m) {
      std::string key = entry.first;
      io(a, key);
      io(a, entry.second);
    }
  }
}

/// A shared, read-only value (the grounded part of a mold request): written as a flag and the value, read into a new object.
template <class A, class T>
void io(A& a, std::shared_ptr<const T>& p) {
  bool has = static_cast<bool>(p);
  io(a, has);
  if constexpr (A::kReading) {
    if (has) {
      auto value = std::make_shared<T>();
      io(a, *value);
      p = std::move(value);
    } else {
      p.reset();
    }
  } else {
    if (has) io(a, const_cast<T&>(*p));   // the writer only reads
  }
}

// Structs: one `visit` each, found by argument-dependent lookup (the archive classes live in this namespace).
template <class A, class T>
  requires std::is_class_v<T> && (!std::is_same_v<T, std::string>)
void io(A& a, T& v);

// --- geometry shared by every job ---------------------------------------------------------------------------------------------------------

template <class A> void visit(A& a, Point3& v) { io(a, v.x); io(a, v.y); io(a, v.z); }
template <class A> void visit(A& a, Bounds3& v) { io(a, v.min); io(a, v.max); }
template <class A> void visit(A& a, MeshFaceRun& v) { io(a, v.startTriangle); io(a, v.triangleCount); io(a, v.role); }
template <class A> void visit(A& a, MeshPayload& v) { io(a, v.positions); io(a, v.indices); io(a, v.faceRuns); }
template <class A> void visit(A& a, TriangleSoup& v) { io(a, v.positions); }

template <class A, class T>
  requires std::is_class_v<T> && (!std::is_same_v<T, std::string>)
void io(A& a, T& v) {
  visit(a, v);
}

// --- framing ---------------------------------------------------------------------------------------------------------------------------

inline constexpr char kMagic[4] = {'C', 'M', 'W', '1'};

template <class T>
std::vector<std::uint8_t> encode(std::uint8_t kind, const T& value) {
  Writer w;
  w.raw(kMagic, sizeof kMagic);
  w.raw(&kind, 1);
  io(w, const_cast<T&>(value));   // the writer only reads
  return std::move(w.bytes);
}

template <class T>
T decode(std::uint8_t kind, std::span<const std::uint8_t> bytes) {
  Reader r(bytes);
  char magic[4];
  std::uint8_t got = 0;
  r.raw(magic, sizeof magic);
  r.raw(&got, 1);
  if (std::memcmp(magic, kMagic, sizeof kMagic) != 0) throw WireError("This is not Craft job data.");
  if (got != kind) throw WireError("The job data is of the wrong kind.");
  T value;
  io(r, value);
  if (r.remaining() != 0) throw WireError("The job data has trailing bytes.");
  return value;
}

}  // namespace wire
}  // namespace craft
