import QtQuick
import QtQuick.Controls
import QtQuick.Shapes

// The viewport's floating model toolbar: the reference's "Model tools" bar (SplitFaceControls.tsx, CavityAction.tsx, MasterMoldAction.tsx and
// MoldToolbar.module.css), at the upper centre of the viewport. Icon buttons are 30 px with an 18 px glyph, the bar is always dark (the
// reference's neutral-950 whatever the theme), the active tool is tinted with the accent, a disabled button is drawn at 34 %.
// The glyphs are the reference's own SVG path data (MoldToolbarIcons.tsx), drawn with Qt Quick Shapes.
Item {
    id: bar
    objectName: "viewportToolbar"
    visible: app.modelPhase === "ready"

    // The reference's design tokens. The bar is neutral-950 in both themes; the accent follows the theme (cyan on dark, cyan / blue on light).
    readonly property bool darkTheme: app.theme === "dark"
    readonly property color panelColor: "#0b1118"
    readonly property color iconColor: "#d8e0e8"          // neutral-200
    readonly property color iconHoverColor: "#f7f9fb"     // neutral-50
    readonly property color accent: darkTheme ? "#22d3ee" : "#06b6d4"
    readonly property color accentStrong: darkTheme ? "#67e8f9" : "#2f80ed"
    readonly property color focusRing: accentStrong
    function mix(top, base, share) {   // color-mix(in srgb, top share%, base)
        return Qt.rgba(top.r * share + base.r * (1 - share), top.g * share + base.g * (1 - share), top.b * share + base.b * (1 - share), 1)
    }
    readonly property color lineColor: mix("#ffffff", panelColor, 0.14)
    readonly property color buttonColor: mix("#ffffff", panelColor, 0.07)
    readonly property color hoverLineColor: mix("#ffffff", panelColor, 0.26)
    readonly property color hoverColor: "#202832"         // neutral-800

    // Like the reference's bar the width is its content; in a narrow viewport the buttons wrap onto a second line instead of leaving it.
    // The root is a lane across the viewport (it takes no input); the visible bar is centred in it and the session panel hangs under its right end, so that
    // both lie inside their parent.
    anchors { top: parent.top; topMargin: 12; left: parent.left; right: parent.right; leftMargin: 12; rightMargin: 12 }
    // The width the buttons need on one line, from the buttons themselves (not from the Flow, whose size depends on this one).
    readonly property real naturalWidth: {
        let w = 0, n = 0
        for (let i = 0; i < flow.children.length; ++i) {
            const c = flow.children[i]
            if (!c.visible) continue
            w += c.width
            ++n
        }
        return w + Math.max(0, n - 1) * flow.spacing
    }
    readonly property real barWidth: Math.min(naturalWidth + 12, Math.max(60, width))
    readonly property real barHeight: flow.childrenRect.height + 10
    readonly property real barBottom: y + barHeight        // what is placed under the bar starts here (the Mold Scale field, the pieces list)
    readonly property real barRight: x + (width + barWidth) / 2
    height: barHeight + (sessionPanel.visible ? sessionPanel.height + 6 : 0)
    readonly property bool sessionOpen: app.cuttingSession.open === true

    readonly property bool hasModel: app.modelPhase === "ready"
    property bool piecesOpen: false   // the Master Mold pieces list under the bar
    Binding on piecesOpen { when: app.masterMold.showPieces !== true; value: false }   // no pieces, no list
    readonly property real clearance: app.moldClearanceMm
    function clearanceText() { return (Math.round(clearance * 10) / 10) + " mm" }
    readonly property string masterMoldTip: {
        const m = app.masterMold
        if (m.generating) return m.progressLabel !== "" ? m.progressLabel : qsTr("Generating Master Mold…")
        if (m.bannerIsError) return qsTr("Master Mold: ") + m.banner
        if (m.uiKind === "stale") return qsTr("Master Mold: needs regeneration (the part or printer context changed)")
        return qsTr("Master Mold")
    }

    // --- glyphs: a 24-unit view box drawn at 18 px ------------------------------------------------------------------------------------------
    component Glyph: Item {
        property color color: bar.iconColor
        default property alias paths: shape.data
        implicitWidth: 18
        implicitHeight: 18
        Shape {
            id: shape
            width: 24; height: 24
            scale: 0.75
            transformOrigin: Item.TopLeft
            preferredRendererType: Shape.CurveRenderer
        }
    }
    // One path: outlined (w > 0), filled solid, or filled at a share of the colour.
    component Part: ShapePath {
        id: part
        property string d: ""
        property color color: "white"
        property real w: 1.6
        property bool solid: false
        property real fillShare: 0
        property color fill: "transparent"
        property bool dashed: false
        strokeColor: w > 0 ? color : "transparent"
        strokeWidth: w
        fillColor: fill.a > 0 ? fill : (solid ? color : (fillShare > 0 ? Qt.rgba(color.r, color.g, color.b, fillShare) : "transparent"))
        capStyle: ShapePath.RoundCap
        joinStyle: ShapePath.RoundJoin
        strokeStyle: dashed ? ShapePath.DashLine : ShapePath.SolidLine
        dashPattern: dashed ? [1.5, 1.5] : []
        PathSvg { path: part.d }
    }
    component PointerGlyph: Glyph {
        id: g
        Part { color: g.color; solid: true; w: 1.2; d: "M6 4.5 18.2 13l-6.1 1.2-3.2 5.3L6 4.5Z" }
    }
    component EraserGlyph: Glyph {
        id: g
        Part { color: g.color; d: "m8.2 18.2-3.4-3.4a2 2 0 0 1 0-2.8l7.4-7.4a2 2 0 0 1 2.8 0l4.4 4.4a2 2 0 0 1 0 2.8l-6.4 6.4H8.2Z" }
        Part { color: g.color; d: "m9.5 8.5 6 6M12.8 18.2H20" }
    }
    component FlipGlyph: Glyph {
        id: g
        Part { color: g.color; d: "M8 8.5h8v7H8z" }
        Part { color: g.color; d: "M6 6.5c1.5-2.7 4.9-3.8 7.7-2.4 1.1.5 2 1.4 2.6 2.4" }
        Part { color: g.color; d: "m14.4 5.2 2.2 1.5.8-2.5" }
    }
    component MoldScaleGlyph: Glyph {
        id: g
        Part { color: g.color; w: 1.55; d: "M5.5 5.5h8v8h-8z" }
        Part { color: g.color; w: 1.55; d: "M13 11 19 5m-4 0h4v4" }
    }
    component SprueGlyph: Glyph {
        id: g
        Part { color: g.color; fillShare: 0.22; w: 1.5; d: "M7 5.5h10l-3 5v7a2 2 0 0 1-4 0v-7l-3-5Z" }
        Part { color: g.color; w: 1.3; d: "M8.5 8h7M10 12h4" }
    }
    component MasterMoldGlyph: Glyph {
        id: g
        Part { color: g.color; fill: "#1c2f4d"; w: 1.3; d: "M4 7h5v12H4z" }
        Part { color: g.color; w: 1.3; d: "M12 4h8v17h-8z" }
    }
    // Three rows with a dot on each (the reference's pieces icon, drawn at 16 px there: its 16-unit coordinates are scaled by 1.5 for this 24-unit box).
    component PiecesGlyph: Glyph {
        id: g
        Part { color: g.color; w: 2.25; d: "M3 6h18M3 12h18M3 18h18" }
        Part { color: g.color; solid: true; w: 0; d: "M5.4 6a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0-4.2 0Z" }
        Part { color: g.color; solid: true; w: 0; d: "M14.4 12a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0-4.2 0Z" }
        Part { color: g.color; solid: true; w: 0; d: "M6.9 18a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 1 0-4.2 0Z" }
    }
    // The Constructed Cutting Plan icon: two coloured blocks with the cut between them (its own colours, not the bar's).
    component ConstructGlyph: Item {
        implicitWidth: 23
        implicitHeight: 20
        Shape {
            width: 28; height: 24
            scale: 0.82
            transformOrigin: Item.TopLeft
            preferredRendererType: Shape.CurveRenderer
            Part { color: "#d8f5e4"; fill: "#4fb879"; w: 1.1; d: "M4.5 5.5 10.5 2v15.8l-6 3.5V5.5Z" }
            Part { color: "#d8f5e4"; fill: "#3c9462"; w: 1; d: "m4.5 5.5 6 2.5v9.8l-6 3.5" }
            Part { color: "#ffe5cb"; fill: "#ed9a54"; w: 1.1; d: "M17.5 6.2 23.5 2.7v15.8l-6 3.5V6.2Z" }
            Part { color: "#ffe5cb"; fill: "#c97838"; w: 1; d: "m17.5 6.2 6 2.5v9.8l-6 3.5" }
            Part { color: "#bac8d8"; w: 1; dashed: true; d: "M11.8 7.5h4.4M11.8 12h4.4M11.8 16.5h4.4" }
        }
    }
    component CutByFaceGlyph: Glyph {
        id: g
        Part { color: g.color; fillShare: 0.32; w: 1.3; d: "M5 8.5 12 5l7 3.5-7 3.5-7-3.5Z" }
        Part { color: g.color; w: 1.3; d: "M5 8.5v7l7 3.5v-7L5 8.5ZM19 8.5v7l-7 3.5v-7l7-3.5Z" }
    }
    component SegmentationGlyph: Glyph {
        id: g
        Part { color: g.color; fillShare: 0.22; w: 1.3; d: "M5 8.5 12 5l7 3.5v7L12 19l-7-3.5v-7Z" }
        Part { color: g.color; w: 1.1; d: "M5 8.5 12 12l7-3.5M12 12v7" }
    }
    component UndoGlyph: Glyph {
        id: g
        Part { color: g.color; w: 1.7; d: "M9 7 5 11l4 4" }
        Part { color: g.color; w: 1.7; d: "M6 11h7a5 5 0 0 1 5 5" }
    }
    component RedoGlyph: Glyph {
        id: g
        Part { color: g.color; w: 1.7; d: "m15 7 4 4-4 4" }
        Part { color: g.color; w: 1.7; d: "M18 11h-7a5 5 0 0 0-5 5" }
    }
    component MinusGlyph: Glyph {
        id: g
        Part { color: g.color; w: 1.8; d: "M6 12h12" }
    }
    component PlusGlyph: Glyph {
        id: g
        Part { color: g.color; w: 1.8; d: "M12 6v12M6 12h12" }
    }
    component GlassGlyph: Glyph {
        id: g
        property bool glass: false
        Part { color: g.color; d: "M12 3 20 7.5 12 12 4 7.5 12 3Z" }
        Part { color: g.color; d: "M4 7.5V16.5L12 21V12L4 7.5Z" }
        Part { color: g.color; d: "M20 7.5V16.5L12 21V12L20 7.5Z" }
        Part { color: g.color; w: g.glass ? 1.6 : 0; d: "M7.2 9.4 10.6 7.5M13.4 16.7 17 14.7" }
    }

    // --- the button: 30 px, 1 px line, 4 px radius, hover / active (highlighted) / disabled / focus states of .iconButton ------------------------
    component IconButton: AbstractButton {
        id: btn
        property bool highlighted: false      // aria-pressed in the reference: the tool that is on (accent tinted)
        property bool accented: false     // the "workflow-advancing" action (the cavity button)
        property string tip: ""
        property Component glyph: null
        implicitWidth: glyph === null ? Math.max(30, labelText.implicitWidth + 18) : 30
        implicitHeight: 30
        focusPolicy: Qt.StrongFocus
        hoverEnabled: true
        Accessible.name: text
        Accessible.description: tip
        ToolTip.visible: hovered && tip !== ""
        ToolTip.delay: 400
        ToolTip.text: tip
        opacity: enabled ? 1 : 0.34
        readonly property bool tinted: highlighted || (accented && enabled)
        readonly property color glyphColor: tinted ? bar.accentStrong : (hovered && enabled ? bar.iconHoverColor : bar.iconColor)
        background: Rectangle {
            y: btn.pressed ? 1 : 0
            radius: 4
            border.width: 1
            border.color: btn.highlighted ? bar.accent
                                      : btn.accented && btn.enabled ? (btn.hovered ? bar.accent : bar.mix(bar.accent, bar.panelColor, 0.56))
                                                                      : (btn.hovered && btn.enabled ? bar.hoverLineColor : bar.lineColor)
            color: btn.highlighted ? bar.mix(bar.accent, bar.panelColor, btn.hovered ? 0.34 : 0.24)
                               : btn.accented && btn.enabled ? bar.mix(bar.accent, bar.panelColor, btn.hovered ? 0.24 : 0.16)
                                                             : (btn.hovered && btn.enabled ? bar.hoverColor : bar.buttonColor)
            Rectangle {   // the keyboard focus ring (2 px, 2 px outside)
                visible: btn.visualFocus
                anchors.fill: parent; anchors.margins: -3
                radius: 6; color: "transparent"; border.width: 2; border.color: bar.focusRing
            }
        }
        contentItem: Item {
            y: btn.pressed ? 1 : 0
            Loader {
                id: glyphLoader
                visible: btn.glyph !== null
                anchors.centerIn: parent
                sourceComponent: btn.glyph
                onLoaded: item.color = Qt.binding(function() { return btn.glyphColor })
            }
            Text {
                id: labelText
                visible: btn.glyph === null
                anchors.centerIn: parent
                text: btn.text
                font.pixelSize: 12
                color: btn.glyphColor
            }
        }
    }

    // --- the bar ----------------------------------------------------------------------------------------------------------------------------
    Rectangle {
        id: panel
        objectName: "viewportToolbarPanel"
        x: (bar.width - width) / 2
        width: bar.barWidth
        height: bar.barHeight
        radius: 6
        color: bar.panelColor
        border.width: 1
        border.color: bar.lineColor
        // The bar takes the pointer: a press on it must not orbit the view, and the wheel must not zoom it.
        MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            acceptedButtons: Qt.AllButtons
            onWheel: (w) => w.accepted = true
        }
    }

    Flow {
        id: flow
        x: panel.x + 6; y: 5
        width: panel.width - 12
        spacing: 6

        IconButton {
            objectName: "flipToolButton"
            text: qsTr("Flip")
            glyph: Component { FlipGlyph {} }
            highlighted: app.tool === "orientation"
            enabled: !bar.sessionOpen && (app.orientationState.available || app.tool === "orientation")
            tip: app.orientationState.available ? qsTr("Use the arrow keys to flip the part") : app.orientationState.reason
            onClicked: app.tool = app.tool === "orientation" ? "select" : "orientation"
        }

        // Mold Scale, the global command: drag in the view (0.1 mm per pixel) or type the value; one undo step.
        IconButton {
            objectName: "moldScaleToolButton"
            text: qsTr("Mold Scale")
            tip: qsTr("Mold Scale: drag in the view to change the mold clearance, or type a value")
            glyph: Component { MoldScaleGlyph {} }
            highlighted: app.tool === "mold-scale"
            enabled: !bar.sessionOpen && ((app.modelPhase === "ready" && !app.busy && app.spruePhase !== "evaluating") || app.tool === "mold-scale")   // as AppController::moldScaleAvailable
            onClicked: app.tool = app.tool === "mold-scale" ? "select" : "mold-scale"
        }

        // The clearance between the part and the mold's outside, stepped in whole millimetres (the exact value is in the Mold section).
        Row {
            spacing: 4
            height: 30
            IconButton {
                objectName: "clearanceMinus"
                text: qsTr("Decrease mold clearance")
                tip: text
                glyph: Component { MinusGlyph {} }
                enabled: bar.hasModel && !app.busy && !bar.sessionOpen && bar.clearance > app.minMoldClearanceMm + 1e-9
                onClicked: app.moldClearanceMm = Math.max(app.minMoldClearanceMm, Math.ceil(bar.clearance - 1e-9) - 1)
            }
            Text {
                objectName: "clearanceValue"
                height: 30
                width: Math.max(54, implicitWidth + 6)
                verticalAlignment: Text.AlignVCenter
                horizontalAlignment: Text.AlignHCenter
                text: bar.clearanceText()
                font.pixelSize: 13
                color: "#f7f9fb"
                Accessible.role: Accessible.StaticText
                Accessible.name: qsTr("Mold clearance ") + text
            }
            IconButton {
                objectName: "clearancePlus"
                text: qsTr("Increase mold clearance")
                tip: text
                glyph: Component { PlusGlyph {} }
                enabled: bar.hasModel && !app.busy && !bar.sessionOpen && bar.clearance < app.maxMoldClearanceMm - 1e-9
                onClicked: app.moldClearanceMm = Math.min(app.maxMoldClearanceMm, Math.floor(bar.clearance + 1e-9) + 1)
            }
        }

        Item { width: 1; height: 30; Rectangle { width: 1; height: 24; anchors.verticalCenter: parent.verticalCenter; color: bar.lineColor } }   // separator

        // The Constructed Cutting Plan: opens the session (Cutting by Face / Segmentation, then Done or Cancel).
        IconButton {
            objectName: "constructButton"
            text: qsTr("Constructed Cutting Plan")
            tip: bar.sessionOpen ? qsTr("The cutting session is open: finish it with Done or Cancel") : text
            glyph: Component { ConstructGlyph {} }
            highlighted: bar.sessionOpen
            enabled: bar.hasModel && !app.busy && !bar.sessionOpen && app.moldPhase !== "generating" && app.segmentation.adopted !== true
            onClicked: app.openCuttingSession()
        }

        // The number of cutting planes in the mold (the reference's round badge).
        Item {
            width: badge.width; height: 30
            Rectangle {
            id: badge
            anchors.verticalCenter: parent.verticalCenter
            objectName: "cutPlaneBadge"
            readonly property int planes: { let n = 0; for (const f of app.cutFaces) if (f.enabled) ++n; return n }
            width: Math.max(24, badgeText.implicitWidth + 12); height: 24
            radius: 12
            color: Qt.rgba(0x11 / 255, 0x18 / 255, 0x21 / 255, 0.7)
            border.width: 1
            border.color: "#202832"
            Accessible.role: Accessible.StaticText
            Accessible.name: planes === 1 ? qsTr("1 cutting plane") : qsTr("%1 cutting planes").arg(planes)
            Text {
                id: badgeText
                anchors.centerIn: parent
                text: parent.planes
                font.pixelSize: 11; font.weight: Font.DemiBold
                color: "#cbd5df"
            }
            HoverHandler { id: badgeHover }
            ToolTip.visible: badgeHover.hovered
            ToolTip.delay: 400
            ToolTip.text: Accessible.name
            }
        }

        Item { width: 1; height: 30; Rectangle { width: 1; height: 24; anchors.verticalCenter: parent.verticalCenter; color: bar.lineColor } }   // separator

        IconButton {
            objectName: "pointerToolButton"
            text: qsTr("Pointer tool")
            tip: text
            glyph: Component { PointerGlyph {} }
            highlighted: app.tool === "select"
            onClicked: app.tool = "select"
        }
        IconButton {
            objectName: "eraserToolButton"
            text: qsTr("Eraser tool")
            tip: app.eraserAvailable || app.tool === "eraser" ? qsTr("Click a cutting plane to remove it") : qsTr("Eraser tool")
            glyph: Component { EraserGlyph {} }
            highlighted: app.tool === "eraser"
            enabled: app.eraserAvailable || app.tool === "eraser"
            onClicked: app.tool = "eraser"
        }
        IconButton {
            objectName: "sprueToolButton"
            text: qsTr("Sprue")
            tip: text
            glyph: Component { SprueGlyph {} }
            highlighted: app.tool === "sprue"
            enabled: app.moldPhase === "complete"
            onClicked: app.tool = app.tool === "sprue" ? "select" : "sprue"
        }

        // The cavity action: "Create Cavity" until the mold exists, then "Rebuild Cavity" (CavityAction.tsx).
        IconButton {
            objectName: "cavityButton"
            text: app.moldPhase === "generating" ? qsTr("Creating Cavity…") : (app.moldPhase === "complete" ? qsTr("Rebuild Cavity") : qsTr("Create Cavity"))
            tip: qsTr("Generate the mold (Ctrl+G)")
            accented: true
            enabled: bar.hasModel && !app.busy && !bar.sessionOpen && app.moldPhase !== "generating"
            onClicked: app.generateMold()
        }
        IconButton {
            objectName: "glassToggleButton"
            visible: app.moldPhase === "complete"
            text: app.moldGlass ? qsTr("Disable glass mold appearance") : qsTr("Enable glass mold appearance")
            tip: text
            glyph: Component { GlassGlyph { glass: app.moldGlass } }
            highlighted: app.moldGlass
            onClicked: app.moldGlass = !app.moldGlass
        }

        IconButton {
            objectName: "masterMoldButton"
            text: qsTr("Master Mold")
            tip: bar.masterMoldTip
            glyph: Component { MasterMoldGlyph {} }
            highlighted: app.masterMold.uiKind === "success"   // the reference's pressed look once the tooling is complete
            enabled: !bar.sessionOpen && app.masterMold.canGenerate === true && app.masterMold.generating !== true
            onClicked: app.generateMasterMold()
        }

        // The pieces list: only when there is tooling to inspect (a blocked-only or failed result is never shown as generated geometry).
        IconButton {
            objectName: "masterPiecesButton"
            visible: app.masterMold.showPieces === true
            text: qsTr("Master Mold pieces")
            tip: text
            glyph: Component { PiecesGlyph {} }
            highlighted: bar.piecesOpen
            onClicked: bar.piecesOpen = !bar.piecesOpen
        }

        Item { width: 1; height: 30; Rectangle { width: 1; height: 24; anchors.verticalCenter: parent.verticalCenter; color: bar.lineColor } }   // the reference's separator

        IconButton {
            objectName: "undoButton"
            text: qsTr("Undo")
            tip: qsTr("Undo (Ctrl+Z)")
            glyph: Component { UndoGlyph {} }
            enabled: app.history.canUndo
            onClicked: app.undo()
        }
        IconButton {
            objectName: "redoButton"
            text: qsTr("Redo")
            tip: qsTr("Redo (Ctrl+Y)")
            glyph: Component { RedoGlyph {} }
            enabled: app.history.canRedo
            onClicked: app.redo()
        }
    }

    // --- the Constructed Cutting Plan session (CuttingSessionPanel.tsx): two icon tabs, the tab's content, then Cancel and Done -----------------------------
    readonly property int planeCount: { let n = 0; for (const f of app.cutFaces) if (f.enabled) ++n; return n }
    Rectangle {
        id: sessionPanel
        objectName: "cuttingSessionPanel"
        visible: bar.sessionOpen
        width: Math.min(300, bar.width)
        x: bar.width - width
        y: bar.barHeight + 6
        height: sessionColumn.implicitHeight + 16
        radius: 6
        color: Qt.rgba(11 / 255, 17 / 255, 24 / 255, 0.96)
        border.width: 1
        border.color: bar.lineColor
        Accessible.role: Accessible.Pane
        Accessible.name: qsTr("Constructed Cutting Plan")
        MouseArea {   // the panel takes the pointer, as the bar does
            anchors.fill: parent
            hoverEnabled: true
            acceptedButtons: Qt.AllButtons
            onWheel: (w) => w.accepted = true
        }
        Column {
            id: sessionColumn
            x: 8; y: 8
            width: parent.width - 16
            spacing: 6

            Row {
                spacing: 4
                IconButton {
                    objectName: "sessionTabCutByFace"
                    text: qsTr("Cutting by Face")
                    tip: text
                    glyph: Component { CutByFaceGlyph {} }
                    highlighted: app.cuttingSession.tab === "cutByFace"
                    enabled: app.cuttingSession.committing !== true
                    onClicked: app.setCuttingSessionTab("cutByFace")
                }
                IconButton {
                    objectName: "sessionTabSegmentation"
                    text: qsTr("Segmentation")
                    tip: text
                    glyph: Component { SegmentationGlyph {} }
                    highlighted: app.cuttingSession.tab === "segmentation"
                    enabled: app.cuttingSession.committing !== true
                    onClicked: app.setCuttingSessionTab("segmentation")
                }
            }
            Rectangle { width: parent.width; height: 1; color: bar.lineColor }

            // Cutting by Face: the planes are chosen on the part's box (or in the inspector); the tab shows how many.
            Row {
                visible: app.cuttingSession.tab === "cutByFace"
                spacing: 8
                Rectangle {
                    objectName: "sessionPlaneCount"
                    readonly property int planes: bar.planeCount
                    width: Math.max(24, countText.implicitWidth + 12); height: 24
                    radius: 4
                    color: Qt.rgba(1, 1, 1, 0.07)
                    Accessible.role: Accessible.StaticText
                    Accessible.name: planes === 1 ? qsTr("1 split plane") : qsTr("%1 split planes").arg(planes)
                    Text { id: countText; anchors.centerIn: parent; text: parent.planes; font.pixelSize: 12; color: "#f7f9fb" }
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: qsTr("Click a face of the part's box to cut by it")
                    font.pixelSize: 11
                    color: "#8a8f98"
                }
            }

            // Segmentation: one extension plane per axis the plan did not use (AxisExtensionPicker.tsx).
            Column {
                visible: app.cuttingSession.tab === "segmentation"
                width: parent.width
                spacing: 6
                Row {
                    spacing: 4
                    Repeater {
                        model: ["x", "y", "z"]
                        delegate: IconButton {
                            required property string modelData
                            readonly property bool extended: { const e = app.segmentation.extensions || []; for (let i = 0; i < e.length; ++i) if (e[i].axis === modelData) return true; return false }
                            // "required" holds the plan's own axes and the extensions': an axis the plan used is one that is neither free nor an extension.
                            readonly property bool algorithmUsed: !extended && (app.segmentation.availableAxes || []).indexOf(modelData) < 0
                            objectName: "sessionAxis:" + modelData
                            text: modelData.toUpperCase()
                            tip: algorithmUsed ? qsTr("%1 is already used by the segmentation plan").arg(text)
                                 : extended ? qsTr("%1 already has an extension plane -- click again to remove it").arg(text)
                                 : qsTr("Add a %1 extension plane").arg(text)
                            Accessible.name: qsTr("%1 axis").arg(text)
                            highlighted: extended
                            enabled: !algorithmUsed && app.segmentation.phase === "planned" && app.cuttingSession.committing !== true
                            onClicked: extended ? app.removeSegmentationExtension(modelData) : app.addSegmentationExtension(modelData)
                        }
                    }
                }
                Text {
                    objectName: "sessionSegmentationNote"
                    width: parent.width
                    wrapMode: Text.Wrap
                    font.pixelSize: 11
                    readonly property bool problem: app.segmentation.phase === "failed" || app.segmentation.valid === false
                    text: problem ? (app.segmentation.message || qsTr("The plan is not valid."))
                                  : (app.segmentation.sectionCount !== undefined ? qsTr("%1 section(s)").arg(app.segmentation.sectionCount) : (app.segmentation.message || ""))
                    visible: text !== ""
                    color: problem ? "#e5484d" : "#8a8f98"
                }
            }
            Rectangle { width: parent.width; height: 1; color: bar.lineColor }

            Row {
                spacing: 6
                IconButton {
                    objectName: "sessionCancel"
                    width: (sessionColumn.width - 6) / 2
                    text: qsTr("Cancel")
                    tip: qsTr("Close the session and put the cuts back as they were")
                    enabled: app.cuttingSession.committing !== true
                    onClicked: app.cancelCuttingSession()
                }
                IconButton {
                    objectName: "sessionDone"
                    width: (sessionColumn.width - 6) / 2
                    text: qsTr("Done")
                    accented: true
                    readonly property bool segmentationTab: app.cuttingSession.tab === "segmentation"
                    readonly property bool ready: segmentationTab ? (app.segmentation.phase === "planned" && app.segmentation.valid === true) : bar.planeCount > 0
                    tip: segmentationTab && app.segmentation.phase === "planned" && app.segmentation.valid === false
                         ? qsTr("The current extension plane position is invalid -- move it to a valid location before committing.")
                         : (segmentationTab ? qsTr("Cut the mold into these sections") : qsTr("Keep these cutting planes"))
                    enabled: app.cuttingSession.committing !== true && ready
                    onClicked: app.commitCuttingSession()
                }
            }
            Text {
                objectName: "sessionBlockedReason"
                visible: app.cuttingSession.blockedReason !== ""
                width: parent.width
                text: app.cuttingSession.blockedReason
                wrapMode: Text.Wrap
                font.pixelSize: 12
                color: "#e5484d"
                Accessible.role: Accessible.AlertMessage
            }
        }
    }
}