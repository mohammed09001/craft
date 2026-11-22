import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts

ApplicationWindow {
    id: window
    width: 1280
    height: 800
    // The tool bar needs about 890 px (with the Flip button it ended at 885 px, past the 880 px minimum: Redo was cut off). The mold opacity slider
    // that used to sit at its right end is in the inspector's Mold section.
    minimumWidth: 910
    minimumHeight: 520
    visible: true
    title: (app.modelInfo.fileName ? app.project.title + " — " : "") + "Craft"

    // Escape cancels a sprue-ring drag or its numeric editor first; otherwise it clears the selection (the reference
    // does the same). It only acts when there is something to cancel or clear.
    // With the Flip tool active the arrow keys flip the part (the reference's keyboard mapping); a held key flips once.
    Shortcut { sequence: "Left"; autoRepeat: false; enabled: app.tool === "orientation"; onActivated: app.flipPart("left") }
    Shortcut { sequence: "Right"; autoRepeat: false; enabled: app.tool === "orientation"; onActivated: app.flipPart("right") }
    Shortcut { sequence: "Up"; autoRepeat: false; enabled: app.tool === "orientation"; onActivated: app.flipPart("forward") }
    Shortcut { sequence: "Down"; autoRepeat: false; enabled: app.tool === "orientation"; onActivated: app.flipPart("backward") }
    Shortcut {
        sequence: "Escape"
        enabled: app.sprueGizmo.cancellable || (app.tool === "select" && !!app.selection.kind)
        onActivated: { if (!app.sprueGizmoCancel()) app.clearSelection() }
    }

    function exportMold() { exportDialog.open() }
    function exportMold3mf() { export3mfDialog.open() }
    function exportMasterTooling() { masterExportDialog.open() }

    // Replacing the document discards unsaved changes: ask first. (Saving is asynchronous, so the dialog offers to
    // cancel and save with Ctrl+S rather than chaining the action behind the save.)
    property var pendingAction: null
    property bool closeConfirmed: false
    function guarded(action) {
        if (app.project.dirty) { pendingAction = action; unsavedDialog.open() }
        else action()
    }
    // Closing the window with unsaved changes asks first; an unclean exit would otherwise be the only record of the work.
    onClosing: function(close) {
        if (closeConfirmed || !app.project.dirty) return
        close.accepted = false
        pendingAction = function() { closeConfirmed = true; window.close() }
        unsavedDialog.open()
    }

    // Dropping one STL file anywhere on the window imports it, as in the reference ("Drag and drop one STL file to import it"); anything else is
    // refused with the reference's message in the status line. The drop area lies under the panels (above them it swallowed every mouse press:
    // drops still reach it, as a drag is delivered to the drop areas under the pointer whatever is drawn over them), and the outline that shows
    // a drag is over the window is a separate item on top that takes no input.
    DropArea {
        id: dropArea
        anchors.fill: parent
        onEntered: function(drag) { drag.accepted = drag.hasUrls }
        onDropped: function(drop) {
            if (!drop.hasUrls) return
            const urls = drop.urls
            if (app.acceptDroppedStl(urls)) { const file = urls[0]; window.guarded(function() { app.importStl(file) }) }
        }
    }

    FileDialog {
        id: openDialog
        title: qsTr("Import STL")
        nameFilters: [qsTr("STL models (*.stl *.STL)"), qsTr("All files (*)")]
        onAccepted: { const file = selectedFile; window.guarded(function() { app.importStl(file) }) }
    }
    FileDialog {
        id: openProjectDialog
        title: qsTr("Open project")
        nameFilters: [qsTr("Craft projects (*.craft)"), qsTr("All files (*)")]
        onAccepted: { const file = selectedFile; window.guarded(function() { app.openProject(file) }) }
    }
    FileDialog {
        id: saveProjectDialog
        title: qsTr("Save project")
        fileMode: FileDialog.SaveFile
        defaultSuffix: "craft"
        nameFilters: [qsTr("Craft projects (*.craft)")]
        onAccepted: app.saveProjectAs(selectedFile)
    }
    FileDialog {
        id: relinkModelDialog
        property string projectPath: ""
        title: qsTr("Locate the model file")
        nameFilters: [qsTr("STL models (*.stl *.STL)"), qsTr("All files (*)")]
        onAccepted: app.openProjectRelinked(projectPath, selectedFile)
    }
    Dialog {
        id: unsavedDialog
        title: qsTr("Unsaved changes")
        modal: true
        anchors.centerIn: parent
        width: Math.min(window.width - 40, 460)
        standardButtons: Dialog.Discard | Dialog.Cancel
        Label {
            width: parent.width
            wrapMode: Text.Wrap
            text: qsTr("This project has unsaved changes. Cancel and press Ctrl+S to keep them, or discard them and continue.")
        }
        onDiscarded: { close(); const action = window.pendingAction; window.pendingAction = null; if (action) action() }
        onRejected: window.pendingAction = null
    }
    Dialog {
        id: relinkDialog
        property string projectPath: ""
        property string detail: ""
        title: qsTr("Model file needed")
        modal: true
        anchors.centerIn: parent
        width: Math.min(window.width - 40, 480)
        standardButtons: Dialog.Cancel
        ColumnLayout {
            width: parent.width
            Label { text: relinkDialog.detail; wrapMode: Text.Wrap; Layout.fillWidth: true }
            Button {
                text: qsTr("Locate the model…")
                onClicked: { relinkModelDialog.projectPath = relinkDialog.projectPath; relinkDialog.close(); relinkModelDialog.open() }
            }
        }
    }
    Dialog {
        id: recoveryDialog
        title: qsTr("Recover unsaved work?")
        modal: true
        anchors.centerIn: parent
        width: Math.min(window.width - 40, 520)
        readonly property var first: app.recovery.available ? app.recovery.items[0] : null
        ColumnLayout {
            width: parent.width
            Label {
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                text: recoveryDialog.first
                      ? qsTr("Craft did not close normally last time. An autosaved copy of ") + recoveryDialog.first.name
                        + qsTr(" from ") + recoveryDialog.first.modifiedAt + qsTr(" is available.")
                      : ""
            }
            RowLayout {
                Button { text: qsTr("Recover"); onClicked: { recoveryDialog.close(); app.recoverProject(recoveryDialog.first.path) } }
                Button { text: qsTr("Discard"); onClicked: { recoveryDialog.close(); app.discardRecovery() } }
                Button { text: qsTr("Decide later"); onClicked: recoveryDialog.close() }
            }
        }
    }
    Component.onCompleted: if (app.recovery.available) recoveryDialog.open()
    FolderDialog {
        id: exportDialog
        title: qsTr("Export mold bodies to folder")
        onAccepted: app.exportMoldBodies(selectedFolder)
    }
    FileDialog {
        id: export3mfDialog
        title: qsTr("Export mold bodies as 3MF")
        fileMode: FileDialog.SaveFile
        defaultSuffix: "3mf"
        nameFilters: [qsTr("3MF models (*.3mf)")]
        onAccepted: app.exportMoldBodies3mf(selectedFile)
    }
    FolderDialog {
        id: masterExportDialog
        title: qsTr("Export Master tooling: choose where to create the export folder")
        onAccepted: app.exportMasterTooling(selectedFolder)
    }
    Dialog {
        id: errorDialog
        objectName: "errorDialog"
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
            // A missing or changed linked model has its own dialog that offers to locate the file.
            if (code === "project_asset_missing" || code === "project_asset_changed") return
            errorDialog.title = title
            errorDialog.detail = message
            errorDialog.open()
        }
        function onSaveAsRequested() { saveProjectDialog.open() }
        function onProjectModelNeedsRelink(projectPath, code, message) {
            relinkDialog.projectPath = projectPath
            relinkDialog.detail = message
            relinkDialog.open()
        }
    }

    Action { id: openAction; text: qsTr("&Open STL…"); shortcut: StandardKey.Open; onTriggered: openDialog.open() }
    Action { id: openProjectAction; text: qsTr("Open &project…"); shortcut: "Ctrl+Shift+O"; onTriggered: openProjectDialog.open() }
    Action { id: saveAction; text: qsTr("&Save project"); shortcut: StandardKey.Save; enabled: app.modelPhase === "ready"; onTriggered: app.saveProject() }
    Action { id: saveAsAction; text: qsTr("Save project &as…"); shortcut: StandardKey.SaveAs; enabled: app.modelPhase === "ready"; onTriggered: saveProjectDialog.open() }
    Action { id: fitAction; text: qsTr("&Fit view"); shortcut: "F"; onTriggered: app.fitView() }
    Action { id: resetAction; text: qsTr("&Reset view"); shortcut: "Home"; onTriggered: app.resetView() }
    Action { id: generateAction; text: qsTr("&Generate mold"); shortcut: "Ctrl+G"; onTriggered: app.generateMold() }
    // Master Mold's own entry, a peer of Generate mold (MasterMoldAction.tsx): it needs only a valid model, never a mold, planes or a cavity, and
    // is unavailable while it runs (Cancel is in the inspector).
    Action {
        id: masterMoldAction
        text: qsTr("Master Mold")
        enabled: app.masterMold.canGenerate === true && app.masterMold.generating !== true
        onTriggered: app.generateMasterMold()
    }
    // The button's tooltip is its state, as in the reference: progress, the failure, "needs regeneration", or just the name.
    readonly property string masterMoldTip: {
        const m = app.masterMold
        if (m.generating) return m.progressLabel !== "" ? m.progressLabel : qsTr("Generating Master Mold…")
        if (m.bannerIsError) return qsTr("Master Mold: ") + m.banner
        if (m.uiKind === "stale") return qsTr("Master Mold: needs regeneration (the part or printer context changed)")
        return qsTr("Master Mold")
    }
    Action { id: undoAction; text: qsTr("&Undo"); shortcut: StandardKey.Undo; enabled: app.history.canUndo; onTriggered: app.undo() }
    Action { id: redoAction; text: qsTr("&Redo"); shortcut: StandardKey.Redo; enabled: app.history.canRedo; onTriggered: app.redo() }
    Action { id: quitAction; text: qsTr("&Quit"); shortcut: StandardKey.Quit; onTriggered: window.close() }

    menuBar: MenuBar {
        Menu {
            title: qsTr("&File")
            MenuItem { action: openAction }
            MenuItem { action: openProjectAction }
            MenuSeparator {}
            MenuItem { action: saveAction }
            MenuItem { action: saveAsAction }
            MenuSeparator {}
            MenuItem { text: qsTr("&Export mold STL…"); enabled: app.moldPhase === "complete"; onTriggered: window.exportMold() }
            MenuItem { text: qsTr("Export mold &3MF…"); enabled: app.moldPhase === "complete"; onTriggered: window.exportMold3mf() }
            MenuItem { text: qsTr("Export &Master tooling…"); enabled: app.masterMold.canExport === true; onTriggered: window.exportMasterTooling() }
            MenuSeparator {}
            MenuItem { action: quitAction }
        }
        Menu {
            title: qsTr("&Edit")
            MenuItem { action: undoAction }
            MenuItem { action: redoAction }
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
            MenuItem { action: masterMoldAction }
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
            spacing: 2   // the buttons carry their own padding; the whole toolbar must fit the minimum window width
            ToolButton { action: openAction }
            ToolButton { action: openProjectAction }
            ToolButton { action: saveAction }
            ToolSeparator {}
            ToolButton { text: qsTr("Select"); checkable: true; checked: app.tool === "select"; onClicked: app.tool = "select" }
            ToolButton { text: qsTr("Measure"); checkable: true; checked: app.tool === "measure"; onClicked: app.tool = "measure" }
            ToolButton {
                objectName: "flipToolButton"
                text: qsTr("Flip"); checkable: true; checked: app.tool === "orientation"
                enabled: app.orientationState.available || app.tool === "orientation"
                ToolTip.visible: hovered
                ToolTip.text: app.orientationState.available ? qsTr("Use the arrow keys to flip the part") : app.orientationState.reason
                onClicked: app.tool = app.tool === "orientation" ? "select" : "orientation"
            }
            ToolButton {
                text: qsTr("Eraser"); checkable: true; checked: app.tool === "eraser"
                enabled: app.eraserAvailable || app.tool === "eraser"
                ToolTip.visible: hovered; ToolTip.text: qsTr("Click a cutting plane to remove it")
                onClicked: app.tool = "eraser"
            }
            ToolButton {
                text: qsTr("Sprue"); checkable: true; checked: app.tool === "sprue"
                enabled: app.moldPhase === "complete"
                onClicked: app.tool = "sprue"
            }
            ToolSeparator {}
            ToolButton { action: fitAction }
            ToolButton { action: resetAction }
            ToolSeparator {}
            ToolButton { action: generateAction; enabled: app.modelPhase === "ready" && !app.busy }
            ToolButton {
                objectName: "masterMoldButton"
                action: masterMoldAction
                text: qsTr("Master")   // short: the full toolbar must fit the minimum window width (the name, tooltip and menu entry say "Master Mold")
                Accessible.name: qsTr("Master Mold")
                highlighted: app.masterMold.uiKind === "success"   // the reference's pressed look once the tooling is complete
                ToolTip.visible: hovered; ToolTip.text: window.masterMoldTip
                Accessible.description: window.masterMoldTip
            }
            ToolSeparator {}
            ToolButton { objectName: "undoButton"; action: undoAction }
            ToolButton { objectName: "redoButton"; action: redoAction }
            Item { Layout.fillWidth: true }
        }
    }

    SplitView {
        anchors.fill: parent
        ViewportView { objectName: "viewport"; SplitView.fillWidth: true; SplitView.minimumWidth: 300 }
        Inspector {
            SplitView.preferredWidth: 340
            SplitView.minimumWidth: 260
            padding: 10
        }
    }

    // The outline shown while a drag is over the window: above everything, and it takes no mouse or hover input.
    Rectangle {
        objectName: "dropOverlay"
        anchors.fill: parent
        visible: dropArea.containsDrag
        enabled: false
        color: "transparent"
        border.width: 3
        border.color: "#22b8cf"
        Label {
            anchors.centerIn: parent
            text: qsTr("Drop an STL file to import it")
            font.pixelSize: 18
            padding: 12
            background: Rectangle { radius: 6; color: palette.window; opacity: 0.9 }
        }
    }

    footer: ToolBar {
        RowLayout {
            anchors.fill: parent
            Label { text: app.statusText; elide: Text.ElideRight; Layout.fillWidth: true; leftPadding: 8 }
            // The footer shows whichever long job runs: a save or an open (with its own stage and a Cancel) or the engine's busy state.
            readonly property bool projectJob: app.project.saving || app.project.opening || app.project.loading
            ProgressBar { objectName: "footerProgress"; visible: app.busy || parent.projectJob; value: parent.projectJob ? app.project.progress : app.busyProgress; implicitWidth: 140 }
            Label { text: parent.projectJob ? app.project.stage : app.busyStage; visible: app.busy || parent.projectJob }
            ToolButton { objectName: "cancelProjectButton"; text: qsTr("Cancel"); visible: parent.projectJob; onClicked: app.cancelProjectOperation() }
            Label { text: "mm · Z-up"; rightPadding: 8 }
        }
    }
}
