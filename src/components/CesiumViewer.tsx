import { useEffect, useRef, useCallback } from 'react';
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

/**
 * CesiumViewer 组件 - 校园 3D 可视化核心
 */
export default function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  const homeRequest = useAppStore((state) => state.homeRequest);
  const setStatus = useAppStore((state) => state.setStatus);

  // ----- 归位逻辑封装 -----
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
    viewerRef.current = viewer;

    return () => {
      viewer.scene.preUpdate.removeEventListener(constrainCamera);
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
          }
        });
        await viewer.dataSources.add(buildingsDs);

        // 2. 加载道路 (贴地线条)
        const roadsDs = await Cesium.GeoJsonDataSource.load('/data/校园内道路.geojson', {
          stroke: Cesium.Color.fromCssColorString('#475467'),
          strokeWidth: 3,
          clampToGround: true
        });
        await viewer.dataSources.add(roadsDs);

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

        setStatus(`Buildings/Roads/Points Data Loaded`);
      } catch (e) {
        console.error(e);
        setStatus('Load Error');
      }
    };

    loadData();
    return () => { active = false; };
  }, [setStatus]);

  useEffect(() => { flyToHome(); }, [homeRequest, flyToHome]);

  return (
    <div className="cesium-container">
      <div className="cesium-canvas" ref={containerRef} />
      <button className="home-button" onClick={flyToHome} title="回到初始位置">
        🏠 归位
      </button>
    </div>
  );
}
