import * as Cesium from 'cesium';

export type RoadBeautifyConfig = {
  roadGeoJsonUrl: string;
  roadTextureUrl: string;
  treeModelUrl: string;
  roadTextureTileSizeMeters: number;
  treeSpacingMeters: number;
  treeSideOffsetMeters: number;
  treeScale: number;
  treeMaxCount: number;
};

export type RoadBeautifyResult = {
  roadDs: Cesium.GeoJsonDataSource;
  treeEntities: Cesium.Entity[];
  treeCount: number;
};

function estimateTextureRepeat(polygon: Cesium.PolygonGraphics, tileSizeMeters: number): Cesium.Cartesian2 {
  const now = Cesium.JulianDate.now();
  const hierarchy = polygon.hierarchy?.getValue(now);
  const positions = hierarchy?.positions;
  if (!positions || positions.length < 3) {
    return new Cesium.Cartesian2(40, 40);
  }

  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  positions.forEach((p) => {
    const c = Cesium.Cartographic.fromCartesian(p);
    minLon = Math.min(minLon, c.longitude);
    maxLon = Math.max(maxLon, c.longitude);
    minLat = Math.min(minLat, c.latitude);
    maxLat = Math.max(maxLat, c.latitude);
  });

  const midLat = (minLat + maxLat) * 0.5;
  const midLon = (minLon + maxLon) * 0.5;

  const west = Cesium.Cartographic.fromRadians(minLon, midLat);
  const east = Cesium.Cartographic.fromRadians(maxLon, midLat);
  const south = Cesium.Cartographic.fromRadians(midLon, minLat);
  const north = Cesium.Cartographic.fromRadians(midLon, maxLat);

  const widthMeters = new Cesium.EllipsoidGeodesic(west, east).surfaceDistance || 1.0;
  const heightMeters = new Cesium.EllipsoidGeodesic(south, north).surfaceDistance || 1.0;

  const repeatX = Cesium.Math.clamp(Math.round(widthMeters / tileSizeMeters), 1, 2000);
  const repeatY = Cesium.Math.clamp(Math.round(heightMeters / tileSizeMeters), 1, 2000);
  return new Cesium.Cartesian2(repeatX, repeatY);
}

function lerpCartesian(a: Cesium.Cartesian3, b: Cesium.Cartesian3, t: number): Cesium.Cartesian3 {
  return new Cesium.Cartesian3(
    Cesium.Math.lerp(a.x, b.x, t),
    Cesium.Math.lerp(a.y, b.y, t),
    Cesium.Math.lerp(a.z, b.z, t)
  );
}

function getLocalDirectionUnit(a: Cesium.Cartesian3, b: Cesium.Cartesian3, atPoint: Cesium.Cartesian3) {
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(atPoint);
  const east = Cesium.Matrix4.getColumn(enu, 0, new Cesium.Cartesian4());
  const north = Cesium.Matrix4.getColumn(enu, 1, new Cesium.Cartesian4());
  const east3 = new Cesium.Cartesian3(east.x, east.y, east.z);
  const north3 = new Cesium.Cartesian3(north.x, north.y, north.z);

  const delta = Cesium.Cartesian3.subtract(b, a, new Cesium.Cartesian3());
  const dirE = Cesium.Cartesian3.dot(delta, east3);
  const dirN = Cesium.Cartesian3.dot(delta, north3);
  const len = Math.hypot(dirE, dirN);

  if (len < 1e-6) {
    return null;
  }

  return {
    east3,
    north3,
    dirE: dirE / len,
    dirN: dirN / len
  };
}

function offsetPointByEN(
  center: Cesium.Cartesian3,
  east3: Cesium.Cartesian3,
  north3: Cesium.Cartesian3,
  offsetE: number,
  offsetN: number
): Cesium.Cartesian3 {
  const e = Cesium.Cartesian3.multiplyByScalar(east3, offsetE, new Cesium.Cartesian3());
  const n = Cesium.Cartesian3.multiplyByScalar(north3, offsetN, new Cesium.Cartesian3());
  return Cesium.Cartesian3.add(center, Cesium.Cartesian3.add(e, n, new Cesium.Cartesian3()), new Cesium.Cartesian3());
}

function isRingCCW(positions: Cesium.Cartesian3[]): boolean {
  let sum = 0;
  for (let i = 0; i < positions.length; i += 1) {
    const p1 = Cesium.Cartographic.fromCartesian(positions[i]);
    const p2 = Cesium.Cartographic.fromCartesian(positions[(i + 1) % positions.length]);
    sum += (p1.longitude * p2.latitude) - (p2.longitude * p1.latitude);
  }
  return sum > 0;
}

