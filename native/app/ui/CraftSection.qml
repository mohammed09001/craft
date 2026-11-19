import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// A titled section of the inspector that can be folded. The inspector is one long column (about 3,400 px with an analysis report); a
// folded section leaves its title and nothing else, so the user can keep only what they are working on in view.
//
// The header is a control of its own: it takes keyboard focus (Tab), folds and unfolds on Space and Enter and on a click, shows a focus ring,
// and tells a screen reader its name and whether it is expanded. The content goes inside as children, as in a GroupBox.
ColumnLayout {
    id: section

    property string title: ""
    property bool collapsed: false
    default property alias content: body.data

    readonly property bool dark: app.theme === "dark"

    objectName: "section:" + title
    Layout.fillWidth: true
    spacing: 0

    function toggle() { collapsed = !collapsed }

    Rectangle {
        id: header
        objectName: "sectionHeader:" + section.title
        Layout.fillWidth: true
        implicitHeight: 30
        color: headerArea.containsMouse ? (section.dark ? "#2c323a" : "#e3e8ee") : (section.dark ? "#22272e" : "#eef1f5")
        border.width: 1
        border.color: section.dark ? "#3a424b" : "#c3cad2"
        activeFocusOnTab: true

        Accessible.role: Accessible.Button
        Accessible.name: section.title + (section.collapsed ? qsTr(", collapsed") : qsTr(", expanded"))
        Accessible.onPressAction: section.toggle()
        Keys.onSpacePressed: section.toggle()
        Keys.onReturnPressed: section.toggle()
        Keys.onEnterPressed: section.toggle()

        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 8
            anchors.rightMargin: 8
            spacing: 6
            Label { text: section.collapsed ? "\u25B8" : "\u25BE"; Layout.preferredWidth: 12 }
            Label { text: section.title; font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true }
        }
        Rectangle {   // the focus ring
            anchors.fill: parent
            visible: header.activeFocus
            color: "transparent"
            border.width: 2
            border.color: section.palette.highlight
        }
        MouseArea {
            id: headerArea
            anchors.fill: parent
            hoverEnabled: true
            onClicked: { header.forceActiveFocus(); section.toggle() }
        }
    }

    Rectangle {
        id: frame
        visible: !section.collapsed
        Layout.fillWidth: true
        implicitHeight: body.implicitHeight + 16
        color: "transparent"
        border.width: 1
        border.color: section.dark ? "#3a424b" : "#c3cad2"

        ColumnLayout {
            id: body
            anchors.fill: parent
            anchors.margins: 8
        }
    }
}
