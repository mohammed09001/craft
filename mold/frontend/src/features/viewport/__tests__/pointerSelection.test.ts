import { Vector2 } from "three";

import {
  CLICK_DRAG_THRESHOLD_PX,
  createPointerGesture,
  isClickCandidate,
  normalizePointerToNdc,
  shouldIgnoreEscape,
  updatePointerGesture,
} from "@/features/viewport/runtime/pointerSelection";

it("normalizes pointer coordinates with canvas rect offsets", () => {
  const target = new Vector2();
  const result = normalizePointerToNdc(
    { clientX: 150, clientY: 90 },
    { left: 50, top: 40, width: 200, height: 100 },
    target,
  );

  expect(result).toBe(target);
  expect(target.x).toBe(0);
  expect(target.y).toBe(0);
});

it("rejects zero-sized viewport rects", () => {
  expect(
    normalizePointerToNdc(
      { clientX: 10, clientY: 10 },
      { left: 0, top: 0, width: 0, height: 100 },
    ),
  ).toBeNull();
  expect(
    normalizePointerToNdc(
      { clientX: 10, clientY: 10 },
      { left: 0, top: 0, width: 100, height: 0 },
    ),
  ).toBeNull();
});

it("keeps movement at the click threshold as a click candidate", () => {
  const gesture = createPointerGesture({
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
  } as PointerEvent);

  updatePointerGesture(gesture, {
    clientX: 10 + CLICK_DRAG_THRESHOLD_PX,
    clientY: 10,
  });

  expect(isClickCandidate(gesture)).toBe(true);
});

it("classifies movement beyond the click threshold as drag", () => {
  const gesture = createPointerGesture({
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
  } as PointerEvent);

  updatePointerGesture(gesture, {
    clientX: 10 + CLICK_DRAG_THRESHOLD_PX + 1,
    clientY: 10,
  });

  expect(isClickCandidate(gesture)).toBe(false);
});

it("does not handle Escape from editable controls", () => {
  const input = document.createElement("input");
  const event = new KeyboardEvent("keydown", { key: "Escape" });

  input.dispatchEvent(event);
  Object.defineProperty(event, "target", {
    configurable: true,
    value: input,
  });

  expect(shouldIgnoreEscape(event)).toBe(true);
});
