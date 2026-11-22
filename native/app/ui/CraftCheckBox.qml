import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// A check box whose state reads at a glance in both themes. The Fusion style drew an unchecked box in the dark theme as a plain blue square
// and a checked one as the same square with a faint tick, so "on" and "off" could hardly be told apart: the box here is empty with a visible
// border when off and filled with the highlight colour and a white tick when on.
CheckBox {
    id: control
    Layout.minimumWidth: 80   // when in a layout: a long label wraps rather than widening the panel

    indicator: Rectangle {
        implicitWidth: 18
        implicitHeight: 18
        x: control.leftPadding
        y: control.topPadding + (control.availableHeight - height) / 2
        radius: 3
        // Explicit colours for the off state: the palette's base colour came out as the accent blue under this style, which is what made an
        // unchecked box look checked.
        readonly property bool dark: app.theme === "dark"
        color: control.checked ? control.palette.highlight : (dark ? "#262b32" : "#ffffff")
        border.width: 1
        border.color: control.checked ? control.palette.highlight : (dark ? "#7d8794" : "#7a838e")
        opacity: control.enabled ? 1.0 : 0.5

        Text {
            anchors.centerIn: parent
            visible: control.checked
            text: "\u2713"
            color: control.palette.highlightedText
            font.pixelSize: 14
            font.bold: true
        }
    }

    contentItem: Text {
        leftPadding: control.indicator.width + control.spacing
        text: control.text
        font: control.font
        color: control.palette.windowText
        opacity: control.enabled ? 1.0 : 0.5
        verticalAlignment: Text.AlignVCenter
        wrapMode: Text.Wrap   // a long label (a mold or piece name, or a larger text size) wraps instead of being cut off
    }
}
