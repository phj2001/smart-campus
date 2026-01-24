import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useAppStore } from '../store/appStore';

// 长安大学渭水校区边界多边形坐标（从 GeoJSON 提取）
const campusBoundaryCoords: [number, number][] = [
  [108.8917821, 34.3734929], [108.8855068, 34.3719475], [108.8854275, 34.3719],
  [108.8853423, 34.371737], [108.8852941, 34.3710678], [108.8856544, 34.3710781],
  [108.8857327, 34.3705948], [108.8852551, 34.3705851], [108.8851438, 34.3687269],
  [108.8852644, 34.3668085], [108.8853512, 34.3653785], [108.8924245, 34.3671874],
  [108.893726, 34.3675537], [108.8966235, 34.3682966], [108.900259, 34.3692364],
  [108.9009314, 34.3694168], [108.9016373, 34.3695989], [108.9096821, 34.3716447],
  [108.9099449, 34.3717115], [108.9086247, 34.3746856], [108.9085694, 34.3748103],
  [108.9073157, 34.3776344], [108.9071657, 34.3778451], [108.9070792, 34.3778623],
  [108.9048427, 34.3772908], [108.9045138, 34.3772135], [108.9038534, 34.3770457],
  [108.9016931, 34.3764958], [108.8921669, 34.3735992], [108.8917821, 34.3734929],
];

// 校园边界框（基于多边形计算的精确矩形）
const CAMPUS_WEST = 108.8851438;
const CAMPUS_SOUTH = 34.3653785;
const CAMPUS_EAST = 108.9099449;
const CAMPUS_NORTH = 34.3778623;

const campusRectangle = Cesium.Rectangle.fromDegrees(
  CAMPUS_WEST, CAMPUS_SOUTH, CAMPUS_EAST, CAMPUS_NORTH
);

// 计算校园中心点（边界框中心）
const campusCenterLon = (CAMPUS_WEST + CAMPUS_EAST) / 2;   // 108.8975444
const campusCenterLat = (CAMPUS_SOUTH + CAMPUS_NORTH) / 2; // 34.3716204

// 计算合适的视角高度（基于校园尺寸）
// 校园东西跨度约 2.48km，南北跨度约 1.39km
// 为了完整显示，使用较大的跨度来计算高度
const lonSpan = CAMPUS_EAST - CAMPUS_WEST;  // 约 0.0248 度
const latSpan = CAMPUS_NORTH - CAMPUS_SOUTH; // 约 0.0125 度
const maxSpan = Math.max(lonSpan, latSpan);
// 根据视角角度和屏幕比例，计算合适高度（经验公式）
const cameraHeight = maxSpan * 111000 * 1.2; // 约 3300m

// 校园中心位置和视角
const homePosition = Cesium.Cartesian3.fromDegrees(108.89779, 34.36006, 2000);
const homeOrientation = {
  heading: Cesium.Math.toRadians(0),       // 朝北
  pitch: Cesium.Math.toRadians(-60),       // 俯视角度更大，看到更完整的校园
  roll: 0,
};

