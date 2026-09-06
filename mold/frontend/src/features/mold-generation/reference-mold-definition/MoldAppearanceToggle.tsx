import { useMoldAppearanceStore } from "./moldAppearance.store";

export function MoldAppearanceToggle({
  visible,
}: {
  readonly visible: boolean;
}) {
  const mode = useMoldAppearanceStore((state) => state.mode);
  const toggleGlassMode = useMoldAppearanceStore(
    (state) => state.toggleGlassMode,
  );

  if (!visible) {
    return null;
  }

  const glassActive = mode === "glass";
  const label = glassActive
    ? "Disable glass mold appearance"
    : "Enable glass mold appearance";

  return (
    <button
      aria-label={label}
      aria-pressed={glassActive}
      data-mold-appearance={mode}
      onClick={toggleGlassMode}
      title={label}
      type="button"
    >
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        viewBox="0 0 24 24"
        width="18"
      >
        <path
          d="M12 3 20 7.5 12 12 4 7.5 12 3Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
        <path
          d="M4 7.5V16.5L12 21V12L4 7.5Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
        <path
          d="M20 7.5V16.5L12 21V12L20 7.5Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
        {glassActive && (
          <path
            d="M7.2 9.4 10.6 7.5M13.4 16.7 17 14.7"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
        )}
      </svg>
    </button>
  );
}

