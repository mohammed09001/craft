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
    clip: true

    View3D {
        id: view
        anchors.fill: parent
        camera: camera
        environment: SceneEnvironment {
            clearColor: root.dark ? "#1b1f24" : "#e9edf1"
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
                position: itemOffset
                visible: itemVisible

                Model {
                    geometry: itemGeometry
                    pickable: false
                    materials: PrincipledMaterial {
                        baseColor: itemColor
                        metalness: 0.05
                        roughness: 0.6
                        cullMode: Material.NoCulling
                        opacity: itemKind === "mold-body" ? app.moldOpacity : 1.0
                        alphaMode: itemKind === "mold-body" && app.moldOpacity < 1
                                   ? PrincipledMaterial.Blend : PrincipledMaterial.Opaque
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
        onPositionChanged: (e) => {
            const dx = e.x - lastX, dy = e.y - lastY
            lastX = e.x; lastY = e.y
            if (Math.abs(e.x - pressX) + Math.abs(e.y - pressY) > 4) moved = true
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
