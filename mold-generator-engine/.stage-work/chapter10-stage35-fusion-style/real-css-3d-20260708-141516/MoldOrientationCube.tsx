import "./MoldOrientationCube.css";

export function MoldOrientationCube() {
  return (
    <aside className="mold-fusion-viewcube" aria-label="View orientation cube">
      <svg
        className="mold-fusion-viewcube__svg"
        viewBox="0 0 160 150"
        role="img"
        aria-label="3D view cube with Top, Front, Right, X, Y, and Z labels"
      >
        <defs>
          <filter id="fusion-cube-shadow" x="-35%" y="-35%" width="170%" height="180%">
            <feDropShadow dx="0" dy="10" stdDeviation="7" floodColor="#475569" floodOpacity="0.24" />
          </filter>

          <linearGradient id="fusion-face-top" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="46%" stopColor="#f4f6f8" />
            <stop offset="100%" stopColor="#dbe2ea" />
          </linearGradient>

          <linearGradient id="fusion-face-front" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f7f8fa" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>

          <linearGradient id="fusion-face-right" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#edf1f5" />
            <stop offset="100%" stopColor="#b9c4d3" />
          </linearGradient>
        </defs>

        <g className="mold-fusion-viewcube__axes">
          <line className="mold-fusion-viewcube__axis mold-fusion-viewcube__axis--y" x1="80" y1="45" x2="80" y2="18" />
          <text className="mold-fusion-viewcube__axis-label mold-fusion-viewcube__axis-label--y" x="80" y="10">Y</text>

          <line className="mold-fusion-viewcube__axis mold-fusion-viewcube__axis--x" x1="117" y1="81" x2="143" y2="90" />
          <text className="mold-fusion-viewcube__axis-label mold-fusion-viewcube__axis-label--x" x="151" y="96">X</text>

          <line className="mold-fusion-viewcube__axis mold-fusion-viewcube__axis--z" x1="43" y1="81" x2="18" y2="96" />
          <text className="mold-fusion-viewcube__axis-label mold-fusion-viewcube__axis-label--z" x="8" y="106">Z</text>
        </g>

        <g className="mold-fusion-viewcube__cube" filter="url(#fusion-cube-shadow)">
          <polygon className="mold-fusion-viewcube__face mold-fusion-viewcube__face--top" points="80,42 119,62 80,82 41,62" />
          <polygon className="mold-fusion-viewcube__face mold-fusion-viewcube__face--front" points="41,62 80,82 80,124 41,103" />
          <polygon className="mold-fusion-viewcube__face mold-fusion-viewcube__face--right" points="80,82 119,62 119,103 80,124" />

          <polyline className="mold-fusion-viewcube__outer-edge" points="80,42 119,62 119,103 80,124 41,103 41,62 80,42" />
          <line className="mold-fusion-viewcube__inner-edge" x1="80" y1="82" x2="80" y2="124" />
          <line className="mold-fusion-viewcube__inner-edge" x1="80" y1="82" x2="41" y2="62" />
          <line className="mold-fusion-viewcube__inner-edge" x1="80" y1="82" x2="119" y2="62" />

          <text className="mold-fusion-viewcube__face-text mold-fusion-viewcube__face-text--top" x="80" y="62">Top</text>
          <text className="mold-fusion-viewcube__face-text mold-fusion-viewcube__face-text--front" x="60" y="91">Front</text>
          <text className="mold-fusion-viewcube__face-text mold-fusion-viewcube__face-text--right" x="100" y="91">Right</text>
        </g>
      </svg>
    </aside>
  );
}
