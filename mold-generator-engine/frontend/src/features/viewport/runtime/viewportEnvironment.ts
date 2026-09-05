import { PMREMGenerator, Scene, Texture, WebGLRenderer } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export interface ViewportEnvironment {
  readonly texture: Texture;
  dispose(): void;
}

/**
 * Creates a lightweight, procedural in-memory studio PMREM environment texture.
 *
 * Provides soft curvature reflections and ambient environmental specular response
 * without any external HDRI asset downloads or network requests.
 */
export function createViewportEnvironment(
  renderer: WebGLRenderer,
  scene: Scene,
): ViewportEnvironment {
  if (!("capabilities" in renderer)) {
    return {
      texture: {} as Texture,
      dispose: () => undefined,
    };
  }

  try {
    const pmremGenerator = new PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const roomEnv = new RoomEnvironment();
    const envTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;

    scene.environment = envTexture;
    scene.environmentIntensity = 0.55;

    roomEnv.dispose();
    pmremGenerator.dispose();

    return {
      texture: envTexture,
      dispose: () => {
        if (scene.environment === envTexture) {
          scene.environment = null;
        }
        envTexture.dispose();
      },
    };
  } catch {
    return {
      texture: {} as Texture,
      dispose: () => undefined,
    };
  }
}
