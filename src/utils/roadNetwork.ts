/**
 * 道路网络图构建工具
 * 将 GeoJSON 道路数据转换为邻接表格式的图结构
 */

export interface GraphNode {
    id: string;
    coords: [number, number]; // [lng, lat]
}

export interface GraphEdge {
    to: string;
    distance: number;
    roadId: string;
}

export type Graph = Map<string, { node: GraphNode; edges: GraphEdge[] }>;

/**
 * 将坐标转换为唯一标识符
 */
function coordsToId(lng: number, lat: number): string {
    // 使用 6 位小数精度，足够区分不同点
    return `${lng.toFixed(6)},${lat.toFixed(6)}`;
}

/**
 * Haversine 公式计算两点之间的距离（米）
 */
function haversineDistance(
    lng1: number, lat1: number,
    lng2: number, lat2: number
): number {
    const R = 6371000; // 地球半径（米）
    const toRad = (deg: number) => deg * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * 从 GeoJSON 构建道路网络图
 */
export function buildRoadGraph(geojson: { features: any[] }): Graph {
    const graph: Graph = new Map();

    // 辅助函数：确保节点存在于图中
    const ensureNode = (lng: number, lat: number): string => {
        const id = coordsToId(lng, lat);
        if (!graph.has(id)) {
            graph.set(id, {
                node: { id, coords: [lng, lat] },
                edges: []
            });
        }
        return id;
    };

    // 辅助函数：添加边（双向）
    const addEdge = (fromId: string, toId: string, distance: number, roadId: string) => {
        const fromNode = graph.get(fromId);
        const toNode = graph.get(toId);

        if (fromNode && toNode) {
            // 检查是否已存在该边
            if (!fromNode.edges.some(e => e.to === toId)) {
                fromNode.edges.push({ to: toId, distance, roadId });
            }
            if (!toNode.edges.some(e => e.to === fromId)) {
                toNode.edges.push({ to: fromId, distance, roadId });
            }
        }
    };

    // 遍历所有道路特征
    for (const feature of geojson.features) {
        const roadId = feature.properties?.id || 'unknown';
        const geometry = feature.geometry;

        if (geometry.type === 'MultiLineString') {
            for (const lineCoords of geometry.coordinates) {
                for (let i = 0; i < lineCoords.length - 1; i++) {
                    const [lng1, lat1] = lineCoords[i];
                    const [lng2, lat2] = lineCoords[i + 1];

                    const id1 = ensureNode(lng1, lat1);
                    const id2 = ensureNode(lng2, lat2);

                    const distance = haversineDistance(lng1, lat1, lng2, lat2);
                    addEdge(id1, id2, distance, roadId);
                }
            }
        } else if (geometry.type === 'LineString') {
            const lineCoords = geometry.coordinates;
            for (let i = 0; i < lineCoords.length - 1; i++) {
                const [lng1, lat1] = lineCoords[i];
                const [lng2, lat2] = lineCoords[i + 1];

                const id1 = ensureNode(lng1, lat1);
                const id2 = ensureNode(lng2, lat2);

                const distance = haversineDistance(lng1, lat1, lng2, lat2);
                addEdge(id1, id2, distance, roadId);
            }
        }
    }

    return graph;
}

/**
 * 查找距离给定坐标最近的图节点
 */
export function findNearestNode(
    graph: Graph,
    lng: number,
    lat: number
): GraphNode | null {
    let nearest: GraphNode | null = null;
    let minDist = Infinity;

    for (const { node } of graph.values()) {
        const dist = haversineDistance(lng, lat, node.coords[0], node.coords[1]);
        if (dist < minDist) {
            minDist = dist;
            nearest = node;
        }
    }

    return nearest;
}

/**
 * 导出 Haversine 距离函数供外部使用
 */
export { haversineDistance };
