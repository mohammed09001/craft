import QtQuick
import QtQuick.Controls

// The precision input of the Mold Scale tool (moldScaleRuntime.ts, ensureEditor): a small number field at the upper centre of the viewport, shown only
// while the tool is active. It follows the clearance as it is dragged; Enter commits what was typed as one undo step (clamped to the limits),
// Escape puts the current value back and leaves the field. Press and wheel on it do not reach the camera.
TextField {
    id: field
    objectName: "moldScaleEditor"
    visible: app.tool === "mold-scale"
    width: 88
    height: 30
    horizontalAlignment: TextInput.AlignLeft
    leftPadding: 7; rightPadding: 7; topPadding: 5; bottomPadding: 5
    font.pixelSize: 12
    font.weight: Font.DemiBold
    color: "#f5fbf7"
    selectByMouse: true
    inputMethodHints: Qt.ImhFormattedNumbersOnly
    validator: RegularExpressionValidator { regularExpression: /^\d{0,3}([.,]\d{0,3})?$/ }
    Accessible.name: qsTr("Mold Scale in millimeters")

    // The value as the reference shows it: up to three decimals, no trailing zeros.
    function shown() { return String(Number(app.moldClearanceMm.toFixed(3))) }
    function refresh() { if (!activeFocus) text = shown() }
    Component.onCompleted: refresh()
    Connections { target: app; function onMoldInputsChanged() { field.refresh() } }
    onActiveFocusChanged: refresh()
    onVisibleChanged: if (visible) refresh()

    onAccepted: {
        const typed = Number(text.replace(",", "."))
        if (isFinite(typed) && text !== "") app.moldScaleCommit(typed)
        text = shown()
        focus = false
    }
    Keys.onEscapePressed: { text = shown(); focus = false }

    background: Rectangle {
        radius: 6
        color: Qt.rgba(12 / 255, 16 / 255, 20 / 255, 0.94)
        border.width: 1
        border.color: field.activeFocus ? "#9be0bc" : Qt.rgba(155 / 255, 224 / 255, 188 / 255, 0.72)
    }

    MouseArea {   // the reference's input stops pointer-down: a press on the field must not orbit the view, nor the wheel zoom it
        anchors.fill: parent
        acceptedButtons: Qt.NoButton
        onWheel: (w) => w.accepted = true
    }
}
