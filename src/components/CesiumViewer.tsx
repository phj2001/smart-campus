import { useEffect, useRef, useCallback, useMemo } from 'react';
import * as Cesium from 'cesium';
import { useAppStore } from '../store/appStore';
import {
  CAMPUS_BOUNDARY_COORDS,
  CAMPUS_BOUNDS,
  HOME_POSITION,
  HOME_ORIENTATION,
  CAMERA_CONFIG
} from '../constants/campus';
import {
  isPointInCampus,
  parseHeight,
  estimateHeight,
  getColorForHeight,
  getEntityPosition
} from '../utils/cesiumHelpers';
import { buildRoadGraph, Graph } from '../utils/roadNetwork';
import { planRoute } from '../utils/pathfinding';

/**
 * CesiumViewer 组件 - 校园 3D 可视化核心
 */
export default function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  const homeRequest = useAppStore((state) => state.homeRequest);
  const setStatus = useAppStore((state) => state.setStatus);
  const selectedFeature = useAppStore((state) => state.selectedFeature);
  const setSelectedFeature = useAppStore((state) => state.setSelectedFeature);
  const showBuildings = useAppStore((state) => state.showBuildings);
  const showRoads = useAppStore((state) => state.showRoads);
  const showPoints = useAppStore((state) => state.showPoints);

  // 导航状态
  const navMode = useAppStore((state) => state.navMode);
  const navStart = useAppStore((state) => state.navStart);
  const navEnd = useAppStore((state) => state.navEnd);
  const navPath = useAppStore((state) => state.navPath);
  const setNavStart = useAppStore((state) => state.setNavStart);
  const setNavEnd = useAppStore((state) => state.setNavEnd);
  const setNavPath = useAppStore((state) => state.setNavPath);

  const buildingsDsRef = useRef<Cesium.GeoJsonDataSource | null>(null);
  const roadsDsRef = useRef<Cesium.GeoJsonDataSource | null>(null);
  const pointsDsRef = useRef<Cesium.GeoJsonDataSource | null>(null);

  // 导航可视化相关
  const navRouteRef = useRef<Cesium.Entity | null>(null);
  const navStartMarkerRef = useRef<Cesium.Entity | null>(null);
  const navEndMarkerRef = useRef<Cesium.Entity | null>(null);
  const roadGraphRef = useRef<Graph | null>(null);
  const flyToHome = useCallback(() => {
    viewerRef.current?.camera.flyTo({
      destination: HOME_POSITION,
      orientation: HOME_ORIENTATION,
      duration: 1.4,
    });
  }, []);

  // useEffect #1: 初始化 Viewer
  useEffect(() => {
    if (!containerRef.current) return;

    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkMzgwNzA5ZS00NWEzLTRkOTEtYjcxOS02ZTgxNWRiOGQ1MDYiLCJpZCI6MzYzMjgwLCJpYXQiOjE3NjM5ODEzOTV9.0a44SobBq6h0u66BFdp-UgpenUCLrbhLRTR7SzdcMuE';

    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false, baseLayerPicker: false, fullscreenButton: false,
      geocoder: false, homeButton: false, infoBox: false,
      sceneModePicker: false, selectionIndicator: false, timeline: false,
      navigationHelpButton: false, baseLayer: false, terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    });

    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#d0d5dd');
    viewer.scene.globe.depthTestAgainstTerrain = false;

    // 加载底图
    const localTileProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'http://localhost:8080/data/MBtiles001/{z}/{x}/{y}.jpg',
      minimumLevel: 0, maximumLevel: 19, hasAlphaChannel: false,
    });
    viewer.imageryLayers.addImageryProvider(localTileProvider);
    localTileProvider.errorEvent.addEventListener(() => { });

    // 添加遮罩
    const maskPadding = 0.1;
    const outerBoundary = Cesium.Cartesian3.fromDegreesArray([
      CAMPUS_BOUNDS.WEST - maskPadding, CAMPUS_BOUNDS.SOUTH - maskPadding,
      CAMPUS_BOUNDS.EAST + maskPadding, CAMPUS_BOUNDS.SOUTH - maskPadding,
      CAMPUS_BOUNDS.EAST + maskPadding, CAMPUS_BOUNDS.NORTH + maskPadding,
      CAMPUS_BOUNDS.WEST - maskPadding, CAMPUS_BOUNDS.NORTH + maskPadding,
    ]);
    const campusHolePositions = Cesium.Cartesian3.fromDegreesArray(CAMPUS_BOUNDARY_COORDS.flat());

    viewer.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(outerBoundary, [new Cesium.PolygonHierarchy(campusHolePositions)]),
        material: Cesium.Color.fromCssColorString('#d0d5dd'),
        classificationType: Cesium.ClassificationType.BOTH,
      },
    });

    viewer.camera.setView({ destination: HOME_POSITION, orientation: HOME_ORIENTATION });

    // 相机限制逻辑
    const controller = viewer.scene.screenSpaceCameraController;
    controller.minimumZoomDistance = CAMERA_CONFIG.MIN_ZOOM;
    controller.maximumZoomDistance = CAMERA_CONFIG.MAX_ZOOM;

    let lastValidPosition: Cesium.Cartographic | null = null;
    const constrainCamera = () => {
      const pos = viewer.camera.positionCartographic;
      const lon = Cesium.Math.toDegrees(pos.longitude);
      const lat = Cesium.Math.toDegrees(pos.latitude);
      const isOut = lon < CAMERA_CONFIG.CENTER.LON - CAMERA_CONFIG.MAX_OFFSET ||
        lon > CAMERA_CONFIG.CENTER.LON + CAMERA_CONFIG.MAX_OFFSET ||
        lat < CAMERA_CONFIG.CENTER.LAT - CAMERA_CONFIG.MAX_OFFSET ||
        lat > CAMERA_CONFIG.CENTER.LAT + CAMERA_CONFIG.MAX_OFFSET;

      if (isOut && lastValidPosition) {
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromRadians(lastValidPosition.longitude, lastValidPosition.latitude, pos.height),
          orientation: { heading: viewer.camera.heading, pitch: viewer.camera.pitch, roll: viewer.camera.roll }
        });
      } else {
        lastValidPosition = pos.clone();
      }
    };

    viewer.scene.preUpdate.addEventListener(constrainCamera);

    // ----- 点击交互 (拾取要素 / 导航选点) -----
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
      // 获取当前导航模式
      const currentNavMode = useAppStore.getState().navMode;

      if (currentNavMode === 'selectStart' || currentNavMode === 'selectEnd') {
        // 导航选点模式：将点击位置转换为经纬度
        const ellipsoid = viewer.scene.globe.ellipsoid;
        const cartesian = viewer.camera.pickEllipsoid(click.position, ellipsoid);

        if (cartesian) {
          const cartographic = ellipsoid.cartesianToCartographic(cartesian);
          const lng = Cesium.Math.toDegrees(cartographic.longitude);
          const lat = Cesium.Math.toDegrees(cartographic.latitude);

          if (currentNavMode === 'selectStart') {
            useAppStore.getState().setNavStart([lng, lat]);
          } else {
            useAppStore.getState().setNavEnd([lng, lat]);
          }
        }
        return; // 不继续处理要素选择
      }

      // 常规模式：拾取要素
      const pickedObject = viewer.scene.pick(click.position);
      if (Cesium.defined(pickedObject) && pickedObject.id instanceof Cesium.Entity) {
        const entity = pickedObject.id;
        const props = entity.properties?.getValue(Cesium.JulianDate.now()) ?? {};
        // 排除掉遮罩层等没有 name 的要素
        if (props.name || props.name_zh || props.id) {
          setSelectedFeature(props);
        } else {
          setSelectedFeature(null);
        }
      } else {
        setSelectedFeature(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewerRef.current = viewer;

    return () => {
      viewer.scene.preUpdate.removeEventListener(constrainCamera);
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // useEffect #2: 加载数据
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    let active = true;
    const now = Cesium.JulianDate.now();

    const loadData = async () => {
      setStatus('Loading Campus Data...');
      try {
        const now = Cesium.JulianDate.now();

        // 1. 加载建筑物 (校园内建筑物.geojson)
        const buildingsDs = await Cesium.GeoJsonDataSource.load('/data/校园内建筑物.geojson');
        buildingsDs.entities.values.forEach(entity => {
          const props = entity.properties?.getValue(now) ?? {};
          if (entity.polygon) {
            const h = estimateHeight(props);
            // @ts-ignore
            entity.polygon.material = getColorForHeight(h);
            // @ts-ignore
            entity.polygon.outline = false;
            // @ts-ignore
            entity.polygon.extrudedHeight = h;

            // --- 核心修复：为多边形设置位置以显示标签 ---
            const labelText = props.name;
            if (labelText) {
              // 提取多边形层级
              const hierarchy = entity.polygon.hierarchy?.getValue(now);
              if (hierarchy && hierarchy.positions.length > 0) {
                // 将第一个点作为标签锚点
                entity.position = hierarchy.positions[0] as any;

                entity.label = new Cesium.LabelGraphics({
                  text: labelText,
                  font: 'bold 13px "Microsoft YaHei", sans-serif',
                  fillColor: Cesium.Color.WHITE,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 3,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                  verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                  // 针对 3D 建筑，将高度设置为拉伸高度，让文字悬浮在屋顶
                  heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                  disableDepthTestDistance: 5000,
                  scaleByDistance: new Cesium.NearFarScalar(500, 1.0, 3000, 0.4),
                  distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1500)
                });
                // 使用 eyeOffset 略微上提文字
                // @ts-ignore
                entity.label.eyeOffset = new Cesium.ConstantProperty(new Cesium.Cartesian3(0, 0, -h - 5));
              }
            }
          }
        });
        await viewer.dataSources.add(buildingsDs);
        buildingsDsRef.current = buildingsDs;
        buildingsDs.show = showBuildings;

        // 2. 加载道路 (贴地线条)
        const roadsDs = await Cesium.GeoJsonDataSource.load('/data/校园内道路.geojson', {
          stroke: Cesium.Color.fromCssColorString('#475467'),
          strokeWidth: 3,
          clampToGround: true
        });
        await viewer.dataSources.add(roadsDs);
        roadsDsRef.current = roadsDs;
        roadsDs.show = showRoads;

        // 3. 加载点要素 (图标/标记)
        const pointsDs = await Cesium.GeoJsonDataSource.load('/data/校园内点要素.geojson');
        pointsDs.entities.values.forEach(entity => {
          const props = entity.properties?.getValue(now) ?? {};
          // 设置简单的标记 (置于顶层，不受深度检测影响)
          entity.point = new Cesium.PointGraphics({
            pixelSize: 10,
            color: Cesium.Color.fromCssColorString('#f04438'),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY, // 始终置于最顶层
            scaleByDistance: new Cesium.NearFarScalar(500, 1.0, 3000, 0.5) // 远距离缩小
          });

          // 添加名称标签
          if (props.name) {
            entity.label = new Cesium.LabelGraphics({
              text: props.name,
              font: '14px "Microsoft YaHei", sans-serif',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -12),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY, // 始终置于最顶层
              scaleByDistance: new Cesium.NearFarScalar(500, 1.0, 3000, 0.5), // 随点一起缩放
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1500)
            });
          }
        });
        await viewer.dataSources.add(pointsDs);
        pointsDsRef.current = pointsDs;
        pointsDs.show = showPoints;

        setStatus(`Buildings/Roads/Points Data Loaded`);
      } catch (e) {
        console.error(e);
        setStatus('Load Error');
      }
    };

    loadData();
    return () => { active = false; };
  }, [setStatus]);

  // useEffect #3: 同步图层显示状态
  useEffect(() => {
    if (buildingsDsRef.current) buildingsDsRef.current.show = showBuildings;
    if (roadsDsRef.current) roadsDsRef.current.show = showRoads;
    if (pointsDsRef.current) pointsDsRef.current.show = showPoints;
  }, [showBuildings, showRoads, showPoints]);

  useEffect(() => { flyToHome(); }, [homeRequest, flyToHome]);

  // useEffect #4: 构建道路图（当道路数据加载后）
  useEffect(() => {
    const buildGraph = async () => {
      try {
        const response = await fetch('/data/校园内道路.geojson');
        const geojson = await response.json();
        roadGraphRef.current = buildRoadGraph(geojson);
        console.log(`Road graph built: ${roadGraphRef.current.size} nodes`);
      } catch (e) {
        console.error('Failed to build road graph:', e);
      }
    };
    buildGraph();
  }, []);

  // useEffect #5: 导航标记可视化（起点/终点）
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // 清理旧标记
    if (navStartMarkerRef.current) {
      viewer.entities.remove(navStartMarkerRef.current);
      navStartMarkerRef.current = null;
    }
    if (navEndMarkerRef.current) {
      viewer.entities.remove(navEndMarkerRef.current);
      navEndMarkerRef.current = null;
    }

    // 添加起点标记
    if (navStart) {
      navStartMarkerRef.current = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(navStart[0], navStart[1]),
        billboard: {
          image: 'data:image/svg+xml,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
              <ellipse cx="16" cy="38" rx="8" ry="2" fill="rgba(0,0,0,0.3)"/>
              <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24C32 7.16 24.84 0 16 0z" fill="#22c55e"/>
              <circle cx="16" cy="14" r="6" fill="white"/>
            </svg>
          `),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
          text: '起点',
          font: 'bold 12px "Microsoft YaHei"',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.fromCssColorString('#22c55e'),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -45),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    }

    // 添加终点标记
    if (navEnd) {
      navEndMarkerRef.current = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(navEnd[0], navEnd[1]),
        billboard: {
          image: 'data:image/svg+xml,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
              <ellipse cx="16" cy="38" rx="8" ry="2" fill="rgba(0,0,0,0.3)"/>
              <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24C32 7.16 24.84 0 16 0z" fill="#ef4444"/>
              <circle cx="16" cy="14" r="6" fill="white"/>
            </svg>
          `),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
          text: '终点',
          font: 'bold 12px "Microsoft YaHei"',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.fromCssColorString('#ef4444'),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -45),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    }
  }, [navStart, navEnd]);

  // useEffect #6: 路径规划与可视化
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // 清理旧路径
    if (navRouteRef.current) {
      viewer.entities.remove(navRouteRef.current);
      navRouteRef.current = null;
    }

    // 如果起点和终点都已设置，计算路径
    if (navStart && navEnd && roadGraphRef.current) {
      console.log('Planning route from', navStart, 'to', navEnd);
      const result = planRoute(roadGraphRef.current, navStart, navEnd);
      console.log('Route result:', result);

      if (result && result.path.length > 1) {
        // 将路径坐标转换为 Cesium 格式
        const positions = result.path.flatMap(([lng, lat]) => [lng, lat]);
        console.log('Route positions count:', result.path.length);

        // 使用 PolylineOutlineMaterial 替代 PolylineGlow (更兼容 clampToGround)
        navRouteRef.current = viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(positions),
            width: 8,
            material: new Cesium.PolylineOutlineMaterialProperty({
              color: Cesium.Color.fromCssColorString('#3b82f6'),
              outlineWidth: 2,
              outlineColor: Cesium.Color.WHITE
            }),
            clampToGround: true,
            classificationType: Cesium.ClassificationType.BOTH
          }
        });

        setNavPath(result.path, result.distance);
        setStatus(`路线规划完成: ${(result.distance / 1000).toFixed(2)} km`);
      } else {
        console.log('No valid route found');
        setNavPath(null, null);
        setStatus('无法找到可行路线');
      }
    } else {
      if (!roadGraphRef.current) {
        console.log('Road graph not ready yet');
      }
      setNavPath(null, null);
    }
  }, [navStart, navEnd, setNavPath, setStatus]);


  return (
    <div className="cesium-container">
      <div className="cesium-canvas" ref={containerRef} />

      <button className="home-button" onClick={flyToHome} title="回到初始位置">
        🏠 归位
      </button>

      {/* 详细属性属性面板 */}
      {selectedFeature && (
        <div className="feature-info-panel">
          <div className="panel-header">
            <h3>要素详情</h3>
            <button onClick={() => setSelectedFeature(null)}>×</button>
          </div>
          <div className="panel-content">
            <table className="info-table">
              <tbody>
                {Object.entries(selectedFeature).map(([key, value]) => {
                  if (value === null || value === undefined || key.startsWith('_')) return null;
                  return (
                    <tr key={key}>
                      <td className="info-key">{key}</td>
                      <td className="info-value">{String(value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 状态栏提示 */}
      <div className="viewer-status-bar">
        {selectedFeature ? `已选择: ${selectedFeature.name || selectedFeature.name_zh || '未命名要素'}` : '点击地图要素查看详情'}
      </div>
    </div>
  );
}
