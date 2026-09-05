import "./MoldOrientationCube.css";

export function MoldOrientationCube() {
  return (
    <aside className="mold-viewcube" aria-label="View orientation cube">
      <svg
        className="mold-viewcube__svg"
        viewBox="0 0 156 138"
        role="img"
        aria-label="3D view cube showing Top, Front, Right and X Y Z axes"
      >
        <defs>
          <filter id="mold-viewcube-shadow" x="-40%" y="-40%" width="180%" height="190%">
            <feDropShadow dx="0" dy="12" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.18" />
          </filter>

          <filter id="mold-viewcube-soft-shadow" x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="3" stdDeviation="2" floodColor="#ffffff" floodOpacity="0.35" />
          </filter>

          <linearGradient id="mold-viewcube-top" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#f5f7fb" />
            <stop offset="100%" stopColor="#dde5f0" />
          </linearGradient>

          <linearGradient id="mold-viewcube-front" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f3f6fa" />
            <stop offset="100%" stopColor="#cfd8e5" />
          </linearGradient>

          <linearGradient id="mold-viewcube-right" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#edf2f7" />
            <stop offset="100%" stopColor="#bcc8d8" />
          </linearGradient>

          <marker id="mold-viewcube-arrow-x" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#ef4444" />
          </marker>

          <marker id="mold-viewcube-arrow-y" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#22c55e" />
          </marker>

          <marker id="mold-viewcube-arrow-z" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#6366f1" />
          </marker>
        </defs>

        <g className="mold-viewcube__axes">
          <line
            className="mold-viewcube__axis-line mold-viewcube__axis-line--y"
            x1="78"
            y1="36"
            x2="78"
            y2="11"
            markerEnd="url(#mold-viewcube-arrow-y)"
          />
          <text className="mold-viewcube__axis-label mold-viewcube__axis-label--y" x="78" y="7">Y</text>

          <line
            className="mold-viewcube__axis-line mold-viewcube__axis-line--x"
            x1="112"
            y1="70"
            x2="138"
            y2="79"
            markerEnd="url(#mold-viewcube-arrow-x)"
          />
          <text className="mold-viewcube__axis-label mold-viewcube__axis-label--x" x="145" y="86">X</text>

          <line
            className="mold-viewcube__axis-line mold-viewcube__axis-line--z"
            x1="44"
            y1="71"
            x2="19"
            y2="87"
            markerEnd="url(#mold-viewcube-arrow-z)"
          />
          <text className="mold-viewcube__axis-label mold-viewcube__axis-label--z" x="10" y="97">Z</text>
        </g>

        <g className="mold-viewcube__body" filter="url(#mold-viewcube-shadow)">
          <polygon
            className="mold-viewcube__face mold-viewcube__face--top"
            points="78,33 113,51 78,68 43,51"
          />
          <polygon
            className="mold-viewcube__face mold-viewcube__face--front"
            points="43,51 78,68 78,110 43,91"
          />
          <polygon
            className="mold-viewcube__face mold-viewcube__face--right"
            points="78,68 113,51 113,91 78,110"
          />

          <polyline
            className="mold-viewcube__edge"
            points="78,33 113,51 113,91 78,110 43,91 43,51 78,33"
          />
          <line className="mold-viewcube__edge mold-viewcube__edge--soft" x1="78" y1="68" x2="78" y2="110" />
          <line className="mold-viewcube__edge mold-viewcube__edge--soft" x1="78" y1="68" x2="43" y2="51" />
          <line className="mold-viewcube__edge mold-viewcube__edge--soft" x1="78" y1="68" x2="113" y2="51" />

          <polygon
            className="mold-viewcube__highlight"
            points="78,39 104,52 78,64 52,52"
            filter="url(#mold-viewcube-soft-shadow)"
          />

          <text className="mold-viewcube__face-label mold-viewcube__face-label--top" x="78" y="49">Top</text>
          <text className="mold-viewcube__face-label mold-viewcube__face-label--front" x="58" y="79">Front</text>
          <text className="mold-viewcube__face-label mold-viewcube__face-label--right" x="97" y="79">Right</text>
        </g>
      </svg>
    </aside>
  );
}