// 检查点是否在校园多边形内（射线法）
function isPointInCampus(lon: number, lat: number): boolean {
  let inside = false;
  const n = campusBoundaryCoords.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = campusBoundaryCoords[i][0], yi = campusBoundaryCoords[i][1];
    const xj = campusBoundaryCoords[j][0], yj = campusBoundaryCoords[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

export default function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const sceneMode = useAppStore((state) => state.sceneMode);
  const homeRequest = useAppStore((state) => state.homeRequest);
  const setStatus = useAppStore((state) => state.setStatus);

  useEffect(() => {
    if (!containerRef.current) return;

    // 设置 Cesium Ion 默认访问令牌
    const cesiumToken = import.meta.env.VITE_CESIUM_ION_TOKEN ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkMzgwNzA5ZS00NWEzLTRkOTEtYjcxOS02ZTgxNWRiOGQ1MDYiLCJpZCI6MzYzMjgwLCJpYXQiOjE3NjM5ODEzOTV9.0a44SobBq6h0u66BFdp-UgpenUCLrbhLRTR7SzdcMuE';
    Cesium.Ion.defaultAccessToken = cesiumToken;

    // 创建 Viewer，先不加载任何底图
    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      shouldAnimate: false,
      baseLayer: false, // 不加载默认底图，我们手动添加
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    });

    // 设置地球基础颜色
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#d0d5dd');
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.globe.showGroundAtmosphere = false;

    // 异步加载 Cesium Ion 默认底图（Bing Maps Aerial）- 加载完整底图
    Cesium.createWorldImageryAsync().then((imageryProvider) => {
      viewer.imageryLayers.addImageryProvider(imageryProvider);
    }).catch((error) => {
      console.error('Failed to load Cesium Ion imagery:', error);
    });

    // 创建一个覆盖校园周围区域的灰色遮罩多边形（带校园形状的孔洞）
    // 外边界：比校园边界大一圈的矩形
    const maskPadding = 0.05; // 约 5km 的扩展
    const outerBoundary = Cesium.Cartesian3.fromDegreesArray([
      CAMPUS_WEST - maskPadding, CAMPUS_SOUTH - maskPadding,
      CAMPUS_EAST + maskPadding, CAMPUS_SOUTH - maskPadding,
      CAMPUS_EAST + maskPadding, CAMPUS_NORTH + maskPadding,
      CAMPUS_WEST - maskPadding, CAMPUS_NORTH + maskPadding,
    ]);

    // 内边界（孔洞）：校园边界多边形
    const campusHole = campusBoundaryCoords.flatMap(([lon, lat]) => [lon, lat]);
    const campusHolePositions = Cesium.Cartesian3.fromDegreesArray(campusHole);

    // 添加带孔洞的灰色遮罩多边形
    viewer.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(outerBoundary, [
          new Cesium.PolygonHierarchy(campusHolePositions),
        ]),
        material: Cesium.Color.fromCssColorString('#e5e7eb'),
        classificationType: Cesium.ClassificationType.BOTH,
      },
    });

    viewer.camera.setView({ destination: homePosition, orientation: homeOrientation });

    // === 相机移动限制 ===
    const controller = viewer.scene.screenSpaceCameraController;
    controller.minimumZoomDistance = 100;   // 最小缩放距离（最近）
    controller.maximumZoomDistance = 3000;  // 最大缩放距离（最远）

    // 定义相机可移动的边界（基于你设置的中心点 108.89779, 34.36006）
    // 你可以调整这个范围来控制用户可以滑动多远
    const CENTER_LON = 108.89779;
    const CENTER_LAT = 34.36006;
    const MAX_OFFSET = 0.005;  // 允许偏离中心的最大经纬度（约 1.5km）

    const cameraBounds = {
      west: CENTER_LON - MAX_OFFSET,
      east: CENTER_LON + MAX_OFFSET,
      south: CENTER_LAT - MAX_OFFSET,
      north: CENTER_LAT + MAX_OFFSET,
    };

    // 使用 preUpdate 事件在每一帧渲染前检查和限制相机位置
    // 这样可以实现"撞墙"效果，而不是拉回中心
    let lastValidPosition: Cesium.Cartographic | null = null;

    const constrainCamera = () => {
      const cameraPosition = viewer.camera.positionCartographic;
      const lon = Cesium.Math.toDegrees(cameraPosition.longitude);
      const lat = Cesium.Math.toDegrees(cameraPosition.latitude);

      // 检查是否超出边界
      const isOutOfBounds =
        lon < cameraBounds.west ||
        lon > cameraBounds.east ||
        lat < cameraBounds.south ||
        lat > cameraBounds.north;

      if (isOutOfBounds && lastValidPosition) {
        // 超出边界，恢复到上一个有效位置（阻止移动）
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromRadians(
            lastValidPosition.longitude,
            lastValidPosition.latitude,
            cameraPosition.height  // 保持当前高度
          ),
          orientation: {
            heading: viewer.camera.heading,
            pitch: viewer.camera.pitch,
            roll: viewer.camera.roll,
          },
        });
      } else {
        // 在边界内，保存当前位置
        lastValidPosition = cameraPosition.clone();
      }
    };

    viewer.scene.preUpdate.addEventListener(constrainCamera);

    viewerRef.current = viewer;
    return () => {
      viewer.scene.preUpdate.removeEventListener(constrainCamera);
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    let active = true;
    const now = Cesium.JulianDate.now();

    const parseHeight = (value: unknown) => {
      if (value === null || value === undefined) return null;
      const match = String(value).match(/[\d.]+/);
      if (!match) return null;
      const parsed = Number(match[0]);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const colorForHeight = (height: number) => {
      if (height >= 60) return Cesium.Color.fromCssColorString('#6f6a64');
      if (height >= 40) return Cesium.Color.fromCssColorString('#8b857e');
      if (height >= 20) return Cesium.Color.fromCssColorString('#a9a39a');
      return Cesium.Color.fromCssColorString('#c9c3b8');
    };

    const load = async () => {
      setStatus('Loading GeoJSON...');
      try {
        const dataSource = await Cesium.GeoJsonDataSource.load('/data/buildings.geojson', {
          clampToGround: false,
        });
        if (!active) return;
        await viewer.dataSources.add(dataSource);

        let buildingCount = 0;
        let roadCount = 0;
        for (const entity of dataSource.entities.values) {
          const props = entity.properties?.getValue(now) ?? {};
          const isCampus = props.amenity === 'university';

          if (entity.polygon) {
            if (isCampus) {
              // @ts-ignore - Cesium 运行时 API 支持直接赋值
              entity.polygon.material = Cesium.Color.TRANSPARENT;
              // @ts-ignore
              entity.polygon.outline = true;
              // @ts-ignore
              entity.polygon.outlineColor = Cesium.Color.fromCssColorString('#2f3e4d');
              // @ts-ignore
              entity.polygon.extrudedHeight = 0;
            } else {
              const levels = parseHeight(props['building:levels']);
              const height =
                parseHeight(props.height) ?? (levels !== null ? levels * 3 : null) ?? 12;
              // @ts-ignore - Cesium 运行时 API 支持直接赋值
              entity.polygon.material = colorForHeight(height);
              // @ts-ignore
              entity.polygon.outline = false;
              // @ts-ignore
              entity.polygon.extrudedHeight = height;
              buildingCount += 1;
            }
          } else if (entity.polyline) {
            // @ts-ignore
            entity.polyline.width = 2.2;
            // @ts-ignore
            entity.polyline.material = Cesium.Color.fromCssColorString('#3a4957').withAlpha(0.6);
            roadCount += 1;
          } else if (entity.point || entity.billboard || entity.label) {
            entity.show = false;
            entity.billboard = undefined;
            entity.label = undefined;
          }

          // === GeoJSON 裁剪：隐藏校园外的要素 ===
          // 获取实体中心点并检查是否在校园边界内
          let entityLon: number | null = null;
          let entityLat: number | null = null;

          if (entity.polygon?.hierarchy) {
            // 对于多边形，获取第一个顶点作为参考点
            const hierarchy = entity.polygon.hierarchy.getValue(now);
            if (hierarchy && hierarchy.positions && hierarchy.positions.length > 0) {
              const carto = Cesium.Cartographic.fromCartesian(hierarchy.positions[0]);
              entityLon = Cesium.Math.toDegrees(carto.longitude);
              entityLat = Cesium.Math.toDegrees(carto.latitude);
            }
          } else if (entity.polyline?.positions) {
            // 对于线，获取第一个顶点
            const positions = entity.polyline.positions.getValue(now);
            if (positions && positions.length > 0) {
              const carto = Cesium.Cartographic.fromCartesian(positions[0]);
              entityLon = Cesium.Math.toDegrees(carto.longitude);
              entityLat = Cesium.Math.toDegrees(carto.latitude);
            }
          } else if (entity.position) {
            // 对于点实体
            const pos = entity.position.getValue(now);
            if (pos) {
              const carto = Cesium.Cartographic.fromCartesian(pos);
              entityLon = Cesium.Math.toDegrees(carto.longitude);
              entityLat = Cesium.Math.toDegrees(carto.latitude);
            }
          }

          // 如果获取到坐标且不在校园范围内，隐藏该实体
          if (entityLon !== null && entityLat !== null) {
            if (!isPointInCampus(entityLon, entityLat)) {
              entity.show = false;
            }
          }
        }

        setStatus(`Loaded buildings ${buildingCount} / roads ${roadCount}`);
      } catch (error) {
        console.error(error);
        setStatus('GeoJSON load failed');
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [setStatus]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (sceneMode === '3D') {
      viewer.scene.morphTo3D(1.2);
    } else if (sceneMode === '2.5D') {
      viewer.scene.morphToColumbusView(1.2);
    } else {
      viewer.scene.morphTo2D(1.2);
    }
  }, [sceneMode]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: homePosition,
      orientation: homeOrientation,
      duration: 1.4,
    });
  }, [homeRequest]);

  return <div className="cesium-canvas" ref={containerRef} />;
}
