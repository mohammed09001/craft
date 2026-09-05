import "./MoldOrientationCube.css";

export function MoldOrientationCube() {
  return (
    <aside className="mold-viewcube" aria-label="View orientation cube">
      <div className="mold-viewcube__scene" aria-hidden="true">
        <div className="mold-viewcube__axis mold-viewcube__axis--y">Y</div>
        <div className="mold-viewcube__axis mold-viewcube__axis--x">X</div>
        <div className="mold-viewcube__axis mold-viewcube__axis--z">Z</div>

        <div className="mold-viewcube__cube">
          <div className="mold-viewcube__face mold-viewcube__face--top">Top</div>
          <div className="mold-viewcube__face mold-viewcube__face--front">Front</div>
          <div className="mold-viewcube__face mold-viewcube__face--right">Right</div>
        </div>
      </div>
    </aside>
  );
}