function collectRings(hierarchy: Cesium.PolygonHierarchy, isHole: boolean, out: Array<{ positions: Cesium.Cartesian3[]; isHole: boolean }>) {
  if (!hierarchy.positions || hierarchy.positions.length < 2) {
    return;
  }

  out.push({ positions: hierarchy.positions, isHole });
  if (hierarchy.holes && hierarchy.holes.length > 0) {
    hierarchy.holes.forEach((h) => collectRings(h, true, out));
  }
}

function plantTreesOutsideRoads(
  viewer: Cesium.Viewer,
  roadEntities: Cesium.Entity[],
  cfg: RoadBeautifyConfig
): Cesium.Entity[] {
  const created: Cesium.Entity[] = [];
  const dedupe = new Set<string>();

  const addTree = (cartesian: Cesium.Cartesian3) => {
    if (created.length >= cfg.treeMaxCount) {
      return;
    }

    const c = Cesium.Cartographic.fromCartesian(cartesian);
    const lonDeg = Cesium.Math.toDegrees(c.longitude);
    const latDeg = Cesium.Math.toDegrees(c.latitude);
    const key = `${Math.round(lonDeg * 1e5)}_${Math.round(latDeg * 1e5)}`;
    if (dedupe.has(key)) {
      return;
    }
    dedupe.add(key);

    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, 0),
      orientation: Cesium.Transforms.headingPitchRollQuaternion(
        Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, 0),
        new Cesium.HeadingPitchRoll(Math.random() * Math.PI * 2, 0, 0)
      ),
      model: {
        uri: cfg.treeModelUrl,
        scale: cfg.treeScale,
        minimumPixelSize: 24,
        maximumScale: 80,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      }
    });
    created.push(entity);
  };

  roadEntities.forEach((entity) => {
    if (!entity.polygon?.hierarchy) {
      return;
    }

    const hierarchy = entity.polygon.hierarchy.getValue(Cesium.JulianDate.now());
    if (!hierarchy) {
      return;
    }

    const rings: Array<{ positions: Cesium.Cartesian3[]; isHole: boolean }> = [];
    collectRings(hierarchy, false, rings);

    rings.forEach((ring) => {
      const positions = ring.positions;
      const ringCCW = isRingCCW(positions);

      for (let i = 0; i < positions.length; i += 1) {
        if (created.length >= cfg.treeMaxCount) {
          return;
        }

        const a = positions[i];
        const b = positions[(i + 1) % positions.length];
        const segLen = Cesium.Cartesian3.distance(a, b);
        if (segLen < cfg.treeSpacingMeters) {
          continue;
        }

        for (let d = cfg.treeSpacingMeters * 0.5; d < segLen; d += cfg.treeSpacingMeters) {
          if (created.length >= cfg.treeMaxCount) {
            return;
          }

          const t = d / segLen;
          const center = lerpCartesian(a, b, t);
          const basis = getLocalDirectionUnit(a, b, center);
          if (!basis) {
            continue;
          }

          const leftE = -basis.dirN;
          const leftN = basis.dirE;
          const rightE = basis.dirN;
          const rightN = -basis.dirE;

          let outwardE: number;
          let outwardN: number;

          if (!ring.isHole) {
            outwardE = ringCCW ? rightE : leftE;
            outwardN = ringCCW ? rightN : leftN;
          } else {
            outwardE = ringCCW ? leftE : rightE;
            outwardN = ringCCW ? leftN : rightN;
          }

          const point = offsetPointByEN(
            center,
            basis.east3,
            basis.north3,
            outwardE * cfg.treeSideOffsetMeters,
            outwardN * cfg.treeSideOffsetMeters
          );
          addTree(point);
        }
      }
    });
  });

  return created;
}

export async function applyRoadBeautification(
  viewer: Cesium.Viewer,
  cfg: RoadBeautifyConfig
): Promise<RoadBeautifyResult> {
  const roadDs = await Cesium.GeoJsonDataSource.load(cfg.roadGeoJsonUrl, {
    clampToGround: true
  });
  await viewer.dataSources.add(roadDs);

  roadDs.entities.values.forEach((entity) => {
    if (!entity.polygon) {
      return;
    }

    entity.polygon.material = new Cesium.ImageMaterialProperty({
      image: cfg.roadTextureUrl,
      repeat: estimateTextureRepeat(entity.polygon, cfg.roadTextureTileSizeMeters)
    });
    entity.polygon.outline = false;
  });

  const treeEntities = plantTreesOutsideRoads(viewer, roadDs.entities.values, cfg);

  return {
    roadDs,
    treeEntities,
    treeCount: treeEntities.length
  };
}
