import "./MoldOrientationCube.css";

export function MoldOrientationCube() {
  return (
    <aside className="mold-viewcube" aria-label="View orientation cube">
      <svg
        className="mold-viewcube__svg"
        viewBox="0 0 140 128"
        role="img"
        aria-label="3D view cube showing Top, Front, Right and X Y Z axes"
      >
        <defs>
          <filter id="mold-viewcube-shadow" x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="10" stdDeviation="7" floodOpacity="0.22" />
          </filter>

          <linearGradient id="mold-viewcube-top" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#e9edf2" />
          </linearGradient>

          <linearGradient id="mold-viewcube-front" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f4f6f8" />
            <stop offset="100%" stopColor="#d8dee7" />
          </linearGradient>

          <linearGradient id="mold-viewcube-right" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#edf1f5" />
            <stop offset="100%" stopColor="#cbd3df" />
          </linearGradient>
        </defs>

        <g className="mold-viewcube__axes">
          <line className="mold-viewcube__axis-line mold-viewcube__axis-line--y" x1="70" y1="33" x2="70" y2="8" />
          <text className="mold-viewcube__axis-label mold-viewcube__axis-label--y" x="70" y="7">Y</text>

          <line className="mold-viewcube__axis-line mold-viewcube__axis-line--x" x1="102" y1="66" x2="127" y2="75" />
          <text className="mold-viewcube__axis-label mold-viewcube__axis-label--x" x="132" y="81">X</text>

          <line className="mold-viewcube__axis-line mold-viewcube__axis-line--z" x1="38" y1="66" x2="16" y2="81" />
          <text className="mold-viewcube__axis-label mold-viewcube__axis-label--z" x="8" y="91">Z</text>
        </g>

        <g className="mold-viewcube__body" filter="url(#mold-viewcube-shadow)">
          <polygon
            className="mold-viewcube__face mold-viewcube__face--top"
            points="70,30 103,47 70,64 37,47"
          />
          <polygon
            className="mold-viewcube__face mold-viewcube__face--front"
            points="37,47 70,64 70,104 37,86"
          />
          <polygon
            className="mold-viewcube__face mold-viewcube__face--right"
            points="70,64 103,47 103,86 70,104"
          />

          <polyline className="mold-viewcube__edge" points="70,30 103,47 103,86 70,104 37,86 37,47 70,30" />
          <line className="mold-viewcube__edge mold-viewcube__edge--soft" x1="70" y1="64" x2="70" y2="104" />
          <line className="mold-viewcube__edge mold-viewcube__edge--soft" x1="70" y1="64" x2="37" y2="47" />
          <line className="mold-viewcube__edge mold-viewcube__edge--soft" x1="70" y1="64" x2="103" y2="47" />

          <text className="mold-viewcube__face-label mold-viewcube__face-label--top" x="70" y="48">Top</text>
          <text className="mold-viewcube__face-label mold-viewcube__face-label--front" x="53" y="76">Front</text>
          <text className="mold-viewcube__face-label mold-viewcube__face-label--right" x="87" y="76">Right</text>
        </g>
      </svg>
    </aside>
  );
}
