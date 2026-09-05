import "./MoldOrientationCube.css";

export function MoldOrientationCube() {
  return (
    <aside className="fusion-view-cube" aria-label="View orientation cube">
      <div className="fusion-view-cube__stage" aria-hidden="true">
        <span className="fusion-view-cube__axis fusion-view-cube__axis--y">Y</span>
        <span className="fusion-view-cube__axis fusion-view-cube__axis--x">X</span>
        <span className="fusion-view-cube__axis fusion-view-cube__axis--z">Z</span>

        <div className="fusion-view-cube__object">
          <div className="fusion-view-cube__face fusion-view-cube__face--top">Top</div>
          <div className="fusion-view-cube__face fusion-view-cube__face--front">Front</div>
          <div className="fusion-view-cube__face fusion-view-cube__face--right">Right</div>
        </div>
      </div>
    </aside>
  );
}
