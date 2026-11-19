#include "stl/Stl.h"

#include <algorithm>
#include <cctype>
#include <charconv>
#include <cmath>
#include <cstring>
#include <fstream>
#include <string_view>
#include <vector>

#include "contracts/Operation.h"

namespace craft::stl {

namespace {

constexpr std::size_t kBinaryHeaderBytes = 84;
constexpr std::size_t kBinaryFacetBytes = 50;

[[noreturn]] void parseFailure() {
  throw CodedError("stl_parse_failed", "The STL file could not be parsed.");
}

std::uint32_t readUint32(const std::uint8_t* data) {
  return static_cast<std::uint32_t>(data[0]) | static_cast<std::uint32_t>(data[1]) << 8 |
         static_cast<std::uint32_t>(data[2]) << 16 | static_cast<std::uint32_t>(data[3]) << 24;
}

float readFloat(const std::uint8_t* data) {
  const std::uint32_t bits = readUint32(data);
  float value = 0;
  std::memcpy(&value, &bits, sizeof(value));
  return value;
}

bool startsWithSolid(std::span<const std::uint8_t> bytes) {
  // three.js accepts "solid" at any of the first five offsets.
  for (std::size_t offset = 0; offset < 5; ++offset) {
    if (bytes.size() >= offset + 5 && std::memcmp(bytes.data() + offset, "solid", 5) == 0) {
      return true;
    }
  }
  return false;
}

bool isBinary(std::span<const std::uint8_t> bytes) {
  if (bytes.size() >= kBinaryHeaderBytes) {
    const std::uint64_t facets = readUint32(bytes.data() + 80);
    if (kBinaryHeaderBytes + facets * kBinaryFacetBytes == bytes.size()) return true;
  }
  return !startsWithSolid(bytes);
}

ReadResult parseBinary(std::span<const std::uint8_t> bytes) {
  if (bytes.size() < kBinaryHeaderBytes) parseFailure();
  const std::uint64_t facets = readUint32(bytes.data() + 80);
  if (kBinaryHeaderBytes + facets * kBinaryFacetBytes > bytes.size()) parseFailure();

  ReadResult result;
  result.encoding = Encoding::Binary;
  result.facetCount = static_cast<std::size_t>(facets);
  result.soup.positions.resize(result.facetCount * 9);
  const std::uint8_t* facet = bytes.data() + kBinaryHeaderBytes;
  float* out = result.soup.positions.data();
  for (std::size_t i = 0; i < result.facetCount; ++i, facet += kBinaryFacetBytes) {
    // Bytes 0..11 hold the stored normal; shading normals are recomputed from
    // winding, so only the three vertices are kept.
    for (int value = 0; value < 9; ++value) *out++ = readFloat(facet + 12 + value * 4);
  }
  return result;
}

class Tokenizer {
 public:
  explicit Tokenizer(std::string_view text) : text_(text) {}

  bool next(std::string_view& token) {
    while (position_ < text_.size() && std::isspace(static_cast<unsigned char>(text_[position_]))) {
      ++position_;
    }
    if (position_ >= text_.size()) return false;
    const std::size_t start = position_;
    while (position_ < text_.size() && !std::isspace(static_cast<unsigned char>(text_[position_]))) {
      ++position_;
    }
    token = text_.substr(start, position_ - start);
    return true;
  }

