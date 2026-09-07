/**
 * Kept separate from pointerSelection.ts (which imports "three" for NDC
 * math) so that Viewport.tsx -- eagerly rendered at boot -- can use this
 * pure DOM-event check without pulling three.js into the main bundle.
 */
export function shouldIgnoreEscape(event: KeyboardEvent) {
  if (event.defaultPrevented) {
    return true;
  }

  const target = event.target;

  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest("dialog,[role='dialog'],[aria-modal='true']") !== null) {
    return true;
  }

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }

  return target.closest("[contenteditable=''],[contenteditable='true']") !== null;
}
