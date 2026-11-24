// The list model behind the Inspector's Repeaters: a change of one row's fields must update that row in place (the delegate, and the
// keyboard focus in it, survive), rows that come and go insert and remove, and nothing is emitted when nothing changed (R-UI-5).
#include <QtTest/QtTest>

#include <QSignalSpy>

#include "VariantListModel.h"

using craft::app::VariantListModel;

namespace {

QVariantMap face(const QString& name, bool enabled, double position) { return {{"face", name}, {"enabled", enabled}, {"position", position}}; }

QVariantList faces(std::initializer_list<QVariantMap> maps) {
  QVariantList list;
  for (const QVariantMap& m : maps) list << m;
  return list;
}

QStringList keys(const VariantListModel& model, const QString& field = QStringLiteral("face")) {
  QStringList out;
  for (int i = 0; i < model.rowCount(); ++i) out << model.data(model.index(i), VariantListModel::ModelDataRole).toMap().value(field).toString();
  return out;
}

struct Spies {
  QSignalSpy inserted, removed, changed, reset, moved;
  explicit Spies(VariantListModel& m)
      : inserted(&m, &QAbstractItemModel::rowsInserted), removed(&m, &QAbstractItemModel::rowsRemoved), changed(&m, &QAbstractItemModel::dataChanged),
        reset(&m, &QAbstractItemModel::modelReset), moved(&m, &QAbstractItemModel::rowsMoved) {}
  int total() const { return inserted.count() + removed.count() + changed.count() + reset.count() + moved.count(); }
};

}  // namespace

class VariantListModelTest : public QObject {
  Q_OBJECT

 private slots:
  void aFirstFillInsertsTheRowsAndOneRoleCarriesTheWholeMap() {
    VariantListModel model(QStringLiteral("face"));
    QSignalSpy count(&model, &VariantListModel::countChanged);
    model.setItems(faces({face("top", false, 0.5), face("left", true, 0.3)}));
    QCOMPARE(model.rowCount(), 2);
    QCOMPARE(model.count(), 2);
    QCOMPARE(count.count(), 1);
    QCOMPARE(keys(model), (QStringList{"top", "left"}));
    QCOMPARE(model.roleNames().value(VariantListModel::ModelDataRole), QByteArray("modelData"));
    QCOMPARE(model.data(model.index(1), VariantListModel::ModelDataRole).toMap().value("position").toDouble(), 0.3);
    QVERIFY(!model.data(model.index(5), VariantListModel::ModelDataRole).isValid());
  }

  void aChangedFieldUpdatesItsRowInPlaceAndNothingElse() {
    VariantListModel model(QStringLiteral("face"));
    model.setItems(faces({face("top", false, 0.5), face("left", true, 0.3), face("front", false, 0.7)}));
    Spies spies(model);
    model.setItems(faces({face("top", false, 0.5), face("left", true, 0.45), face("front", false, 0.7)}));   // the slider of 'left' moved
    QCOMPARE(spies.changed.count(), 1);
    QCOMPARE(spies.changed.first().at(0).toModelIndex().row(), 1);
    QCOMPARE(spies.total(), 1);   // no rows inserted, removed or reset: a delegate in this list is never rebuilt
    QCOMPARE(model.data(model.index(1), VariantListModel::ModelDataRole).toMap().value("position").toDouble(), 0.45);
  }

  void anUnchangedListEmitsNothing() {
    VariantListModel model(QStringLiteral("face"));
    const QVariantList list = faces({face("top", false, 0.5), face("left", true, 0.3)});
    model.setItems(list);
    Spies spies(model);
    QSignalSpy count(&model, &VariantListModel::countChanged);
    model.setItems(list);
    QCOMPARE(spies.total(), 0);
    QCOMPARE(count.count(), 0);
  }

  void rowsThatComeAndGoAreInsertedAndRemovedAlone() {
    VariantListModel model(QStringLiteral("face"));
    model.setItems(faces({face("a", false, 0), face("b", false, 0), face("c", false, 0)}));
    {
      Spies spies(model);   // the middle one goes
      model.setItems(faces({face("a", false, 0), face("c", false, 0)}));
      QCOMPARE(spies.removed.count(), 1);
      QCOMPARE(spies.removed.first().at(1).toInt(), 1);
      QCOMPARE(spies.total(), 1);
      QCOMPARE(keys(model), (QStringList{"a", "c"}));
    }
    {
      Spies spies(model);   // one comes in the middle, one at the end
      model.setItems(faces({face("a", false, 0), face("b", false, 0), face("c", false, 0), face("d", true, 1)}));
      QCOMPARE(spies.inserted.count(), 2);
      QCOMPARE(spies.reset.count(), 0);
      QCOMPARE(keys(model), (QStringList{"a", "b", "c", "d"}));
    }
    {
      Spies spies(model);   // one goes while another changes
      model.setItems(faces({face("b", false, 0), face("c", true, 0), face("d", true, 1)}));
      QCOMPARE(spies.removed.count(), 1);
      QCOMPARE(spies.changed.count(), 1);
      QCOMPARE(keys(model), (QStringList{"b", "c", "d"}));
    }
    model.setItems({});
    QCOMPARE(model.rowCount(), 0);
  }

