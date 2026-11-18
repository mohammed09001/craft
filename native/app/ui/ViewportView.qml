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
    property var sprue: app.sprueStyle          // Sprue preview colours and the mold glass look (one source: C++)
    property bool overPart: false               // the pointer is over the part or its selection box (pointer cursor)
    clip: true

    View3D {
        id: view
        anchors.fill: parent
        camera: camera
        environment: SceneEnvironment {
            clearColor: root.style.background
            backgroundMode: SceneEnvironment.Color
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

        DirectionalLight { rotation: app.camera.rotation; brightness: 1.1; ambientColor: "#555a60" }
        DirectionalLight { eulerRotation.x: -35; eulerRotation.y: 140; brightness: 0.5 }

        // Engineering grid on Z = 0 (minor + major).
        Model {
            visible: app.showGrid
            geometry: app.gridMinorGeometry
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: root.dark ? "#2e353d" : "#cdd3da"
            }
        }
        Model {
            visible: app.showGrid
            geometry: app.gridMajorGeometry
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: root.dark ? "#4a545f" : "#a8b0b9"
            }
        }
        // Axes: X red, Y green, Z blue.
        Model { visible: app.showAxes; geometry: app.axisXGeometry
            materials: DefaultMaterial { lighting: DefaultMaterial.NoLighting; diffuseColor: "#e5484d" } }
        Model { visible: app.showAxes; geometry: app.axisYGeometry
            materials: DefaultMaterial { lighting: DefaultMaterial.NoLighting; diffuseColor: "#46a758" } }
        Model { visible: app.showAxes; geometry: app.axisZGeometry
            materials: DefaultMaterial { lighting: DefaultMaterial.NoLighting; diffuseColor: "#3e63dd" } }

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
                position: itemOffset
                visible: itemVisible

                Model {
                    geometry: itemGeometry
                    pickable: false
                    materials: PrincipledMaterial {
                        // A selected part takes the highlight colour and a faint emissive glow, like the reference.
                        baseColor: itemSelected ? root.style.highlightColor : itemColor
                        emissiveFactor: itemSelected ? root.style.highlightEmissive : Qt.vector3d(0, 0, 0)
                        metalness: 0.05
                        roughness: itemSelected ? Math.min(0.6, root.style.highlightRoughness) : 0.6
                        cullMode: Material.NoCulling
                        // While the Sprue tool is active the mold bodies turn to glass (0.28) so the preview shows through.
                        opacity: itemKind === "mold-body" ? (app.sprueGlass ? root.sprue.glassOpacity : app.moldOpacity) : 1.0
                        alphaMode: itemKind === "mold-body" && (app.sprueGlass || app.moldOpacity < 1)
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
                    visible: app.showEdges
                    geometry: itemEdgeGeometry
                    materials: DefaultMaterial {
                        lighting: DefaultMaterial.NoLighting
                        diffuseColor: root.dark ? "#0d1014" : "#2b3138"
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
        onPressed: (e) => { lastX = pressX = e.x; lastY = pressY = e.y; moved = false }
        hoverEnabled: true
        property real hoverX: 0
        property real hoverY: 0
        cursorShape: app.tool === "sprue" ? Qt.CrossCursor
                   : (app.tool === "select" && root.overPart ? Qt.PointingHandCursor : Qt.ArrowCursor)
        // Hover picking runs at most every 33 ms: it raycasts the part, which is linear in its triangle count.
        Timer {
            id: hoverTimer
            interval: 33
            onTriggered: root.overPart = app.hoverAt(mouse.hoverX, mouse.hoverY, mouse.width, mouse.height)
        }
        // The Sprue preview is throttled the same way (the reference coalesces pointer moves to one per frame).
        Timer {
            id: sprueTimer
            interval: 16
            onTriggered: app.previewSprueAt(mouse.hoverX, mouse.hoverY, mouse.width, mouse.height)
        }
        onExited: { hoverTimer.stop(); sprueTimer.stop(); app.clearHover(); app.clearSprueCandidate(); root.overPart = false }
        onPositionChanged: (e) => {
            if (app.tool === "sprue") {
                if (e.buttons === 0) { hoverX = e.x; hoverY = e.y; if (!sprueTimer.running) sprueTimer.start() }
                else { sprueTimer.stop(); app.clearSprueCandidate() }  // dragging orbits/pans: the preview hides
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
            if (!moved && e.button === Qt.LeftButton) app.pickAt(e.x, e.y, width, height)
        }
        onWheel: (w) => app.camera.zoomByWheel(w.angleDelta.y)
    }

    onWidthChanged: app.camera.setViewportSize(width, height)
    onHeightChanged: app.camera.setViewportSize(width, height)

    Label {
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
