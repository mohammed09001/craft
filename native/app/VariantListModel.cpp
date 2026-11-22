#include "VariantListModel.h"

#include <QSet>

#include <algorithm>

namespace craft::app {

VariantListModel::VariantListModel(QString keyField, QHash<QString, QString> nested, QObject* parent)
    : QAbstractListModel(parent), keyField_(std::move(keyField)), nested_(std::move(nested)) {
  nestedOrder_ = nested_.keys();
  std::sort(nestedOrder_.begin(), nestedOrder_.end());   // a fixed role order
}

QHash<int, QByteArray> VariantListModel::roleNames() const {
  QHash<int, QByteArray> names{{ModelDataRole, "modelData"}};
  for (int i = 0; i < nestedOrder_.size(); ++i) names.insert(FirstNestedRole + i, nestedOrder_[i].toUtf8());
  return names;
}

QVariant VariantListModel::data(const QModelIndex& index, int role) const {
  if (!index.isValid() || index.row() < 0 || index.row() >= count()) return {};
  const Row& row = rows_[static_cast<std::size_t>(index.row())];
  if (role == ModelDataRole) return row.map;
  const int nestedIndex = role - FirstNestedRole;
  if (nestedIndex >= 0 && nestedIndex < nestedOrder_.size()) return QVariant::fromValue<QObject*>(row.children.value(nestedOrder_[nestedIndex]));
  return {};
}

QVariantList VariantListModel::items() const {
  QVariantList list;
  for (const Row& row : rows_) list << row.map;
  return list;
}

QString VariantListModel::keyOf(const QVariantMap& map, int position) const {
  if (keyField_.isEmpty()) return QString::number(position);
  const QString key = map.value(keyField_).toString();
  return key.isEmpty() ? QStringLiteral("#%1").arg(position) : key;
}

VariantListModel::Row VariantListModel::makeRow(const QVariantMap& map, int position) {
  Row row;
  row.key = keyOf(map, position);
  row.map = map;
  for (const QString& field : nestedOrder_) {
    auto* child = new VariantListModel(nested_.value(field), {}, this);
    child->setItems(map.value(field).toList());
    row.children.insert(field, child);
  }
  return row;
}

bool VariantListModel::updateRow(Row& row, const QVariantMap& map) {
  bool changed = false;
  for (const QString& field : nestedOrder_) row.children.value(field)->setItems(map.value(field).toList());   // in place, with its own signals
  if (row.map != map) {
    row.map = map;
    changed = true;
  }
  return changed;
}

void VariantListModel::rebuild(const std::vector<QVariantMap>& maps) {
  beginResetModel();
  for (Row& row : rows_)
    for (VariantListModel* child : std::as_const(row.children)) child->deleteLater();
  rows_.clear();
  QSet<QString> seen;
  rowsUnique_ = true;
  for (std::size_t i = 0; i < maps.size(); ++i) {
    rows_.push_back(makeRow(maps[i], static_cast<int>(i)));
    if (seen.contains(rows_.back().key)) rowsUnique_ = false;
    seen.insert(rows_.back().key);
  }
  endResetModel();
}

void VariantListModel::setItems(const QVariantList& items) {
  std::vector<QVariantMap> maps;
  maps.reserve(static_cast<std::size_t>(items.size()));
  for (const QVariant& item : items) maps.push_back(item.toMap());

  const int before = count();
  std::vector<QString> keys;
  QSet<QString> unique;
  bool uniqueKeys = true;
  for (std::size_t i = 0; i < maps.size(); ++i) {
    keys.push_back(keyOf(maps[i], static_cast<int>(i)));
    if (unique.contains(keys.back())) uniqueKeys = false;
    unique.insert(keys.back());
  }

  if (!uniqueKeys || !rowsUnique_) {
    // Without unique keys a row cannot be followed: start over (and stay correct).
    if (rows_.empty() && maps.empty()) return;
    rebuild(maps);
    if (count() != before) emit countChanged();
    return;
  }

  // 1. Rows that are gone.
  for (int i = count() - 1; i >= 0; --i) {
    if (unique.contains(rows_[static_cast<std::size_t>(i)].key)) continue;
    beginRemoveRows({}, i, i);
    for (VariantListModel* child : std::as_const(rows_[static_cast<std::size_t>(i)].children)) child->deleteLater();
    rows_.erase(rows_.begin() + i);
    endRemoveRows();
  }
  // 2. The rows that stayed must keep their order; if they were reordered, start over.
  {
    std::vector<QString> kept;
    for (const QString& key : keys) {
      const bool had = std::any_of(rows_.begin(), rows_.end(), [&](const Row& row) { return row.key == key; });
      if (had) kept.push_back(key);
    }
    bool sameOrder = kept.size() == rows_.size();
    for (std::size_t i = 0; sameOrder && i < kept.size(); ++i) sameOrder = rows_[i].key == kept[i];
    if (!sameOrder) {
      rebuild(maps);
      if (count() != before) emit countChanged();
      return;
    }
  }
  // 3. Walk the new list: update what is in place, insert what is new.
  for (std::size_t i = 0; i < maps.size(); ++i) {
    const int at = static_cast<int>(i);
    if (i < rows_.size() && rows_[i].key == keys[i]) {
      if (updateRow(rows_[i], maps[i])) emit dataChanged(index(at), index(at), {ModelDataRole});
    } else {
      beginInsertRows({}, at, at);
      rows_.insert(rows_.begin() + at, makeRow(maps[i], at));
      endInsertRows();
    }
  }
  if (count() != before) emit countChanged();
}

}  // namespace craft::app