  void aReorderedListStartsOverCorrectly() {
    VariantListModel model(QStringLiteral("face"));
    model.setItems(faces({face("a", false, 0), face("b", false, 0), face("c", false, 0)}));
    Spies spies(model);
    model.setItems(faces({face("c", false, 0), face("a", false, 0), face("b", false, 0)}));
    QCOMPARE(spies.reset.count(), 1);
    QCOMPARE(keys(model), (QStringList{"c", "a", "b"}));
  }

  void rowsWithoutUniqueKeysAreStillCorrect() {
    VariantListModel model(QStringLiteral("face"));
    model.setItems(faces({face("a", false, 1), face("a", true, 2)}));   // not unique: cannot be followed, so it rebuilds, and is right
    QCOMPARE(model.rowCount(), 2);
    QCOMPARE(model.data(model.index(1), VariantListModel::ModelDataRole).toMap().value("position").toDouble(), 2.0);
    model.setItems(faces({face("a", false, 1), face("a", true, 3)}));
    QCOMPARE(model.data(model.index(1), VariantListModel::ModelDataRole).toMap().value("position").toDouble(), 3.0);
    model.setItems(faces({face("a", false, 1), face("b", true, 3)}));   // unique again
    QCOMPARE(keys(model), (QStringList{"a", "b"}));
    Spies spies(model);
    model.setItems(faces({face("a", false, 1), face("b", true, 4)}));
    QCOMPARE(spies.changed.count(), 1);   // and followed in place from now on
    QCOMPARE(spies.total(), 1);
  }

  void withoutAKeyFieldRowsAreFollowedByPosition() {
    VariantListModel model;
    model.setItems(faces({face("a", false, 1), face("b", true, 2)}));
    Spies spies(model);
    model.setItems(faces({face("a", false, 1), face("b", true, 9)}));
    QCOMPARE(spies.changed.count(), 1);
    QCOMPARE(spies.total(), 1);
    model.setItems(faces({face("a", false, 1)}));
    QCOMPARE(model.rowCount(), 1);
  }

  void aNestedListGetsAChildModelThatIsUpdatedInPlace() {
    VariantListModel sets(QStringLiteral("id"), {{QStringLiteral("pieces"), QStringLiteral("key")}});
    const auto piece = [](const QString& key, bool visible) { return QVariantMap{{"key", key}, {"visible", visible}}; };
    const auto set = [&](const QString& id, QVariantList pieces) { return QVariantMap{{"id", id}, {"status", "current"}, {"pieces", pieces}}; };
    QCOMPARE(sets.roleNames().value(VariantListModel::FirstNestedRole), QByteArray("pieces"));

    sets.setItems(QVariantList{set("s1", {piece("a", true), piece("b", true)}), set("s2", {piece("c", false)})});
    auto* first = qvariant_cast<QObject*>(sets.data(sets.index(0), VariantListModel::FirstNestedRole));
    auto* firstPieces = qobject_cast<VariantListModel*>(first);
    QVERIFY(firstPieces);
    QCOMPARE(firstPieces->rowCount(), 2);

    // A piece's check box is toggled: the same child model, the same row, only that row's data changed (the piece delegate is not rebuilt).
    Spies childSpies(*firstPieces);
    Spies setSpies(sets);
    sets.setItems(QVariantList{set("s1", {piece("a", false), piece("b", true)}), set("s2", {piece("c", false)})});
    QCOMPARE(qvariant_cast<QObject*>(sets.data(sets.index(0), VariantListModel::FirstNestedRole)), first);
    QCOMPARE(childSpies.changed.count(), 1);
    QCOMPARE(childSpies.total(), 1);
    QCOMPARE(setSpies.reset.count(), 0);   // and no set row was rebuilt either
    QCOMPARE(setSpies.inserted.count() + setSpies.removed.count(), 0);
    QCOMPARE(firstPieces->data(firstPieces->index(0), VariantListModel::ModelDataRole).toMap().value("visible").toBool(), false);

    // A piece that appears is a row of the child, not a new set.
    Spies childSpies2(*firstPieces);
    sets.setItems(QVariantList{set("s1", {piece("a", false), piece("b", true), piece("d", true)}), set("s2", {piece("c", false)})});
    QCOMPARE(childSpies2.inserted.count(), 1);
    QCOMPARE(firstPieces->rowCount(), 3);
    QCOMPARE(qvariant_cast<QObject*>(sets.data(sets.index(0), VariantListModel::FirstNestedRole)), first);
  }
};

QTEST_APPLESS_MAIN(VariantListModelTest)
#include "tst_variant_list_model.moc"