 private:
  std::string_view text_;
  std::size_t position_ = 0;
};

float parseNumber(std::string_view token) {
  if (!token.empty() && token.front() == '+') token.remove_prefix(1);
  float value = 0;
  const auto [end, error] = std::from_chars(token.data(), token.data() + token.size(), value);
  if (error == std::errc::result_out_of_range) {
    // Overflow is a non-finite coordinate, reported by geometry validation.
    return std::numeric_limits<float>::infinity();
  }
  if (error != std::errc() || end != token.data() + token.size()) parseFailure();
  return value;
}

ReadResult parseAscii(std::span<const std::uint8_t> bytes) {
  Tokenizer tokens(std::string_view(reinterpret_cast<const char*>(bytes.data()), bytes.size()));
  ReadResult result;
  result.encoding = Encoding::Ascii;

  std::string_view token;
  bool inFacet = false;
  int facetVertices = 0;
  while (tokens.next(token)) {
    if (token == "facet") {
      if (inFacet) parseFailure();
      inFacet = true;
      facetVertices = 0;
    } else if (token == "vertex") {
      if (!inFacet || facetVertices >= 3) parseFailure();
      for (int axis = 0; axis < 3; ++axis) {
        std::string_view number;
        if (!tokens.next(number)) parseFailure();
        result.soup.positions.push_back(parseNumber(number));
      }
      ++facetVertices;
    } else if (token == "endfacet") {
      if (!inFacet || facetVertices != 3) parseFailure();
      inFacet = false;
      ++result.facetCount;
    }
  }
  if (inFacet) parseFailure();
  return result;
}

std::string lowerExtension(const std::filesystem::path& path) {
  std::string extension = path.extension().string();
  std::transform(extension.begin(), extension.end(), extension.begin(),
                 [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return extension;
}

}  // namespace

ReadResult parse(std::span<const std::uint8_t> bytes) {
  if (bytes.empty()) parseFailure();
  return isBinary(bytes) ? parseBinary(bytes) : parseAscii(bytes);
}

ReadResult readFile(const std::filesystem::path& path, std::uintmax_t maxFileBytes) { return parse(readFileBytes(path, maxFileBytes)); }

std::vector<std::uint8_t> readFileBytes(const std::filesystem::path& path, std::uintmax_t maxFileBytes, const std::function<bool()>& cancelled,
                                        const std::function<void(double)>& progress, std::size_t chunkBytes) {
  if (lowerExtension(path) != ".stl") {
    throw CodedError("stl_invalid_selection", "Only .stl files are supported.");
  }
  std::error_code error;
  const std::uintmax_t size = std::filesystem::file_size(path, error);
  if (error) throw CodedError("stl_unreadable", "The STL file could not be read.");
  if (size == 0) throw CodedError("stl_invalid_selection", "The STL file is empty.");
  if (size > maxFileBytes) {
    throw CodedError("stl_invalid_selection", "The STL file is too large for local loading.");
  }

  std::ifstream stream(path, std::ios::binary);
  std::vector<std::uint8_t> bytes(static_cast<std::size_t>(size));
  if (!stream) throw CodedError("stl_unreadable", "The STL file could not be read.");
  const std::size_t chunk = std::max<std::size_t>(chunkBytes, 1);
  for (std::size_t at = 0; at < bytes.size();) {
    if (cancelled && cancelled()) throw CodedError("stl_cancelled", "Loading the STL file was cancelled.");
    const std::size_t n = std::min(chunk, bytes.size() - at);
    if (!stream.read(reinterpret_cast<char*>(bytes.data() + at), static_cast<std::streamsize>(n))) throw CodedError("stl_unreadable", "The STL file could not be read.");
    at += n;
    if (progress) progress(static_cast<double>(at) / static_cast<double>(bytes.size()));
  }
  return bytes;
}

Bounds3 validateDisplayable(const TriangleSoup& soup) {
  if (soup.positions.empty()) {
    throw CodedError("stl_invalid_geometry", "The STL file does not contain displayable vertices.");
  }
  for (float value : soup.positions) {
    if (!std::isfinite(value)) {
      throw CodedError("stl_invalid_geometry", "The STL file contains invalid vertex coordinates.");
    }
  }
  const Bounds3 bounds = boundsOfSoup(soup);
  const Point3 size = bounds.size();
  const double maxDimension = std::max({size.x, size.y, size.z});
  if (!std::isfinite(size.x) || !std::isfinite(size.y) || !std::isfinite(size.z) ||
      maxDimension <= 1e-9) {
    throw CodedError("stl_invalid_geometry", "The STL file has no displayable size.");
  }
  return bounds;
}

std::vector<std::uint8_t> encodeBinary(const TriangleSoup& soup, const std::string& headerNote) {
  const std::size_t triangles = soup.triangleCount();
  if (triangles == 0 || triangles > 0xFFFFFFFFull) throw CodedError("stl_write_failed", "The mesh has no triangles to export.");
  std::vector<std::uint8_t> buffer(kBinaryHeaderBytes + triangles * kBinaryFacetBytes, 0);
  const std::string header = "Craft native project; units=millimeters; up=Z; " + headerNote;  // never starts with "solid"
  std::memcpy(buffer.data(), header.data(), std::min<std::size_t>(header.size(), 80));
  const std::uint32_t count = static_cast<std::uint32_t>(triangles);
  std::memcpy(buffer.data() + 80, &count, 4);
  std::uint8_t* out = buffer.data() + kBinaryHeaderBytes;
  for (std::size_t triangle = 0; triangle < triangles; ++triangle, out += kBinaryFacetBytes) {
    const float* v = soup.positions.data() + triangle * 9;
    const double e1[3] = {double(v[3]) - v[0], double(v[4]) - v[1], double(v[5]) - v[2]};
    const double e2[3] = {double(v[6]) - v[0], double(v[7]) - v[1], double(v[8]) - v[2]};
    const double n[3] = {e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]};
    const double length = std::sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
    const float normal[3] = {length > 0 ? static_cast<float>(n[0] / length) : 0.0f, length > 0 ? static_cast<float>(n[1] / length) : 0.0f,
                             length > 0 ? static_cast<float>(n[2] / length) : 0.0f};
    std::memcpy(out, normal, 12);
    std::memcpy(out + 12, v, 36);
  }
  return buffer;
}

std::vector<std::uint8_t> encodeBinary(const MeshPayload& mesh, const std::string& headerNote) {
  const std::size_t triangles = mesh.triangleCount();
  if (triangles == 0 || triangles > 0xFFFFFFFFull) {
    throw CodedError("stl_write_failed", "The mesh has no triangles to export.");
  }
  std::vector<std::uint8_t> buffer(kBinaryHeaderBytes + triangles * kBinaryFacetBytes, 0);
  // The header must not start with "solid" or readers mistake it for ASCII.
  const std::string header = "Craft native export; units=millimeters; up=Z; " + headerNote;
  std::memcpy(buffer.data(), header.data(), std::min<std::size_t>(header.size(), 80));
  const std::uint32_t count = static_cast<std::uint32_t>(triangles);
  std::memcpy(buffer.data() + 80, &count, 4);

  std::uint8_t* out = buffer.data() + kBinaryHeaderBytes;
  for (std::size_t triangle = 0; triangle < triangles; ++triangle, out += kBinaryFacetBytes) {
    float v[9];
    for (int corner = 0; corner < 3; ++corner) {
      const std::size_t index = mesh.indices[triangle * 3 + corner] * 3ull;
      for (int axis = 0; axis < 3; ++axis) {
        v[corner * 3 + axis] = static_cast<float>(mesh.positions[index + axis]);
      }
    }
    const double e1[3] = {double(v[3]) - v[0], double(v[4]) - v[1], double(v[5]) - v[2]};
    const double e2[3] = {double(v[6]) - v[0], double(v[7]) - v[1], double(v[8]) - v[2]};
    double n[3] = {e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2],
                   e1[0] * e2[1] - e1[1] * e2[0]};
    const double length = std::sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
    const float normal[3] = {length > 0 ? static_cast<float>(n[0] / length) : 0.0f,
                             length > 0 ? static_cast<float>(n[1] / length) : 0.0f,
                             length > 0 ? static_cast<float>(n[2] / length) : 0.0f};
    std::memcpy(out, normal, 12);
    std::memcpy(out + 12, v, 36);
  }
  return buffer;
}

void writeBinary(const std::filesystem::path& path, const MeshPayload& mesh,
                 const std::string& headerNote) {
  const std::vector<std::uint8_t> buffer = encodeBinary(mesh, headerNote);

  // Write to a sibling temp file and rename so a failed export never leaves a
  // truncated file under the requested name.
  std::filesystem::path temporary = path;
  temporary += ".craft-tmp";
  {
    std::ofstream stream(temporary, std::ios::binary | std::ios::trunc);
    if (!stream || !stream.write(reinterpret_cast<const char*>(buffer.data()), static_cast<std::streamsize>(buffer.size()))) {
      throw CodedError("stl_write_failed", "The STL file could not be written.");
    }
  }
  std::error_code error;
  std::filesystem::rename(temporary, path, error);
  if (error) {
    std::filesystem::remove(temporary, error);
    throw CodedError("stl_write_failed", "The STL file could not be written.");
  }
}
}  // namespace craft::stl
