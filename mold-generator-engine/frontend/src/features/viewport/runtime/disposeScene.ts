import {
  BufferGeometry,
  Material,
  Object3D,
  Texture,
  type Object3DEventMap,
} from "three";

type DisposableObject = Object3D<Object3DEventMap> & {
  geometry?: BufferGeometry;
  material?: Material | Material[];
};

function disposeMaterial(material: Material) {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) {
      value.dispose();
    }
  }

  material.dispose();
}

export function disposeScene(root: Object3D) {
  root.traverse((object) => {
    const disposable = object as DisposableObject;

    disposable.geometry?.dispose();

    if (Array.isArray(disposable.material)) {
      disposable.material.forEach(disposeMaterial);
      return;
    }

    disposable.material?.dispose();
  });
}
