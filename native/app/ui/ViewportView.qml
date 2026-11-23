import QtQuick
import QtQuick3D
import QtQuick.Controls

// The 3D viewport. All geometry arrives as Qt Quick 3D geometry objects built
// by the C++ MeshGeometryAdapter from canonical millimeter / Z-up data; the
// scene is not rotated or rescaled, so a rendered coordinate is the
// engineering coordinate.
Item {
    id: root
    property bool dark: app.theme === "dark"
    property var style: app.selectionStyle      // highlight, selection box and overlay colours (one source: C++)
    property var look: app.viewLook             // background, grid, edge style and lighting rig of the reference (one source: C++)
    property var sprue: app.sprueStyle          // Sprue preview colours and the mold glass look (one source: C++)
    property bool interacted: false             // the first press or wheel in the viewport hides the hint badge, once per session
    property bool overPart: false               // the pointer is over the part or its selection box (pointer cursor)
    property bool gizmoPress: false             // a press that landed on a sprue ring: this gesture belongs to the gizmo
    property bool swallowRelease: false         // the release that ends a double click the gizmo handled is not a click
    property bool planeDrag: false              // a right-button press that landed on a cutting plane: the gesture drags that plane
    property bool scaleDrag: false              // a left press under the Mold Scale tool: the gesture changes the clearance, not the camera
    clip: true

    // The background is a plain rectangle under a transparent 3D view: Qt tone maps the clear colour, which would turn the
    // reference's background (#0b1118 / #f7f9fb) into a different colour, while the reference's background is not tone mapped.
    Rectangle { anchors.fill: parent; color: root.look.background }

    View3D {
        id: view
        anchors.fill: parent
        camera: camera
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Transparent
            tonemapMode: SceneEnvironment.TonemapModeAces   // the reference renders with ACES filmic tone mapping
            antialiasingMode: SceneEnvironment.MSAA
            antialiasingQuality: SceneEnvironment.High
        }

        PerspectiveCamera {
            id: camera
            position: app.camera.position
            rotation: app.camera.rotation
            fieldOfView: app.camera.fieldOfView
            fieldOfViewOrientation: PerspectiveCamera.Vertical
            clipNear: app.camera.clipNear
            clipFar: app.camera.clipFar
        }

        // The reference's five-point rig, fixed in the world (key, fill, rim, and the sky half of the hemisphere light); the
        // ambient and the hemisphere's mean arrive as the ambient colour of the first light.
        Repeater3D {
            model: root.look.lights
            delegate: DirectionalLight {
                required property int index
                required property var modelData
                rotation: modelData.rotation
                color: modelData.color
                brightness: modelData.brightness
                ambientColor: index === 0 ? root.look.ambientColor : "black"
            }
        }

        // Engineering grid on Z = 0 (minor + major).
        Model {
            visible: app.showGrid
            geometry: app.gridMinorGeometry
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: root.look.gridMinorColor
                opacity: root.look.gridMinorOpacity
            }
        }
        Model {
            visible: app.showGrid
            geometry: app.gridMajorGeometry
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: root.look.gridMajorColor
                opacity: root.look.gridMajorOpacity
            }
        }
        // The ground-plane ruler (the Axes option): the two axes and a tick across them at every minor step, the axes in the
        // major grid colour and the ticks in the minor one, and numbered labels that always face the camera. Like the reference
        // the labels are depth tested against the part (a part in front of a label hides it).
        Model {
            visible: app.showAxes
            geometry: app.rulerAxesGeometry
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: root.look.gridMajorColor
                opacity: root.look.rulerAxisOpacity
            }
        }
        Model {
            visible: app.showAxes
            geometry: app.rulerTicksGeometry
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: root.look.gridMinorColor
                opacity: root.look.rulerTickOpacity
            }
        }
        Repeater3D {
            model: app.showAxes ? app.rulerLabels : []
            delegate: Model {
                required property var modelData
                source: "#Rectangle"
                pickable: false
                position: modelData.position
                scale: modelData.scale
                rotation: app.camera.rotation      // the label faces the camera
                materials: PrincipledMaterial {
                    lighting: PrincipledMaterial.NoLighting
                    baseColor: root.look.rulerLabelColor
                    // The texture is white text on transparent: its alpha channel is the glyph coverage.
                    opacityMap: Texture {
                        source: modelData.source
                        generateMipmaps: true
                        mipFilter: Texture.Linear
                        minFilter: Texture.Linear
                        magFilter: Texture.Linear
                    }
                    opacityChannel: Material.A
                    alphaMode: PrincipledMaterial.Blend
                    cullMode: Material.NoCulling
                }
            }
        }

        Model {
            geometry: app.measureLineGeometry
            materials: DefaultMaterial { lighting: DefaultMaterial.NoLighting; diffuseColor: "#ffb224" }
        }

        // The selected part's dashed bounding box, the box face under the pointer, and the faces chosen for Cut by
        // Face. All three are built in scene coordinates by the controller (see AppControllerSelection.cpp).
        Model {
            visible: app.selectionBox.visible
            geometry: app.selectionBoxGeometry
            pickable: false
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: root.style.boxColor
                opacity: root.style.boxOpacity
            }
        }
        Model {
            visible: app.selectionBox.visible && app.selectionBox.hoverFace !== ""
            geometry: app.hoverFaceGeometry
            pickable: false
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: root.style.boxColor
                opacity: root.style.hoverOpacity
                cullMode: Material.NoCulling
            }
        }
        Model {
            visible: app.selectionBox.visible && app.selectionBox.selectedFaces.length > 0
            geometry: app.selectedFacesGeometry
            pickable: false
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: root.style.boxColor
                opacity: root.style.selectedOpacity
                cullMode: Material.NoCulling
            }
        }

        // The Sprue tool's 3D preview at the pointer: funnel, main stem and entry neck in one mesh, green when the axis
        // reaches the cavity and red when it does not (built in scene coordinates by the controller).
        Model {
            visible: app.sprueCandidate.onTopFace === true
            geometry: app.spruePreviewGeometry
            pickable: false
            materials: PrincipledMaterial {
                baseColor: app.sprueCandidate.valid ? root.sprue.validColor : root.sprue.invalidColor
                metalness: root.sprue.metalness
                roughness: root.sprue.roughness
                opacity: root.sprue.opacity
                alphaMode: PrincipledMaterial.Blend
                depthDrawMode: Material.AlwaysDepthDraw   // the reference keeps depthWrite on for the preview
            }
        }

        // The Cut by Face planes as thin translucent slabs with their edges: amber, red under the Eraser.
        Repeater3D {
            model: app.cutPlaneSlabs
            delegate: Node {
                required property vector3d slabCenter
                required property vector3d slabSize
                required property color slabColor
                required property real slabSurfaceOpacity
                required property real slabEdgeOpacity
                position: slabCenter
                Model {
                    source: "#Cube"                       // 100 units: scaled to the slab
                    pickable: false
                    scale: Qt.vector3d(slabSize.x / 100, slabSize.y / 100, slabSize.z / 100)
                    materials: DefaultMaterial {
                        lighting: DefaultMaterial.NoLighting
                        diffuseColor: slabColor
                        opacity: slabSurfaceOpacity
                        cullMode: Material.NoCulling
                        depthDrawMode: Material.NeverDepthDraw
                    }
                }
                Model {
                    geometry: app.cutPlaneEdgeGeometry    // the unit box edges
                    pickable: false
                    scale: slabSize
                    materials: DefaultMaterial {
                        lighting: DefaultMaterial.NoLighting
                        diffuseColor: slabColor
                        opacity: slabEdgeOpacity
                    }
                }
            }
        }

        // One surface model (+ optional feature-edge overlay) per scene row.
        Repeater3D {
            model: app.scene
            delegate: Node {
                required property string itemKind
                required property color itemColor
                required property bool itemVisible
                required property vector3d itemOffset
                required property var itemGeometry
                required property var itemEdgeGeometry
                required property bool itemSelected
                required property var itemGlassEdgeGeometry
                required property bool itemGizmoHidden
                required property bool itemGhost
                required property bool itemRoleColors
                position: itemOffset
                visible: itemVisible && !itemGizmoHidden   // a hovered sprue ring hides the bodies it cuts

                Model {
                    geometry: itemGeometry
                    pickable: false
                    materials: PrincipledMaterial {
                        // The faces of a cavity, a registration key or a sprue funnel carry their role's colour in the vertices (D-112);
                        // the glass appearance draws every role as the outer mold's glass instead.
                        vertexColorsEnabled: itemRoleColors && !app.moldGlass
                        // A selected part takes the highlight colour and a faint emissive glow, like the reference.
                        baseColor: itemSelected ? root.style.highlightColor : itemColor
                        emissiveFactor: itemSelected ? root.style.highlightEmissive : Qt.vector3d(0, 0, 0)
                        metalness: itemKind === "mold-body" && app.moldGlass ? root.look.glass.metalness : root.look.metalness
                        roughness: itemSelected ? Math.min(root.look.roughness, root.style.highlightRoughness)
                                                : itemKind === "mold-body" && app.moldGlass ? root.look.glass.roughness : root.look.roughness
                        cullMode: Material.NoCulling
                        // While the Sprue tool is active the mold bodies turn to glass (0.28) so the preview shows through; the glass appearance
                        // is the same idea at the reference's 0.3. Otherwise the mold opacity slider decides.
                        // A stale Master Mold piece is a ghosted holdover: never more opaque than 0.2, whatever the appearance mode.
                        opacity: itemKind === "mold-body" ? Math.min(app.sprueGlass ? root.sprue.glassOpacity : app.moldGlass ? root.look.glass.opacity : app.moldOpacity, itemGhost ? root.look.staleMasterOpacity : 1.0) : 1.0
                        alphaMode: itemKind === "mold-body" && (app.sprueGlass || app.moldGlass || app.moldOpacity < 1 || itemGhost)
                                   ? PrincipledMaterial.Blend : PrincipledMaterial.Opaque
                    }
                }
                Model {
                    visible: app.sprueGlass && itemKind === "mold-body" && itemGlassEdgeGeometry !== null
                    geometry: itemGlassEdgeGeometry
                    pickable: false
                    materials: DefaultMaterial {
                        lighting: DefaultMaterial.NoLighting
                        diffuseColor: root.sprue.glassEdgeColor
                        opacity: root.sprue.glassEdgeOpacity
                    }
                }
                Model {
                    visible: app.showEdges && itemEdgeGeometry !== null    // mold bodies only: the reference does not outline the part
                    geometry: itemEdgeGeometry
                    materials: DefaultMaterial {
                        lighting: DefaultMaterial.NoLighting
                        diffuseColor: root.look.edgeColor
                        opacity: root.look.edgeOpacity
                    }
                }
            }
        }
    }

    // The sprue resize rings. A second, transparent View3D with the same camera draws them over the scene, which is what
    // the reference's depthTest:false + renderOrder 20 does: a ring at the cavity stays visible behind the mold.
    View3D {
        id: gizmoView
        anchors.fill: parent
        visible: app.sprueGizmo.active
        camera: gizmoCamera
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Transparent
            antialiasingMode: SceneEnvironment.MSAA
            antialiasingQuality: SceneEnvironment.High
        }
        PerspectiveCamera {
            id: gizmoCamera
            position: app.camera.position
            rotation: app.camera.rotation
            fieldOfView: app.camera.fieldOfView
            fieldOfViewOrientation: PerspectiveCamera.Vertical
            clipNear: app.camera.clipNear
            clipFar: app.camera.clipFar
        }
        Repeater3D {
            model: app.sprueHandles
            delegate: Node {
                required property vector3d handlePosition
                required property quaternion handleRotation
                required property var handleGeometry
                required property color handleColor
                required property real handleOpacity
                required property real handleVisualScale
                required property real handleGroupScale
                position: handlePosition
                rotation: handleRotation
                scale: Qt.vector3d(handleGroupScale, handleGroupScale, 1)   // the drag preview scales the ring in its plane
                Model {
                    geometry: handleGeometry
                    pickable: false
                    scale: Qt.vector3d(handleVisualScale, handleVisualScale, handleVisualScale)
                    materials: DefaultMaterial {
                        lighting: DefaultMaterial.NoLighting
                        diffuseColor: handleColor
                        opacity: handleOpacity
                    }
                }
            }
        }
    }

    // Orbit (left), pan (right/middle), zoom (wheel), pick on click.
    MouseArea {
        id: mouse
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
        property real lastX: 0
        property real lastY: 0
        property real pressX: 0
        property real pressY: 0
        property bool moved: false
        onPressed: (e) => {
            root.interacted = true
            lastX = pressX = e.x; lastY = pressY = e.y; moved = false
            // A press on a sprue ring starts resizing it instead of orbiting (and is never a click that places a sprue).
            root.gizmoPress = e.button === Qt.LeftButton && app.tool === "sprue" && app.sprueGizmoPressAt(e.x, e.y, width, height)
            // A right-button press on a cutting plane drags the plane instead of panning (not under the Eraser).
            root.planeDrag = e.button === Qt.RightButton && !root.gizmoPress && app.cutPlaneDragBegin(e.x, e.y, width, height)
            // Mold Scale: a left press starts a clearance drag (moldScaleRuntime.ts); the camera does not move.
            root.scaleDrag = e.button === Qt.LeftButton && app.tool === "mold-scale" && app.moldScaleBegin()
        }
        onCanceled: {
            if (root.scaleDrag) { root.scaleDrag = false; app.moldScaleCancel() }
            if (root.gizmoPress) { root.gizmoPress = false; app.sprueGizmoCancel() }
            if (root.planeDrag) { root.planeDrag = false; app.cutPlaneDragCancel() }
        }
        onDoubleClicked: (e) => {
            if (app.tool !== "sprue" || e.button !== Qt.LeftButton) return
            // The press that belongs to this double click already started a resize (no movement yet): drop it.
            if (root.gizmoPress && app.sprueGizmo.dragging) app.sprueGizmoCancel()
            const info = app.sprueGizmoEditAt(e.x, e.y, width, height)
            if (info.operationId) {
                gizmoEditor.openFor(info, e.x, e.y)
                root.swallowRelease = true   // the reference stops the event: the click part must not place a sprue
            }
        }
        hoverEnabled: true
        property real hoverX: 0
        property real hoverY: 0
        // The Sprue tool shows the reference's funnel cursor (a horizontal-resize cursor over a ring); the Select tool a
        // pointing hand over the part.
        property string cursorName: app.cutPlanes.cursor ? app.cutPlanes.cursor   // over a cutting plane: an open hand, a closed one while dragging it
                                  : app.tool === "sprue" ? (app.sprueGizmo.active ? app.sprueGizmo.cursor : "cross")
                                  : app.tool === "mold-scale" ? (app.moldScaleDragging ? "grabbing" : "grab")
                                  : app.tool === "eraser" ? "eraser"
                                  : (app.tool === "select" && root.overPart ? "hand" : "arrow")
        onCursorNameChanged: app.applyViewportCursor(mouse, cursorName)
        Component.onCompleted: app.applyViewportCursor(mouse, cursorName)
        // Hover picking runs at most every 33 ms: it raycasts the part, which is linear in its triangle count.
        Timer {
            id: hoverTimer
            interval: 33
            onTriggered: {
                if (app.tool === "eraser") app.eraserHoverAt(mouse.hoverX, mouse.hoverY, mouse.width, mouse.height)
                else root.overPart = app.hoverAt(mouse.hoverX, mouse.hoverY, mouse.width, mouse.height)
            }
        }
        // The Sprue preview is throttled the same way (the reference coalesces pointer moves to one per frame).
        Timer {
            id: sprueTimer
            interval: 16
            // Over a ring the pointer belongs to the gizmo and there is no placement preview.
            onTriggered: { if (!app.sprueGizmoHoverAt(mouse.hoverX, mouse.hoverY, mouse.width, mouse.height)) app.previewSprueAt(mouse.hoverX, mouse.hoverY, mouse.width, mouse.height) }
        }
        onExited: { hoverTimer.stop(); sprueTimer.stop(); app.clearHover(); app.clearSprueCandidate(); app.sprueGizmoLeave(); app.eraserLeave(); app.cutPlaneLeave(); root.overPart = false }
        onPositionChanged: (e) => {
            if (root.scaleDrag) { app.moldScaleDragBy(e.x - pressX); return }   // the pointer drives the clearance: 0.1 mm per pixel
            if (root.planeDrag) {   // dragging a cutting plane: the pointer drives the plane, not the camera
                app.cutPlaneDragTo(e.x, e.y, width, height)
                return
            }
            app.cutPlaneHoverAt(e.x, e.y, width, height)   // a plane under the pointer brightens (not under the Eraser)
            if (root.gizmoPress) {   // resizing a ring: the pointer drives the diameter, not the camera
                if (app.sprueGizmo.dragging) {
                    app.sprueGizmoDragTo(e.x, e.y, (e.modifiers & Qt.ShiftModifier) !== 0)
                    gizmoLabel.place(e.x, e.y)
                }
                return
            }
            if (app.tool === "sprue") {
                if (e.buttons === 0) { hoverX = e.x; hoverY = e.y; if (!sprueTimer.running) sprueTimer.start() }
                else { sprueTimer.stop(); app.clearSprueCandidate() }  // dragging orbits/pans: the preview hides
            }
            if (app.tool === "eraser") {
                if (e.buttons === 0) { hoverX = e.x; hoverY = e.y; if (!hoverTimer.running) hoverTimer.start() }
                else { hoverTimer.stop(); app.eraserLeave() }   // orbiting/panning: no hover
            }
            if (app.tool === "select") {
                if (e.buttons === 0) { hoverX = e.x; hoverY = e.y; if (!hoverTimer.running) hoverTimer.start() }
                else { hoverTimer.stop(); app.clearHover(); root.overPart = false }  // dragging orbits/pans: no hover
            }
            const dx = e.x - lastX, dy = e.y - lastY
            lastX = e.x; lastY = e.y
            const t = root.style.clickDragThresholdPx   // the reference's rule: Euclidean distance beyond 4 px
            if ((e.x - pressX) * (e.x - pressX) + (e.y - pressY) * (e.y - pressY) > t * t) moved = true
            if (e.buttons & Qt.LeftButton) app.camera.orbitByPixels(dx, dy, height)
            else if (e.buttons & (Qt.RightButton | Qt.MiddleButton)) app.camera.panByPixels(dx, dy, height)
        }
        onReleased: (e) => {
            const swallow = root.swallowRelease
            root.swallowRelease = false
            if (root.scaleDrag && e.button === Qt.LeftButton) { root.scaleDrag = false; app.moldScaleEnd(); return }   // one undo step
            if (root.planeDrag && e.button === Qt.RightButton) { root.planeDrag = false; app.cutPlaneDragEnd(); return }   // commits when it moved
            if (root.gizmoPress) { root.gizmoPress = false; app.sprueGizmoRelease(); return }   // commits when the diameter changed
            if (swallow) return
            if (!moved && e.button === Qt.LeftButton) app.pickAt(e.x, e.y, width, height)
        }
        onWheel: (w) => { root.interacted = true; app.camera.zoomByWheel(w.angleDelta.y) }
    }

    // The floating model toolbar of the reference (upper centre): Flip, mold scale, the tools, the cavity, Master Mold, undo and redo.
    ViewportToolbar { id: toolbar }
    MoldScaleEditor { anchors.horizontalCenter: parent.horizontalCenter; y: toolbar.y + toolbar.height + 8 }

    // The diameter label (7.00 mm with the diameter sign) next to the pointer while a ring is dragged; it takes the
    // warning colour at either limit.
    Rectangle {
        id: gizmoLabel
        visible: app.sprueGizmo.labelVisible
        x: 6; y: 6
        width: gizmoLabelText.implicitWidth + 14; height: gizmoLabelText.implicitHeight + 6
        radius: 4
        color: root.dark ? "#1f242a" : "#f4f6f8"
        border.color: root.dark ? "#3a424b" : "#c3cad2"
        Label {
            id: gizmoLabelText
            anchors.centerIn: parent
            text: app.sprueGizmo.labelText
            font.family: "monospace"; font.pixelSize: 12
            color: app.sprueGizmo.labelWarns ? "#d18b24" : (root.dark ? "#e6e9ec" : "#1b1f24")
        }
        function place(px, py) {
            x = Math.max(6, Math.min(root.width - 110, px + 12))
            y = Math.max(6, Math.min(root.height - 34, py - 28))
        }
    }

    // Double click on a ring: type a diameter. Enter commits, Escape or leaving the field cancels.
    Popup {
        id: gizmoEditor
        parent: root
        visible: app.sprueGizmo.editing
        closePolicy: Popup.NoAutoClose
        padding: 4
        function openFor(info, px, py) {
            editorField.text = info.text
            x = Math.max(6, Math.min(root.width - 110, px + 12))
            y = Math.max(6, Math.min(root.height - 34, py - 28))
        }
        onOpened: { editorField.forceActiveFocus(); editorField.selectAll() }
        contentItem: Column {
            spacing: 4
            TextField {
                id: editorField
                width: 92
                font.family: "monospace"; font.pixelSize: 12
                inputMethodHints: Qt.ImhFormattedNumbersOnly
                selectByMouse: true
                color: app.sprueGizmo.editError !== "" ? "#e5484d" : palette.text
                onAccepted: app.sprueGizmoCommitEdit(text)
                Keys.onEscapePressed: app.sprueGizmoCancel()
                onActiveFocusChanged: { if (!activeFocus && app.sprueGizmo.editing) app.sprueGizmoCloseEditor() }
            }
            Label {
                visible: app.sprueGizmo.editError !== ""
                text: app.sprueGizmo.editError
                width: 160
                wrapMode: Text.Wrap
                font.pixelSize: 11
                color: "#e5484d"
            }
        }
    }

    onWidthChanged: app.camera.setViewportSize(width, height)
    onHeightChanged: app.camera.setViewportSize(width, height)

    // The interaction hint of the reference (Viewport.tsx showHint, .hint): bottom right, until the first press or wheel in the
    // viewport, while a model is loaded and nothing is busy. Colours are the reference's theme tokens (panel at 84 %, subtle
    // border, muted text).
    Rectangle {
        objectName: "interactionHint"
        visible: app.modelPhase === "ready" && !root.interacted && !app.busy
        anchors { right: parent.right; bottom: parent.bottom; margins: 16 }
        width: hintText.implicitWidth + 24
        height: hintText.implicitHeight + 16
        radius: 6
        border.width: 1
        border.color: root.dark ? "#202832" : "#d8e0e8"
        color: root.dark ? Qt.rgba(0x11 / 255, 0x18 / 255, 0x21 / 255, 0.84) : Qt.rgba(1, 1, 1, 0.84)
        Label {
            id: hintText
            anchors.centerIn: parent
            text: qsTr("Left drag Rotate \u00b7 Right drag Pan \u00b7 Wheel Zoom")
            font.pixelSize: 13
            color: root.dark ? "#8795a3" : "#647281"
        }
    }
    Label {
        objectName: "emptyHint"
        anchors.centerIn: parent
        visible: app.modelPhase === "empty"
        text: qsTr("Open an STL file to begin (Ctrl+O)")
        color: root.dark ? "#8a949e" : "#5d6872"
        font.pixelSize: 16
    }
    Label {
        anchors { left: parent.left; bottom: parent.bottom; margins: 8 }
        color: root.dark ? "#8a949e" : "#5d6872"
        font.pixelSize: 11
        text: "mm · Z-up   grid " + app.gridInfo.minorStep + " / " + app.gridInfo.majorStep + " mm"
    }
}
