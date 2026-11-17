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
            title: qsTr("Segmentation")
            enabled: app.modelPhase === "ready"
            ColumnLayout {
                anchors.fill: parent
                Label {
                    text: qsTr("Splits an oversized mold into pieces that fit the printer.")
                    wrapMode: Text.Wrap; Layout.fillWidth: true
                }
                RowLayout {
                    Label { text: qsTr("Printer (mm)") }
                    SpinBox { id: printerX; from: 10; to: 5000; stepSize: 10; value: app.printerVolume.x || 220; editable: true; implicitWidth: 90 }
                    SpinBox { id: printerY; from: 10; to: 5000; stepSize: 10; value: app.printerVolume.y || 220; editable: true; implicitWidth: 90 }
                    SpinBox { id: printerZ; from: 10; to: 5000; stepSize: 10; value: app.printerVolume.z || 250; editable: true; implicitWidth: 90 }
                }
                Button {
                    text: qsTr("Plan segmentation")
                    Layout.fillWidth: true
                    enabled: !app.busy
                    onClicked: { app.setPrinterVolume(printerX.value, printerY.value, printerZ.value); app.planSegmentation() }
                }
                Label {
                    visible: !!app.segmentation.message
                    text: app.segmentation.message
                    wrapMode: Text.Wrap; Layout.fillWidth: true
                    color: app.segmentation.phase === "failed" || app.segmentation.valid === false ? "#e5484d" : palette.text
                }
                Label {
                    visible: app.segmentation.sectionCount !== undefined
                    text: qsTr("Axes: ") + (app.segmentation.requiredAxes || []).join(", ").toUpperCase()
                          + qsTr(" · sections: ") + app.segmentation.sectionCount
                          + (app.segmentation.blockSize ? qsTr(" · block ") + root.fmt(app.segmentation.blockSize.x, 0) + "×"
                             + root.fmt(app.segmentation.blockSize.y, 0) + "×" + root.fmt(app.segmentation.blockSize.z, 0) + " mm" : "")
                    wrapMode: Text.Wrap; Layout.fillWidth: true
                }
                Repeater {
                    model: app.segmentation.blockers || []
                    delegate: Label { required property var modelData; text: "⚠ " + modelData; color: "#e5484d"; wrapMode: Text.Wrap; Layout.fillWidth: true }
                }
                Flow {
                    Layout.fillWidth: true
                    spacing: 6
                    visible: app.segmentation.phase === "planned"
                    Repeater {
                        model: app.segmentation.availableAxes || []
                        delegate: Button {
                            required property var modelData
                            text: qsTr("Add ") + modelData.toUpperCase() + qsTr(" cut")
                            onClicked: app.addSegmentationExtension(modelData)
                        }
                    }
                }
                Repeater {
                    model: app.segmentation.extensions || []
                    delegate: RowLayout {
                        required property var modelData
                        Label { text: modelData.axis.toUpperCase() + qsTr(" cut at") }
                        TextField {
                            text: Number(modelData.coordinateMm).toFixed(2)
                            inputMethodHints: Qt.ImhFormattedNumbersOnly
                            implicitWidth: 90
                            onEditingFinished: app.moveSegmentationExtension(modelData.axis, parseFloat(text))
                        }
                        Label { text: "mm" }
                        ToolButton { text: qsTr("Remove"); onClicked: app.removeSegmentationExtension(modelData.axis) }
                    }
                }
                Button {
                    visible: app.segmentation.phase === "planned" || app.segmentation.phase === "executing"
                    text: app.segmentation.phase === "executing" ? qsTr("Cancel") : qsTr("Cut mold into sections")
                    highlighted: true
                    Layout.fillWidth: true
                    enabled: app.segmentation.phase === "executing" || app.segmentation.valid === true
                    onClicked: app.segmentation.phase === "executing" ? app.cancelCurrentJob() : app.executeSegmentation()
                }
                ColumnLayout {
                    visible: app.segmentation.adopted === true
                    Label {
                        text: (app.segmentation.execution ? app.segmentation.execution.bodyCount : 0) + qsTr(" sections")
                              + (app.segmentation.execution && app.segmentation.execution.keyCount !== undefined
                                 ? qsTr(", ") + app.segmentation.execution.keyCount + qsTr(" registration keys") : "")
                        font.bold: true
                    }
                    Label {
                        text: qsTr("Generate the mold to subtract the cavity from every section.")
                        wrapMode: Text.Wrap; Layout.fillWidth: true
                    }
                }
                Button {
                    visible: app.segmentation.phase !== undefined && app.segmentation.phase !== "idle"
                    text: qsTr("Reset segmentation")
                    Layout.fillWidth: true
                    onClicked: app.resetSegmentation()
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
                RowLayout {
                    Label { text: qsTr("Cavity clearance: ") + root.fmt(app.cavityClearanceMm, 1) + " mm" }
                    Slider {
                        Layout.fillWidth: true
                        from: 0; to: app.maxCavityClearanceMm; stepSize: 0.1
                        value: app.cavityClearanceMm
                        onMoved: app.cavityClearanceMm = value
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
                Label { text: qsTr("Kernel: ") + app.moldSummary.implementation }
                Label {
                    text: qsTr("Offset: ") + app.moldSummary.offsetEngine
                          + (app.moldSummary.usedFallback ? qsTr(" (fell back to distance field)") : "")
                    wrapMode: Text.Wrap; Layout.fillWidth: true
                }
                Label { text: qsTr("Block: ") + root.size(app.moldSummary.referenceBlock) }
                Label { text: qsTr("Removed: ") + root.fmt(app.moldSummary.removedVolumeMm3, 1) + " mm³" }
                Label { text: qsTr("Time: ") + root.fmt(app.moldSummary.elapsedMs, 0) + " ms" }
                Label {
                    text: app.moldSummary.registration.keyed
                          ? qsTr("Registration: ") + app.moldSummary.registration.featureCount + qsTr(" keys across ")
                            + app.moldSummary.registration.interfaceCount + qsTr(" interface(s)")
                          : qsTr("Registration: not applied")
                    wrapMode: Text.Wrap; Layout.fillWidth: true
                }
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
            visible: app.moldPhase === "complete"
            title: qsTr("Sprues")
            ColumnLayout {
                anchors.fill: parent
                Label {
                    visible: app.tool !== "sprue" && app.sprues.length === 0
                    text: qsTr("Choose the Sprue tool and click the top face over the cavity.")
                    wrapMode: Text.Wrap; Layout.fillWidth: true
                }
                Label {
                    visible: app.tool === "sprue"
                    wrapMode: Text.Wrap; Layout.fillWidth: true
                    text: app.sprueCandidate.onTopFace
                          ? (app.sprueCandidate.valid
                             ? qsTr("Click to place: stem ") + root.fmt(app.sprueCandidate.stemLengthMm, 1) + " mm, Ø"
                               + root.fmt(app.sprueCandidate.mainDiameterMm, 1) + " / Ø" + root.fmt(app.sprueCandidate.entryNeckDiameterMm, 1)
                               + " × " + root.fmt(app.sprueCandidate.entryNeckLengthMm, 1) + " mm neck"
                             : qsTr("This point does not reach the cavity."))
                          : qsTr("Move over the top face of the mold.")
                }
                Repeater {
                    model: app.sprues
                    delegate: ColumnLayout {
                        required property var modelData
                        Layout.fillWidth: true
                        RowLayout {
                            Label { text: modelData.operationId; font.bold: true }
                            Label {
                                text: modelData.status
                                color: modelData.status === "resolved" ? "#46a758" : modelData.status === "invalid" ? "#e5484d" : "#ffb224"
                            }
                            Item { Layout.fillWidth: true }
                            ToolButton { text: qsTr("Remove"); onClicked: app.removeSprue(modelData.operationId) }
                        }
                        Label {
                            visible: modelData.status === "invalid"
                            text: modelData.message; color: "#e5484d"; wrapMode: Text.Wrap; Layout.fillWidth: true
                        }
                        Label {
                            text: qsTr("at ") + root.fmt(modelData.x, 1) + ", " + root.fmt(modelData.y, 1) + " mm"
                                  + (modelData.depthMm !== undefined ? qsTr(" · depth ") + root.fmt(modelData.depthMm, 1) + " mm" : "")
                        }
                        RowLayout {
                            Label { text: qsTr("Main Ø ") + root.fmt(modelData.mainDiameterMm, 1) }
                            Slider {
                                Layout.fillWidth: true; from: 2; to: 50
                                value: modelData.mainDiameterMm
                                onMoved: app.resizeSprue(modelData.operationId, value)
                            }
                        }
                        RowLayout {
                            Label { text: qsTr("Neck Ø ") + root.fmt(modelData.entryNeckDiameterMm, 1) }
                            Slider {
                                Layout.fillWidth: true; from: 2; to: Math.max(2.1, modelData.mainDiameterMm)
                                value: modelData.entryNeckDiameterMm
                                onMoved: app.resizeSprueEntryNeck(modelData.operationId, value)
                            }
                        }
                    }
                }
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
