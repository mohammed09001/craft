import { describe,expect,it } from "vitest";

import {
  boundsFromManifold,
  getManifoldModule,
} from "./manifold.engine";

function exactBoxSignedDistance(
  point:readonly [number,number,number],
):number {
  const centerX=5;
  const centerY=5;
  const centerZ=5;

  const halfX=5;
  const halfY=5;
  const halfZ=5;

  const qx=Math.abs(point[0]-centerX)-halfX;
  const qy=Math.abs(point[1]-centerY)-halfY;
  const qz=Math.abs(point[2]-centerZ)-halfZ;

  const outsideX=Math.max(qx,0);
  const outsideY=Math.max(qy,0);
  const outsideZ=Math.max(qz,0);

  const outsideDistance=Math.hypot(
    outsideX,
    outsideY,
    outsideZ,
  );

  const insideDistance=Math.min(
    Math.max(qx,qy,qz),
    0,
  );

  return outsideDistance+insideDistance;
}

const describeDiagnostic=
  import.meta.env.VITE_RUN_CAVITY_LEVEL_SET_DIAGNOSTIC==="1"
    ?describe
    :describe.skip;

describeDiagnostic("Manifold levelSet diagnostic",()=>{
  it("reports level behavior for an analytic 10 mm cube",async()=>{
    const module=await getManifoldModule();

    const records:{
      level:number;
      tolerance:number;
      volume:number;
      triangleCount:number;
      bounds:ReturnType<typeof boundsFromManifold>;
      status:string;
    }[]=[];

    const configurations=[
      {level:-0.2,tolerance:-1},
      {level:0,tolerance:-1},
      {level:0.2,tolerance:-1},

      {level:-0.2,tolerance:0.0625},
      {level:0,tolerance:0.0625},
      {level:0.2,tolerance:0.0625},
    ];

    for(const configuration of configurations){
      const solid=module.Manifold.levelSet(
        point=>exactBoxSignedDistance([
          point[0],
          point[1],
          point[2],
        ]),
        {
          min:[-2,-2,-2],
          max:[12,12,12],
        },
        0.25,
        configuration.level,
        configuration.tolerance,
      );

      try{
        records.push({
          level:configuration.level,
          tolerance:configuration.tolerance,
          volume:solid.volume(),
          triangleCount:solid.numTri(),
          bounds:boundsFromManifold(solid),
          status:solid.status(),
        });
      }finally{
        solid.delete();
      }
    }

    console.log(
      "LEVEL_SET_DIAGNOSTIC",
      JSON.stringify(records,null,2),
    );

    expect(records).toHaveLength(6);

    for(const record of records){
      expect(record.status).toBe("NoError");
      expect(record.volume).toBeGreaterThan(0);
      expect(record.triangleCount).toBeGreaterThan(0);
    }
  });
});
