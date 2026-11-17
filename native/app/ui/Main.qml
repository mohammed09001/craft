import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts

ApplicationWindow {
    id: window
    width: 1280
    height: 800
    minimumWidth: 800
    minimumHeight: 520
    visible: true
    title: (app.modelInfo.fileName ? app.modelInfo.fileName + " — " : "") + "Craft"

    function exportMold() { exportDialog.open() }

    FileDialog {
        id: openDialog
        title: qsTr("Import STL")
        nameFilters: [qsTr("STL models (*.stl *.STL)"), qsTr("All files (*)")]
        onAccepted: app.importStl(selectedFile)
    }
    FolderDialog {
        id: exportDialog
        title: qsTr("Export mold bodies to folder")
        onAccepted: app.exportMoldBodies(selectedFolder)
    }
    Dialog {
        id: errorDialog
        property string detail: ""
        title: qsTr("Craft")
        modal: true
        anchors.centerIn: parent
        standardButtons: Dialog.Ok
        width: Math.min(window.width - 40, 460)
        Label { width: parent.width; text: errorDialog.detail; wrapMode: Text.Wrap }
    }
    Connections {
        target: app
        function onErrorOccurred(title, message, code) {
            errorDialog.title = title
            errorDialog.detail = message
            errorDialog.open()
        }
    }

    Action { id: openAction; text: qsTr("&Open STL…"); shortcut: StandardKey.Open; onTriggered: openDialog.open() }
    Action { id: fitAction; text: qsTr("&Fit view"); shortcut: "F"; onTriggered: app.fitView() }
    Action { id: resetAction; text: qsTr("&Reset view"); shortcut: "Home"; onTriggered: app.resetView() }
    Action { id: generateAction; text: qsTr("&Generate mold"); shortcut: "Ctrl+G"; onTriggered: app.generateMold() }
    Action { id: quitAction; text: qsTr("&Quit"); shortcut: StandardKey.Quit; onTriggered: Qt.quit() }

    menuBar: MenuBar {
        Menu {
            title: qsTr("&File")
            MenuItem { action: openAction }
            MenuItem { text: qsTr("&Export mold STL…"); enabled: app.moldPhase === "complete"; onTriggered: window.exportMold() }
            MenuSeparator {}
            MenuItem { action: quitAction }
        }
        Menu {
            title: qsTr("&View")
            MenuItem { action: fitAction }
            MenuItem { action: resetAction }
            MenuSeparator {}
            Repeater {
                model: ["top", "bottom", "front", "back", "left", "right"]
                delegate: MenuItem { required property string modelData; text: modelData; onTriggered: app.camera.lookFrom(modelData) }
            }
            MenuSeparator {}
            MenuItem { text: qsTr("Grid"); checkable: true; checked: app.showGrid; onToggled: app.showGrid = checked }
            MenuItem { text: qsTr("Axes"); checkable: true; checked: app.showAxes; onToggled: app.showAxes = checked }
            MenuItem { text: qsTr("Edges"); checkable: true; checked: app.showEdges; onToggled: app.showEdges = checked }
            MenuItem { text: qsTr("Light theme"); checkable: true; checked: app.theme === "light"; onToggled: app.theme = checked ? "light" : "dark" }
        }
        Menu {
            title: qsTr("&Mold")
            MenuItem { action: generateAction; enabled: app.modelPhase === "ready" }
        }
        Menu {
            title: qsTr("&Help")
            MenuItem { text: qsTr("Log file: ") + app.logFilePath; enabled: false }
            MenuItem { text: qsTr("Craft ") + app.applicationVersion; enabled: false }
        }
    }

    header: ToolBar {
        RowLayout {
            anchors.fill: parent
            spacing: 4
            ToolButton { action: openAction }
            ToolSeparator {}
            ToolButton { text: qsTr("Select"); checkable: true; checked: app.tool === "select"; onClicked: app.tool = "select" }
            ToolButton { text: qsTr("Measure"); checkable: true; checked: app.tool === "measure"; onClicked: app.tool = "measure" }
            ToolSeparator {}
            ToolButton { action: fitAction }
            ToolButton { action: resetAction }
            ToolSeparator {}
            ToolButton { action: generateAction; enabled: app.modelPhase === "ready" && !app.busy }
            Item { Layout.fillWidth: true }
            Label { text: qsTr("Mold opacity") }
            Slider { from: 0.1; to: 1; value: app.moldOpacity; onMoved: app.moldOpacity = value; implicitWidth: 120 }
        }
    }

    SplitView {
        anchors.fill: parent
        ViewportView { SplitView.fillWidth: true; SplitView.minimumWidth: 300 }
        Inspector {
            SplitView.preferredWidth: 340
            SplitView.minimumWidth: 260
            padding: 10
        }
    }

    footer: ToolBar {
        RowLayout {
            anchors.fill: parent
            Label { text: app.statusText; elide: Text.ElideRight; Layout.fillWidth: true; leftPadding: 8 }
            ProgressBar { visible: app.busy; value: app.busyProgress; implicitWidth: 140 }
            Label { text: app.busyStage; visible: app.busy }
            Label { text: "mm · Z-up"; rightPadding: 8 }
        }
    }
}
