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
    // The engine's reports carry identifiers (parting_strategy_requires_manual_review); they are shown as words. Only the separators change.
    function words(text) { return String(text).replace(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g, function (m) { return m.replace(/_/g, " ") }) }
    function size(b) { return b ? fmt(b.size.x) + " × " + fmt(b.size.y) + " × " + fmt(b.size.z) + " mm" : "–" }

    objectName: "inspector"

    // Every CraftSection under the inspector's column, found by walking it (sections nest: the reports sit inside Engineering reports).
    function collectSections(item, found) {
        for (var i = 0; i < item.children.length; ++i) {
            var child = item.children[i]
            if (child.hasOwnProperty("collapsed") && child.hasOwnProperty("title") && child.hasOwnProperty("toggle")) found.push(child)
            collectSections(child, found)
        }
        return found
    }
    // The Molds section's rows: the ids of the bodies (stable while they exist) and a lookup of one body's current name and visibility.
    property var moldBodyIds: []
    function syncMoldBodyIds() {
        var ids = []
        var bodies = app.moldBrowser.bodies || []
        for (var i = 0; i < bodies.length; ++i) ids.push(bodies[i].id)
        if (JSON.stringify(ids) !== JSON.stringify(moldBodyIds)) moldBodyIds = ids
    }
    function moldBodyInfo(id) {
        var bodies = app.moldBrowser.bodies || []
        for (var i = 0; i < bodies.length; ++i) if (bodies[i].id === id) return bodies[i]
        return null
    }
    Component.onCompleted: syncMoldBodyIds()
    Connections { target: app; function onMoldBrowserChanged() { root.syncMoldBodyIds() } }

    function setAllCollapsed(value) {
        var all = collectSections(inspectorColumn, [])
        for (var i = 0; i < all.length; ++i) all[i].collapsed = value
    }

    ColumnLayout {
        id: inspectorColumn
        objectName: "inspectorContent"   // the UI tour grabs all of it, not only the part that fits the window
        width: root.availableWidth
        spacing: 10

        RowLayout {
            Layout.fillWidth: true
            Item { Layout.fillWidth: true }
            Button { objectName: "collapseAll"; flat: true; text: qsTr("Collapse all"); onClicked: root.setAllCollapsed(true) }
            Button { objectName: "expandAll"; flat: true; text: qsTr("Expand all"); onClicked: root.setAllCollapsed(false) }
        }

        CraftSection {
            Layout.fillWidth: true
            title: qsTr("Model")
            ColumnLayout {
                Layout.fillWidth: true
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

        CraftSection {
            Layout.fillWidth: true
            title: qsTr("Orientation")
            visible: app.modelPhase === "ready"
            ColumnLayout {
                Layout.fillWidth: true
                objectName: "orientationSection"
                Label {
                    text: app.orientationState.available ? qsTr("Flip turns the part a quarter turn about a world axis; Auto orient lays its largest flat face on the ground.")
                                                         : app.orientationState.reason
                    wrapMode: Text.Wrap; Layout.fillWidth: true
                    font.italic: !app.orientationState.available
                }
                GridLayout {
                    columns: 2
                    Layout.fillWidth: true
                    enabled: app.orientationState.available
                    Button { objectName: "flipLeftButton"; text: qsTr("Flip left"); Layout.fillWidth: true; onClicked: app.flipPart("left") }
                    Button { objectName: "flipRightButton"; text: qsTr("Flip right"); Layout.fillWidth: true; onClicked: app.flipPart("right") }
                    Button { objectName: "flipForwardButton"; text: qsTr("Flip forward"); Layout.fillWidth: true; onClicked: app.flipPart("forward") }
                    Button { objectName: "flipBackwardButton"; text: qsTr("Flip back"); Layout.fillWidth: true; onClicked: app.flipPart("backward") }
                    Button { objectName: "flipUpsideDownButton"; text: qsTr("Upside down"); Layout.fillWidth: true; Layout.columnSpan: 2; onClicked: app.flipPart("upside-down") }
                    Button { objectName: "autoOrientButton"; text: qsTr("Auto orient"); Layout.fillWidth: true; onClicked: app.autoOrientPart() }
                    Button { objectName: "resetOrientationButton"; text: qsTr("Reset"); Layout.fillWidth: true; enabled: !app.orientationState.isIdentity; onClicked: app.resetPartOrientation() }
                }
            }
        }

        CraftSection {
            Layout.fillWidth: true
            title: qsTr("Segmentation")
            enabled: app.modelPhase === "ready"
            ColumnLayout {
                Layout.fillWidth: true
                Label {
                    text: qsTr("Splits an oversized mold into pieces that fit the printer.")
                    wrapMode: Text.Wrap; Layout.fillWidth: true
                }
                Label { text: qsTr("Printer build volume (mm)") }
                // Three fields that share the panel's width (the panel is 260 px wide at the narrowest): fixed 90 px fields plus the
                // label were wider than the panel and the third was cut off.
                RowLayout {
                    Layout.fillWidth: true
                    SpinBox { id: printerX; Accessible.name: qsTr("Printer build volume X (mm)"); Layout.fillWidth: true; Layout.minimumWidth: 70; from: 10; to: 5000; stepSize: 10; value: app.printerVolume.x || 220; editable: true; implicitWidth: 70 }
                    SpinBox { id: printerY; Accessible.name: qsTr("Printer build volume Y (mm)"); Layout.fillWidth: true; Layout.minimumWidth: 70; from: 10; to: 5000; stepSize: 10; value: app.printerVolume.y || 220; editable: true; implicitWidth: 70 }
                    SpinBox { id: printerZ; Accessible.name: qsTr("Printer build volume Z (mm)"); Layout.fillWidth: true; Layout.minimumWidth: 70; from: 10; to: 5000; stepSize: 10; value: app.printerVolume.z || 250; editable: true; implicitWidth: 70 }
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
                Label {
                    objectName: "protectedRegionsNote"
                    visible: (app.segmentation.protectedRegions || []).length > 0
                    text: qsTr("The mold you had built is taken into account: %1 protected region(s) (cavity, sprues, keys), advisory.")
                              .arg((app.segmentation.protectedRegions || []).length)
                    font.italic: true
                    wrapMode: Text.Wrap; Layout.fillWidth: true
                }
                Label {
                    objectName: "previewKeysHint"
                    visible: app.segmentation.previewState === "running"
                    text: qsTr("Previewing the alignment keys…")
                    font.italic: true
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
                    model: app.extensionModel
                    delegate: RowLayout {
                        required property var modelData
                        Label { text: modelData.axis.toUpperCase() + qsTr(" cut at") }
                        TextField {
                            objectName: "extensionField:" + modelData.axis
                            Accessible.name: qsTr("Extra cut position on the %1 axis (mm)").arg(modelData.axis.toUpperCase())
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

        CraftSection {
            Layout.fillWidth: true
            title: qsTr("Master Mold")
            visible: app.modelPhase === "ready"
            ColumnLayout {
                Layout.fillWidth: true
                Label {
                    text: qsTr("Plans printable master tooling straight from the part. No mold, cut or cavity is needed.")
                    wrapMode: Text.Wrap; Layout.fillWidth: true
                }
                Button {
                    id: masterButton
                    Layout.fillWidth: true
                    highlighted: app.masterMold.uiKind === "success"
                    enabled: app.masterMold.generating || app.masterMold.canGenerate
                    text: app.masterMold.generating ? qsTr("Cancel Master Mold") : qsTr("Generate Master Mold")
                    onClicked: app.masterMold.generating ? app.cancelCurrentJob() : app.generateMasterMold()
                }

                Label {
                    visible: app.masterMold.generating && !!app.masterMold.progressLabel
                    text: app.masterMold.progressLabel
                    Layout.fillWidth: true
                }
                ProgressBar {
                    visible: app.masterMold.generating
                    Layout.fillWidth: true
                    from: 0; to: 1
                    value: app.busyProgress
                }
                Label {
                    visible: !!app.masterMold.banner
                    text: app.masterMold.banner
                    wrapMode: Text.Wrap; Layout.fillWidth: true
                    color: app.masterMold.bannerIsError ? "#e5484d" : palette.text
                }
                Label {
                    visible: !!app.masterMold.incompleteNote
                    text: app.masterMold.incompleteNote
                    wrapMode: Text.Wrap; Layout.fillWidth: true
                    font.italic: true
                }
                Repeater {
                    model: app.masterMold.summaryLines || []
                    delegate: Label { required property var modelData; text: modelData; wrapMode: Text.Wrap; Layout.fillWidth: true }
                }
                ColumnLayout {
                    visible: app.masterMold.showPieces === true
                    Layout.fillWidth: true
                    RowLayout {
                        Label {
                            text: qsTr("Working mold: ") + app.masterMold.workingMoldPieceCount
                            font.bold: true
                        }
                        Item { Layout.fillWidth: true }
                        ToolButton { text: qsTr("Show all"); onClicked: app.showAllMasterPieces() }
                    }
                    Repeater {
                        model: app.masterSetModel
                        delegate: ColumnLayout {
                            required property var modelData
                            required property var pieces   // this set's pieces, a model of their own that is updated in place
                            Layout.fillWidth: true
                            RowLayout {
                                Label {
                                    text: modelData.name + (modelData.releaseMode ? " · " + modelData.releaseMode : "")
                                    font.bold: true
                                    color: modelData.status === "stale" ? "#8a8f98" : palette.text
                                }
                                Item { Layout.fillWidth: true }
                                ToolButton {
                                    visible: modelData.canIsolate
                                    text: qsTr("Isolate")
                                    onClicked: app.isolateMasterSet(modelData.id)
                                }
                            }
                            Repeater {
                                model: pieces
                                delegate: CraftCheckBox {
                                    required property var modelData
                                    objectName: "masterPiece:" + modelData.key
                                    text: modelData.name
                                    checked: modelData.visible
                                    onToggled: app.toggleMasterPiece(modelData.key)
                                }
                            }
                            Label {
                                visible: modelData.status === "blocked" && !!modelData.failureMessage
                                text: modelData.failureMessage
                                wrapMode: Text.Wrap; Layout.fillWidth: true
                                color: "#e5484d"
                            }
                        }
                    }
                }
                Button {
                    id: masterExportButton
                    visible: app.masterMold.showPieces === true
                    text: app.masterMold.exporting ? qsTr("Exporting…") : qsTr("Export Master tooling…")
                    Layout.fillWidth: true
                    enabled: app.masterMold.canExport === true
                    onClicked: window.exportMasterTooling()
                }
                Label {
                    visible: app.masterMold.showPieces === true && app.masterMold.canExport === true && !app.masterMold.lastExport.folder
                    text: qsTr("Exports %1 STL file(s), one 3MF with every piece, and a manifest into a new folder; nothing is overwritten. Stale or blocked parts are skipped.")
                              .arg(app.masterMold.exportablePieceCount)
                    wrapMode: Text.Wrap; Layout.fillWidth: true
                    color: "#8a8f98"
                }
                ColumnLayout {
                    visible: !!app.masterMold.lastExport.folder
                    Layout.fillWidth: true
                    Label {
                        text: app.masterMold.lastExport.threeMf ? qsTr("Exported %1 STL file(s) and one 3MF to:").arg(app.masterMold.lastExport.fileCount || 0) : qsTr("Exported %1 file(s) to:").arg(app.masterMold.lastExport.fileCount || 0)
                        font.bold: true
                        wrapMode: Text.Wrap; Layout.fillWidth: true
                    }
                    Label {
                        text: app.masterMold.lastExport.folder || ""
                        wrapMode: Text.WrapAnywhere; Layout.fillWidth: true
                        textFormat: Text.PlainText
                    }
                    Button {
                        text: qsTr("Show folder")
                        onClicked: Qt.openUrlExternally(app.fileUrl(app.masterMold.lastExport.folder))
                    }
                    Repeater {
                        model: app.masterMold.lastExport.warnings || []
                        delegate: Label { required property var modelData; text: "⚠ " + modelData; wrapMode: Text.Wrap; Layout.fillWidth: true; color: "#c98a4f" }
                    }
                    Repeater {
                        model: app.masterMold.lastExport.excluded || []
                        delegate: Label { required property var modelData; text: qsTr("Skipped: ") + modelData; wrapMode: Text.Wrap; Layout.fillWidth: true; color: "#8a8f98" }
                    }
                }
                Button {
                    visible: app.masterMold.status !== "unavailable"
                    text: qsTr("Reset Master Mold")
                    Layout.fillWidth: true
                    enabled: !app.masterMold.generating
                    onClicked: app.resetMasterMold()
                }
            }
        }

        CraftSection {
            Layout.fillWidth: true
            title: qsTr("Mold")
            enabled: app.modelPhase === "ready"
            ColumnLayout {
                Layout.fillWidth: true
                RowLayout {
                    Label { text: qsTr("Clearance (mm)") }
                    SpinBox {
                        Accessible.name: qsTr("Mold clearance (mm)")
                        from: app.minMoldClearanceMm; to: app.maxMoldClearanceMm
                        value: app.moldClearanceMm
                        editable: true
                        onValueModified: app.moldClearanceMm = value
                    }
                }
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: qsTr("Mold opacity") }
                    Slider { Accessible.name: qsTr("Mold opacity"); Layout.fillWidth: true; from: 0.1; to: 1; value: app.moldOpacity; onMoved: app.moldOpacity = value }
                }
                // The reference's MoldAppearanceToggle: shown once the mold is complete.
                Button {
                    objectName: "moldGlassButton"
                    visible: app.moldPhase === "complete"
                    text: qsTr("Glass appearance")
                    checkable: true
                    checked: app.moldGlass
                    onClicked: app.moldGlass = !app.moldGlass
                    Accessible.name: app.moldGlass ? qsTr("Disable glass mold appearance") : qsTr("Enable glass mold appearance")
                    ToolTip.visible: hovered; ToolTip.text: Accessible.name
                }
                RowLayout {
                    Label { text: qsTr("Cavity clearance: ") + root.fmt(app.cavityClearanceMm, 1) + " mm" }
                    Slider {
                        Accessible.name: qsTr("Cavity clearance (mm)")
                        Layout.fillWidth: true
                        from: 0; to: app.maxCavityClearanceMm; stepSize: 0.1
                        value: app.cavityClearanceMm
                        onMoved: app.cavityClearanceMm = value
                        onPressedChanged: pressed ? app.beginHistoryGesture() : app.endHistoryGesture()
                    }
                }
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: qsTr("Cavity quality") }
                    ComboBox {
                        id: qualityBox
                        objectName: "cavityQuality"
                        Layout.fillWidth: true
                        enabled: app.cavityClearanceMm > 0   // the mode only shapes an offset cavity; with no clearance there is none
                        model: [qsTr("High (as the reference)"), qsTr("Standard (faster)")]
                        currentIndex: app.cavityQuality === "standard" ? 1 : 0
                        onActivated: app.cavityQuality = currentIndex === 1 ? "standard" : "high"
                        Accessible.name: qsTr("Cavity quality")
                    }
                }
                Label { text: qsTr("Cut by face"); font.bold: true }
                Repeater {
                    model: app.cutFaceModel
                    delegate: RowLayout {
                        required property var modelData
                        CraftCheckBox {
                            objectName: "cutFaceCheck:" + modelData.face
                            Layout.preferredWidth: Math.max(96, implicitWidth)   // the same width in every row at the normal text size, so the sliders start at the same place; wider when the text is larger
                            text: modelData.face + " (" + modelData.axis + ")"
                            checked: modelData.enabled
                            onToggled: app.setCutFaceEnabled(modelData.face, checked)
                        }
                        Slider {
                            objectName: "cutFaceSlider:" + modelData.face
                            Accessible.name: qsTr("Position of the %1 cutting plane").arg(modelData.face)
                            Layout.fillWidth: true; Layout.minimumWidth: 40
                            enabled: modelData.enabled
                            from: 0.001; to: 0.999
                            value: modelData.position
                            onMoved: app.setCutFacePosition(modelData.face, value)
                            onPressedChanged: pressed ? app.beginHistoryGesture() : app.endHistoryGesture()
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

        CraftSection {
            Layout.fillWidth: true
            visible: app.moldPhase === "complete"
            title: qsTr("Mold result")
            ColumnLayout {
                Layout.fillWidth: true
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
                    text: app.moldSummary.registration && app.moldSummary.registration.keyed
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
                Button { text: qsTr("Export 3MF…"); Layout.fillWidth: true; onClicked: window.exportMold3mf() }
            }
        }

        // The reference's Molds browser: show or hide each mold body and the original model (not an undo step).
        CraftSection {
            visible: app.moldBrowser.available
            title: qsTr("Molds")
            ColumnLayout {
                Layout.fillWidth: true
                // The repeater runs on the list of ids, which changes only when bodies come or go: a toggle changes a body's "visible" and must not
                // rebuild the delegates (that would destroy the checkbox that was just toggled and take the keyboard focus with it).
                Repeater {
                    model: root.moldBodyIds
                    delegate: CraftCheckBox {
                        id: bodyBox
                        required property var modelData
                        readonly property var info: root.moldBodyInfo(modelData)
                        objectName: "bodyToggle:" + modelData
                        Layout.fillWidth: true
                        text: info ? info.name : ""
                        onToggled: app.setBodyVisible(modelData, checked)
                        Binding { target: bodyBox; property: "checked"; value: bodyBox.info ? bodyBox.info.visible : true }
                    }
                }
                Label { text: qsTr("Model"); font.bold: true; Layout.topMargin: 4 }
                CraftCheckBox {
                    objectName: "bodyToggle:model"
                    Layout.fillWidth: true
                    text: qsTr("Original")
                    checked: !!app.moldBrowser.model && app.moldBrowser.model.visible !== false
                    onToggled: app.setBodyVisible(app.moldBrowser.model.id, checked)
                }
            }
        }

        CraftSection {
            Layout.fillWidth: true
            visible: app.moldPhase === "complete"
            title: qsTr("Sprues")
            ColumnLayout {
                Layout.fillWidth: true
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
                    model: app.sprueModel
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
                                objectName: "sprueMainSlider:" + modelData.operationId
                                Accessible.name: qsTr("Main diameter of %1 (mm)").arg(modelData.operationId)
                                Layout.fillWidth: true; Layout.minimumWidth: 40; from: 2; to: 50
                                value: modelData.mainDiameterMm
                                onMoved: app.resizeSprue(modelData.operationId, value)
                                onPressedChanged: pressed ? app.beginHistoryGesture() : app.endHistoryGesture()
                            }
                        }
                        RowLayout {
                            Label { text: qsTr("Neck Ø ") + root.fmt(modelData.entryNeckDiameterMm, 1) }
                            Slider {
                                objectName: "sprueNeckSlider:" + modelData.operationId
                                Accessible.name: qsTr("Entry neck diameter of %1 (mm)").arg(modelData.operationId)
                                Layout.fillWidth: true; Layout.minimumWidth: 40; from: 2; to: Math.max(2.1, modelData.mainDiameterMm)
                                value: modelData.entryNeckDiameterMm
                                onMoved: app.resizeSprueEntryNeck(modelData.operationId, value)
                                onPressedChanged: pressed ? app.beginHistoryGesture() : app.endHistoryGesture()
                            }
                        }
                    }
                }
            }
        }

        CraftSection {
            Layout.fillWidth: true
            title: qsTr("Import analysis (Python)")
            enabled: app.modelPhase === "ready"
            ColumnLayout {
                Layout.fillWidth: true
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

        CraftSection {
            id: reportsBox
            Layout.fillWidth: true
            title: qsTr("Engineering reports")
            readonly property var reports: app.engineeringReports
            readonly property var view: reports.report ? reports : null
            ColumnLayout {
                Layout.fillWidth: true
                Button {
                    text: reportsBox.reports.phase === "running" ? qsTr("Cancel analysis") : qsTr("Analyze part (Python)")
                    enabled: app.modelPhase === "ready" || reportsBox.reports.phase === "running"
                    Layout.fillWidth: true
                    onClicked: reportsBox.reports.phase === "running" ? app.cancelMoldabilityAnalysis() : app.runMoldabilityAnalysis()
                }
                Label {
                    visible: reportsBox.reports.phase === "running"
                    text: reportsBox.reports.stage
                    wrapMode: Text.Wrap; Layout.fillWidth: true
                }
                Label {
                    visible: reportsBox.reports.phase === "error"
                    text: reportsBox.reports.error
                    color: "#e5484d"; wrapMode: Text.Wrap; Layout.fillWidth: true
                }

                // --- the engineering report envelope -------------------------------------------------------
                ColumnLayout {
                    visible: !!reportsBox.view
                    Layout.fillWidth: true
                    Label {
                        text: qsTr("Report: ") + (reportsBox.view ? reportsBox.view.report.statusLabel : "")
                        font.bold: true
                    }
                    Label {
                        visible: !!reportsBox.view && !!reportsBox.view.report.summary
                        text: reportsBox.view ? reportsBox.view.report.summary : ""
                        wrapMode: Text.Wrap; Layout.fillWidth: true
                    }
                    Repeater {
                        model: reportsBox.view ? reportsBox.view.report.errors : []
                        Label { text: modelData; color: "#e5484d"; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    }
                    Label {
                        visible: !!reportsBox.view && reportsBox.view.report.statistics.analysisMs !== undefined
                        text: reportsBox.view && reportsBox.view.report.statistics.analysisMs !== undefined
                              ? qsTr("Engine time: ") + root.fmt(reportsBox.view.report.statistics.analysisMs, 0) + " ms" : ""
                    }

                    // --- Pull Direction card (ported PullDirectionCard) --------------------------------------
                    CraftSection {
                        visible: !!reportsBox.view && reportsBox.view.pullDirection.available
                        Layout.fillWidth: true
                        title: qsTr("Pull Direction")
                        ColumnLayout {
                            Layout.fillWidth: true
                            Label {
                                text: qsTr("Result: ") + (reportsBox.view && reportsBox.view.pullDirection.card ? reportsBox.view.pullDirection.card.result : "")
                                font.bold: true; wrapMode: Text.Wrap; Layout.fillWidth: true
                            }
                            Label { wrapMode: Text.Wrap; Layout.fillWidth: true; text: qsTr("Best direction: ") + (reportsBox.view && reportsBox.view.pullDirection.card ? reportsBox.view.pullDirection.card.bestDirection : "") }
                            Label { wrapMode: Text.Wrap; Layout.fillWidth: true; text: qsTr("Confidence: ") + (reportsBox.view && reportsBox.view.pullDirection.card ? reportsBox.view.pullDirection.card.confidence : "") }
                            Label { wrapMode: Text.Wrap; Layout.fillWidth: true; text: qsTr("Candidates: ") + (reportsBox.view && reportsBox.view.pullDirection.card ? reportsBox.view.pullDirection.card.candidates : 0) }
                            Repeater {
                                model: reportsBox.view && reportsBox.view.pullDirection.card ? reportsBox.view.pullDirection.card.warnings : []
                                Label { text: "• " + root.words(modelData); wrapMode: Text.Wrap; Layout.fillWidth: true }
                            }
                            Label {
                                visible: !!reportsBox.view && !!reportsBox.view.pullDirection.evaluation
                                text: reportsBox.view && reportsBox.view.pullDirection.evaluation
                                      ? qsTr("Evaluation: ") + reportsBox.view.pullDirection.evaluation.statusLabel + "\n"
                                        + reportsBox.view.pullDirection.evaluation.bestLabel + "\n"
                                        + reportsBox.view.pullDirection.evaluation.countLabel : ""
                                wrapMode: Text.Wrap; Layout.fillWidth: true
                            }
                            Repeater {
                                model: reportsBox.view && reportsBox.view.pullDirection.evaluation ? reportsBox.view.pullDirection.evaluation.messages : []
                                Label { text: "• " + root.words(modelData); wrapMode: Text.Wrap; Layout.fillWidth: true }
                            }
                            Label { wrapMode: Text.Wrap; Layout.fillWidth: true; text: qsTr("Ranked candidates"); font.bold: true; visible: !!reportsBox.view && reportsBox.view.pullDirection.available }
                            Repeater {
                                model: reportsBox.view && reportsBox.view.pullDirection.ranked ? reportsBox.view.pullDirection.ranked : []
                                Label { wrapMode: Text.Wrap; Layout.fillWidth: true; text: modelData.rank + ".  " + modelData.directionLabel + "   score " + root.fmt(modelData.score, 1) }
                            }
                        }
                    }
                    Label {
                        visible: !!reportsBox.view && !reportsBox.view.pullDirection.available
                        text: reportsBox.view && reportsBox.view.pullDirection.note ? reportsBox.view.pullDirection.note : ""
                        wrapMode: Text.Wrap; Layout.fillWidth: true
                    }

                    // --- moldability assessment from the engine -----------------------------------------------
                    ColumnLayout {
                        visible: !!reportsBox.view && !!reportsBox.view.moldability
                        Layout.fillWidth: true
                        Label { wrapMode: Text.Wrap; Layout.fillWidth: true; text: qsTr("Moldability (preliminary)"); font.bold: true }
                        Label {
                            text: reportsBox.view && reportsBox.view.moldability
                                  ? root.words(reportsBox.view.moldability.status) + " · risk " + root.words(reportsBox.view.moldability.overallRisk) : ""
                            wrapMode: Text.Wrap; Layout.fillWidth: true
                        }
                        Label {
                            text: reportsBox.view && reportsBox.view.moldability ? reportsBox.view.moldability.summary : ""
                            wrapMode: Text.Wrap; Layout.fillWidth: true
                        }
                    }
                    // --- cavity analysis (Python engine) ---------------------------------------------------------
                    CraftSection {
                        visible: !!reportsBox.view && !!reportsBox.view.cavity && reportsBox.view.cavity.available
                        Layout.fillWidth: true
                        title: qsTr("Cavity analysis")
                        ColumnLayout {
                            Layout.fillWidth: true
                            Label {
                                text: reportsBox.view && reportsBox.view.cavity && reportsBox.view.cavity.available
                                      ? qsTr("Outcome: ") + root.words(reportsBox.view.cavity.assessmentOutcome) + " (" + root.words(reportsBox.view.cavity.status) + ")" : ""
                                font.bold: true; wrapMode: Text.Wrap; Layout.fillWidth: true
                            }
                            Label {
                                text: reportsBox.view && reportsBox.view.cavity && reportsBox.view.cavity.decisionSummary ? reportsBox.view.cavity.decisionSummary : ""
                                wrapMode: Text.Wrap; Layout.fillWidth: true
                            }
                            Label {
                                text: reportsBox.view && reportsBox.view.cavity && reportsBox.view.cavity.available
                                      ? qsTr("Candidates: ") + reportsBox.view.cavity.candidateCount + qsTr("  Openings: ") + reportsBox.view.cavity.openingCount
                                        + qsTr("  Core targets: ") + (reportsBox.view.cavity.coreTargetCount || 0) : ""
                                wrapMode: Text.Wrap; Layout.fillWidth: true
                            }
                            Label { wrapMode: Text.Wrap; Layout.fillWidth: true; text: qsTr("Engine findings"); font.bold: true; visible: !!reportsBox.view && !!reportsBox.view.cavity && reportsBox.view.cavity.findings.length > 0 }
                            Repeater {
                                model: reportsBox.view && reportsBox.view.cavity && reportsBox.view.cavity.findings ? reportsBox.view.cavity.findings : []
                                Label { text: "• " + root.words(modelData); wrapMode: Text.Wrap; Layout.fillWidth: true }
                            }
                        }
                    }

                    // --- generation readiness (Chapter 9 hand-off, ported adapter) ---------------------------------
                    CraftSection {
                        visible: !!reportsBox.view && !!reportsBox.view.readiness && reportsBox.view.readiness.available
                        Layout.fillWidth: true
                        title: qsTr("Generation readiness")
                        ColumnLayout {
                            Layout.fillWidth: true
                            Label {
                                text: reportsBox.view && reportsBox.view.readiness && reportsBox.view.readiness.available
                                      ? reportsBox.view.readiness.statusLabel + (reportsBox.view.readiness.canGenerate ? qsTr(" — can generate") : qsTr(" — cannot generate yet")) : ""
                                font.bold: true; wrapMode: Text.Wrap; Layout.fillWidth: true
                            }
                            Label {
                                text: reportsBox.view && reportsBox.view.readiness && reportsBox.view.readiness.available
                                      ? qsTr("Engine verdict: ") + root.words(reportsBox.view.readiness.engineStatus) + "  ·  confidence " + reportsBox.view.readiness.confidence
                                        + (reportsBox.view.readiness.requiresManualReview ? qsTr("  ·  manual review required") : "") : ""
                                wrapMode: Text.Wrap; Layout.fillWidth: true
                            }
                            Label { wrapMode: Text.Wrap; Layout.fillWidth: true; text: qsTr("Blockers"); font.bold: true; visible: !!reportsBox.view && !!reportsBox.view.readiness && reportsBox.view.readiness.blockers.length > 0 }
                            Repeater {
                                model: reportsBox.view && reportsBox.view.readiness && reportsBox.view.readiness.blockers ? reportsBox.view.readiness.blockers : []
                                Label { text: "• " + root.words(modelData); color: "#e5484d"; wrapMode: Text.Wrap; Layout.fillWidth: true }
                            }
                            Label { wrapMode: Text.Wrap; Layout.fillWidth: true; text: qsTr("Missing inputs"); font.bold: true; visible: !!reportsBox.view && !!reportsBox.view.readiness && reportsBox.view.readiness.missingInputs.length > 0 }
                            Repeater {
                                model: reportsBox.view && reportsBox.view.readiness && reportsBox.view.readiness.missingInputs ? reportsBox.view.readiness.missingInputs : []
                                Label { text: "• " + root.words(modelData); wrapMode: Text.Wrap; Layout.fillWidth: true }
                            }
                            Label { wrapMode: Text.Wrap; Layout.fillWidth: true; text: qsTr("Parting strategies"); font.bold: true; visible: !!reportsBox.view && !!reportsBox.view.readiness && reportsBox.view.readiness.partingStrategies.length > 0 }
                            Repeater {
                                model: reportsBox.view && reportsBox.view.readiness && reportsBox.view.readiness.partingStrategies ? reportsBox.view.readiness.partingStrategies : []
                                Label {
                                    text: modelData.rank + ".  " + root.words(modelData.strategyType) + " (" + root.words(modelData.generationMode) + ")  " + root.words(modelData.status)
                                          + "  score " + root.fmt(modelData.score, 1) + (modelData.requiresManualReview ? qsTr("  · review") : "")
                                    wrapMode: Text.Wrap; Layout.fillWidth: true
                                }
                            }
                            Label { wrapMode: Text.Wrap; Layout.fillWidth: true; text: qsTr("Warnings"); font.bold: true; visible: !!reportsBox.view && !!reportsBox.view.readiness && reportsBox.view.readiness.warnings.length > 0 }
                            Repeater {
                                model: reportsBox.view && reportsBox.view.readiness && reportsBox.view.readiness.warnings ? reportsBox.view.readiness.warnings : []
                                Label { text: "• " + root.words(modelData); wrapMode: Text.Wrap; Layout.fillWidth: true }
                            }
                        }
                    }
                    Repeater {
                        model: reportsBox.view && reportsBox.view.stageErrors ? reportsBox.view.stageErrors : []
                        Label { text: qsTr("Stage did not complete — ") + modelData; color: "#e5484d"; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    }
                    Repeater {
                        model: reportsBox.view ? reportsBox.view.report.warnings : []
                        Label { text: "⚠ " + modelData; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    }
                    Label {
                        visible: !!reportsBox.view && !!reportsBox.view.omittedNote
                        text: reportsBox.view && reportsBox.view.omittedNote ? reportsBox.view.omittedNote : ""
                        wrapMode: Text.Wrap; Layout.fillWidth: true; opacity: 0.7
                    }
                }

                // --- registry (engineeringReportManifest) -------------------------------------------------------
                Label { wrapMode: Text.Wrap; Layout.fillWidth: true; text: qsTr("Registered reports"); font.bold: true; Layout.topMargin: 6 }
                Repeater {
                    model: reportsBox.reports.registry
                    Label { wrapMode: Text.Wrap; Layout.fillWidth: true; text: modelData.displayName + " (" + modelData.supportLabel + ")" }
                }
            }
        }
        CraftSection {
            Layout.fillWidth: true
            title: app.tool === "measure" ? qsTr("Measurement") : qsTr("Selection")
            ColumnLayout {
                Layout.fillWidth: true
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
