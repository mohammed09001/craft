#pragma once

// A list of QVariantMaps for a QML Repeater that keeps its rows when a row's fields change.
//
// The controller hands lists to the UI as QVariantList properties (cutFaces, sprues, the segmentation's extensions, the Master Mold's sets).
// A Repeater over such a property is rebuilt from scratch whenever the property is re-read, so every delegate is destroyed and created again
// when ANY field of ANY row changes, including by the control's own action: a check box toggled with Space, a slider moved with an arrow key
// or dragged with the mouse, a field edited and confirmed with Enter all lose the keyboard focus (and a drag in progress) the moment they
// act (R-UI-5). Qt does not diff such a list.
//
// This model does. setItems(items) compares the new list with the rows it holds by a key field (a face name, an operation id) and emits the
// narrowest signal: dataChanged for a row whose map changed, rowsInserted / rowsRemoved for rows that came or went, a reset only when the
// rows were reordered or the keys are not unique. A delegate therefore survives a change of its own row. The one role is `modelData` (the
// row's whole map), so a delegate keeps reading `modelData.field` as it did over the plain list. A field that is itself a list of maps
// can be declared nested: it becomes a role of its own whose value is a child VariantListModel that is updated in place the same way
// (the Master Mold's sets, each with its pieces).

#include <QAbstractListModel>
#include <QHash>
#include <QString>
#include <QVariantList>
#include <QVariantMap>

#include <vector>

namespace craft::app {

class VariantListModel : public QAbstractListModel {
  Q_OBJECT
  Q_PROPERTY(int count READ count NOTIFY countChanged)

 public:
  enum Role { ModelDataRole = Qt::UserRole + 1, FirstNestedRole };

  /// `keyField`: the map field that identifies a row (empty: rows are identified by position). `nested`: field name -> that field's own key
  /// field, for fields holding a list of maps that should get a child model.
  explicit VariantListModel(QString keyField = {}, QHash<QString, QString> nested = {}, QObject* parent = nullptr);

  int rowCount(const QModelIndex& parent = {}) const override { return parent.isValid() ? 0 : static_cast<int>(rows_.size()); }
  QVariant data(const QModelIndex& index, int role) const override;
  QHash<int, QByteArray> roleNames() const override;
  int count() const { return static_cast<int>(rows_.size()); }

  /// Replaces the contents; what is unchanged keeps its row.
  void setItems(const QVariantList& items);
  QVariantList items() const;

 signals:
  void countChanged();

 private:
  struct Row {
    QString key;
    QVariantMap map;
    QHash<QString, VariantListModel*> children;
  };
  QString keyOf(const QVariantMap& map, int position) const;
  Row makeRow(const QVariantMap& map, int position);
  /// Brings `row` to `map`; true when anything the delegate can see changed.
  bool updateRow(Row& row, const QVariantMap& map);
  void rebuild(const std::vector<QVariantMap>& maps);

  QString keyField_;
  QHash<QString, QString> nested_;
  QList<QString> nestedOrder_;   // the nested fields, in role order
  std::vector<Row> rows_;
  bool rowsUnique_ = true;   // false after a rebuild from a list whose keys were not unique: the next change rebuilds too
};

}  // namespace craft::app
