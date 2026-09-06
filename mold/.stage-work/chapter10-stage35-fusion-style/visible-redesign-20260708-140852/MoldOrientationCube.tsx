import "./MoldOrientationCube.css";

export function MoldOrientationCube() {
  return (
    <aside className="mold-viewcube" aria-label="View orientation cube">
      <svg
        className="mold-viewcube__svg"
        viewBox="0 0 128 116"
        role="img"
        aria-label="3D view cube with Top, Front, Right, X, Y, and Z labels"
      >
        <defs>
          <filter id="mold-viewcube-depth-shadow" x="-35%" y="-35%" width="170%" height="180%">
            <feDropShadow dx="0" dy="8" stdDeviation="5" floodColor="#64748b" floodOpacity="0.22" />
          </filter>

          <linearGradient id="mold-viewcube-face-top" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#dfe5ec" />
          </linearGradient>

          <linearGradient id="mold-viewcube-face-front" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f2f5f8" />
            <stop offset="100%" stopColor="#cfd7e1" />
          </linearGradient>

          <linearGradient id="mold-viewcube-face-right" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#e8edf3" />
            <stop offset="100%" stopColor="#bcc7d5" />
          </linearGradient>
        </defs>

        <g className="mold-viewcube__axis-layer">
          <line className="mold-viewcube__axis mold-viewcube__axis--y" x1="64" y1="30" x2="64" y2="9" />
          <text className="mold-viewcube__axis-text mold-viewcube__axis-text--y" x="64" y="6">Y</text>

          <line className="mold-viewcube__axis mold-viewcube__axis--x" x1="92" y1="59" x2="113" y2="68" />
          <text className="mold-viewcube__axis-text mold-viewcube__axis-text--x" x="119" y="73">X</text>

          <line className="mold-viewcube__axis mold-viewcube__axis--z" x1="36" y1="59" x2="16" y2="72" />
          <text className="mold-viewcube__axis-text mold-viewcube__axis-text--z" x="9" y="81">Z</text>
        </g>

        <g className="mold-viewcube__cube" filter="url(#mold-viewcube-depth-shadow)">
          <polygon className="mold-viewcube__face mold-viewcube__face--top" points="64,29 94,44 64,59 34,44" />
          <polygon className="mold-viewcube__face mold-viewcube__face--front" points="34,44 64,59 64,94 34,78" />
          <polygon className="mold-viewcube__face mold-viewcube__face--right" points="64,59 94,44 94,78 64,94" />

          <polyline className="mold-viewcube__outline" points="64,29 94,44 94,78 64,94 34,78 34,44 64,29" />
          <line className="mold-viewcube__inner-edge" x1="64" y1="59" x2="64" y2="94" />
          <line className="mold-viewcube__inner-edge" x1="64" y1="59" x2="34" y2="44" />
          <line className="mold-viewcube__inner-edge" x1="64" y1="59" x2="94" y2="44" />

          <text className="mold-viewcube__label mold-viewcube__label--top" x="64" y="44">Top</text>
          <text className="mold-viewcube__label mold-viewcube__label--front" x="49" y="68">Front</text>
          <text className="mold-viewcube__label mold-viewcube__label--right" x="79" y="68">Right</text>
        </g>
      </svg>
    </aside>
  );
}
