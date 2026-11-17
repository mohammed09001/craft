import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Context inspector: model, mold settings, results, analysis report,
// selection / measurement. Presents controller state only.
ScrollView {
    id: root
    clip: true
    contentWidth: availableWidth

    function fmt(v, d) { return (v === undefined || v === null) ? "–" : Number(v).toFixed(d === undefined ? 2 : d) }
    function size(b) { return b ? fmt(b.size.x) + " × " + fmt(b.size.y) + " × " + fmt(b.size.z) + " mm" : "–" }

    ColumnLayout {
        width: root.availableWidth
        spacing: 10

        GroupBox {
            Layout.fillWidth: true
            title: qsTr("Model")
            ColumnLayout {
                anchors.fill: parent
                Label { visible: app.modelPhase === "empty"; text: qsTr("No model loaded."); wrapMode: Text.Wrap; Layout.fillWidth: true }
                Label { visible: app.modelPhase === "loading"; text: qsTr("Loading…") }
                Label { visible: app.modelPhase === "error"; text: app.modelMessage; color: "#e5484d"; wrapMode: Text.Wrap; Layout.fillWidth: true }
                ColumnLayout {
                    visible: app.modelPhase === "ready"
                    Label { text: app.modelInfo.fileName || ""; font.bold: true; elide: Text.ElideMiddle; Layout.fillWidth: true }
                    Label { text: (app.modelInfo.triangleCount || 0) + " triangles · " + (app.modelInfo.encoding || "") }
                    Label { text: qsTr("Size: ") + root.size(app.modelInfo.groundedBounds) }
                    Label { text: qsTr("Units: millimeters (assumed)"); font.italic: true }
                }
            }
        }

        GroupBox {
            Layout.fillWidth: true
            title: qsTr("Mold")
            enabled: app.modelPhase === "ready"
            ColumnLayout {
                anchors.fill: parent
                RowLayout {
                    Label { text: qsTr("Clearance (mm)") }
                    SpinBox {
                        from: app.minMoldClearanceMm; to: app.maxMoldClearanceMm
                        value: app.moldClearanceMm
                        editable: true
                        onValueModified: app.moldClearanceMm = value
                    }
                }
                Label { text: qsTr("Cut by face"); font.bold: true }
                Repeater {
                    model: app.cutFaces
                    delegate: RowLayout {
                        required property var modelData
                        CheckBox {
                            text: modelData.face + " (" + modelData.axis + ")"
                            checked: modelData.enabled
                            onToggled: app.setCutFaceEnabled(modelData.face, checked)
                        }
                        Slider {
                            Layout.fillWidth: true
                            enabled: modelData.enabled
                            from: 0.001; to: 0.999
                            value: modelData.position
                            onMoved: app.setCutFacePosition(modelData.face, value)
                        }
                    }
                }
                Button {
                    text: app.busy && app.moldPhase === "generating" ? qsTr("Cancel") : qsTr("Generate mold")
                    highlighted: true
                    Layout.fillWidth: true
                    onClicked: app.moldPhase === "generating" ? app.cancelCurrentJob() : app.generateMold()
                }
                ProgressBar {
                    visible: app.moldPhase === "generating"
                    Layout.fillWidth: true
                    value: app.busyProgress
                }
                Label { visible: app.moldPhase === "generating"; text: app.busyStage }
                Label { visible: app.moldPhase === "error"; text: app.moldError; color: "#e5484d"; wrapMode: Text.Wrap; Layout.fillWidth: true }
            }
        }

        GroupBox {
            Layout.fillWidth: true
            visible: app.moldPhase === "complete"
            title: qsTr("Mold result")
            ColumnLayout {
                anchors.fill: parent
                Label { text: qsTr("Engine: ") + app.moldSummary.implementation }
                Label { text: qsTr("Block: ") + root.size(app.moldSummary.referenceBlock) }
                Label { text: qsTr("Removed: ") + root.fmt(app.moldSummary.removedVolumeMm3, 1) + " mm³" }
                Label { text: qsTr("Time: ") + root.fmt(app.moldSummary.elapsedMs, 0) + " ms" }
                Repeater {
                    model: app.moldSummary.bodies || []
                    delegate: Label {
                        required property var modelData
                        text: modelData.name + " · " + root.fmt(modelData.volumeMm3, 1) + " mm³ · "
                              + modelData.triangleCount + " tris" + (modelData.watertight ? " · watertight" : " · OPEN")
                        wrapMode: Text.Wrap
                        Layout.fillWidth: true
                    }
                }
                Repeater {
                    model: app.moldIssues
                    delegate: Label {
                        required property var modelData
                        text: "⚠ " + modelData.message
                        color: "#ffb224"
                        wrapMode: Text.Wrap
                        Layout.fillWidth: true
                    }
                }
                Button { text: qsTr("Export STL…"); Layout.fillWidth: true; onClicked: window.exportMold() }
            }
        }

        GroupBox {
            Layout.fillWidth: true
            title: qsTr("Import analysis (Python)")
            enabled: app.modelPhase === "ready"
            ColumnLayout {
                anchors.fill: parent
                Label { text: qsTr("Runtime: ") + app.analysisRuntime; wrapMode: Text.Wrap; Layout.fillWidth: true }
                Button {
                    text: app.analysisPhase === "running" ? qsTr("Cancel analysis") : qsTr("Run analysis")
                    Layout.fillWidth: true
                    onClicked: app.analysisPhase === "running" ? app.cancelAnalysis() : app.runImportAnalysis()
                }
                Label { visible: app.analysisPhase === "running"; text: app.analysisStage }
                Label { visible: app.analysisPhase === "error"; text: app.analysisError; color: "#e5484d"; wrapMode: Text.Wrap; Layout.fillWidth: true }
                ColumnLayout {
                    visible: app.analysisPhase === "complete"
                    Label { text: qsTr("Status: ") + (app.analysisReport.status || ""); font.bold: true }
                    Label { text: app.analysisReport.summary || ""; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Label { text: qsTr("Engine time: ") + root.fmt(app.analysisReport.elapsedMs, 0) + " ms" }
                }
            }
        }

        GroupBox {
            Layout.fillWidth: true
            title: app.tool === "measure" ? qsTr("Measurement") : qsTr("Selection")
            ColumnLayout {
                anchors.fill: parent
                Label {
                    visible: app.tool === "select" && !app.selection.name
                    text: qsTr("Click the model to select a face."); wrapMode: Text.Wrap; Layout.fillWidth: true
                }
                Label {
                    visible: !!app.selection.name && app.tool === "select"
                    text: (app.selection.name || "") + "\ntriangle " + (app.selection.triangle || 0)
                          + "\nat " + root.fmt(app.selection.point ? app.selection.point.x : 0) + ", "
                          + root.fmt(app.selection.point ? app.selection.point.y : 0) + ", "
                          + root.fmt(app.selection.point ? app.selection.point.z : 0) + " mm"
                }
                Label {
                    visible: app.tool === "measure"
                    text: app.measurement.distanceMm !== undefined
                          ? qsTr("Distance: ") + root.fmt(app.measurement.distanceMm) + " mm"
                          : qsTr("Click two points on the model.")
                }
            }
        }
    }
}
