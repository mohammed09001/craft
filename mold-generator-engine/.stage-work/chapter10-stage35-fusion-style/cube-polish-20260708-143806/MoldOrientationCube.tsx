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
            <feDropShadow dx="0" dy="11" stdDeviation="6" floodColor="#475569" floodOpacity="0.24" />
          </filter>

          <linearGradient id="mg-viewcube-top" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="52%" stopColor="#f4f6f8" />
            <stop offset="100%" stopColor="#dbe3ec" />
          </linearGradient>

          <linearGradient id="mg-viewcube-front" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f5f7fa" />
            <stop offset="100%" stopColor="#cdd7e3" />
          </linearGradient>

          <linearGradient id="mg-viewcube-right" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#edf1f5" />
            <stop offset="100%" stopColor="#b9c5d4" />
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
            d="M49 26 C66 15 92 15 109 26"
            markerEnd="url(#mg-viewcube-arrow)"
          />
          <path
            className="mg-viewcube__orbit mg-viewcube__orbit--right"
            d="M125 48 C138 64 138 86 125 102"
            markerEnd="url(#mg-viewcube-arrow)"
          />

          <polygon className="mg-viewcube__nav-triangle mg-viewcube__nav-triangle--top" points="78,24 73,33 83,33" />
          <polygon className="mg-viewcube__nav-triangle mg-viewcube__nav-triangle--right" points="128,72 119,67 119,77" />
          <polygon className="mg-viewcube__nav-triangle mg-viewcube__nav-triangle--bottom" points="78,126 73,117 83,117" />
          <polygon className="mg-viewcube__nav-triangle mg-viewcube__nav-triangle--left" points="28,72 37,67 37,77" />
        </g>

        <g className="mg-viewcube__axes" aria-hidden="true">
          <line className="mg-viewcube__axis-line mg-viewcube__axis-line--y" x1="78" y1="43" x2="78" y2="12" />
          <text className="mg-viewcube__axis-label mg-viewcube__axis-label--y" x="78" y="8">Y</text>

          <line className="mg-viewcube__axis-line mg-viewcube__axis-line--x" x1="116" y1="80" x2="141" y2="91" />
          <text className="mg-viewcube__axis-label mg-viewcube__axis-label--x" x="148" y="98">X</text>

          <line className="mg-viewcube__axis-line mg-viewcube__axis-line--z" x1="40" y1="80" x2="16" y2="94" />
          <text className="mg-viewcube__axis-label mg-viewcube__axis-label--z" x="8" y="104">Z</text>
        </g>

        <g className="mg-viewcube__cube" filter="url(#mg-viewcube-shadow)" aria-hidden="true">
          <polygon
            className="mg-viewcube__face mg-viewcube__face--top"
            points="78,41 116,60 78,79 40,60"
          />
          <polygon
            className="mg-viewcube__face mg-viewcube__face--front"
            points="40,60 78,79 78,119 40,99"
          />
          <polygon
            className="mg-viewcube__face mg-viewcube__face--right"
            points="78,79 116,60 116,99 78,119"
          />

          <polyline
            className="mg-viewcube__edge mg-viewcube__edge--outer"
            points="78,41 116,60 116,99 78,119 40,99 40,60 78,41"
          />
          <line className="mg-viewcube__edge mg-viewcube__edge--inner" x1="78" y1="79" x2="78" y2="119" />
          <line className="mg-viewcube__edge mg-viewcube__edge--inner" x1="78" y1="79" x2="40" y2="60" />
          <line className="mg-viewcube__edge mg-viewcube__edge--inner" x1="78" y1="79" x2="116" y2="60" />

          <text className="mg-viewcube__face-label mg-viewcube__face-label--top" x="78" y="60">Top</text>
          <text className="mg-viewcube__face-label mg-viewcube__face-label--front" x="59" y="88">Front</text>
          <text className="mg-viewcube__face-label mg-viewcube__face-label--right" x="97" y="88">Right</text>
        </g>
      </svg>
    </aside>
  );
}
