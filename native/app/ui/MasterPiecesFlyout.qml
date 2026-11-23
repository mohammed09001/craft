import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// The Master Mold pieces list of the reference (MasterMoldPiecesBrowser.tsx), opened from the toolbar's pieces button: "Working mold: N parts" and
// Show all, then each tooling set with Isolate and a check box per piece, a blocked set's reason, and the schema version. It drives the same
// controller actions as the inspector's list (they show the same state), so a change in one appears in the other. The panel is as dark as the bar.
Pane {
    id: flyout
    objectName: "masterPiecesFlyout"
    padding: 8
    implicitWidth: 280
    width: Math.min(implicitWidth, parent ? parent.width - 16 : implicitWidth)
    height: Math.min(implicitHeight, parent ? Math.max(120, parent.height - y - 16) : implicitHeight)
    // The check boxes and labels read their colours from the palette: the panel is always dark, in both themes.
    palette.windowText: "#d8e0e8"
    palette.text: "#d8e0e8"
    palette.buttonText: "#d8e0e8"
    palette.button: "#1c2228"
    palette.highlight: "#22d3ee"
    palette.highlightedText: "#0b1118"
    background: Rectangle {
        radius: 6
        color: Qt.rgba(11 / 255, 17 / 255, 24 / 255, 0.97)
        border.width: 1
        border.color: "#2d3238"
    }
    Accessible.role: Accessible.Pane
    Accessible.name: qsTr("Master Mold pieces list")

    // The list can be longer than the viewport is tall.
    contentItem: Flickable {
        id: scroller
        clip: true
        implicitWidth: 264
        implicitHeight: column.implicitHeight   // a Flickable has no size of its own: the panel is as tall as its list, up to the viewport
        contentWidth: width
        contentHeight: column.implicitHeight
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: ScrollBar {}
        ColumnLayout {
            id: column
            width: scroller.width - 10
            spacing: 4
            RowLayout {
                Layout.fillWidth: true
                Label {
                    objectName: "masterPiecesTitle"
                    text: qsTr("Working mold: %1 part(s)").arg(app.masterMold.workingMoldPieceCount)
                    font.bold: true
                }
                Item { Layout.fillWidth: true }
                ToolButton {
                    objectName: "masterPiecesShowAll"
                    text: qsTr("Show all")
                    Accessible.name: qsTr("Show all Master Mold pieces")
                    onClicked: app.showAllMasterPieces()
                }
            }
            Repeater {
                model: app.masterSetModel
                delegate: ColumnLayout {
                    required property var modelData
                    required property var pieces   // this set's pieces: a model of their own, updated in place (a toggled check box keeps its focus)
                    Layout.fillWidth: true
                    spacing: 2
                    RowLayout {
                        Layout.fillWidth: true
                        Label {
                            Layout.fillWidth: true
                            elide: Text.ElideRight
                            text: modelData.name + (modelData.releaseMode ? " · " + modelData.releaseMode : "")
                            font.bold: true
                            color: modelData.status === "stale" ? "#8a8f98" : palette.windowText
                        }
                        ToolButton {
                            objectName: "masterIsolate:" + modelData.id
                            visible: modelData.canIsolate
                            text: qsTr("Isolate")
                            Accessible.name: qsTr("Isolate %1 tooling").arg(modelData.name)
                            onClicked: app.isolateMasterSet(modelData.id)
                        }
                    }
                    Repeater {
                        model: pieces
                        delegate: CraftCheckBox {
                            required property var modelData
                            objectName: "masterPieceFlyout:" + modelData.key
                            text: modelData.name
                            checked: modelData.visible
                            Accessible.name: qsTr("Show %1").arg(modelData.name)
                            onToggled: app.toggleMasterPiece(modelData.key)
                        }
                    }
                    Label {
                        visible: modelData.status === "blocked"
                        text: modelData.failureMessage ? modelData.failureMessage : qsTr("tooling could not be generated")
                        wrapMode: Text.Wrap
                        Layout.fillWidth: true
                        color: "#e5484d"
                        font.pixelSize: 11
                    }
                }
            }
            Label {
                text: qsTr("schema v%1").arg(app.masterMold.schemaVersion)
                font.pixelSize: 10
                color: "#8a8f98"
            }
        }
    }
}
