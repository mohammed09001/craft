import { Vector2 } from "three";

export const CLICK_DRAG_THRESHOLD_PX = 4;

export type PointerClientPoint = {
  clientX: number;
  clientY: number;
};

export type ViewportRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PointerGesture = {
  button: number;
  clientX: number;
  clientY: number;
  isDrag: boolean;
  pointerId: number;
};

export function normalizePointerToNdc(
  point: PointerClientPoint,
  rect: ViewportRect,
  target = new Vector2(),
) {
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  target.set(
    ((point.clientX - rect.left) / rect.width) * 2 - 1,
    -((point.clientY - rect.top) / rect.height) * 2 + 1,
  );

  return target;
}

export function createPointerGesture(
  event: Pick<PointerEvent, "button" | "clientX" | "clientY" | "pointerId">,
): PointerGesture {
  return {
    button: event.button,
    clientX: event.clientX,
    clientY: event.clientY,
    isDrag: false,
    pointerId: event.pointerId,
  };
}

export function updatePointerGesture(
  gesture: PointerGesture,
  point: PointerClientPoint,
  thresholdPx = CLICK_DRAG_THRESHOLD_PX,
) {
  const distanceX = point.clientX - gesture.clientX;
  const distanceY = point.clientY - gesture.clientY;
  const movedBeyondThreshold =
    distanceX * distanceX + distanceY * distanceY > thresholdPx * thresholdPx;

  if (movedBeyondThreshold) {
    gesture.isDrag = true;
  }

  return gesture;
}

export function isClickCandidate(gesture: PointerGesture) {
  return !gesture.isDrag;
}
