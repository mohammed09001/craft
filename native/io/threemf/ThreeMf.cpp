#include "threemf/ThreeMf.h"

#include <algorithm>
#include <array>
#include <charconv>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <map>
#include <system_error>
#include <unordered_map>

#include "contracts/Operation.h"
#include "path/ExtendedPath.h"

namespace craft::threemf {

namespace {

// --- CRC-32 (IEEE 802.3, the ZIP polynomial) ---------------------------------
const std::array<std::uint32_t, 256>& crcTable() {
  static const std::array<std::uint32_t, 256> table = [] {
    std::array<std::uint32_t, 256> t{};
    for (std::uint32_t i = 0; i < 256; ++i) {
      std::uint32_t c = i;
      for (int k = 0; k < 8; ++k) c = (c & 1u) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
      t[i] = c;
    }
    return t;
  }();
  return table;
}

std::uint32_t crc32(const std::uint8_t* data, std::size_t size) {
  std::uint32_t c = 0xFFFFFFFFu;
  const auto& table = crcTable();
  for (std::size_t i = 0; i < size; ++i) c = table[(c ^ data[i]) & 0xFFu] ^ (c >> 8);
  return c ^ 0xFFFFFFFFu;
}

void put16(std::vector<std::uint8_t>& out, std::uint16_t v) {
  out.push_back(static_cast<std::uint8_t>(v & 0xFF));
  out.push_back(static_cast<std::uint8_t>(v >> 8));
}
void put32(std::vector<std::uint8_t>& out, std::uint32_t v) {
  for (int i = 0; i < 4; ++i) out.push_back(static_cast<std::uint8_t>((v >> (8 * i)) & 0xFF));
}
std::uint16_t get16(const std::vector<std::uint8_t>& b, std::size_t at) {
  return static_cast<std::uint16_t>(b[at] | (b[at + 1] << 8));
}
std::uint32_t get32(const std::vector<std::uint8_t>& b, std::size_t at) {
  return static_cast<std::uint32_t>(b[at]) | (static_cast<std::uint32_t>(b[at + 1]) << 8) |
         (static_cast<std::uint32_t>(b[at + 2]) << 16) | (static_cast<std::uint32_t>(b[at + 3]) << 24);
}

struct Entry {
  std::string name;
  std::string data;
};

// Fixed DOS timestamp (1980-01-01 00:00) so the output is deterministic.
constexpr std::uint16_t kDosTime = 0;
constexpr std::uint16_t kDosDate = (0 << 9) | (1 << 5) | 1;

std::vector<std::uint8_t> zipStored(const std::vector<Entry>& entries) {
  std::vector<std::uint8_t> out;
  struct Central {
    std::uint32_t crc, size, offset;
    const Entry* entry;
  };
  std::vector<Central> central;
  for (const Entry& e : entries) {
    const auto crc = crc32(reinterpret_cast<const std::uint8_t*>(e.data.data()), e.data.size());
    const auto offset = static_cast<std::uint32_t>(out.size());
    put32(out, 0x04034b50);
    put16(out, 20);          // version needed
    put16(out, 0x0800);      // flags: UTF-8 names
    put16(out, 0);           // stored
    put16(out, kDosTime);
    put16(out, kDosDate);
    put32(out, crc);
    put32(out, static_cast<std::uint32_t>(e.data.size()));
    put32(out, static_cast<std::uint32_t>(e.data.size()));
    put16(out, static_cast<std::uint16_t>(e.name.size()));
    put16(out, 0);
    out.insert(out.end(), e.name.begin(), e.name.end());
    out.insert(out.end(), e.data.begin(), e.data.end());
    central.push_back({crc, static_cast<std::uint32_t>(e.data.size()), offset, &e});
  }
  const auto cdOffset = static_cast<std::uint32_t>(out.size());
  for (const Central& c : central) {
    put32(out, 0x02014b50);
    put16(out, 20);
    put16(out, 20);
    put16(out, 0x0800);
    put16(out, 0);
    put16(out, kDosTime);
    put16(out, kDosDate);
    put32(out, c.crc);
    put32(out, c.size);
    put32(out, c.size);
    put16(out, static_cast<std::uint16_t>(c.entry->name.size()));
    put16(out, 0);
    put16(out, 0);
    put16(out, 0);
    put16(out, 0);
    put32(out, 0);
    put32(out, c.offset);
    out.insert(out.end(), c.entry->name.begin(), c.entry->name.end());
  }
  const auto cdSize = static_cast<std::uint32_t>(out.size()) - cdOffset;
  put32(out, 0x06054b50);
  put16(out, 0);
  put16(out, 0);
  put16(out, static_cast<std::uint16_t>(central.size()));
  put16(out, static_cast<std::uint16_t>(central.size()));
  put32(out, cdSize);
  put32(out, cdOffset);
  put16(out, 0);
  return out;
}

// --- model XML ---------------------------------------------------------------
std::string escapeXml(const std::string& s) {
  std::string r;
  for (char ch : s) {
    switch (ch) {
      case '&': r += "&amp;"; break;
      case '<': r += "&lt;"; break;
      case '>': r += "&gt;"; break;
      case '"': r += "&quot;"; break;
      case '\'': r += "&apos;"; break;
      default:
        // XML 1.0 forbids most control characters; replace rather than emit an ill-formed file.
        if (static_cast<unsigned char>(ch) < 0x20 && ch != '\t' && ch != '\n' && ch != '\r') r += ' ';
        else r += ch;
    }
  }
  return r;
}

void appendNumber(std::string& out, double v) {
  if (v == 0) v = 0;  // normalise -0
  char buffer[40];
  const auto result = std::to_chars(buffer, buffer + sizeof buffer, v);  // shortest round-trip form
  out.append(buffer, result.ptr);
}

void appendUnsigned(std::string& out, std::uint64_t v) {
  char buffer[24];
  const auto result = std::to_chars(buffer, buffer + sizeof buffer, v);
  out.append(buffer, result.ptr);
}

std::string pathText(const std::filesystem::path& p) {
  const auto u8 = p.u8string();  // char8_t-based under C++20
  return std::string(u8.begin(), u8.end());
}

bool meshUsable(const MeshPayload& m) {
  if (m.positions.empty() || m.indices.empty() || m.positions.size() % 3 != 0 || m.indices.size() % 3 != 0) return false;
  const auto vertexCount = m.vertexCount();
  for (double p : m.positions)
    if (!std::isfinite(p)) return false;
  for (auto index : m.indices)
    if (index >= vertexCount) return false;
  return true;
}

constexpr const char* kContentTypes =
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
    "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
    "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
    "<Default Extension=\"model\" ContentType=\"application/vnd.ms-package.3dmanufacturing-3dmodel+xml\"/>"
    "</Types>";

constexpr const char* kRels =
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
    "<Relationship Target=\"/3D/3dmodel.model\" Id=\"rel0\" "
    "Type=\"http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel\"/>"
    "</Relationships>";

}  // namespace

std::vector<std::uint8_t> encode(const std::vector<Object>& objects, const std::string& title) {
  if (objects.empty()) throw CodedError("threemf_write_failed", "Nothing to export: no bodies were given.");
  std::string model;
  model +=
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
      "<model unit=\"millimeter\" xml:lang=\"en-US\" xmlns=\"http://schemas.microsoft.com/3dmanufacturing/core/2015/02\">";
  if (!title.empty()) model += "<metadata name=\"Title\">" + escapeXml(title) + "</metadata>";
  model += "<metadata name=\"Application\">Craft</metadata><resources>";
  std::uint32_t id = 1;
  for (const Object& object : objects) {
    if (!object.mesh || !meshUsable(*object.mesh))
      throw CodedError("threemf_write_failed", "Cannot export '" + object.name + "': its mesh is empty or invalid.");
    const MeshPayload& mesh = *object.mesh;
    model += "<object id=\"";
    appendUnsigned(model, id++);
    model += "\" name=\"" + escapeXml(object.name) + "\" type=\"model\"><mesh><vertices>";
    for (std::size_t v = 0; v < mesh.vertexCount(); ++v) {
      model += "<vertex x=\"";
      appendNumber(model, mesh.positions[3 * v]);
      model += "\" y=\"";
      appendNumber(model, mesh.positions[3 * v + 1]);
      model += "\" z=\"";
      appendNumber(model, mesh.positions[3 * v + 2]);
      model += "\"/>";
    }
    model += "</vertices><triangles>";
    for (std::size_t t = 0; t < mesh.triangleCount(); ++t) {
      model += "<triangle v1=\"";
      appendUnsigned(model, mesh.indices[3 * t]);
      model += "\" v2=\"";
      appendUnsigned(model, mesh.indices[3 * t + 1]);
      model += "\" v3=\"";
      appendUnsigned(model, mesh.indices[3 * t + 2]);
      model += "\"/>";
    }
    model += "</triangles></mesh></object>";
  }
  model += "</resources><build>";
  for (std::uint32_t i = 1; i <= objects.size(); ++i) {
    model += "<item objectid=\"";
    appendUnsigned(model, i);
    model += "\"/>";
  }
  model += "</build></model>";
  return zipStored({{"[Content_Types].xml", kContentTypes}, {"_rels/.rels", kRels}, {"3D/3dmodel.model", std::move(model)}});
}

void write(const std::filesystem::path& path, const std::vector<Object>& objects, const std::string& title) {
  const auto bytes = encode(objects, title);
  const std::filesystem::path target = io::extendedLength(path, 8);   // 8: the temporary suffix below (path over MAX_PATH: io/path/ExtendedPath.h)
  std::filesystem::path partial = target;
  partial += ".part";
  std::error_code ec;
  {
    std::ofstream file(partial, std::ios::binary | std::ios::trunc);
    if (!file) throw CodedError("threemf_write_failed", "Cannot create " + pathText(path));
    file.write(reinterpret_cast<const char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
    file.flush();
    if (!file) {
      file.close();
      std::filesystem::remove(partial, ec);
      throw CodedError("threemf_write_failed", "Cannot write " + pathText(path));
    }
  }
  std::filesystem::rename(partial, target, ec);
  if (ec) {
    std::filesystem::remove(target, ec);  // rename onto an existing file is not portable everywhere
    std::error_code ec2;
    std::filesystem::rename(partial, target, ec2);
    if (ec2) {
      std::filesystem::remove(partial, ec);
      throw CodedError("threemf_write_failed", "Cannot finish " + pathText(path) + ": " + ec2.message());
    }
  }
}

// =============================================================================
// Validation
// =============================================================================
namespace {

struct Tag {
  std::string name;  ///< namespace prefix stripped
  std::map<std::string, std::string> attrs;
  bool closing = false;
  bool selfClosing = false;
};

// A deliberately small XML tokenizer: enough to check well-formedness (matching tags) and read attributes.
bool nextTag(const std::string& xml, std::size_t& pos, Tag& tag, std::string& problem) {
  while (true) {
    pos = xml.find('<', pos);
    if (pos == std::string::npos) return false;
    if (xml.compare(pos, 4, "<!--") == 0) {
      const auto end = xml.find("-->", pos + 4);
      if (end == std::string::npos) { problem = "unterminated XML comment"; return false; }
      pos = end + 3;
      continue;
    }
    if (xml.compare(pos, 2, "<?") == 0) {
      const auto end = xml.find("?>", pos + 2);
      if (end == std::string::npos) { problem = "unterminated XML declaration"; return false; }
      pos = end + 2;
      continue;
    }
    break;
  }
  const auto end = xml.find('>', pos);
  if (end == std::string::npos) { problem = "unterminated XML tag"; return false; }
  std::string body = xml.substr(pos + 1, end - pos - 1);
  pos = end + 1;
  tag = Tag{};
  if (!body.empty() && body.front() == '/') { tag.closing = true; body.erase(0, 1); }
  if (!body.empty() && body.back() == '/') { tag.selfClosing = true; body.pop_back(); }
  std::size_t i = 0;
  while (i < body.size() && !std::isspace(static_cast<unsigned char>(body[i]))) ++i;
  tag.name = body.substr(0, i);
  if (const auto colon = tag.name.find(':'); colon != std::string::npos) tag.name.erase(0, colon + 1);
  if (tag.name.empty()) { problem = "empty XML tag name"; return false; }
  while (i < body.size()) {
    while (i < body.size() && std::isspace(static_cast<unsigned char>(body[i]))) ++i;
    if (i >= body.size()) break;
    const auto eq = body.find('=', i);
    if (eq == std::string::npos) { problem = "malformed attribute in <" + tag.name + ">"; return false; }
    std::string key = body.substr(i, eq - i);
    while (!key.empty() && std::isspace(static_cast<unsigned char>(key.back()))) key.pop_back();
    std::size_t q = eq + 1;
    while (q < body.size() && std::isspace(static_cast<unsigned char>(body[q]))) ++q;
    if (q >= body.size() || (body[q] != '"' && body[q] != '\'')) { problem = "unquoted attribute in <" + tag.name + ">"; return false; }
    const char quote = body[q];
    const auto close = body.find(quote, q + 1);
    if (close == std::string::npos) { problem = "unterminated attribute value in <" + tag.name + ">"; return false; }
    tag.attrs[key] = body.substr(q + 1, close - q - 1);
    i = close + 1;
  }
  return true;
}

bool parseDouble(const std::string& s, double& v) {
  if (s.empty()) return false;
  const auto result = std::from_chars(s.data(), s.data() + s.size(), v);
  return result.ec == std::errc() && result.ptr == s.data() + s.size() && std::isfinite(v);
}
bool parseIndex(const std::string& s, std::uint64_t& v) {
  if (s.empty()) return false;
  const auto result = std::from_chars(s.data(), s.data() + s.size(), v);
  return result.ec == std::errc() && result.ptr == s.data() + s.size();
}

std::string unescapeXml(std::string s) {
  const std::pair<const char*, char> table[] = {{"&lt;", '<'}, {"&gt;", '>'}, {"&quot;", '"'}, {"&apos;", '\''}, {"&amp;", '&'}};
  for (const auto& [from, to] : table) {
    std::size_t at = 0;
    const std::size_t len = std::strlen(from);
    while ((at = s.find(from, at)) != std::string::npos) { s.replace(at, len, 1, to); ++at; }
  }
  return s;
}

struct ParsedObject {
  std::uint64_t id = 0;
  std::string name;
  std::vector<double> positions;
  std::vector<std::uint64_t> triangles;
};

void checkMesh(const ParsedObject& parsed, ObjectReport& r) {
  r.name = parsed.name;
  r.vertices = parsed.positions.size() / 3;
  r.triangles = parsed.triangles.size() / 3;
  r.indicesInRange = true;
  for (auto index : parsed.triangles)
    if (index >= r.vertices) r.indicesInRange = false;
  if (!r.indicesInRange || r.triangles == 0) return;
  for (int a = 0; a < 3; ++a) {
    r.bounds[a] = r.bounds[a + 3] = parsed.positions[a];
  }
  for (std::size_t v = 0; v < r.vertices; ++v)
    for (int a = 0; a < 3; ++a) {
      r.bounds[a] = std::min(r.bounds[a], parsed.positions[3 * v + a]);
      r.bounds[a + 3] = std::max(r.bounds[a + 3], parsed.positions[3 * v + a]);
    }
  r.noDegenerateTriangles = true;
  std::unordered_map<std::uint64_t, int> directed;  // (a<<32|b) -> count
  directed.reserve(r.triangles * 3);
  double volume = 0;
  for (std::size_t t = 0; t < r.triangles; ++t) {
    const std::uint64_t i0 = parsed.triangles[3 * t], i1 = parsed.triangles[3 * t + 1], i2 = parsed.triangles[3 * t + 2];
    if (i0 == i1 || i1 == i2 || i0 == i2) r.noDegenerateTriangles = false;
    const double* p0 = &parsed.positions[3 * i0];
    const double* p1 = &parsed.positions[3 * i1];
    const double* p2 = &parsed.positions[3 * i2];
    volume += (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) +
               p0[2] * (p1[0] * p2[1] - p1[1] * p2[0])) / 6.0;
    ++directed[(i0 << 32) | i1];
    ++directed[(i1 << 32) | i2];
    ++directed[(i2 << 32) | i0];
  }
  r.volume = volume;
  r.closedTwoManifold = true;
  for (const auto& [edge, count] : directed) {
    const std::uint64_t reverse = ((edge & 0xFFFFFFFFull) << 32) | (edge >> 32);
    const auto it = directed.find(reverse);
    if (count != 1 || it == directed.end() || it->second != 1) { r.closedTwoManifold = false; break; }
  }
}

}  // namespace

Report validate(const std::vector<std::uint8_t>& bytes) {
  Report report;
  auto fail = [&](std::string problem) {
    report.ok = false;
    if (report.problem.empty()) report.problem = std::move(problem);
    return report;
  };
  // ---- ZIP directory ----
  if (bytes.size() < 22) return fail("not a ZIP package: too small");
  std::size_t eocd = std::string::npos;
  for (std::size_t i = bytes.size() - 22 + 1; i-- > 0;) {
    if (get32(bytes, i) == 0x06054b50) { eocd = i; break; }
    if (bytes.size() - i > 22 + 65535) break;
  }
  if (eocd == std::string::npos) return fail("not a ZIP package: no end-of-central-directory record");
  const std::size_t count = get16(bytes, eocd + 10);
  std::size_t at = get32(bytes, eocd + 16);
  std::map<std::string, std::string> parts;
  for (std::size_t n = 0; n < count; ++n) {
    if (at + 46 > bytes.size() || get32(bytes, at) != 0x02014b50) return fail("corrupt ZIP central directory");
    const auto method = get16(bytes, at + 10);
    const auto crc = get32(bytes, at + 16);
    const auto csize = get32(bytes, at + 20);
    const auto usize = get32(bytes, at + 24);
    const std::size_t nameLen = get16(bytes, at + 28), extraLen = get16(bytes, at + 30), commentLen = get16(bytes, at + 32);
    const std::size_t local = get32(bytes, at + 42);
    if (at + 46 + nameLen > bytes.size()) return fail("corrupt ZIP central directory");
    const std::string name(reinterpret_cast<const char*>(&bytes[at + 46]), nameLen);
    at += 46 + nameLen + extraLen + commentLen;
    if (method != 0) return fail("entry '" + name + "' is compressed (method " + std::to_string(method) + "); only stored entries are validated");
    if (csize != usize) return fail("entry '" + name + "' has inconsistent sizes");
    if (local + 30 > bytes.size() || get32(bytes, local) != 0x04034b50) return fail("entry '" + name + "' has no local header");
    const std::size_t data = local + 30 + get16(bytes, local + 26) + get16(bytes, local + 28);
    if (data + usize > bytes.size()) return fail("entry '" + name + "' runs past the end of the file");
    if (crc32(&bytes[data], usize) != crc) return fail("entry '" + name + "' fails its CRC-32 check");
    if (parts.count(name)) return fail("duplicate entry '" + name + "'");
    parts[name].assign(reinterpret_cast<const char*>(&bytes[data]), usize);
  }
  for (const char* required : {"[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model"})
    if (!parts.count(required)) return fail(std::string("missing required part ") + required);

  // ---- model XML ----
  const std::string& xml = parts["3D/3dmodel.model"];
  std::size_t pos = 0;
  std::string problem;
  Tag tag;
  std::vector<std::string> stack;
  std::vector<ParsedObject> objects;
  std::vector<std::uint64_t> buildIds;
  bool sawModel = false, inVertices = false, inTriangles = false, inMetadata = false;
  while (nextTag(xml, pos, tag, problem)) {
    if (tag.closing) {
      if (stack.empty() || stack.back() != tag.name) return fail("mismatched closing tag </" + tag.name + ">");
      stack.pop_back();
      if (tag.name == "vertices") inVertices = false;
      if (tag.name == "triangles") inTriangles = false;
      if (tag.name == "metadata") inMetadata = false;
      continue;
    }
    if (!sawModel) {
      if (tag.name != "model") return fail("root element is <" + tag.name + ">, not <model>");
      sawModel = true;
      const auto unit = tag.attrs.find("unit");
      report.unit = unit == tag.attrs.end() ? "millimeter" : unit->second;  // 3MF default
    }
    if (tag.name == "object") {
      ParsedObject o;
      if (!parseIndex(tag.attrs["id"], o.id)) return fail("<object> without a valid id");
      o.name = unescapeXml(tag.attrs["name"]);
      objects.push_back(std::move(o));
    } else if (tag.name == "vertices") {
      inVertices = true;
    } else if (tag.name == "triangles") {
      inTriangles = true;
    } else if (tag.name == "vertex" && inVertices && !objects.empty()) {
      double x, y, z;
      if (!parseDouble(tag.attrs["x"], x) || !parseDouble(tag.attrs["y"], y) || !parseDouble(tag.attrs["z"], z))
        return fail("a <vertex> has a missing or non-finite coordinate");
      auto& p = objects.back().positions;
      p.push_back(x); p.push_back(y); p.push_back(z);
    } else if (tag.name == "triangle" && inTriangles && !objects.empty()) {
      std::uint64_t a, b, c;
      if (!parseIndex(tag.attrs["v1"], a) || !parseIndex(tag.attrs["v2"], b) || !parseIndex(tag.attrs["v3"], c))
        return fail("a <triangle> has a missing or invalid vertex index");
      auto& t = objects.back().triangles;
      t.push_back(a); t.push_back(b); t.push_back(c);
    } else if (tag.name == "item") {
      std::uint64_t id;
      if (!parseIndex(tag.attrs["objectid"], id)) return fail("<item> without a valid objectid");
      buildIds.push_back(id);
    }
    (void)inMetadata;
    if (!tag.selfClosing) stack.push_back(tag.name);
  }
  if (!problem.empty()) return fail(problem);
  if (!stack.empty()) return fail("unclosed element <" + stack.back() + ">");
  if (!sawModel) return fail("the model part has no <model> element");
  if (report.unit != "millimeter") return fail("unit is '" + report.unit + "', expected millimeter");
  if (objects.empty()) return fail("the model has no objects");
  report.buildItems = buildIds.size();
  if (buildIds.empty()) return fail("the model has no build items");
  for (auto id : buildIds) {
    const bool known = std::any_of(objects.begin(), objects.end(), [&](const ParsedObject& o) { return o.id == id; });
    if (!known) return fail("a build item references the missing object " + std::to_string(id));
  }
  bool all = true;
  for (const ParsedObject& o : objects) {
    ObjectReport r;
    checkMesh(o, r);
    if (!r.indicesInRange) { fail("object '" + o.name + "' has a triangle index out of range"); all = false; }
    else if (r.triangles == 0) { fail("object '" + o.name + "' has no triangles"); all = false; }
    else if (!r.noDegenerateTriangles) { fail("object '" + o.name + "' has a degenerate triangle"); all = false; }
    else if (!r.closedTwoManifold) { fail("object '" + o.name + "' is not a closed, consistently oriented 2-manifold"); all = false; }
    report.objects.push_back(std::move(r));
  }
  report.ok = all;
  return report;
}

Report validateFile(const std::filesystem::path& path) {
  std::ifstream file(io::extendedLength(path), std::ios::binary);
  if (!file) {
    Report r;
    r.problem = "cannot open " + pathText(path);
    return r;
  }
  std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
  return validate(bytes);
}

}  // namespace craft::threemf
