import { CanvasTexture, SRGBColorSpace } from "three";

export type RulerLabelTexture = {
  readonly texture: CanvasTexture;
  readonly aspect: number;
};

export function createRulerLabelTexture(text: string): RulerLabelTexture {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (context === null) {
    return { texture: new CanvasTexture(canvas), aspect: 1 };
  }

  const fontSize = 32;
  const padding = 4;
  const font = `600 ${fontSize}px system-ui, sans-serif`;

  context.font = font;
  const textWidth = Math.max(1, Math.ceil(context.measureText(text).width));

  canvas.width = textWidth + padding * 2;
  canvas.height = fontSize + padding * 2;

  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  return {
    texture,
    aspect: canvas.width / canvas.height,
  };
}
