import * as Cesium from 'cesium';
import { CAMPUS_BOUNDARY_COORDS } from '../constants/campus';

/**
 * 判断一个点是否在校园多边形内部 (射线法)
 */
export function isPointInCampus(lon: number, lat: number): boolean {
    let inside = false;
    const n = CAMPUS_BOUNDARY_COORDS.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = CAMPUS_BOUNDARY_COORDS[i][0];
        const yi = CAMPUS_BOUNDARY_COORDS[i][1];
        const xj = CAMPUS_BOUNDARY_COORDS[j][0];
        const yj = CAMPUS_BOUNDARY_COORDS[j][1];
        if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * 从属性值中解析高度数字
 */
export function parseHeight(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const match = String(value).match(/[\d.]+/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 根据建筑物高度返回对应的颜色
 */
export function getColorForHeight(height: number): Cesium.Color {
    if (height >= 60) return Cesium.Color.fromCssColorString('#6f6a64');
    if (height >= 40) return Cesium.Color.fromCssColorString('#8b857e');
    if (height >= 20) return Cesium.Color.fromCssColorString('#a9a39a');
    return Cesium.Color.fromCssColorString('#c9c3b8');
}

/**
 * 根据建筑类型或楼层数估算高度 (用于数据缺失时的保底方案)
 */
export function estimateHeight(properties: any): number {
    const levels = parseHeight(properties['building:levels']);
    const h = parseHeight(properties.height);
    const type = properties.building;

    // 1. 如果有明确高度数字，直接使用
    if (h) return h;

    // 2. 如果有层数，按层数估算 (平均 3.5 米一层)
    if (levels) return levels * 3.5;

    // 3. 根据建筑用途估算
    switch (type) {
        case 'dormitory': return 18;  // 宿舍
        case 'apartments': return 24; // 公寓
        case 'university':
        case 'college': return 20;     // 教学楼
        case 'office': return 16;      // 办公楼
        case 'commercial': return 12;  // 商业/后勤
        case 'restaurant': return 9;   // 餐厅
        case 'library': return 26;     // 图书馆 (通常作为地标较高)
        case 'sports_hall': return 15; // 场馆
        case 'yes': return 12;
        default: return 11;            // 兜底高度
    }
}

/**
 * 获取实体的位置坐标
 */
export function getEntityPosition(
    entity: Cesium.Entity,
    now: Cesium.JulianDate
): [number, number] | null {
    let cartesian: Cesium.Cartesian3 | undefined;
    if (entity.polygon?.hierarchy) {
        const hierarchy = entity.polygon.hierarchy.getValue(now);
        if (hierarchy?.positions?.length > 0) cartesian = hierarchy.positions[0];
    } else if (entity.polyline?.positions) {
        const positions = entity.polyline.positions.getValue(now);
        if (positions?.length > 0) cartesian = positions[0];
    } else if (entity.position) {
        cartesian = entity.position.getValue(now);
    }

    if (cartesian) {
        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        return [Cesium.Math.toDegrees(carto.longitude), Cesium.Math.toDegrees(carto.latitude)];
    }
    return null;
}
