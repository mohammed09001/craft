import "./MoldOrientationCube.css";

export function MoldOrientationCube() {
  return (
    <aside className="mg-viewcube" aria-label="View orientation cube">
      <svg
        className="mg-viewcube__svg"
        viewBox="0 0 156 144"
        role="img"
        aria-label="3D ViewCube with Top, Front, Right, X, Y, Z, home, rotation arrows, and direction triangles"
      >
        <defs>
          <filter id="mg-viewcube-shadow" x="-35%" y="-35%" width="170%" height="190%">
            <feDropShadow dx="0" dy="10" stdDeviation="5" floodColor="#475569" floodOpacity="0.22" />
          </filter>

          <linearGradient id="mg-viewcube-top" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="48%" stopColor="#f7f8fa" />
            <stop offset="100%" stopColor="#dfe6ee" />
          </linearGradient>

          <linearGradient id="mg-viewcube-front" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f4f6f8" />
            <stop offset="100%" stopColor="#cfd8e4" />
          </linearGradient>

          <linearGradient id="mg-viewcube-right" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#e9eef4" />
            <stop offset="100%" stopColor="#b8c5d4" />
          </linearGradient>

          <marker id="mg-viewcube-arrow" markerWidth="7" markerHeight="7" refX="5.7" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" className="mg-viewcube__arrow-head" />
          </marker>
        </defs>

        <g className="mg-viewcube__nav" aria-hidden="true">
          <g className="mg-viewcube__home" transform="translate(18 21)">
            <path d="M0 8 L8 1 L16 8" />
            <path d="M3 8 V17 H13 V8" />
          </g>

          <path
            className="mg-viewcube__orbit mg-viewcube__orbit--top"
            d="M48 27 C65 16 91 16 108 27"
            markerEnd="url(#mg-viewcube-arrow)"
          />
          <path
            className="mg-viewcube__orbit mg-viewcube__orbit--right"
            d="M126 49 C138 65 138 85 126 101"
            markerEnd="url(#mg-viewcube-arrow)"
          />

          <polygon className="mg-viewcube__nav-triangle mg-viewcube__nav-triangle--top" points="78,25 73,33 83,33" />
          <polygon className="mg-viewcube__nav-triangle mg-viewcube__nav-triangle--right" points="128,72 120,67 120,77" />
          <polygon className="mg-viewcube__nav-triangle mg-viewcube__nav-triangle--bottom" points="78,126 73,118 83,118" />
          <polygon className="mg-viewcube__nav-triangle mg-viewcube__nav-triangle--left" points="28,72 36,67 36,77" />
        </g>

        <g className="mg-viewcube__axes" aria-hidden="true">
          <line className="mg-viewcube__axis-line mg-viewcube__axis-line--y" x1="78" y1="42" x2="78" y2="13" />
          <text className="mg-viewcube__axis-label mg-viewcube__axis-label--y" x="78" y="8">Y</text>

          <line className="mg-viewcube__axis-line mg-viewcube__axis-line--x" x1="116" y1="80" x2="140" y2="90" />
          <text className="mg-viewcube__axis-label mg-viewcube__axis-label--x" x="148" y="97">X</text>

          <line className="mg-viewcube__axis-line mg-viewcube__axis-line--z" x1="40" y1="80" x2="17" y2="95" />
          <text className="mg-viewcube__axis-label mg-viewcube__axis-label--z" x="8" y="104">Z</text>
        </g>

        <g className="mg-viewcube__cube" filter="url(#mg-viewcube-shadow)" aria-hidden="true">
          <polygon
            className="mg-viewcube__face mg-viewcube__face--top"
            points="78,38 119,59 78,80 37,59"
          />
          <polygon
            className="mg-viewcube__face mg-viewcube__face--front"
            points="37,59 78,80 78,123 37,101"
          />
          <polygon
            className="mg-viewcube__face mg-viewcube__face--right"
            points="78,80 119,59 119,101 78,123"
          />

          <polyline
            className="mg-viewcube__edge mg-viewcube__edge--outer"
            points="78,38 119,59 119,101 78,123 37,101 37,59 78,38"
          />
          <line className="mg-viewcube__edge mg-viewcube__edge--inner" x1="78" y1="80" x2="78" y2="123" />
          <line className="mg-viewcube__edge mg-viewcube__edge--inner" x1="78" y1="80" x2="37" y2="59" />
          <line className="mg-viewcube__edge mg-viewcube__edge--inner" x1="78" y1="80" x2="119" y2="59" />

          <text className="mg-viewcube__face-label mg-viewcube__face-label--top" x="78" y="58">Top</text>
          <text className="mg-viewcube__face-label mg-viewcube__face-label--front" x="57" y="89">Front</text>
          <text className="mg-viewcube__face-label mg-viewcube__face-label--right" x="99" y="89">Right</text>
        </g>
      </svg>
    </aside>
  );
}
